
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
import { ConnectionStatus, Message, LeadStatus, WhatsAppGroup } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db, sanitizeKey } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';
import { Buffer } from 'buffer'; 
import { normalizeJid } from '../utils/jidUtils.js';

// GLOBAL STATE
const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const isConnecting = new Map<string, boolean>(); 

// RETRY CACHE (CRITICAL FOR BAD MAC RESILIENCE)
const retryMap = new Map<string, any>();
const msgRetryCounterCache = {
    get: (key: string) => retryMap.get(key),
    set: (key: string, value: any) => { retryMap.set(key, value); },
    del: (key: string) => { retryMap.delete(key); },
    flushAll: () => { retryMap.clear(); }
};

// Logger setup - Silent to avoid console spam
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
// CORE CONNECTION LOGIC (STABLE v3.3 - BACK TO BASICS)
// ----------------------------------------------------------------------
export async function connectToWhatsApp(userId: string, phoneNumber?: string, isManual: boolean = false) {
    if (isConnecting.get(userId)) {
        return;
    }
    
    const existingSock = sessions.get(userId);
    if (existingSock?.user) {
        // @ts-ignore
        if (existingSock.ws && existingSock.ws.isOpen) {
            return; 
        } else {
            sessions.delete(userId);
        }
    }

    try {
        isConnecting.set(userId, true);
        
        qrCache.delete(userId);
        codeCache.delete(userId);

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
            
            // --- STABILITY & RESILIENCE SETTINGS ---
            syncFullHistory: false, 
            markOnlineOnConnect: false, 
            
            // Timeouts
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 90000, // Aumentado para evitar Timeouts en prekeys
            keepAliveIntervalMs: 30000, 
            
            retryRequestDelayMs: 5000, 
            msgRetryCounterCache: msgRetryCounterCache, 
            
            getMessage: async (key) => {
                return undefined; 
            }
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const pairingCode = (update as any).pairingCode;

            if (qr) {
                if (phoneNumber && !codeCache.get(userId) && !qrCache.get(userId)) {
                    setTimeout(async () => {
                        try {
                            const currentSock = sessions.get(userId);
                            if (currentSock === sock && !currentSock.authState.creds.me && !codeCache.get(userId)) {
                                const code = await currentSock.requestPairingCode(phoneNumber);
                                codeCache.set(userId, code);
                            }
                        } catch (e) {
                            console.error("Pairing code error", e);
                        }
                    }, 3000);
                }
                qrCache.set(userId, await QRCode.toDataURL(qr));
            }

            if (pairingCode) {
                codeCache.set(userId, pairingCode);
            }

            if (connection === 'close') {
                isConnecting.set(userId, false);
                sessions.delete(userId);
                
                const disconnectError = lastDisconnect?.error as Boom | any;
                const statusCode = disconnectError?.output?.statusCode;
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                qrCache.delete(userId);
                codeCache.delete(userId);

                if (shouldReconnect) {
                    const delay = statusCode === DisconnectReason.restartRequired ? 1000 : 5000;
                    if (statusCode !== DisconnectReason.restartRequired) {
                        logService.warn(`[WA] Desconectado (${statusCode}). Reconectando en ${delay}ms...`, userId);
                    }
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), delay);
                } else {
                    logService.warn(`[WA] Sesión cerrada (Log Out). Limpiando datos.`, userId);
                    await clearBindedSession(userId);
                    await db.updateUserSettings(userId, { isActive: false });
                }
            } else if (connection === 'open') {
                isConnecting.set(userId, false);
                logService.info(`[WA] ✅ CONEXIÓN ESTABLECIDA.`, userId);
                qrCache.delete(userId);
                codeCache.delete(userId);
                
                if (sock.user?.id) {
                    const number = jidNormalizedUser(sock.user.id).split('@')[0];
                    await db.updateUser(userId, { whatsapp_number: number });
                    await db.updateUserSettings(userId, { isActive: true });
                }
            }
        });

        // Message Handling
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            for (const msg of messages) {
                // --- PROTOCOLO DE INGESTA SILENCIOSA ---
                // Calculamos la antigüedad del mensaje
                const msgTime = (typeof msg.messageTimestamp === 'number' 
                    ? msg.messageTimestamp 
                    : (msg.messageTimestamp as any)?.low) || Math.floor(Date.now() / 1000);
                
                const now = Math.floor(Date.now() / 1000);
                const ageInSeconds = now - msgTime;
                
                // CRITICAL: Filter Bad MAC loops from absolute garbage timestamps
                if (ageInSeconds > 86400) continue; // Ignore messages older than 24h completely

                if (!msg.message) continue;
                
                const rawJid = msg.key.remoteJid;
                const canonicalJid = normalizeJid(rawJid);
                if (!canonicalJid || canonicalJid === 'status@broadcast' || canonicalJid.endsWith('@newsletter')) continue;
                
                if (user?.settings?.ignoredJids?.includes(canonicalJid.split('@')[0])) {
                    continue; 
                }

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
                
                // GUARDAMOS SIEMPRE EN DB (Para Chatlist)
                await conversationService.addMessage(userId, canonicalJid, userMessage, contactName);

                // --- AI TRIGGER LOGIC ---
                // Solo si NO soy yo
                if (!isMe) {
                    logService.info(`[INBOX] 📩 ${canonicalJid}: ${messageText.substring(0, 30)}...`, userId);
                    
                    // REGLA DE 10 MINUTOS (600 segundos)
                    // Si el mensaje es viejo, lo guardamos pero NO disparamos la IA.
                    // Esto previene bucles de spam al resincronizar.
                    if (ageInSeconds > 600) {
                        logService.info(`[SILENT-INGEST] Mensaje antiguo (${ageInSeconds}s). Guardado sin respuesta IA.`, userId);
                        continue; // SKIP AI
                    }

                    // Si es reciente, procesamos
                    await processAiResponseForJid(userId, canonicalJid);
                }
            }
        });

    } catch (error) {
        logService.error(`[WA] Error fatal en conexión`, error, userId);
        isConnecting.set(userId, false);
    }
}

