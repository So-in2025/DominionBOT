
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
  GroupMetadata,
  Contact,
  WAMessageKey,
  isJidGroup
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ConnectionStatus, Message, LeadStatus, User, Conversation, WhatsAppGroup } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db, sanitizeKey } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';
import { radarService } from '../services/radarService.js'; 
import { Buffer } from 'buffer'; 
import { campaignService } from '../services/campaignService.js'; 
import { normalizeJid } from '../utils/jidUtils.js';

// GLOBAL STATE MANAGERS
const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const reconnectionAttempts = new Map<string, number>();
const connectingLocks = new Set<string>(); // MUTEX: Prevents parallel connection attempts

// RETRY CACHE (Prevent DB spam)
const msgRetryCounterMap = new Map<string, any>();
const retryCache = {
    get: (key: string) => msgRetryCounterMap.get(key),
    set: (key: string, value: any) => { msgRetryCounterMap.set(key, value) },
    del: (key: string) => { msgRetryCounterMap.delete(key) },
    flushAll: () => { msgRetryCounterMap.clear() }
};

// Silent logger
const logger = pino({ level: 'silent' }); 

export const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
export const ELITE_BOT_NAME = 'Simulador Neural';
export const DOMINION_NETWORK_JID = '5491110000000@s.whatsapp.net';

// AI QUEUE
const aiProcessingQueue = new Set<string>();
let lastTickTime = Date.now();

// TRAFFIC GOVERNOR
setInterval(async () => {
    const now = Date.now();
    const drift = now - lastTickTime - 2000;
    lastTickTime = now;
    
    // CPU Watchdog
    if (drift > 800) {
        logService.warn(`[WATCHDOG] ⚠️ Alta latencia de CPU (${drift}ms). Sistema bajo carga.`, 'SYSTEM');
    }

    if (aiProcessingQueue.size > 0) {
        const itemsToProcess = Array.from(aiProcessingQueue).slice(0, drift > 500 ? 1 : 3);
        
        for (const item of itemsToProcess) {
            aiProcessingQueue.delete(item);   
            const [userId, jid] = item.split('::');
            if (userId && jid) {
                try {
                    await processAiResponseForJid(userId, jid);
                } catch (err) {
                    logService.error(`[AI-QUEUE] Error processing ${item}`, err, userId);
                }
            }
        }
    }
}, 2000); 

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

    // Strict check: Socket must exist AND websocket must be open
    // @ts-ignore
    if (sock?.user && sock.ws?.isOpen) return { status: ConnectionStatus.CONNECTED };
    
    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };
    
    if (connectingLocks.has(userId)) return { status: ConnectionStatus.GENERATING_QR };

    return { status: ConnectionStatus.DISCONNECTED };
}

export function getSocket(userId: string): WASocket | undefined {
    return sessions.get(userId);
}

