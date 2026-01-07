
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

// GLOBAL STATE
const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const isConnecting = new Map<string, boolean>(); 
const retryMap = new Map<string, any>();

// RECONNECTION STATE (Exponential Backoff & Timeout Tracking)
const reconnectAttempts = new Map<string, number>();
const reconnectTimeouts = new Map<string, NodeJS.Timeout>();

const msgRetryCounterCache = {
    get: (key: string) => retryMap.get(key),
    set: (key: string, value: any) => { retryMap.set(key, value); },
    del: (key: string) => { retryMap.delete(key); },
    flushAll: () => { retryMap.clear(); }
};

// Logger setup - Silent to avoid console spam in production
const logger = pino({ level: 'silent' }); 

export const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
export const ELITE_BOT_NAME = 'Simulador Neural';
export const DOMINION_NETWORK_JID = '5491110000000@s.whatsapp.net';

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
    const sock = sessions.get(userId);
    const qr = qrCache.get(userId);
    const code = codeCache.get(userId);

    // @ts-ignore
    if (sock?.user) return { status: ConnectionStatus.CONNECTED };
    
    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };
    
    if (isConnecting.get(userId)) return { status: ConnectionStatus.GENERATING_QR };

    return { status: ConnectionStatus.DISCONNECTED };
}

export function getSocket(userId: string): WASocket | undefined {
    return sessions.get(userId);
}

