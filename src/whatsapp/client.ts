
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
const connectionLocks = new Map<string, boolean>(); 
const DEBOUNCE_TIME_MS = 6000; 

const BOOT_TIMESTAMP = Date.now() / 1000;
const logger = pino({ level: 'silent' }); 

const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';

export function getSessionStatus(userId: string): { status: ConnectionStatus, qr?: string, pairingCode?: string } {
    const sock = sessions.get(userId);
    const qr = qrCache.get(userId);
    const code = codeCache.get(userId);
    const isLocked = connectionLocks.get(userId);

    if (sock?.user) return { status: ConnectionStatus.CONNECTED };
    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };
    if (isLocked) return { status: ConnectionStatus.GENERATING_QR };

    return { status: ConnectionStatus.DISCONNECTED };
}

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
    if (connectionLocks.get(userId)) {
        logService.warn(`[WA-CLIENT] Conexión en proceso para ${userId}. Omitiendo duplicado.`, userId);
        return;
    }

    if (sessions.has(userId)) {
        try {
            const oldSock = sessions.get(userId);
            oldSock?.end(undefined);
            sessions.delete(userId);
        } catch (e) {}
    }

    connectionLocks.set(userId, true);
    qrCache.delete(userId);
    codeCache.delete(userId);

    try {
        logService.info(`[WA-CLIENT] Iniciando motor WhatsApp para: ${userId}`, userId);
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
            agent: user?.settings?.proxyUrl ? new HttpsProxyAgent(user.settings.proxyUrl) as any : undefined,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast') || jid?.endsWith('@g.us'),
            syncFullHistory: true, 
            defaultQueryTimeoutMs: 60000, 
            keepAliveIntervalMs: 10000, 
            retryRequestDelayMs: 2000,
            connectTimeoutMs: 60000,
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => { 
            const { connection, lastDisconnect, qr, isNewLogin, pairingCode: newPairingCode } = update;

            if (qr) {
                logService.info(`[WA-CLIENT] QR generado.`, userId);
                qrCache.set(userId, await QRCode.toDataURL(qr));
                connectionLocks.set(userId, false); 
            }

            if (newPairingCode) {
                codeCache.set(userId, newPairingCode);
                connectionLocks.set(userId, false);
            }

            if (connection === 'close') {
                const disconnectError = lastDisconnect?.error as Boom;
                const statusCode = disconnectError?.output?.statusCode;
                
                const isConflict = disconnectError?.message === 'Stream Errored' && disconnectError?.data === 'conflict';
                const isCorrupt428 = statusCode === 428; 
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                if (isConflict || isCorrupt428) {
                    logService.error(`[WA-CLIENT] 🚨 ERROR CRÍTICO (${statusCode}). Sesión corrupta.`, disconnectError, userId);
                    sessions.delete(userId);
                    qrCache.delete(userId);
                    codeCache.delete(userId);
                    connectionLocks.delete(userId);
                    await clearBindedSession(userId); 
                    return; 
                }

                const shouldReconnect = !isLoggedOut;
                logService.warn(`[WA-CLIENT] Conexión cerrada (${statusCode}). Reconectando: ${shouldReconnect}`, userId);
                
                qrCache.delete(userId);
                codeCache.delete(userId);
                sessions.delete(userId); 
                connectionLocks.delete(userId); 

                if (shouldReconnect) {
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 3000); 
                } else {
                    logService.info(`[WA-CLIENT] Usuario desconectado. Limpiando datos.`, userId);
                    await clearBindedSession(userId); 
                }
            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] ✅ CONEXIÓN ESTABLECIDA.`, userId);
                qrCache.delete(userId);
                codeCache.delete(userId);
                connectionLocks.delete(userId);
                
                if (isNewLogin) {
                    const user = await db.getUser(userId);
                    if (user && !user.whatsapp_number) {
                        await db.updateUser(userId, { whatsapp_number: sock.user?.id?.split('@')[0] });
                    }
                }
            }
        });

        if (phoneNumber) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    codeCache.set(userId, code);
                } catch(e) {
                    logService.error("Error pidiendo código", e, userId);
                }
            }, 3000);
        }

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (messages.length === 0) return;
            
            try {
                const messagesByJid: Record<string, typeof messages> = {};
                for (const msg of messages) {
                    const jid = msg.key.remoteJid;
                    if (!jid || jid.endsWith('@g.us')) continue; 
                    if (!messagesByJid[jid]) messagesByJid[jid] = [];
                    messagesByJid[jid].push(msg);
                }

                const chatProcessPromises = Object.keys(messagesByJid).map(async (jid) => {
                    const chatMessages = messagesByJid[jid];
                    
                    for (const msg of chatMessages) {
                        try {
                            if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

                            const isFromMe = msg.key.fromMe;
                            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                            if (!jid || !messageText) continue;

                            const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Date.now() / 1000;
                            // Relaxed history check: 30 seconds buffer
                            const isHistory = msgTimestamp < (BOOT_TIMESTAMP - 30); 

                            const userMessage: Message = {
                                id: msg.key.id || Date.now().toString(),
                                text: messageText,
                                sender: isFromMe ? 'owner' : 'user', 
                                timestamp: new Date(msgTimestamp * 1000)
                            };

                            // --- NAME CAPTURE IMPROVEMENT ---
                            // Check multiple sources for the name
                            const senderName = msg.pushName || (msg as any).verifiedBizName || undefined;

                            await conversationService.addMessage(userId, jid, userMessage, senderName, isHistory);

                            if (!isFromMe && !isHistory && type === 'notify') {
                                if (messageDebounceMap.has(jid)) {
                                    clearTimeout(messageDebounceMap.get(jid)!);
                                }
                                messageDebounceMap.set(jid, setTimeout(() => {
                                    processAiResponseForJid(userId, jid).catch(err => console.error(`AI Error:`, err));
                                    messageDebounceMap.delete(jid);
                                }, DEBOUNCE_TIME_MS));
                            }
                        } catch (innerError) {
                            console.error(`Error procesando mensaje individual:`, innerError);
                        }
                    }
                });

                await Promise.all(chatProcessPromises);

            } catch (batchError) {
                console.error(`[WA-CLIENT] Error procesando batch:`, batchError);
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Fallo fatal al iniciar conexión`, error, userId);
    }
}