// ----------------------------------------------------------------------
// CORE CONNECTION LOGIC (ARMORED)
// ----------------------------------------------------------------------
export async function connectToWhatsApp(userId: string, phoneNumber?: string, isManual: boolean = false) {
    // 1. MUTEX CHECK: If already connecting, abort to prevent race conditions.
    if (connectingLocks.has(userId)) {
        logService.debug(`[WA-CLIENT] 🔒 Conexión en progreso para ${userId}. Ignorando solicitud duplicada.`, userId);
        return;
    }

    // 2. RECONNECTION LIMITER
    // FIX: If isManual is true (triggered from UI), reset attempts to 0 to bypass lockout
    if (isManual) {
        reconnectionAttempts.set(userId, 0);
        logService.info(`[WA-CLIENT] 🔄 Reseteo manual de intentos de conexión.`, userId);
    }

    const attempts = reconnectionAttempts.get(userId) || 0;
    
    if (attempts >= 10) { 
        logService.error(`[WA-CLIENT] 🛑 Máximo de reconexiones alcanzado para ${userId}. Pausa de seguridad (5m).`, userId);
        // Auto-reset after 5m in case no manual intervention happens
        setTimeout(() => reconnectionAttempts.set(userId, 0), 60000 * 5); 
        return; 
    }

    try {
        connectingLocks.add(userId);
        reconnectionAttempts.set(userId, attempts + 1);
        
        logService.info(`[WA-CLIENT] 🔌 Iniciando secuencia de conexión #${attempts + 1}`, userId);

        // 3. ZOMBIE KILLER: Aggressively destroy old sockets
        const oldSock = sessions.get(userId);
        if (oldSock) {
            logService.debug(`[WA-CLIENT] 🧟 Eliminando socket zombie anterior...`, userId);
            try {
                oldSock.end(undefined);
                // @ts-ignore
                if (oldSock.ws) oldSock.ws.terminate(); // Force kill
                oldSock.ev.removeAllListeners('connection.update');
                oldSock.ev.removeAllListeners('creds.update');
                oldSock.ev.removeAllListeners('messages.upsert');
            } catch (e) {}
            sessions.delete(userId);
        }

        // Clean caches
        qrCache.delete(userId);
        codeCache.delete(userId);

        // Wait a bit for OS to release ports
        await new Promise(resolve => setTimeout(resolve, 1500));

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
            
            // --- STABILITY CONFIGURATION ---
            syncFullHistory: false, 
            markOnlineOnConnect: false, 
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000, // Aggressive Keep-Alive (10s) to detect dead sockets
            retryRequestDelayMs: 2000,
            msgRetryCounterCache: retryCache,
            getMessage: async () => undefined
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => { 
            const { connection, lastDisconnect, qr, isNewLogin, pairingCode: newPairingCode } = update;

            // QR Handling
            if (qr) {
                // If we have a phone number, prefer pairing code
                if (phoneNumber && !codeCache.get(userId) && !qrCache.get(userId)) { 
                    // Only try pairing code ONCE per session to avoid spamming
                    logService.info(`[WA-CLIENT] QR detectado. Intentando upgrade a Código de Emparejamiento...`, userId);
                    setTimeout(async () => {
                        try {
                            // Verify socket is still the active one
                            const currentSock = sessions.get(userId);
                            if (currentSock === sock && !currentSock.user && !codeCache.get(userId)) {
                                const code = await currentSock.requestPairingCode(phoneNumber);
                                codeCache.set(userId, code);
                                logService.info(`[WA-CLIENT] 🔢 Código generado: ${code}`, userId);
                            }
                        } catch (e) {
                            logService.warn("No se pudo generar código de emparejamiento (posiblemente ya conectado o timeout).", userId);
                        }
                    }, 3000);
                }
                
                // Always cache QR as fallback
                qrCache.set(userId, await QRCode.toDataURL(qr));
                if (!phoneNumber) logService.info(`[WA-CLIENT] QR generado (Esperando escaneo).`, userId);
            }

            if (newPairingCode) {
                codeCache.set(userId, newPairingCode);
            }

            // Connection Closed Handling
            if (connection === 'close') {
                // RELEASE LOCK immediately on close so retry can happen
                connectingLocks.delete(userId);
                
                const disconnectError = lastDisconnect?.error as Boom | any;
                const statusCode = disconnectError?.output?.statusCode;
                const errorMsg = disconnectError?.message || 'Unknown';

                logService.warn(`[WA-CLIENT] 📉 Conexión cerrada. Código: ${statusCode}. Razón: ${errorMsg}`, userId);

                // CLEANUP
                qrCache.delete(userId);
                codeCache.delete(userId);
                sessions.delete(userId); // Remove from map immediately

                // ANALYZE ERROR
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const isCryptoError = errorMsg.includes('Bad MAC') || errorMsg.includes('Decryption failed');
                const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515

                if (isLoggedOut || isCryptoError) {
                    const reason = isCryptoError ? 'CORRUPCIÓN DE LLAVES (Bad MAC)' : 'SESIÓN CERRADA (401)';
                    logService.warn(`[WA-CLIENT] ☢️ ${reason}. Ejecutando purgado nuclear.`, userId);
                    await clearBindedSession(userId); 
                    reconnectionAttempts.set(userId, 0); 
                    // Reconnect clean after 2s
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber, false), 2000);
                } else {
                    // Soft Reconnect (Network issues, timeouts, etc)
                    const currentAttempts = reconnectionAttempts.get(userId) || 0;
                    // Fast retry for 515/408/440, slower for others
                    const isTransient = statusCode === 408 || statusCode === 440 || statusCode === 515;
                    const delay = isTransient ? 2000 : Math.min(30000, 2000 * Math.pow(1.5, currentAttempts)); 
                    
                    logService.info(`[WA-CLIENT] 🔄 Reconectando en ${Math.round(delay/1000)}s...`, userId);
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber, false), delay); 
                }

            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] ✅ CONEXIÓN ESTABLECIDA Y ESTABLE.`, userId);
                
                // RELEASE LOCK
                connectingLocks.delete(userId);
                
                reconnectionAttempts.set(userId, 0); 
                qrCache.delete(userId);
                codeCache.delete(userId);
                
                if (sock.user?.id) {
                    const connectedNumber = sock.user.id.split('@')[0];
                    // Ensure DB is in sync
                    await db.updateUser(userId, { whatsapp_number: connectedNumber });
                    await db.updateUserSettings(userId, { isActive: true });
                }
            }
        });

        // --- EVENT LISTENERS ---

        sock.ev.on('chats.upsert', async (chats) => {
            if (!chats || chats.length === 0) return;
            const items = chats.map(c => ({
                jid: normalizeJid(c.id)!,
                name: c.name || undefined,
                timestamp: typeof c.conversationTimestamp === 'number' ? c.conversationTimestamp : undefined
            })).filter(i => i.jid);
            await conversationService.ensureConversationsExist(userId, items);
        });

        sock.ev.on('contacts.upsert', async (contacts) => {
            if (!contacts || contacts.length === 0) return;
            const items = contacts.map(c => ({
                jid: normalizeJid(c.id)!,
                name: c.name || c.notify || c.verifiedName || undefined
            })).filter(c => c.jid && c.name);
            await conversationService.ensureConversationsExist(userId, items as any);
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (!messages || messages.length === 0) return;
            
            try {
                const user = await db.getUser(userId);
                const ignoredJids = user?.settings.ignoredJids || [];
                const userConversations = user?.conversations || {};

                // BATCH PROCESSING
                for (const msg of messages) {
                    const rawJid = msg.key.remoteJid;
                    const canonicalJid = normalizeJid(rawJid); 
                    
                    if (!canonicalJid || canonicalJid === 'status@broadcast' || canonicalJid.endsWith('@newsletter')) continue; 

                    const isGroup = isJidGroup(canonicalJid);
                    
                    // GROUP HANDLING (RADAR)
                    if (isGroup) {
                        if (type === 'notify' && !msg.key.fromMe) {
                            const text = extractMessageContent(msg);
                            if (text) {
                                const sender = msg.key.participant || msg.participant || canonicalJid; 
                                const senderName = msg.pushName || 'Unknown';
                                radarService.processGroupMessage(userId, canonicalJid, canonicalJid, sender, senderName, text).catch(e => console.error(e));
                            }
                        }
                        continue; 
                    }

                    // IGNORE LIST CHECK
                    const number = canonicalJid.split('@')[0];
                    if (ignoredJids.some(ignored => number.includes(ignored))) continue;

                    // CONVERSATION LOGIC
                    const isOwnerMessage = msg.key.fromMe;
                    const safeJid = sanitizeKey(canonicalJid);
                    const conversationExists = userConversations[safeJid] || userConversations[canonicalJid];

                    // Don't create chat for outgoing messages if chat doesn't exist (optional strictness)
                    if (isOwnerMessage && !conversationExists) continue;

                    const bestName = msg.pushName || (msg as any).verifiedBizName || undefined;
                    await conversationService.ensureConversationsExist(userId, [{ jid: canonicalJid, name: bestName }]);

                    const messageText = extractMessageContent(msg);
                    if (!messageText) continue;

                    const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Date.now() / 1000;
                    const isOldForAI = type === 'append' || (msgTimestamp < (Date.now() / 1000 - 300)); 

                    const userMessage: Message = {
                        id: msg.key.id || Date.now().toString(),
                        text: messageText,
                        sender: isOwnerMessage ? 'owner' : 'user', 
                        timestamp: new Date(msgTimestamp * 1000).toISOString()
                    };

                    await conversationService.addMessage(userId, canonicalJid, userMessage, bestName, isOldForAI);
                    
                    if (!isOwnerMessage && !isOldForAI) {
                        logService.info(`[INBOX] 📩 Mensaje de ${bestName || canonicalJid}: "${messageText.substring(0, 20)}..."`, userId);
                        if (type === 'notify') aiProcessingQueue.add(`${userId}::${canonicalJid}`);
                    }
                }
            } catch (batchError) {
                console.error(`[WA-CLIENT] Error procesando batch de mensajes:`, batchError);
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Fallo fatal al iniciar conexión`, error, userId);
        connectingLocks.delete(userId); // Ensure lock is released on crash
    }
}