// ----------------------------------------------------------------------
// CORE CONNECTION LOGIC (v4.0 - ANTI-FRAGILE)
// ----------------------------------------------------------------------
export async function connectToWhatsApp(userId: string, phoneNumber?: string, isManual: boolean = false) {
    if (isConnecting.get(userId)) {
        // [DEEP TRACE] Warning about lock
        logService.warn(`[WA] ⚠️ Intento de conexión duplicado ignorado. Lock activo.`, userId);
        return;
    }
    
    // Clear any pending reconnects since we are connecting now
    if (reconnectTimeouts.has(userId)) {
        clearTimeout(reconnectTimeouts.get(userId));
        reconnectTimeouts.delete(userId);
    }
    
    // Safety: If automatic, ensure session exists
    if (!isManual) {
        const hasSession = await hasValidSession(userId);
        if (!hasSession) {
            // logService.debug(`[WA] No hay sesión previa válida para autoconectar.`, userId);
            return;
        }
    }

    try {
        isConnecting.set(userId, true);
        
        // [DEEP TRACE] Step 1: Initialization
        logService.info(`[WA] 🚀 [STEP 1/4] Iniciando secuencia de arranque para ${phoneNumber || 'QR Mode'}`, userId);
        socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.GENERATING_QR });
        
        // Reset QR/Code caches on new attempt
        if (isManual) {
            qrCache.delete(userId);
            codeCache.delete(userId);
            reconnectAttempts.set(userId, 0); 
        }

        // [DEEP TRACE] Step 2: DB & Auth State
        logService.info(`[WA] [STEP 2/4] Cargando estado de autenticación (MongoDB/Redis)...`, userId);
        const { state, saveCreds } = await useMongoDBAuthState(userId);
        
        logService.info(`[WA] [STEP 2.5/4] Obteniendo versión de Baileys...`, userId);
        const { version } = await fetchLatestBaileysVersion();
        const user = await db.getUser(userId);

        // [DEEP TRACE] Step 3: Socket Construction
        logService.info(`[WA] [STEP 3/4] Construyendo Socket...`, userId);

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
            
            // --- STABILITY SETTINGS ---
            syncFullHistory: false, 
            markOnlineOnConnect: false, 
            connectTimeoutMs: 60000, // Increased timeout
            defaultQueryTimeoutMs: 60000, 
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 5000, 
            msgRetryCounterCache: msgRetryCounterCache, 
            getMessage: async (key) => { return undefined; }
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        // [DEEP TRACE] Step 4: Event Listening
        logService.info(`[WA] [STEP 4/4] Escuchando eventos de conexión...`, userId);

        // [PAIRING CODE LOGIC] - Needs to be triggered explicitly if phone provided
        if (phoneNumber && !sock.authState.creds.registered) {
            logService.info(`[WA] 🔢 Solicitando código de emparejamiento para ${phoneNumber}... (Esperando inicio de socket)`, userId);
            
            setTimeout(async () => {
                try {
                    // Check if socket is still valid
                    const currentSock = sessions.get(userId);
                    if (!currentSock) {
                         logService.warn(`[WA] Socket muerto antes de pedir código.`, userId);
                         return;
                    }
                    
                    if (!currentSock.authState.creds.me && !codeCache.get(userId)) {
                        logService.info(`[WA] ⏳ Ejecutando requestPairingCode...`, userId);
                        const code = await currentSock.requestPairingCode(phoneNumber);
                        codeCache.set(userId, code);
                        logService.info(`[WA] ✅ CÓDIGO RECIBIDO: ${code}`, userId);
                        socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
                    }
                } catch (e: any) {
                    logService.error(`[WA] ❌ Error solicitando código de emparejamiento: ${e.message}`, e, userId);
                    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
                    isConnecting.set(userId, false); // Release lock on error
                }
            }, 6000); // Wait 6s for socket to be fully ready
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const pairingCode = (update as any).pairingCode;

            // [DEEP TRACE] Connection Update Log
            if (connection) logService.info(`[WA] 🔄 Estado de conexión: ${connection}`, userId);

            if (qr) {
                logService.info(`[WA] 📸 QR GENERADO. Enviando a cliente...`, userId);
                const qrDataUrl = await QRCode.toDataURL(qr);
                qrCache.set(userId, qrDataUrl);
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, qr: qrDataUrl });
            }

            if (pairingCode) {
                logService.info(`[WA] 🔢 Evento de código recibido: ${pairingCode}`, userId);
                codeCache.set(userId, pairingCode);
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.AWAITING_SCAN, pairingCode });
            }

            if (connection === 'close') {
                isConnecting.set(userId, false);
                sessions.delete(userId);
                
                const disconnectError = lastDisconnect?.error as Boom | any;
                const statusCode = disconnectError?.output?.statusCode;
                
                logService.warn(`[WA] 🔌 Conexión cerrada. Código: ${statusCode}`, userId);

                // --- NUCLEAR ERROR HANDLING ---
                
                // 1. LOGOUT / BAD SESSION (Radioactive)
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    logService.error(`[WA] ☢️ SESIÓN CORRUPTA O CERRADA (${statusCode}). EJECUTANDO PURGA.`, null, userId);
                    await clearBindedSession(userId);
                    await db.updateUserSettings(userId, { isActive: false });
                    qrCache.delete(userId);
                    codeCache.delete(userId);
                    reconnectAttempts.delete(userId);
                    
                    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
                    return; // DO NOT RECONNECT
                }

                // 2. CONNECTION REPLACED (Another instance opened)
                if (statusCode === DisconnectReason.connectionReplaced) {
                    logService.warn(`[WA] ⚠️ Conexión reemplazada desde otro nodo. Deteniendo este proceso.`, userId);
                    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
                    return; // DO NOT RECONNECT
                }

                // 3. RESTART REQUIRED (Crypto issue, usually fixable by restart)
                if (statusCode === DisconnectReason.restartRequired) {
                    logService.info(`[WA] Reinicio de protocolo criptográfico solicitado.`, userId);
                    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.RESETTING });
                    connectToWhatsApp(userId, phoneNumber); // Fast reconnect
                    return;
                }

                // 4. CONNECTION LOST / TIMED OUT (Network Issue)
                // Implement Exponential Backoff to prevent DB hammering
                const attempts = reconnectAttempts.get(userId) || 0;
                // Cap delay at 60 seconds. Formula: 2^attempts * 1000
                const delay = Math.min(Math.pow(2, attempts) * 1000, 60000);
                
                logService.warn(`[WA] Desconectado (${statusCode}). Reintento #${attempts + 1} en ${delay}ms...`, userId);
                
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
                
                reconnectAttempts.set(userId, attempts + 1);
                
                qrCache.delete(userId);
                codeCache.delete(userId);

                // TRACK TIMEOUT TO ALLOW CANCELLATION
                const timeoutId = setTimeout(() => connectToWhatsApp(userId, phoneNumber), delay);
                reconnectTimeouts.set(userId, timeoutId);

            } else if (connection === 'open') {
                isConnecting.set(userId, false);
                reconnectAttempts.delete(userId); // Success! Reset counters
                
                // Clear any pending timeout just in case
                if (reconnectTimeouts.has(userId)) {
                    clearTimeout(reconnectTimeouts.get(userId));
                    reconnectTimeouts.delete(userId);
                }

                logService.info(`[WA] ✅ CONEXIÓN ESTABLECIDA EXITOSAMENTE.`, userId);
                
                qrCache.delete(userId);
                codeCache.delete(userId);
                
                if (sock.user?.id) {
                    const number = jidNormalizedUser(sock.user.id).split('@')[0];
                    await db.updateUser(userId, { whatsapp_number: number });
                    await db.updateUserSettings(userId, { isActive: true });
                }
                
                socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.CONNECTED });
            }
        });

        // Message Handling
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            for (const msg of messages) {
                if (msg.key.remoteJid === 'status@broadcast') continue;

                const rawJid = msg.key.remoteJid;
                const canonicalJid = normalizeJid(rawJid);
                if (!canonicalJid || canonicalJid.endsWith('@newsletter')) continue;

                if (user?.settings?.ignoredJids?.some(blocked => canonicalJid.includes(blocked))) {
                    continue; 
                }

                const msgTime = (typeof msg.messageTimestamp === 'number' 
                    ? msg.messageTimestamp 
                    : (msg.messageTimestamp as any)?.low) || Math.floor(Date.now() / 1000);
                
                const now = Math.floor(Date.now() / 1000);
                const ageInSeconds = now - msgTime;
                
                if (ageInSeconds > 86400) continue; 

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

                const contactName = msg.pushName;
                
                await conversationService.addMessage(userId, canonicalJid, userMessage, contactName);

                if (!isMe) {
                    if (ageInSeconds > 300) continue; 
                    logService.info(`[INBOX] 📩 ${canonicalJid}: ${messageText.substring(0, 30)}...`, userId);
                    await processAiResponseForJid(userId, canonicalJid);
                }
            }
        });

    } catch (error) {
        logService.error(`[WA] ❌ ERROR FATAL en inicialización de cliente`, error, userId);
        isConnecting.set(userId, false);
        socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
    }
}

