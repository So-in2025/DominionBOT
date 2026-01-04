
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
    if (connectingLocks.has(userId)) {
        return;
    }

    if (isManual) {
        reconnectionAttempts.set(userId, 0);
    }

    const attempts = reconnectionAttempts.get(userId) || 0;
    
    if (attempts >= 15) { // Increased limits for resilience
        logService.error(`[WA-CLIENT] 🛑 Máximo de reconexiones alcanzado para ${userId}. Pausa de seguridad.`, userId);
        setTimeout(() => reconnectionAttempts.set(userId, 0), 60000 * 2); 
        return; 
    }

    try {
        connectingLocks.add(userId);
        reconnectionAttempts.set(userId, attempts + 1);
        
        // ZOMBIE KILLER
        const oldSock = sessions.get(userId);
        if (oldSock) {
            try {
                oldSock.end(undefined);
                // @ts-ignore
                if (oldSock.ws) oldSock.ws.terminate(); 
                oldSock.ev.removeAllListeners('connection.update');
                oldSock.ev.removeAllListeners('creds.update');
                oldSock.ev.removeAllListeners('messages.upsert');
            } catch (e) {}
            sessions.delete(userId);
        }

        qrCache.delete(userId);
        codeCache.delete(userId);

        await new Promise(resolve => setTimeout(resolve, 1000));

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
            markOnlineOnConnect: true, // Keep online to reduce sync lag
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 20000, 
            retryRequestDelayMs: 2000,
            msgRetryCounterCache: retryCache,
            getMessage: async () => undefined
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => { 
            const { connection, lastDisconnect, qr, pairingCode: newPairingCode } = update;

            if (qr) {
                if (phoneNumber && !codeCache.get(userId) && !qrCache.get(userId)) { 
                    setTimeout(async () => {
                        try {
                            const currentSock = sessions.get(userId);
                            if (currentSock === sock && !currentSock.user && !codeCache.get(userId)) {
                                const code = await currentSock.requestPairingCode(phoneNumber);
                                codeCache.set(userId, code);
                            }
                        } catch (e) {}
                    }, 2000);
                }
                qrCache.set(userId, await QRCode.toDataURL(qr));
            }

            if (newPairingCode) {
                codeCache.set(userId, newPairingCode);
            }

            if (connection === 'close') {
                connectingLocks.delete(userId);
                
                const disconnectError = lastDisconnect?.error as Boom | any;
                const statusCode = disconnectError?.output?.statusCode;
                
                // CLEANUP
                qrCache.delete(userId);
                codeCache.delete(userId);
                sessions.delete(userId);

                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const isCryptoError = disconnectError?.message?.includes('Bad MAC');

                if (isLoggedOut || isCryptoError) {
                    await clearBindedSession(userId); 
                    reconnectionAttempts.set(userId, 0); 
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber, false), 1000);
                } else {
                    const currentAttempts = reconnectionAttempts.get(userId) || 0;
                    // AGGRESSIVE RECONNECT: Fast retries for first 5 attempts
                    const delay = currentAttempts < 5 ? 1000 : 5000;
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber, false), delay); 
                }

            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] ✅ CONEXIÓN ESTABLECIDA.`, userId);
                connectingLocks.delete(userId);
                reconnectionAttempts.set(userId, 0); 
                qrCache.delete(userId);
                codeCache.delete(userId);
                
                if (sock.user?.id) {
                    const connectedNumber = sock.user.id.split('@')[0];
                    await db.updateUser(userId, { whatsapp_number: connectedNumber });
                    await db.updateUserSettings(userId, { isActive: true });
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (!messages || messages.length === 0) return;
            
            try {
                const user = await db.getUser(userId);
                const ignoredJids = user?.settings.ignoredJids || [];
                const userConversations = user?.conversations || {};

                for (const msg of messages) {
                    const rawJid = msg.key.remoteJid;
                    const canonicalJid = normalizeJid(rawJid); 
                    
                    if (!canonicalJid || canonicalJid === 'status@broadcast' || canonicalJid.endsWith('@newsletter')) continue; 

                    const isGroup = isJidGroup(canonicalJid);
                    if (isGroup) continue; // For now ignore groups in main logic

                    const number = canonicalJid.split('@')[0];
                    if (ignoredJids.some(ignored => number.includes(ignored))) continue;

                    const isOwnerMessage = msg.key.fromMe;
                    
                    // CRITICAL: NEVER trigger AI for owner messages immediately
                    if (isOwnerMessage) {
                        // Just save to history, don't trigger AI
                        const messageText = extractMessageContent(msg);
                        if (messageText) {
                             const userMessage: Message = {
                                id: msg.key.id || Date.now().toString(),
                                text: messageText,
                                sender: 'owner',
                                timestamp: new Date((typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Date.now()/1000) * 1000).toISOString()
                            };
                            await conversationService.addMessage(userId, canonicalJid, userMessage, undefined);
                        }
                        continue;
                    }

                    // Process INCOMING Message
                    const bestName = msg.pushName || (msg as any).verifiedBizName || undefined;
                    const messageText = extractMessageContent(msg);
                    if (!messageText) continue;

                    const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Date.now() / 1000;
                    
                    // ANTI-FLOOD: Ignore old messages (> 2 mins ago) to prevent responding to backlog on reconnect
                    if (msgTimestamp < (Date.now() / 1000 - 120)) continue;

                    const userMessage: Message = {
                        id: msg.key.id || Date.now().toString(),
                        text: messageText,
                        sender: 'user', 
                        timestamp: new Date(msgTimestamp * 1000).toISOString()
                    };

                    await conversationService.addMessage(userId, canonicalJid, userMessage, bestName);
                    
                    // IA TRIGGER - ONLY FOR NOTIFY TYPE OR FRESH MESSAGES
                    if (type === 'notify' || type === 'append') {
                        // Double check: Is this truly a user message?
                        if (!msg.key.fromMe) {
                            logService.info(`[INBOX] 📩 Mensaje de ${canonicalJid}: "${messageText.substring(0, 20)}..."`, userId);
                            aiProcessingQueue.add(`${userId}::${canonicalJid}`);
                        }
                    }
                }
            } catch (batchError) {
                console.error(`[WA-CLIENT] Error procesando batch:`, batchError);
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Fallo fatal al iniciar conexión`, error, userId);
        connectingLocks.delete(userId);
    }
}

