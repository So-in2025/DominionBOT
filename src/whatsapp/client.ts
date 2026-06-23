
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
  isJidGroup,
  jidNormalizedUser,
  GroupMetadata
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ConnectionStatus, Message, LeadStatus, WhatsAppGroup, SocketEvents } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db, sanitizeKey } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession, hasValidSession } from './mongoAuth.js';
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';
import { Buffer } from 'buffer'; 
import { normalizeJid } from '../utils/jidUtils.js';
import { socketService } from '../services/socketService.js';
import { redis } from '../redis.js'; 

// GLOBAL STATE
const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const isConnecting = new Map<string, boolean>(); 

// REAL-TIME STATE TRACKING
const connectionStateMap = new Map<string, ConnectionStatus>();

export const waMetrics = {
    lastMessageReceived: null as Date | null,
    lastMessageSent: null as Date | null,
    messagesProcessed: 0,
    messagesSent: 0
};

// RECONNECTION STATE
const reconnectAttempts = new Map<string, number>();
const reconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// BAD MAC COUNTER (Anti-Loop Protection System)
// Rastrea cuántos errores de desencriptación ocurren para evitar llenar el log y la CPU
const badMacCounters = new Map<string, { count: number, lastTime: number }>();

// --- IN-MEMORY RETRY CACHE ---
const retryCacheMap = new Map<string, any>();
const msgRetryCounterCache = {
    get: <T>(key: string): T | undefined => {
        return retryCacheMap.get(key) as T | undefined;
    },
    set: (key: string, value: any) => {
        retryCacheMap.set(key, value);
    },
    del: (key: string) => {
        retryCacheMap.delete(key);
    },
    flushAll: () => {
        retryCacheMap.clear();
    }
};

// Logger setup - SILENT MODE FOR PRODUCTION
const logger = pino({ 
    level: 'fatal', 
    timestamp: () => `,"time":"${new Date().toISOString()}"`
}); 

export const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
export const ELITE_BOT_NAME = 'Simulador Neural';
export const DOMINION_NETWORK_JID = '5491110000000@s.whatsapp.net';

// --- HELPERS ---
const updateStatus = (userId: string, status: ConnectionStatus) => {
    connectionStateMap.set(userId, status);
    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status });
};

// --- MESSAGE EXTRACTION UTILS ---
function extractMessageContent(msg: proto.IWebMessageInfo | proto.IMessage): string | null {
    const message = (msg as any).message || msg; 
    if (!message) return null;

    if (message.protocolMessage || message.reactionMessage || message.pollUpdateMessage || message.keepInChatMessage || message.senderKeyDistributionMessage) {
        return null; 
    }

    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;

    if (message.ephemeralMessage?.message) return extractMessageContent(message.ephemeralMessage.message);
    if (message.viewOnceMessage?.message) return extractMessageContent(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2?.message) return extractMessageContent(message.viewOnceMessageV2.message);
    if (message.documentWithCaptionMessage?.message) return extractMessageContent(message.documentWithCaptionMessage.message);
    if (message.editedMessage?.message?.protocolMessage?.editedMessage) return extractMessageContent(message.editedMessage.message.protocolMessage.editedMessage);

    if (message.imageMessage) return '📷 [Imagen]';
    if (message.audioMessage) return '🎤 [Audio]';
    if (message.videoMessage) return '🎥 [Video]';
    if (message.documentMessage) return '📄 [Documento]';
    if (message.stickerMessage) return '👾 [Sticker]';
    if (message.contactMessage) return '👤 [Contacto]';
    if (message.locationMessage) return '📍 [Ubicación]';
    
    return null;
}

export function getSessionStatus(userId: string): { status: ConnectionStatus, qr?: string, pairingCode?: string } {
    const currentStatus = connectionStateMap.get(userId) || ConnectionStatus.DISCONNECTED;
    const qr = qrCache.get(userId);
    const code = codeCache.get(userId);

    if (currentStatus === ConnectionStatus.AWAITING_SCAN || currentStatus === ConnectionStatus.GENERATING_QR) {
        if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
        if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };
    }

    return { status: currentStatus };
}

export function getSocket(userId: string): WASocket | undefined {
    return sessions.get(userId);
}

const processedMessages = new Map<string, number>();

function isMessageProcessed(id: string): boolean {
    const now = Date.now();
    // Random cleanup to prevent memory leak (5% chance per check)
    if (Math.random() < 0.05) {
        for (const [key, timestamp] of processedMessages.entries()) {
            if (now - timestamp > 5 * 60 * 1000) { // 5 minutes TTL
                processedMessages.delete(key);
            }
        }
    }
    
    if (processedMessages.has(id)) {
        return true;
    }
    
    processedMessages.set(id, now);
    return false;
}