export async function disconnectWhatsApp(userId: string) {
    const sock = sessions.get(userId);
    if (sock) {
        try {
            sock.end(undefined);
        } catch (e) {}
        sessions.delete(userId);
    }
    isConnecting.set(userId, false);
    qrCache.delete(userId);
    codeCache.delete(userId);
    await db.updateUserSettings(userId, { isActive: false });
}

export async function softResetConnection(userId: string) {
    logService.warn(`[WA] Soft Reset solicitado para usuario`, userId);
    // 1. Force close existing socket
    const sock = sessions.get(userId);
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(userId);
    }
    isConnecting.set(userId, false);
    
    // 2. Clear caches
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    // 3. Clear Retry Cache (Fixes Bad MAC loops)
    msgRetryCounterCache.flushAll();

    // 4. Reconnect immediately
    await connectToWhatsApp(userId, undefined, true);
}

export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string) {
    const sock = sessions.get(senderId);
    
    if (!sock) throw new Error("Cliente desconectado (Sesión no encontrada)");
    
    // @ts-ignore
    if (sock.ws && !sock.ws.isOpen) {
        throw new Error("Cliente desconectado (Socket cerrado)");
    }

    const canonicalJid = normalizeJid(jid);
    if (!canonicalJid) throw new Error("JID inválido");

    try {
        // TIMEOUT WRAPPER: Si el socket se cuelga (zombie), esto evita que la UI se quede cargando infinito.
        const sendPromise = new Promise(async (resolve, reject) => {
            try {
                if (imageUrl) {
                    const buffer = imageUrl.startsWith('http') 
                        ? { url: imageUrl } 
                        : Buffer.from(imageUrl.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                        
                    const result = await sock.sendMessage(canonicalJid, { image: buffer as any, caption: text });
                    resolve(result);
                } else {
                    const result = await sock.sendMessage(canonicalJid, { text });
                    resolve(result);
                }
            } catch (e) {
                reject(e);
            }
        });

        // Race against a timeout of 10 seconds
        const result = await Promise.race([
            sendPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de espera agotado al enviar mensaje (Socket lento)")), 10000))
        ]);

        return result as any;

    } catch (e: any) {
        console.error("Error sending message:", e);
        if (e.message.includes("Tiempo de espera agotado")) {
            throw new Error("La red de WhatsApp está lenta. Intenta de nuevo.");
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

// AI PROCESSOR WRAPPER
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
            const sock = sessions.get(userId);
            // @ts-ignore
            if (sock && sock.ws && sock.ws.isOpen) {
                // HUMAN DELAY & TYPING PRESENCE
                await sock.sendPresenceUpdate('composing', jid);
                // Delay aleatorio entre 1.5s y 2.5s para simular humano
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
                
                const sent = await sendMessage(userId, jid, aiResult.responseText);
                
                if (sent?.key.id) {
                    await conversationService.addMessage(userId, jid, {
                        id: sent.key.id,
                        text: aiResult.responseText,
                        sender: 'bot',
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                logService.warn(`[AI] No se pudo enviar respuesta a ${jid} porque el socket no está disponible o cerrado.`, userId);
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

        await db.saveUserConversation(userId, { ...freshConvo, ...updates });
    }
}