export async function disconnectWhatsApp(userId: string) {
    reconnectionAttempts.set(userId, 999); 
    const sock = sessions.get(userId);
    if (sock) {
        try { 
            sock.end(undefined);
            // @ts-ignore
            if (sock.ws) sock.ws.terminate(); 
        } catch (e) {}
        sessions.delete(userId);
    }
    qrCache.delete(userId);
    codeCache.delete(userId);
    connectingLocks.delete(userId);
    await db.updateUserSettings(userId, { isActive: false });
}

// --- GUARANTEED DELIVERY SYSTEM ---
export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string): Promise<proto.WebMessageInfo | undefined> {
    const canonicalJid = normalizeJid(jid); 
    if (!canonicalJid) throw new Error("Invalid JID");

    const MAX_RETRIES = 3;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            let sock = sessions.get(senderId);

            // 1. Check Socket Health
            // @ts-ignore
            if (!sock || !sock.ws || !sock.ws.isOpen) {
                logService.warn(`[SEND-RETRY] Intento ${attempt}/${MAX_RETRIES}: Socket desconectado. Intentando reconexión rápida...`, senderId);
                
                // Force a fast reconnect attempt
                connectToWhatsApp(senderId, undefined, false);
                
                // Wait for socket to possibly come alive (2s)
                await new Promise(r => setTimeout(r, 2000));
                sock = sessions.get(senderId);
                
                // @ts-ignore
                if (!sock || !sock.ws || !sock.ws.isOpen) {
                    throw new Error("Socket muerto tras intento de reconexión.");
                }
            }

            logService.debug(`[WA-CLIENT] Enviando mensaje a ${canonicalJid} (Intento ${attempt})...`, senderId);
            
            let sentMsg: proto.WebMessageInfo | undefined;
            if (imageUrl) {
                const base64Data = imageUrl.split(',')[1] || imageUrl;
                const buffer = Buffer.from(base64Data, 'base64');
                sentMsg = (await sock.sendMessage(canonicalJid, { image: buffer, caption: text })) as proto.WebMessageInfo | undefined;
            } else {
                sentMsg = (await sock.sendMessage(canonicalJid, { text })) as proto.WebMessageInfo | undefined;
            }
            
            if (!sentMsg || !sentMsg.key) throw new Error("No ack from Baileys");

            return sentMsg; // Success!

        } catch (e: any) {
            lastError = e;
            logService.warn(`[SEND-RETRY] Fallo intento ${attempt}: ${e.message}`, senderId);
            if (attempt < MAX_RETRIES) {
                // Exponential backoff: 1s, 2s, 4s...
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
        }
    }

    // If we get here, all retries failed.
    logService.error(`[SEND-FAIL] Fallo definitivo enviando a ${canonicalJid}: ${lastError?.message}`, lastError, senderId);
    throw new Error(`No se pudo enviar el mensaje tras ${MAX_RETRIES} intentos. Verifique su teléfono.`);
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
        throw new Error("Error obteniendo grupos.");
    }
}