export async function disconnectWhatsApp(userId: string) {
    logService.info(`[WA] Solicitud de desconexión manual.`, userId);
    
    // CANCEL PENDING RECONNECTS
    const pendingTimeout = reconnectTimeouts.get(userId);
    if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        reconnectTimeouts.delete(userId);
        logService.debug(`[WA] Reintento pendiente cancelado para ${userId}`);
    }

    const sock = sessions.get(userId);
    if (sock) {
        try {
            sock.end(undefined);
        } catch (e) {}
        sessions.delete(userId);
    }
    isConnecting.set(userId, false);
    reconnectAttempts.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    await db.updateUserSettings(userId, { isActive: false });
    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
}

export async function softResetConnection(userId: string) {
    logService.warn(`[WA] Soft Reset solicitado para usuario`, userId);
    
    // CANCEL RECONNECTS
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
    msgRetryCounterCache.flushAll();
    
    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.RESETTING });
    // Force connect with manual flag
    await connectToWhatsApp(userId, undefined, true);
}

// HARD PURGE: Deletes session from DB/Redis + Stops process
export async function purgeSession(userId: string) {
    logService.warn(`[WA] ☢️ PURGA DE SESIÓN SOLICITADA (NUCLEAR).`, userId);
    
    // 1. Cancel Reconnects
    if (reconnectTimeouts.has(userId)) {
        clearTimeout(reconnectTimeouts.get(userId));
        reconnectTimeouts.delete(userId);
    }

    // 2. Kill Socket
    const sock = sessions.get(userId);
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(userId);
    }
    
    // 3. Clear Memory State
    isConnecting.set(userId, false);
    reconnectAttempts.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    // Nuke retry cache
    const keys = Array.from(retryMap.keys());
    keys.forEach(k => {
        if(k.startsWith(userId)) retryMap.delete(k);
    });

    // 4. Clear Persistence (Mongo + Redis)
    await clearBindedSession(userId);
    await db.updateUserSettings(userId, { isActive: false });
    
    socketService.emitToUser(userId, SocketEvents.SESSION_STATUS_UPDATE, { status: ConnectionStatus.DISCONNECTED });
}