// ----------------------------------------------------------------------
// CORE CONNECTION LOGIC
// ----------------------------------------------------------------------
export async function connectToWhatsApp(userId: string, phoneNumber?: string, isManual: boolean = false) {
    if (reconnectTimeouts.has(userId)) {
        clearTimeout(reconnectTimeouts.get(userId));
        reconnectTimeouts.delete(userId);
    }

    if (isConnecting.get(userId)) {
        return;
    }
    
    if (!isManual) {
        const hasSession = await hasValidSession(userId);
        if (!hasSession) {
            logService.info(`[WA] Omitiendo reconexión automática para ${userId}: No hay sesión válida.`, userId);
            return;
        }
    }

    try {
        isConnecting.set(userId, true);
        updateStatus(userId, ConnectionStatus.GENERATING_QR);
        
        logService.info(`[WA] 🚀 [BOOT] Iniciando secuencia para ${phoneNumber || 'Session'}`, userId);
        
        if (isManual) {
            qrCache.delete(userId);
            codeCache.delete(userId);
            reconnectAttempts.set(userId, 0); 
            // Reset Bad MAC counter on manual connect for clean slate
            badMacCounters.set(userId, { count: 0, lastTime: Date.now() });
        }

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
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast') || jid?.endsWith('@newsletter'),
            syncFullHistory: false, 
            markOnlineOnConnect: false, 
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 60000, 
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 5000, 
            msgRetryCounterCache: msgRetryCounterCache,
            getMessage: async (key) => { return undefined; }
        });

        sessions.set(userId, sock);

        // --- SELF-HEALING: AGGRESSIVE BAD MAC HANDLER ---
        (sock.ws as any).on('error', async (err: any) => {
            const errStr = err?.message || JSON.stringify(err);
            if (errStr.includes('Bad MAC')) {
                const now = Date.now();
                const currentStats = badMacCounters.get(userId) || { count: 0, lastTime: now };
                
                // Si el último error fue hace más de 60 segundos, reseteamos el contador.
                if (now - currentStats.lastTime > 60 * 1000) { // 1 minute
                    currentStats.count = 0;
                }

                currentStats.count++;
                currentStats.lastTime = now;
                badMacCounters.set(userId, currentStats);

                logService.warn(`[WA-CRITICAL] 🚨 DETECTADO BAD MAC (${currentStats.count}/3). Posible desincronización.`, userId);

                // Si ocurren 3 o más errores en 60 segundos, la sesión está corrupta. Purgar inmediatamente.
                if (currentStats.count >= 3) { // 3 errors
                    logService.error(`[WA-FATAL] Desincronización de MAC detectada. Purgando sesión para auto-reparación inmediata.`, err, userId);
                    msgRetryCounterCache.flushAll(); // Clear retry cache
                    await purgeSession(userId);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        if (phoneNumber && !sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const currentSock = sessions.get(userId);
                    if (!currentSock) return;
                    
                    if (!currentSock.authState.creds.me && !codeCache.get(userId)) {
                        const code = await currentSock.requestPairingCode(phoneNumber);
                        codeCache.set(userId, code);
                        logService.info(`[WA] ✅ CÓDIGO: ${code}`, userId);
                        updateStatus(userId, ConnectionStatus.AWAITING_SCAN);
                        socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
                    }
                } catch (e: any) {
                    logService.error(`[WA] Error pidiendo código`, e, userId);
                    isConnecting.set(userId, false); 
                }
            }, 5000); 
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const pairingCode = (update as any).pairingCode;

            if (qr) {
                const qrDataUrl = await QRCode.toDataURL(qr);
                qrCache.set(userId, qrDataUrl);
                updateStatus(userId, ConnectionStatus.AWAITING_SCAN);
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, qr: qrDataUrl });
            }

            if (pairingCode) {
                codeCache.set(userId, pairingCode);
                updateStatus(userId, ConnectionStatus.AWAITING_SCAN);
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, pairingCode });
            }

            if (connection === 'close') {
                isConnecting.set(userId, false);
                sessions.delete(userId);
                
                const disconnectError = lastDisconnect?.error as Boom | any;
                const statusCode = disconnectError?.output?.statusCode;
                
                logService.warn(`[WA] 🔌 Conexión cerrada. Código: ${statusCode}`, userId);

                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    logService.info(`[WA] Sesión cerrada o inválida. Limpiando.`, userId);
                    await purgeSession(userId);
                    return; 
                }

                if (statusCode === DisconnectReason.restartRequired) {
                    connectToWhatsApp(userId, phoneNumber); 
                    return;
                }

                const attempts = reconnectAttempts.get(userId) || 0;
                const isStreamError = statusCode === 515; 
                const delay = isStreamError ? 2000 : Math.min(Math.pow(2, attempts) * 1000, 60000);
                
                if (delay > 3000) updateStatus(userId, ConnectionStatus.DISCONNECTED); 
                
                reconnectAttempts.set(userId, attempts + 1);
                const timeoutId = setTimeout(() => connectToWhatsApp(userId, phoneNumber), delay);
                reconnectTimeouts.set(userId, timeoutId);

            } else if (connection === 'open') {
                isConnecting.set(userId, false);
                reconnectAttempts.delete(userId); 
                
                logService.info(`[WA] ✅ CONECTADO Y OPERATIVO.`, userId);
                updateStatus(userId, ConnectionStatus.CONNECTED);
                
                qrCache.delete(userId);
                codeCache.delete(userId);
                
                if (sock.user?.id) {
                    const number = jidNormalizedUser(sock.user.id).split('@')[0];
                    await db.updateUser(userId, { whatsapp_number: number });
                    await db.updateUserSettings(userId, { isActive: true });
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            for (const msg of messages) {
                try {
                    if (msg.key.id && isMessageProcessed(msg.key.id)) continue;
                    if (msg.key.remoteJid === 'status@broadcast') continue;

                    waMetrics.lastMessageReceived = new Date();
                    waMetrics.messagesProcessed++;

                    const rawJid = msg.key.remoteJid;
                    const canonicalJid = normalizeJid(rawJid);
                    if (!canonicalJid || canonicalJid.endsWith('@newsletter')) continue;

                    const userConfig = await db.getUser(userId);
                    if (userConfig?.settings?.ignoredJids?.some(blocked => canonicalJid.includes(blocked))) continue; 

                    const msgTime = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low) || Math.floor(Date.now() / 1000);
                    const now = Math.floor(Date.now() / 1000);
                    
                    if (!msg.message) continue;
                    if (isJidGroup(canonicalJid)) continue; 

                    const messageText = extractMessageContent(msg);
                    if (!messageText) continue;

                    const isMe = msg.key.fromMe;
                    
                    const userMessage: Message = {
                        id: msg.key.id || Date.now().toString(),
                        text: messageText,
                        sender: isMe ? 'owner' : 'user',
                        timestamp: new Date(msgTime * 1000).toISOString()
                    };

                    await conversationService.addMessage(userId, canonicalJid, userMessage, msg.pushName);

                    if (!isMe) {
                        logService.info(`[INBOX] 📩 Nuevo mensaje de ${canonicalJid}`, userId);
                        
                        const diffSeconds = now - msgTime;
                        
                        if (diffSeconds <= 600) { 
                            // 0-10 min -> IA responde
                            await processAiResponseForJid(userId, canonicalJid);
                        } else if (diffSeconds <= 3600) { 
                            // 10-60 min -> Marcar pendiente
                            logService.info(`[INBOX] ⏳ Mensaje antiguo de ${canonicalJid} marcado como pendiente (Diferencia: ${diffSeconds}s).`, userId);
                        } else { 
                            // > 60 min -> Sólo CRM
                            logService.info(`[INBOX] 📂 Mensaje muy antiguo de ${canonicalJid} archivado silenciosamente en CRM (Diferencia: ${diffSeconds}s).`, userId);
                        }
                    }
                } catch (err: any) {
                    // console.error("Error processing message:", err.message); // Silent for now
                }
            }
        });

    } catch (error) {
        logService.error(`[WA] Error fatal iniciando cliente`, error, userId);
        isConnecting.set(userId, false);
        updateStatus(userId, ConnectionStatus.DISCONNECTED);
    }
}

