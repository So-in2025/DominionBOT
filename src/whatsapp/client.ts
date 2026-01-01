
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ConnectionStatus, Message, LeadStatus, User, Conversation } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const connectionAttempts = new Map<string, boolean>();
const DEBOUNCE_TIME_MS = 6000; 

// TIMESTAMP to differentiate History vs Live messages
const BOOT_TIMESTAMP = Date.now() / 1000;

const logger = pino({ level: 'silent' }); 

const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';

export function getSessionStatus(userId: string): { status: ConnectionStatus, qr?: string, pairingCode?: string } {
    const sock = sessions.get(userId);
    const qr = qrCache.get(userId);
    const code = codeCache.get(userId);

    if (sock?.user) return { status: ConnectionStatus.CONNECTED };
    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };
    if (connectionAttempts.get(userId)) return { status: ConnectionStatus.GENERATING_QR };

    return { status: ConnectionStatus.DISCONNECTED };
}

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
    if (connectionAttempts.get(userId)) {
        logService.warn(`[WA-CLIENT] Connection already in progress for user ${userId}.`, userId);
        return;
    }
    
    // SAFETY: Only kill strictly if we are initiating a NEW intentional connection, not a reconnect.
    if (sessions.has(userId)) {
        // We only log this, we don't aggressively kill unless connection is closed.
        // logService.warn(`[WA-CLIENT] Session object exists for ${userId}.`, userId);
    }

    connectionAttempts.set(userId, true);
    qrCache.delete(userId);
    codeCache.delete(userId);

    try {
        logService.info(`[WA-CLIENT] Initiating WhatsApp connection for user: ${userId}`, userId);
        const { state, saveCreds } = await useMongoDBAuthState(userId);
        const { version } = await fetchLatestBaileysVersion();
        
        const user = await db.getUser(userId);

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: Browsers.macOS('Chrome'),
            agent: user?.settings?.proxyUrl ? new HttpsProxyAgent(user.settings.proxyUrl) : undefined,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'),
            syncFullHistory: true, 
            // CRITICAL FIX: Keep Alive Interval to prevent "Stream Errored"
            keepAliveIntervalMs: 10000, 
            retryRequestDelayMs: 5000
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => { 
            const { connection, lastDisconnect, qr, isNewLogin, pairingCode: newPairingCode } = update;

            if (qr) {
                logService.info(`[WA-CLIENT] QR generated for user ${userId}`, userId);
                qrCache.set(userId, await QRCode.toDataURL(qr));
            }

            if (newPairingCode) {
                logService.info(`[WA-CLIENT] Pairing code generated for user ${userId}`, userId);
                codeCache.set(userId, newPairingCode);
            }

            if (connection === 'close') {
                const disconnectError = lastDisconnect?.error as Boom;
                const statusCode = disconnectError?.output?.statusCode;
                
                // Specific Check for 428 (Precondition Required) or Conflict
                const isConflict = disconnectError?.message === 'Stream Errored' && disconnectError?.data === 'conflict';
                const isCorruptSession = statusCode === 428;
                const isRestartRequired = statusCode === DisconnectReason.restartRequired;

                if (isConflict || isCorruptSession) {
                    logService.error(`[WA-CLIENT] 🚨 SESIÓN CORRUPTA (${statusCode}). Purgando sesión para reinicio limpio.`, disconnectError, userId);
                    await clearBindedSession(userId);
                    sessions.delete(userId);
                    qrCache.delete(userId);
                    codeCache.delete(userId);
                    // Do NOT auto-reconnect immediately here, let user re-scan.
                    return; 
                }

                // If it's just a Stream Error or Restart Required, we RECONNECT gracefully.
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                logService.warn(`[WA-CLIENT] Connection closed (${statusCode}). Reason: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`, userId);
                
                // Clean caches but keep session data if reconnecting
                qrCache.delete(userId);
                codeCache.delete(userId);

                if (shouldReconnect) {
                    sessions.delete(userId); // Remove old socket object
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), isRestartRequired ? 1000 : 3000); 
                } else {
                    logService.info(`[WA-CLIENT] User ${userId} logged out. Clearing session.`, userId);
                    await db.updateUser(userId, { whatsapp_number: '' });
                    await db.updateUserSettings(userId, { isActive: false });
                    await clearBindedSession(userId); 
                    sessions.delete(userId); 
                }
            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] Connection opened for user ${userId}.`, userId);
                qrCache.delete(userId);
                codeCache.delete(userId);
                if (isNewLogin) {
                    const user = await db.getUser(userId);
                    if (user && !user.whatsapp_number) {
                        await db.updateUser(userId, { whatsapp_number: sock.user?.id?.split('@')[0] });
                    }
                }
            }
        });

        if (phoneNumber) {
            logService.info(`[WA-CLIENT] Requesting pairing code for user ${userId}.`, userId);
            try {
                // Wait a moment for socket to be ready
                await new Promise(resolve => setTimeout(resolve, 2000));
                const code = await sock.requestPairingCode(phoneNumber);
                if (code) {
                    codeCache.set(userId, code);
                    logService.info(`[WA-CLIENT] Pairing code ${code} obtained.`, userId);
                }
            } catch (pairingCodeError) {
                logService.error(`[WA-CLIENT] Error requesting pairing code.`, pairingCodeError, userId);
            }
        }

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

                const jid = msg.key.remoteJid;
                const isFromMe = msg.key.fromMe;
                const contactName = msg.pushName || jid?.split('@')[0];
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                if (!jid || !messageText) continue;

                // Log that we actually received a message!
                if (Math.random() > 0.95) { // Log occasionally to avoid spam
                     logService.info(`[WA-CLIENT] Processing message from ${jid}`, userId);
                }

                const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any).low;
                const isHistory = msgTimestamp < (BOOT_TIMESTAMP - 10); 

                const userMessage: Message = {
                    id: msg.key.id || Date.now().toString(),
                    text: messageText,
                    sender: isFromMe ? 'owner' : 'user', 
                    timestamp: new Date(msgTimestamp * 1000)
                };

                await conversationService.addMessage(userId, jid, userMessage, contactName, isHistory);

                if (!isFromMe && !isHistory && type === 'notify') {
                    if (messageDebounceMap.has(jid)) {
                        clearTimeout(messageDebounceMap.get(jid)!);
                    }
                    messageDebounceMap.set(jid, setTimeout(() => {
                        processAiResponseForJid(userId, jid).catch(err => {
                            logService.error(`[WA-CLIENT] Error processing AI response`, err, userId);
                        });
                        messageDebounceMap.delete(jid);
                    }, DEBOUNCE_TIME_MS));
                }
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Critical error during connection`, error, userId);
        qrCache.delete(userId);
        codeCache.delete(userId);
        sessions.delete(userId);
    } finally {
        connectionAttempts.delete(userId);
    }
}

