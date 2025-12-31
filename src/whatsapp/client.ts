

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
// import { sseService } from '../services/sseService.js'; // Removed SSE service import

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const connectionAttempts = new Map<string, boolean>();
const DEBOUNCE_TIME_MS = 6000; 

const logger = pino({ level: 'silent' }); 

// --- Test Bot Specifics (re-declared here for clarity and to avoid circular deps) ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
// --- END Test Bot Specifics ---

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

// FIX: Export the connectToWhatsApp function and implement its logic
export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
    // Prevent multiple connection attempts simultaneously
    if (connectionAttempts.get(userId)) {
        logService.warn(`[WA-CLIENT] Connection already in progress for user ${userId}.`, userId);
        return;
    }
    connectionAttempts.set(userId, true);
    qrCache.delete(userId);
    codeCache.delete(userId);

    try {
        logService.info(`[WA-CLIENT] Initiating WhatsApp connection for user: ${userId}`, userId);
        const { state, saveCreds } = await useMongoDBAuthState(userId);
        
        const { version, is = "" } = await fetchLatestBaileysVersion();
        logService.info(`[WA-CLIENT] Baileys version: ${version}`, userId);

        const user = await db.getUser(userId); // Fetch user to get proxy settings if any

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: Browsers.macOS('Chrome'), // Simulate a desktop browser
            agent: user?.settings?.proxyUrl ? new HttpsProxyAgent(user.settings.proxyUrl) : undefined,
            generateHighQualityLinkPreview: true,
            pairingCode: phoneNumber ? true : false, // Request pairing code if phone number is provided
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'), // Ignore broadcast messages
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, pairingCode: newPairingCode } = update;

            if (qr) {
                logService.info(`[WA-CLIENT] QR generated for user ${userId}`, userId);
                qrCache.set(userId, await QRCode.toDataURL(qr));
                // sseService.sendEvent(userId, 'qr_code', { qrCode: qrCache.get(userId) }); // Re-enable if SSE is used
            }

            if (newPairingCode) {
                logService.info(`[WA-CLIENT] Pairing code generated for user ${userId}`, userId);
                codeCache.set(userId, newPairingCode);
                // sseService.sendEvent(userId, 'pairing_code', { pairingCode: newPairingCode }); // Re-enable if SSE is used
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                logService.warn(`[WA-CLIENT] Connection closed for user ${userId}. Reason: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`, userId);
                
                qrCache.delete(userId);
                codeCache.delete(userId);

                if (shouldReconnect) {
                    await connectToWhatsApp(userId, phoneNumber); // Attempt to reconnect
                } else {
                    logService.info(`[WA-CLIENT] User ${userId} logged out. Clearing session.`, userId);
                    await db.updateUser(userId, { whatsapp_number: '', 'settings.isActive': false });
                    await clearBindedSession(userId); // Clear session data from DB
                    sessions.delete(userId); // Remove from active sessions
                }
            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] Connection opened for user ${userId}.`, userId);
                qrCache.delete(userId); // Clear QR/pairing code once connected
                codeCache.delete(userId);
                if (isNewLogin) {
                    const user = await db.getUser(userId);
                    if (user && !user.whatsapp_number) {
                        await db.updateUser(userId, { whatsapp_number: sock.user?.id?.split('@')[0] });
                    }
                }
                // sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED }); // Re-enable if SSE is used
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type === 'notify') {
                for (const msg of messages) {
                    // Ignore status messages and messages from self
                    if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

                    const jid = msg.key.remoteJid;
                    const contactName = msg.pushName || jid?.split('@')[0];
                    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                    if (!jid || !messageText) continue;

                    logService.info(`[WA-CLIENT] Message from ${contactName} (${jid}): ${messageText}`, userId);

                    const userMessage: Message = {
                        id: msg.key.id || Date.now().toString(),
                        text: messageText,
                        sender: 'user',
                        timestamp: new Date(msg.messageTimestamp! * 1000)
                    };
                    await conversationService.addMessage(userId, jid, userMessage, contactName);

                    // Debounce AI response
                    if (messageDebounceMap.has(jid)) {
                        clearTimeout(messageDebounceMap.get(jid)!);
                    }
                    messageDebounceMap.set(jid, setTimeout(() => {
                        processAiResponseForJid(userId, jid).catch(err => {
                            logService.error(`[WA-CLIENT] Error processing AI response for JID ${jid}`, err, userId);
                        });
                        messageDebounceMap.delete(jid);
                    }, DEBOUNCE_TIME_MS));
                }
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Critical error during WhatsApp connection for user ${userId}`, error, userId);
        qrCache.delete(userId);
        codeCache.delete(userId);
        sessions.delete(userId);
        throw error;
    } finally {
        connectionAttempts.delete(userId);
    }
}