export async function disconnectWhatsApp(userId: string) {
    const sock = sessions.get(userId);
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(userId);
    }
    qrCache.delete(userId);
    codeCache.delete(userId);
    connectionLocks.delete(userId);
    await clearBindedSession(userId); 
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
}

export async function sendMessage(userId: string, jid: string, text: string) {
    const sock = sessions.get(userId);
    if (!sock) throw new Error(`WhatsApp no conectado.`);
    await sock.sendMessage(jid, { text });
}

async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const sock = sessions.get(userId);
    if (!sock) return;

    await sock.sendPresenceUpdate('composing', jid);
    const latestUser = await db.getUser(userId); 
    const safeJid = jid.replace(/\./g, '_');
    const latestConversation = latestUser?.conversations?.[safeJid] || latestUser?.conversations?.[jid];

    if (!latestConversation) return;

    const aiResult = await generateBotResponse(latestConversation.messages, user);

    if (aiResult?.responseText) {
        await sock.sendMessage(jid, { text: aiResult.responseText });
        const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date() };
        await conversationService.addMessage(userId, jid, botMessage);
    }
    
    if (aiResult) {
        const updates: Partial<Conversation> = {
            status: aiResult.newStatus,
            tags: [...new Set([...(latestConversation.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined 
        };

        if (aiResult.newStatus === LeadStatus.HOT) {
            updates.isMuted = true;
            updates.suggestedReplies = aiResult.suggestedReplies;
        }
        await db.saveUserConversation(userId, { ...latestConversation, ...updates });
    }
}

// UPDATE: Added 'force' parameter to bypass checks
export async function processAiResponseForJid(userId: string, jid: string, force: boolean = false) {
    const user = await db.getUser(userId);
    if (!user) return;

    const convs = await conversationService.getConversations(userId);
    const conversation = convs.find(c => c.id === jid);

    // Si está forzado, omitimos chequeos de estado del sistema (útil para debug o reactivación manual)
    if (!force) {
        if (!user.settings.isActive || user.plan_status === 'suspended') return;
        
        if (conversation?.isTestBotConversation) { 
            return _commonAiProcessingLogic(userId, jid, user, '[WA-CLIENT-ELITE-TEST]'); 
        }
        
        const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
        if (isIgnored) return;

        if (!conversation) return;

        // CRITICAL: If muted/personal, we normally stop. 
        // BUT if forced, we proceed.
        if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
    } else {
        logService.info(`[WA-CLIENT] ⚡ FORZANDO EJECUCIÓN IA para ${jid}`, userId);
    }

    return _commonAiProcessingLogic(userId, jid, user);
}