// GRACEFUL SHUTDOWN HELPER
export async function closeAllSessions() {
    logService.info('[WA-MANAGER] Cerrando todas las sesiones para apagado seguro...');
    for (const [userId, sock] of sessions) {
        try {
            sock.end(undefined);
            logService.debug(`[WA-MANAGER] Sesión cerrada: ${userId}`);
        } catch (e) {
            console.error(`Error cerrando sesión ${userId}`, e);
        }
    }
    sessions.clear();
    // Clear all timeouts
    for (const t of reconnectTimeouts.values()) clearTimeout(t);
    reconnectTimeouts.clear();
}

/**
 * Calculates a human-like typing delay based on message length.
 * Approx 300 CPM (Chars Per Minute) + Jitter.
 */
function calculateTypingDelay(text: string): number {
    const minDelay = 2000;
    const charDelay = (text.length * 60 * 1000) / 400; // 400 CPM speed
    const jitter = Math.random() * 1500;
    return Math.min(Math.max(minDelay, charDelay + jitter), 12000); // Cap at 12s
}

// --- SELF-HEALING SEND PROTOCOL (WITH ANTI-BAN TYPING) ---
export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string) {
    let sock = sessions.get(senderId);
    const canonicalJid = normalizeJid(jid);
    if (!canonicalJid) throw new Error("JID inválido");

    const attemptSend = async (currentSock: WASocket) => {
        // @ts-ignore
        if (!currentSock || !currentSock.ws || !currentSock.ws.isOpen) {
            throw new Error("Socket cerrado");
        }

        // --- HUMANIZATION LAYER: TYPING SIMULATION ---
        // Only trigger typing simulation for text messages to mimic real behavior
        if (!imageUrl) {
            const delay = calculateTypingDelay(text);
            await currentSock.sendPresenceUpdate('composing', canonicalJid);
            await new Promise(resolve => setTimeout(resolve, delay));
            await currentSock.sendPresenceUpdate('paused', canonicalJid);
        }

        return await Promise.race([
            (async () => {
                if (imageUrl) {
                    const buffer = imageUrl.startsWith('http') 
                        ? { url: imageUrl } 
                        : Buffer.from(imageUrl.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                    return await currentSock.sendMessage(canonicalJid, { image: buffer as any, caption: text });
                } else {
                    return await currentSock.sendMessage(canonicalJid, { text });
                }
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_SEND")), 15000)) // Increased timeout to account for typing
        ]);
    };

    try {
        const result = await attemptSend(sock!);
        return result as any;

    } catch (e: any) {
        if (e.message !== 'TIMEOUT_SEND') {
            console.error(`[SEND-FAIL] Intento 1 fallido para ${canonicalJid}:`, e.message);
        }

        if (e.message === 'TIMEOUT_SEND' || e.message === 'Socket cerrado' || e.message.includes('Stream Ended') || e.message.includes('enc-')) {
            logService.warn(`[SELF-HEALING] 🚑 Recuperando conexión para envío...`, senderId);
            await softResetConnection(senderId);
            await new Promise(r => setTimeout(r, 3000));
            
            const newSock = sessions.get(senderId);
            if (!newSock) throw new Error("No se pudo restablecer la conexión.");

            logService.info(`[SELF-HEALING] 🔄 Reintentando envío...`, senderId);
            
            try {
                const retryResult = await attemptSend(newSock);
                logService.info(`[SELF-HEALING] ✅ Mensaje entregado.`, senderId);
                return retryResult as any;
            } catch (retryError: any) {
                logService.error(`[SELF-HEALING] 💀 Fallo total.`, retryError, senderId);
                throw new Error("Error persistente de conexión.");
            }
        }
        throw e; 
    }
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
            // Typing simulation is now handled inside sendMessage
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
            logService.error(`[AI] Error enviando respuesta a ${jid}`, e, userId);
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

        // Updated to use the service which emits the socket event
        await conversationService.updateConversation(userId, { ...freshConvo, ...updates });
    }
}