// EXPORT PARA EL SERVIDOR (Graceful Shutdown)
export const activeSessions = sessions;

/**
 * Desconecta la sesión de WhatsApp.
 * @param userId ID del usuario
 * @param persistConfig (Opcional) Si es true, NO actualiza isActive a false en la DB. Útil para reinicios de servidor.
 */
export async function disconnectWhatsApp(userId: string, persistConfig: boolean = false) {
    if (reconnectTimeouts.has(userId)) {
        clearTimeout(reconnectTimeouts.get(userId));
        reconnectTimeouts.delete(userId);
    }

    const sock = sessions.get(userId);
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(userId);
    }
    isConnecting.set(userId, false);
    reconnectAttempts.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    // Solo desactivamos el bot si el usuario lo pidió explícitamente (persistConfig = false)
    if (!persistConfig) {
        await db.updateUserSettings(userId, { isActive: false });
    }
    
    updateStatus(userId, ConnectionStatus.DISCONNECTED);
}

export async function softResetConnection(userId: string) {
    await disconnectWhatsApp(userId);
    setTimeout(() => connectToWhatsApp(userId, undefined, true), 1000);
}

// HARD PURGE
export async function purgeSession(userId: string) {
    if (!userId) {
        console.error('[PURGE] Intento de purga sin userId.');
        return;
    }
    logService.warn(`[WA] ☢️ EJECUTANDO PURGA NUCLEAR DE SESIÓN.`, userId);
    
    if (reconnectTimeouts.has(userId)) {
        clearTimeout(reconnectTimeouts.get(userId));
        reconnectTimeouts.delete(userId);
    }
    reconnectAttempts.delete(userId);
    badMacCounters.delete(userId); // Limpiar contador para que no vuelva a dispararse

    const sock = sessions.get(userId);
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(userId);
    }
    
    isConnecting.set(userId, false); 
    qrCache.delete(userId);
    codeCache.delete(userId);
    connectionStateMap.delete(userId); 
    
    try {
        await clearBindedSession(userId);
        await db.updateUserSettings(userId, { isActive: false });
    } catch(e) {
        logService.error('[PURGE] Fallo limpieza DB', e, userId);
    }
    
    updateStatus(userId, ConnectionStatus.DISCONNECTED);
    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
}