// FIX: Export the disconnectWhatsApp function and implement its logic
export async function disconnectWhatsApp(userId: string) {
    logService.info(`[WA-CLIENT] Disconnecting WhatsApp for user: ${userId}`, userId);
    const sock = sessions.get(userId);
    if (sock) {
        await sock.logout(); // End the session cleanly
        sessions.delete(userId);
    }
    qrCache.delete(userId);
    codeCache.delete(userId);
    await db.updateUser(userId, { whatsapp_number: '', 'settings.isActive': false });
    await clearBindedSession(userId); // Ensure session data is cleared from DB
    logService.info(`[WA-CLIENT] WhatsApp disconnected for user: ${userId}`, userId);
}

// FIX: Export the sendMessage function and implement its logic
export async function sendMessage(userId: string, jid: string, text: string) {
    const sock = sessions.get(userId);
    if (!sock) {
        throw new Error(`WhatsApp session not found for user ${userId}.`);
    }
    await sock.sendMessage(jid, { text });
    logService.info(`[WA-CLIENT] Message sent to ${jid} by user ${userId}: ${text}`, userId);
}

/**
 * Procesa un mensaje entrante (ya añadido a la conversación) y genera una respuesta de IA.
 * Esta función es llamada por el listener de `messages.upsert` (después de un debounce)
 * y también puede ser llamada directamente por el Admin Panel para mensajes de prueba.
 */
export async function processAiResponseForJid(userId: string, jid: string) {
    const user = await db.getUser(userId);
    if (!user) {
        logService.warn(`[WA-CLIENT] User ${userId} not found when processing AI response for JID ${jid}.`, userId);
        return;
    }

    // Global checks apply to all JIDs, including the test bot
    if (!user.settings.isActive || user.plan_status === 'suspended') {
        // If the user's bot is globally inactive or plan is suspended, we skip AI processing for *any* JID.
        logService.info(`[WA-CLIENT] AI processing skipped for JID ${jid} (bot inactive or plan suspended globally for user ${userId}).`, userId);
        
        // Special handling for expired/suspended for REAL conversations, not test bot.
        if (user.plan_status === 'expired' && jid !== ELITE_BOT_JID) {
            const conversations = await conversationService.getConversations(userId);
            const conversation = conversations.find(c => c.id === jid);
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

    // --- ELITE BOT SPECIFIC BYPASS ---
    if (jid === ELITE_BOT_JID) {
        // For the ELITE_BOT_JID, if it passed the global checks, it should *always* proceed to AI generation.
        // We explicitly skip `isIgnored`, `isMuted`, `isBotActive`, `status === LeadStatus.PERSONAL` checks.
        logService.info(`[WA-CLIENT] ELITE_BOT_JID ${jid} bypassed conversation-specific checks and proceeding to AI generation.`, userId);
        // Continue directly to common AI processing logic below.
    } else { 
        // --- REGULAR CONVERSATIONS: APPLY ALL STANDARD CHECKS ---
        const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
        if (isIgnored) {
            logService.info(`[WA-CLIENT] JID ${jid} ignored for user ${userId}.`, userId);
            return;
        }

        const convs = await conversationService.getConversations(userId);
        const conversation = convs.find(c => c.id === jid);

        if (!conversation || conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) {
            logService.info(`[WA-CLIENT] AI processing skipped for JID ${jid} (muted, inactive, or personal).`, userId);
            return;
        }
    }

    // --- COMMON AI PROCESSING LOGIC (for ELITE_BOT_JID and regular JIDs that passed all checks) ---
    const sock = sessions.get(userId);
    if (!sock) {
        logService.warn(`[WA-CLIENT] Socket not found for user ${userId}, cannot send response to JID ${jid}.`, userId);
        return;
    }

    await sock.sendPresenceUpdate('composing', jid);
    const latestUser = await db.getUser(userId); // Re-fetch to get latest state
    const latestConversation = latestUser?.conversations?.[jid];

    if (!latestConversation) {
        logService.error(`[WA-CLIENT] Latest conversation for JID ${jid} not found after message processing for user ${userId}.`, null, userId);
        return;
    }

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

        // --- TRIAL LEAD COUNTING EXCLUSION FOR TEST BOT ---
        if (user.plan_status === 'trial' && aiResult.newStatus === LeadStatus.HOT && previousStatus !== LeadStatus.HOT) {
            if (jid === ELITE_BOT_JID) {
                logService.info(`[WA-CLIENT] Lead calificado por bot élite no cuenta para el trial de ${userId}.`, userId);
            } else {
                const currentCount = (user.trial_qualified_leads_count || 0) + 1;
                const maxLeads = 3; 
                if (currentCount >= maxLeads) { 
                    await db.updateUser(userId, { plan_status: 'expired', trial_qualified_leads_count: currentCount });
                    logService.audit(`Prueba finalizada por alcanzar ${maxLeads} leads calificados`, userId, user.username);
                } else {
                    await db.updateUser(userId, { trial_qualified_leads_count: currentCount });
                }
            }
        }
        
        await db.saveUserConversation(userId, { ...latestConversation, ...updates });
    }
}