export async function disconnectWhatsApp(userId: string) {
    logService.info(`[WA-CLIENT] Force disconnecting WhatsApp for user: ${userId}`, userId);
    const sock = sessions.get(userId);
    if (sock) {
        try {
            sock.end(undefined);
            await new Promise(resolve => setTimeout(resolve, 500)); 
        } catch (e) {
            console.error(`[WA-CLIENT] Error closing socket`, e);
        }
        sessions.delete(userId);
    }
    qrCache.delete(userId);
    codeCache.delete(userId);
    await clearBindedSession(userId); 
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
    logService.info(`[WA-CLIENT] WhatsApp disconnected and wiped.`, userId);
}

export async function sendMessage(userId: string, jid: string, text: string) {
    const sock = sessions.get(userId);
    if (!sock) throw new Error(`WhatsApp session not found.`);
    await sock.sendMessage(jid, { text });
}

async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const sock = sessions.get(userId);
    if (!sock) return;

    await sock.sendPresenceUpdate('composing', jid);
    const latestUser = await db.getUser(userId); 
    const latestConversation = latestUser?.conversations?.[jid];

    if (!latestConversation) return;

    const aiResult = await generateBotResponse(latestConversation.messages, user);

    if (aiResult?.responseText) {
        await sock.sendMessage(jid, { text: aiResult.responseText });
        const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date() };
        await conversationService.addMessage(userId, jid, botMessage);
    }
    
    if (aiResult) {
        const previousStatus = latestConversation.status;
        const updates: Partial<Conversation> = {
            status: aiResult.newStatus,
            tags: [...new Set([...(latestConversation.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined 
        };

        if (aiResult.newStatus === LeadStatus.HOT) {
            updates.isMuted = true;
            updates.suggestedReplies = aiResult.suggestedReplies;
        }

        if (user.plan_status === 'trial' && aiResult.newStatus === LeadStatus.HOT && previousStatus !== LeadStatus.HOT) {
            if (latestConversation.isTestBotConversation) {
                logService.info(`${logPrefix} Lead calificado por bot élite no cuenta para el trial.`, userId);
            } else {
                const currentCount = (user.trial_qualified_leads_count || 0) + 1;
                const maxLeads = 3; 
                if (currentCount >= maxLeads) { 
                    await db.updateUser(userId, { plan_status: 'expired', trial_qualified_leads_count: currentCount });
                } else {
                    await db.updateUser(userId, { trial_qualified_leads_count: currentCount });
                }
            }
        }
        await db.saveUserConversation(userId, { ...latestConversation, ...updates });
    }
}

export async function processAiResponseForJid(userId: string, jid: string) {
    const user = await db.getUser(userId);
    if (!user) return;

    const convs = await conversationService.getConversations(userId);
    const conversation = convs.find(c => c.id === jid);

    if (!user.settings.isActive || user.plan_status === 'suspended') {
        if (user.plan_status === 'expired' && jid !== ELITE_BOT_JID) { 
            if (conversation && !conversation.isMuted) {
                const sock = sessions.get(userId);
                if (sock) {
                    const expiredMessage = "Disculpa la demora, en breve te atenderemos.";
                    await sock.sendMessage(jid, { text: expiredMessage });
                    const botMessage: Message = { id: `bot-${Date.now()}-expired`, text: expiredMessage, sender: 'bot', timestamp: new Date() };
                    await conversationService.addMessage(userId, jid, botMessage);
                }
            }
        }
        return;
    }

    if (conversation?.isTestBotConversation) { 
        return _commonAiProcessingLogic(userId, jid, user, '[WA-CLIENT-ELITE-TEST]'); 
    }
    
    const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
    if (isIgnored) return;

    if (!conversation) return;

    if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;

    return _commonAiProcessingLogic(userId, jid, user);
}