const userMessageQueues = new Map<string, Promise<any>>();

export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string): Promise<any> {
    const canonicalJid = normalizeJid(jid);
    if (!canonicalJid) throw new Error("JID inválido");

    const enqueue = async () => {
        let sock = sessions.get(senderId);
        if (!sock) throw new Error("Socket no disponible");

        waMetrics.lastMessageSent = new Date();
        waMetrics.messagesSent++;

        if (!imageUrl) {
            await sock.sendPresenceUpdate('composing', canonicalJid);
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            await sock.sendPresenceUpdate('paused', canonicalJid);
            return await sock.sendMessage(canonicalJid, { text });
        } else {
            const buffer = imageUrl.startsWith('http') 
                ? { url: imageUrl } 
                : Buffer.from(imageUrl.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            return await sock.sendMessage(canonicalJid, { image: buffer as any, caption: text });
        }
    };

    const previousTask = userMessageQueues.get(senderId) || Promise.resolve();
    
    const newTask = new Promise((resolve, reject) => {
        previousTask.finally(async () => {
            try {
                const result = await enqueue();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        });
    });

    userMessageQueues.set(senderId, newTask);
    
    // Auto-clean queue to prevent memory leaks from retained task chains
    newTask.finally(() => {
        if (userMessageQueues.get(senderId) === newTask) {
            userMessageQueues.delete(senderId);
        }
    });

    return newTask;
}

export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
    const sock = sessions.get(userId);
    if (!sock) return [];
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map((g: GroupMetadata) => ({
            id: g.id,
            subject: g.subject,
            size: g.participants.length
        }));
    } catch {
        return [];
    }
}

export async function processAiResponseForJid(userId: string, jid: string, force: boolean = false) {
    const user = await db.getUser(userId);
    if (!user) return;

    const safeJid = sanitizeKey(jid);
    const conversation = user.conversations?.[safeJid] || user.conversations?.[jid];
    
    if (!conversation) return;

    if (!force) {
        if (!user.settings.isActive) return;
        if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
        
        const lastMsg = conversation.messages[conversation.messages.length - 1];
        if (lastMsg && (lastMsg.sender === 'bot' || lastMsg.sender === 'owner' || lastMsg.sender === 'elite_bot')) return;
    }

    const aiResult = await generateBotResponse(conversation, user, conversation.isTestBotConversation);

    if (aiResult?.responseText) {
        try {
            const sent = await sendMessage(userId, jid, aiResult.responseText);
            if (sent?.key.id) {
                await conversationService.addMessage(userId, jid, {
                    id: sent.key.id,
                    text: aiResult.responseText,
                    sender: 'bot',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (e) {
            logService.error(`[AI] Fallo enviando respuesta`, e, userId);
        }
    }

    if (aiResult) {
        const freshUser = await db.getUser(userId);
        const freshConvo = freshUser?.conversations?.[safeJid] || freshUser?.conversations?.[jid] || conversation;
        
        const updates: any = {
            status: aiResult.newStatus,
            tags: [...new Set([...(freshConvo.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined
        };

        if (aiResult.newStatus === LeadStatus.HOT && !freshUser?.settings.isAutonomousClosing) {
            updates.isMuted = true;
            updates.suggestedReplies = aiResult.suggestedReplies;
        }

        await conversationService.updateConversation(userId, { ...freshConvo, ...updates });
    }
}