export async function processAiResponseForJid(userId: string, jid: string, force: boolean = false) {
    const canonicalJid = normalizeJid(jid); 
    if (!canonicalJid) return;
    
    const user = await db.getUser(userId);
    if (!user) return;

    const safeJid = sanitizeKey(canonicalJid);
    const conversation = user.conversations?.[safeJid] || user.conversations?.[canonicalJid];

    if (!conversation) return;

    // --- STRICT ANTI-LOOP & LOGIC CHECK ---
    
    // 1. Check if bot is disabled/muted locally
    if (!force) {
        if (!user.settings.isActive || user.plan_status === 'suspended') return;
        if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
    }

    // 2. CRITICAL: CHECK LAST MESSAGE SENDER
    // We must fetch the absolute latest state from the DB or memory.
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    if (!lastMsg) return;

    // If last message was from BOT or OWNER, DO NOT RESPOND.
    // This stops the infinite loop dead in its tracks.
    if (lastMsg.sender === 'bot' || lastMsg.sender === 'owner' || lastMsg.sender === 'elite_bot') {
        logService.debug(`[AI-SKIP] El último mensaje en ${canonicalJid} no es del usuario (Sender: ${lastMsg.sender}). Ignorando.`, userId);
        return;
    }

    // 3. Socket Health Check (Don't waste AI tokens if we can't reply)
    const sock = sessions.get(userId);
    // @ts-ignore
    if (!sock || !sock.ws || !sock.ws.isOpen) {
         if(!force) {
             logService.warn(`[AI-SKIP] Socket desconectado para ${userId}.`, userId);
             return;
         }
    }

    if (sock) {
        await sock.sendPresenceUpdate('composing', canonicalJid);
    }

    const aiResult = await generateBotResponse(conversation, user, conversation.isTestBotConversation);

    if (aiResult?.responseText) {
        try {
            // REAL SEND with Retry Logic
            const sentMsg = await sendMessage(userId, canonicalJid, aiResult.responseText);
            
            if (sentMsg && sentMsg.key.id) {
                const botMessage: Message = { 
                    id: sentMsg.key.id, 
                    text: aiResult.responseText, 
                    sender: 'bot', 
                    timestamp: new Date().toISOString() 
                };
                await conversationService.addMessage(userId, canonicalJid, botMessage);
            }
        } catch (sendError) {
            logService.error(`[AI-ERROR] Error enviando respuesta IA:`, sendError, userId);
        }
    }
    
    if (aiResult) {
        const freshUser = await db.getUser(userId);
        const freshConvo = freshUser?.conversations?.[safeJid] || freshUser?.conversations?.[canonicalJid] || conversation;

        const updates: Partial<Conversation> = {
            status: aiResult.newStatus,
            tags: [...new Set([...(freshConvo.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined 
        };

        if (aiResult.newStatus === LeadStatus.HOT) {
            if (!freshUser?.settings.isAutonomousClosing) {
                updates.isMuted = true;
                updates.suggestedReplies = aiResult.suggestedReplies;
            } else {
                updates.isMuted = false;
                updates.suggestedReplies = undefined;
            }
        }
        await db.saveUserConversation(userId, { ...freshConvo, ...updates });
    }
}