export async function disconnectWhatsApp(userId: string) {
    logService.info(`[WA-CLIENT] 🔌 Desconexión manual solicitada.`, userId);
    
    // Prevent auto-reconnect logic from interfering
    reconnectionAttempts.set(userId, 999); 
    
    const sock = sessions.get(userId);
    if (sock) {
        try { 
            sock.end(undefined);
            // @ts-ignore
            if (sock.ws) sock.ws.terminate(); // Hard kill
            sock.ev.removeAllListeners('connection.update');
        } catch (e) {}
        sessions.delete(userId);
    }
    
    qrCache.delete(userId);
    codeCache.delete(userId);
    connectingLocks.delete(userId); // RELEASE LOCK
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await clearBindedSession(userId); 
    await db.updateUserSettings(userId, { isActive: false });
}

export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string): Promise<proto.WebMessageInfo | undefined> {
    let sock: WASocket | undefined;
    const canonicalJid = normalizeJid(jid); 
    if (!canonicalJid) throw new Error("Invalid JID");

    if (senderId === DOMINION_NETWORK_JID) {
        const systemSettings = await db.getSystemSettings();
        if (!systemSettings.dominionNetworkJid) throw new Error("Dominion Network JID no configurado.");
        sock = sessions.get('system_network'); 
    } else {
        sock = sessions.get(senderId);
    }

    if (!sock) throw new Error(`WhatsApp no conectado (Sesión no encontrada).`);
    
    // CRITICAL: Validate Socket State
    // @ts-ignore
    if (!sock.ws || !sock.ws.isOpen) {
        throw new Error(`WhatsApp no conectado (Socket cerrado/zombie).`);
    }
    
    try {
        if (imageUrl) {
            const base64Data = imageUrl.split(',')[1] || imageUrl;
            const buffer = Buffer.from(base64Data, 'base64');
            return (await sock.sendMessage(canonicalJid, { image: buffer, caption: text })) as proto.WebMessageInfo | undefined;
        } else {
            return (await sock.sendMessage(canonicalJid, { text })) as proto.WebMessageInfo | undefined;
        }
    } catch (e: any) {
        console.error(`[SEND-FAIL] Error enviando a ${canonicalJid}:`, e);
        throw new Error("Fallo en el envío del mensaje (Error de transporte).");
    }
}

