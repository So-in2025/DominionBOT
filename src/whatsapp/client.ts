import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
  GroupMetadata,
  Contact,
  WAMessageKey
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

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const reconnectionAttempts = new Map<string, number>();

// Silent logger to keep terminal clean, we use logService
const logger = pino({ level: 'silent' }); 

export const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
export const ELITE_BOT_NAME = 'Simulador Neural';
export const DOMINION_NETWORK_JID = '5491110000000@s.whatsapp.net';

// AI Decoupling (Virtual Queue) & Traffic Governor
const aiProcessingQueue = new Set<string>();
let lastTickTime = Date.now();

// TRAFFIC GOVERNOR & AI QUEUE PROCESSOR
setInterval(async () => {
    // HARDWARE WATCHDOG: Check event loop lag
    const now = Date.now();
    const drift = now - lastTickTime - 2000; // Expected 2000ms
    lastTickTime = now;
    
    // If system is lagging (>500ms drift), enter DEGRADED mode
    const isDegraded = drift > 500;
    
    if (isDegraded) {
        logService.warn(`[WATCHDOG] ⚠️ Alta carga de CPU (Lag: ${drift}ms). Modo DEGRADADO activo.`, 'SYSTEM');
    }

    if (aiProcessingQueue.size > 0) {
        const itemsToProcess = Array.from(aiProcessingQueue).slice(0, isDegraded ? 1 : 3);
        
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

// RECURSIVE MESSAGE EXTRACTOR (The "Unwrapper")
function extractMessageContent(msg: proto.IWebMessageInfo | proto.IMessage): string | null {
    const message = (msg as any).message || msg; 
    if (!message) return null;

    // Ignore messages that are purely system/protocol related and have no user-visible content.
    if (message.protocolMessage || message.reactionMessage || message.pollUpdateMessage || message.keepInChatMessage || message.senderKeyDistributionMessage) {
        return null; 
    }

    // 1. Standard Text
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    
    // 2. Media Captions
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;

    // 3. Unwrap Complex Types
    if (message.ephemeralMessage?.message) return extractMessageContent(message.ephemeralMessage.message);
    if (message.viewOnceMessage?.message) return extractMessageContent(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2?.message) return extractMessageContent(message.viewOnceMessageV2.message);
    if (message.documentWithCaptionMessage?.message) return extractMessageContent(message.documentWithCaptionMessage.message);
    if (message.editedMessage?.message?.protocolMessage?.editedMessage) return extractMessageContent(message.editedMessage.message.protocolMessage.editedMessage);

    // 4. Media Placeholders (if they have no caption)
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

    if (sock?.user) return { status: ConnectionStatus.CONNECTED };
    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };

    return { status: ConnectionStatus.DISCONNECTED };
}

export function getSocket(userId: string): WASocket | undefined {
    return sessions.get(userId);
}

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
    const attempts = reconnectionAttempts.get(userId) || 0;
    if (attempts >= 5) {
        logService.error(`[WA-CLIENT] Máximo de reconexiones alcanzado para ${userId}. Abortando.`, userId);
        return; // Abort
    }
    reconnectionAttempts.set(userId, attempts + 1);
    logService.warn(`[WA-CLIENT] Intento de conexión #${attempts + 1} para ${userId}`, userId);

    const oldSock = sessions.get(userId);
    if (oldSock) {
        try {
            oldSock.end(undefined);
            // @ts-ignore
            oldSock.ws?.close(); 
            oldSock.ev.removeAllListeners('connection.update');
            oldSock.ev.removeAllListeners('creds.update');
            oldSock.ev.removeAllListeners('messages.update');
        } catch (e) {}
        sessions.delete(userId);
    }

    qrCache.delete(userId);
    codeCache.delete(userId);

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        logService.info(`[WA-CLIENT] Iniciando motor WhatsApp (Intento Limpio) para: ${userId}`, userId);
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
            syncFullHistory: true,
            markOnlineOnConnect: true, 
            defaultQueryTimeoutMs: 60000, 
            keepAliveIntervalMs: 10000, 
            retryRequestDelayMs: 2000,
            connectTimeoutMs: 60000,
            // BLOQUE 5: HISTORIAL NO DEBE ROMPER CONTEXTO
            getMessage: async () => undefined
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        // BLOQUE 3: DESINCRONIZACIÓN SIGNAL (MessageCounterError)
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                // @ts-ignore
                const err = update.error;
                if (err?.message?.includes('MessageCounterError') || (update as any).update?.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT) {
                    logService.warn('[WA-CLIENT] 🔴 Signal desync detected (MessageCounterError). Forcing session purge.', userId);
                    await clearBindedSession(userId);
                    // PATCH: Reset attempts so immediate reconnection doesn't fail
                    reconnectionAttempts.set(userId, 0); 
                    await disconnectWhatsApp(userId);
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 2000);
                    return;
                }
            }
        });

        sock.ev.on('connection.update', async (update: any) => { 
            const { connection, lastDisconnect, qr, isNewLogin, pairingCode: newPairingCode } = update;

            if (qr) {
                logService.info(`[WA-CLIENT] QR generado.`, userId);
                qrCache.set(userId, await QRCode.toDataURL(qr));
                
                if (phoneNumber && !codeCache.get(userId)) {
                    logService.info(`[WA-CLIENT] Solicitando código de emparejamiento para ${phoneNumber}...`, userId);
                    setTimeout(async () => {
                        try {
                            const currentSock = sessions.get(userId);
                            if (currentSock && !currentSock.user) {
                                const code = await currentSock.requestPairingCode(phoneNumber);
                                codeCache.set(userId, code);
                                logService.info(`[WA-CLIENT] Código generado: ${code}`, userId);
                            }
                        } catch (e) {
                            logService.error("Error pidiendo código", e, userId);
                        }
                    }, 2000); 
                }
            }

            if (newPairingCode) {
                codeCache.set(userId, newPairingCode);
            }

            if (connection === 'close') {
                const disconnectError = lastDisconnect?.error as Boom;
                const statusCode = disconnectError?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                qrCache.delete(userId);
                codeCache.delete(userId);
                sessions.delete(userId);

                if (isLoggedOut) {
                    logService.warn(`[WA-CLIENT] ⚠️ Sesión cerrada por WhatsApp (401/LoggedOut). Purgando datos.`, userId);
                    await clearBindedSession(userId); 
                    reconnectionAttempts.set(userId, 0); 
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 2000);
                } else {
                    const currentAttempts = reconnectionAttempts.get(userId) || 0;
                    const delay = Math.min(60000, 3000 * Math.pow(1.5, currentAttempts));
                    logService.warn(`[WA-CLIENT] Conexión interrumpida (Código: ${statusCode}). Reconectando en ${Math.round(delay/1000)}s... (Intento #${currentAttempts + 1})`, userId);
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), delay); 
                }

            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] ✅ CONEXIÓN ESTABLECIDA.`, userId);
                reconnectionAttempts.set(userId, 0); 
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

        sock.ev.on('chats.upsert', async (chats) => {
            if (!chats || chats.length === 0) return;
            const items = chats.map(c => {
                const canonicalJid = normalizeJid(c.id);
                if (!canonicalJid) return null;
                return {
                    jid: canonicalJid,
                    name: c.name || undefined,
                    timestamp: typeof c.conversationTimestamp === 'number' ? c.conversationTimestamp : undefined
                };
            }).filter(i => i !== null) as { jid: string; name?: string; timestamp?: number }[];
            
            await conversationService.ensureConversationsExist(userId, items);
        });

        sock.ev.on('contacts.upsert', async (contacts) => {
            if (!contacts || contacts.length === 0) return;
            const items = contacts.map(c => {
                const canonicalJid = normalizeJid(c.id);
                if (!canonicalJid) return null;
                return {
                    jid: canonicalJid,
                    name: c.name || c.notify || c.verifiedName || undefined
                };
            }).filter(c => c !== null && c.name) as { jid: string; name: string }[];
            
            await conversationService.ensureConversationsExist(userId, items);
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (!messages || messages.length === 0) return;
            
            if (type === 'append' && messages.length > 5) {
                logService.info(`[HISTORY] 📥 Procesando batch de ${messages.length} mensajes...`, userId);
            }
            
            try {
                // Fetch User & Conversations ONCE for the batch
                const user = await db.getUser(userId);
                const ignoredJids = user?.settings.ignoredJids || [];
                const userConversations = user?.conversations || {};

                const messagesByJid: Record<string, typeof messages> = {};
                
                for (const msg of messages) {
                    const rawJid = msg.key.remoteJid;
                    const canonicalJid = normalizeJid(rawJid); // BLOQUE 1
                    
                    if (!canonicalJid || canonicalJid === 'status@broadcast' || canonicalJid.endsWith('@newsletter')) continue; 

                    // BLOCK: Blacklist Check
                    // canonicalJid ya fue validado arriba (normalizeJid guard)
                    const number = canonicalJid.split('@')[0];
                    if (ignoredJids.some(ignored => number.includes(ignored))) {
                        continue;
                    }

                    if (!messagesByJid[canonicalJid]) messagesByJid[canonicalJid] = [];
                    messagesByJid[canonicalJid].push(msg);
                }

                // Process each chat's batch
                const chatProcessPromises = Object.keys(messagesByJid).map(async (canonicalJid) => {
                    const chatMessages = messagesByJid[canonicalJid];
                    const isGroup = canonicalJid.endsWith('@g.us');

                    // --- GROUP LOGIC (RADAR ONLY) ---
                    if (isGroup) {
                        if (type === 'notify') {
                            for (const msg of chatMessages) {
                                if (msg.key.fromMe) continue;
                                const text = extractMessageContent(msg);
                                if (!text) continue;
                                const sender = msg.key.participant || msg.participant || canonicalJid; 
                                const senderName = msg.pushName || 'Unknown';
                                radarService.processGroupMessage(userId, canonicalJid, canonicalJid, sender, senderName, text).catch(e => console.error(e));
                            }
                        }
                        return; 
                    }

                    // --- PRIVATE CHAT LOGIC (INBOX) ---
                    
                    // BLOQUE 2: ELIMINAR CHAT SI VOS INICIÁS LA CONVERSACIÓN
                    const firstMsg = chatMessages[0];
                    const isOwnerMessage = firstMsg.key.fromMe;
                    
                    // Check existence in the fetched map using sanitizeKey for DB compatibility
                    const safeJid = sanitizeKey(canonicalJid);
                    // Deterministic lookup (Block 4 logic preview)
                    const conversationExists = userConversations[safeJid] || userConversations[canonicalJid];

                    if (isOwnerMessage && !conversationExists) {
                        // IGNORAR TOTALMENTE: No crear chat, no guardar mensaje
                        return;
                    }

                    const bestName = firstMsg.pushName || (firstMsg as any).verifiedBizName || undefined;
                    
                    // Hydrate conversation only if allowed (it exists or it's inbound)
                    await conversationService.ensureConversationsExist(userId, [{ jid: canonicalJid, name: bestName }]);

                    for (const msg of chatMessages) {
                        try {
                            const messageText = extractMessageContent(msg);
                            
                            if (!messageText) {
                                continue; 
                            }

                            const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Date.now() / 1000;
                            const isOldForAI = type === 'append' || (msgTimestamp < (Date.now() / 1000 - 300)); 

                            const userMessage: Message = {
                                id: msg.key.id || Date.now().toString(),
                                text: messageText,
                                sender: msg.key.fromMe ? 'owner' : 'user', 
                                timestamp: new Date(msgTimestamp * 1000).toISOString()
                            };

                            const senderName = msg.pushName || (msg as any).verifiedBizName || undefined;

                            // 1. SAVE TO DB
                            await conversationService.addMessage(userId, canonicalJid, userMessage, senderName, isOldForAI);
                            
                            if (!msg.key.fromMe && !isOldForAI) {
                                logService.info(`[INBOX] 📩 Mensaje procesado de ${senderName || canonicalJid}: "${messageText.substring(0, 20)}..."`, userId);
                            }

                            // 2. QUEUE FOR AI (If new and not from me)
                            if (!msg.key.fromMe && !isOldForAI && type === 'notify') {
                                aiProcessingQueue.add(`${userId}::${canonicalJid}`);
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
    logService.info(`[WA-CLIENT] Ejecutando desconexión manual para ${userId}`, userId);
    const sock = sessions.get(userId);
    if (sock) {
        try { 
            sock.end(undefined);
            // @ts-ignore
            sock.ws?.close();
            sock.ev.removeAllListeners('connection.update');
        } catch (e) {}
        sessions.delete(userId);
    }
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await clearBindedSession(userId); 
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
}

export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string): Promise<proto.WebMessageInfo | undefined> {
    let sock: WASocket | undefined;
    const canonicalJid = normalizeJid(jid); // BLOQUE 1
    if (!canonicalJid) throw new Error("Invalid JID");

    if (senderId === DOMINION_NETWORK_JID) {
        const systemSettings = await db.getSystemSettings();
        if (!systemSettings.dominionNetworkJid) {
            throw new Error("Dominion Network JID no configurado en ajustes del sistema.");
        }
        sock = sessions.get('system_network'); 
        if (!sock) {
             throw new Error("System network client not active for sending permission messages.");
        }
    } else {
        sock = sessions.get(senderId);
    }

    if (!sock) throw new Error(`WhatsApp no conectado para el usuario ${senderId}.`);
    
    if (imageUrl) {
        try {
            const base64Data = imageUrl.split(',')[1] || imageUrl;
            const buffer = Buffer.from(base64Data, 'base64');
            return (await sock.sendMessage(canonicalJid, { image: buffer, caption: text })) as proto.WebMessageInfo | undefined;
        } catch (e) {
            console.error(`Error sending image to ${canonicalJid}:`, e);
            throw new Error("Failed to send image");
        }
    } else {
        return (await sock.sendMessage(canonicalJid, { text })) as proto.WebMessageInfo | undefined;
    }
}

export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
    const sock = sessions.get(userId);
    if (!sock) {
        throw new Error("WhatsApp no conectado.");
    }
    
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map((g: GroupMetadata) => {
            const id = normalizeJid(g.id);
            return id ? { id, subject: g.subject, size: g.participants.length } : null;
        }).filter(g => g !== null) as WhatsAppGroup[];
    } catch (e: any) {
        logService.error(`[WA-CLIENT] Error fetching groups for ${userId}`, e);
        throw new Error("Error obteniendo grupos de WhatsApp.");
    }
}

async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const canonicalJid = normalizeJid(jid); // BLOQUE 1
    if (!canonicalJid) return;

    const sock = sessions.get(userId);
    
    const latestUser = await db.getUser(userId);
    
    // BLOQUE 4: ACCESO DETERMINÍSTICO AL MAPA
    const safeJid = sanitizeKey(canonicalJid);
    const latestConversation = latestUser?.conversations?.[safeJid] || latestUser?.conversations?.[canonicalJid];

    if (!latestConversation) return;

    // BLOQUE 6: IA SOLO CORRE CON CONTEXTO VÁLIDO
    if (!latestConversation.messages || latestConversation.messages.length === 0) {
        logService.warn('[AI] No context available, skipping', userId);
        return;
    }

    const isTestBot = latestConversation.isTestBotConversation;

    if (!isTestBot && !sock) return; 

    if (!isTestBot && sock) {
        await sock.sendPresenceUpdate('composing', canonicalJid);
    }

    const aiResult = await generateBotResponse(latestConversation, latestUser || user, isTestBot);

    if (aiResult?.responseText) {
        if (isTestBot) {
            logService.info(`${logPrefix} Generada respuesta simulada para ${canonicalJid}`, userId);
            const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date().toISOString() };
            await conversationService.addMessage(userId, canonicalJid, botMessage);
        } else if (sock) {
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
        }
    }
    
    if (aiResult) {
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
                logService.info(`${logPrefix} Lead HOT detectado. Activando Shadow Mode (Silencio).`, userId);
            } else {
                updates.isMuted = false;
                updates.suggestedReplies = undefined;
                logService.info(`${logPrefix} Lead HOT detectado. Operando en Guardia Autónoma.`, userId);
            }
        }
        await db.saveUserConversation(userId, { ...freshConvo, ...updates });
    }
}

export async function processAiResponseForJid(userId: string, jid: string, force: boolean = false) {
    const canonicalJid = normalizeJid(jid); // BLOQUE 1
    if (!canonicalJid) {
        if (force) throw new Error(`Invalid JID: ${jid}`);
        return;
    }
    
    const user = await db.getUser(userId);
    if (!user) return;

    // BLOQUE 4: FORZAR IA DEBE SER DETERMINÍSTICO
    // No usar .find, acceso directo al mapa
    const safeJid = sanitizeKey(canonicalJid);
    const conversation = user.conversations?.[safeJid] || user.conversations?.[canonicalJid];

    if (!conversation) {
        logService.warn(`[WA-CLIENT] Force AI run failed. Conversation not found for JID: ${canonicalJid}`, userId);
        // Si es forzado, lanzamos error para debug
        if (force) throw new Error(`Conversation missing for ${canonicalJid}`);
        return;
    }

    if (conversation.isTestBotConversation) {
        if (user.plan_status === 'suspended') return;
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