export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
    const sock = sessions.get(userId);
    // @ts-ignore
    if (!sock || !sock.ws?.isOpen) throw new Error("WhatsApp no conectado.");
    
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map((g: GroupMetadata) => {
            const id = normalizeJid(g.id);
            return id ? { id, subject: g.subject, size: g.participants.length } : null;
        }).filter(g => g !== null) as WhatsAppGroup[];
    } catch (e: any) {
        logService.error(`[WA-CLIENT] Error fetching groups`, e, userId);
        throw new Error("Error obteniendo grupos.");
    }
}

async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const canonicalJid = normalizeJid(jid); 
    if (!canonicalJid) return;

    const sock = sessions.get(userId);
    // @ts-ignore
    const isSocketHealthy = sock && sock.ws && sock.ws.isOpen;

    const latestUser = await db.getUser(userId);
    const safeJid = sanitizeKey(canonicalJid);
    const latestConversation = latestUser?.conversations?.[safeJid] || latestUser?.conversations?.[canonicalJid];

    if (!latestConversation) return;
    if (!latestConversation.messages || latestConversation.messages.length === 0) return;

    const isTestBot = latestConversation.isTestBotConversation;

    if (!isTestBot && !isSocketHealthy) {
        logService.warn(`${logPrefix} 🚫 IA abortada: Socket desconectado.`, userId);
        return; 
    }

    if (!isTestBot && sock) {
        await sock.sendPresenceUpdate('composing', canonicalJid);
    }

    const aiResult = await generateBotResponse(latestConversation, latestUser || user, isTestBot);

    if (aiResult?.responseText) {
        if (isTestBot) {
            // Simulador logic...
            const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date().toISOString() };
            await conversationService.addMessage(userId, canonicalJid, botMessage);
        } else if (sock) {
            try {
                // REAL SEND
                const sentMsg = await sock.sendMessage(canonicalJid, { text: aiResult.responseText });
                
                if (sentMsg && sentMsg.key.id) {
                    const botMessage: Message = { 
                        id: sentMsg.key.id, 
                        text: aiResult.responseText, 
                        sender: 'bot', 
                        timestamp: new Date((sentMsg.messageTimestamp as number) * 1000).toISOString() 
                    };
                    await conversationService.addMessage(userId, canonicalJid, botMessage);
                }
            } catch (sendError) {
                logService.error(`${logPrefix} ❌ Error enviando respuesta IA:`, sendError, userId);
            }
        }
    }
    
    if (aiResult) {
        // ... (Status update logic remains same)
        const freshUser = await db.getUser(userId);
        const freshConvo = freshUser?.conversations?.[safeJid] || freshUser?.conversations?.[canonicalJid] || latestConversation;

        const updates: Partial<Conversation> = {
            status: aiResult.newStatus,
            tags: [...new Set([...(freshConvo.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined 
        };

        if (aiResult.newStatus === LeadStatus.HOT) {
            if (!freshUser?.settings.isAutonomousClosing) {
                updates.isMuted = true;
                updates.suggestedReplies = aiResult.suggestedReplies;
                logService.info(`${logPrefix} Lead HOT. Shadow Mode.`, userId);
            } else {
                updates.isMuted = false;
                updates.suggestedReplies = undefined;
                logService.info(`${logPrefix} Lead HOT. Guardia Autónoma.`, userId);
            }
        }
        await db.saveUserConversation(userId, { ...freshConvo, ...updates });
    }
}

export async function processAiResponseForJid(userId: string, jid: string, force: boolean = false) {
    const canonicalJid = normalizeJid(jid); 
    if (!canonicalJid) {
        if (force) throw new Error(`Invalid JID: ${jid}`);
        return;
    }
    
    const user = await db.getUser(userId);
    if (!user) return;

    const safeJid = sanitizeKey(canonicalJid);
    const conversation = user.conversations?.[safeJid] || user.conversations?.[canonicalJid];

    if (!conversation) {
        if (force) throw new Error(`Conversation missing for ${canonicalJid}`);
        return;
    }

    if (conversation.isTestBotConversation) {
        return _commonAiProcessingLogic(userId, canonicalJid, user, '[WA-CLIENT-ELITE-TEST]');
    }

    if (!force) {
        if (!user.settings.isActive || user.plan_status === 'suspended') return;
        
        const isIgnored = user.settings.ignoredJids?.some(id => id.includes(canonicalJid.split('@')[0]));
        if (isIgnored) return;

        if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
    } else {
        logService.info(`[WA-CLIENT] ⚡ FORZANDO EJECUCIÓN IA para ${canonicalJid}`, userId);
    }

    return _commonAiProcessingLogic(userId, canonicalJid, user);
}
