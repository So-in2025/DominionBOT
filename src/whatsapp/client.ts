
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
  GroupMetadata,
  Contact
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
import { campaignService } from '../services/campaignService.js'; // To access Watchdog state if needed, or implementing local check.

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 

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
        const [item] = aiProcessingQueue; 
        
        // GOVERNOR LOGIC: If degraded, only process if absolutely necessary (e.g., skip processing, or just slow down)
        // Here we just consume one item per tick. In degraded mode, we might want to skip ticks.
        if (isDegraded && Math.random() < 0.5) return; // 50% throttle in degraded mode

        aiProcessingQueue.delete(item);   
        
        const [userId, jid] = item.split('::');
        if (userId && jid) {
            try {
                // In DEGRADED mode, we could check if the lead is already HOT and prioritize, 
                // but for now, simple throttling is safer.
                await processAiResponseForJid(userId, jid);
            } catch (err) {
                logService.error(`[AI-QUEUE] Error processing ${item}`, err, userId);
            }
        }
    }
}, 2000); 

// RECURSIVE MESSAGE EXTRACTOR (The "Unwrapper")
function extractMessageContent(msg: proto.IWebMessageInfo | proto.IMessage): string | null {
    const message = (msg as any).message || msg; 
    if (!message) return null;

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

    // 4. Media Placeholders
    if (message.imageMessage) return '📷 [Imagen]';
    if (message.audioMessage) return '🎤 [Audio]';
    if (message.videoMessage) return '🎥 [Video]';
    if (message.documentMessage) return '📄 [Documento]';
    if (message.stickerMessage) return '👾 [Sticker]';
    if (message.contactMessage) return '👤 [Contacto]';
    if (message.locationMessage) return '📍 [Ubicación]';
    
    // 5. Fallback for unknown types (Ensures visibility)
    if (Object.keys(message).length > 0) {
        // Ignore strictly technical messages that have no user value
        if (message.protocolMessage || message.reactionMessage || message.pollUpdateMessage || message.keepInChatMessage || message.senderKeyDistributionMessage) {
            return null; 
        }
        // If it has content but we don't know what it is, show something so the chat appears
        return '[Contenido Desconocido]'; 
    }

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
    const oldSock = sessions.get(userId);
    if (oldSock) {
        try {
            oldSock.end(undefined);
            // @ts-ignore
            oldSock.ws?.close(); 
            oldSock.ev.removeAllListeners('connection.update');
            oldSock.ev.removeAllListeners('creds.update');
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
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'), 
            syncFullHistory: true,
            markOnlineOnConnect: true, 
            defaultQueryTimeoutMs: 60000, 
            keepAliveIntervalMs: 10000, 
            retryRequestDelayMs: 2000,
            connectTimeoutMs: 60000,
            // CRITICAL OPTIMIZATION: Do NOT query DB in getMessage. 
            // This causes massive lag during history sync. Return empty placeholder.
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

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
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 2000);
                } else {
                    logService.warn(`[WA-CLIENT] Conexión interrumpida (Código: ${statusCode}). Reconectando en 3s...`, userId);
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 3000); 
                }

            } else if (connection === 'open') {
                logService.info(`[WA-CLIENT] ✅ CONEXIÓN ESTABLECIDA.`, userId);
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

        // --- BULK HISTORY HYDRATION PROTOCOL ---
        // Optimized Listener for Chat List updates
        sock.ev.on('chats.upsert', async (chats) => {
            if (!chats || chats.length === 0) return;
            const items = chats.map(c => ({
                jid: c.id,
                name: c.name || undefined,
                timestamp: typeof c.conversationTimestamp === 'number' ? c.conversationTimestamp : undefined
            }));
            await conversationService.ensureConversationsExist(userId, items);
        });

        // Optimized Listener for Contacts
        sock.ev.on('contacts.upsert', async (contacts) => {
            if (!contacts || contacts.length === 0) return;
            const items = contacts.map(c => ({
                jid: c.id,
                name: c.name || c.notify || c.verifiedName || undefined
            })).filter(c => c.name); // Only update if name exists
            await conversationService.ensureConversationsExist(userId, items);
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (!messages || messages.length === 0) return;
            
            // Log for visibility of data flow
            if (type === 'append' && messages.length > 5) {
                logService.info(`[HISTORY] 📥 Procesando batch de ${messages.length} mensajes...`, userId);
            }
            
            try {
                // HARD FILTER: BLACKLIST CHECK AT INGRESS
                // Get user settings ONCE for the batch to check ignoredJids
                const user = await db.getUser(userId);
                const ignoredJids = user?.settings.ignoredJids || [];

                const messagesByJid: Record<string, typeof messages> = {};
                
                for (const msg of messages) {
                    const jid = msg.key.remoteJid;
                    if (!jid || jid === 'status@broadcast') continue; 
                    
                    // BLOCK: If JID is in blacklist, completely ignore
                    // We check against the phone number part of the JID
                    const number = jid.split('@')[0];
                    if (ignoredJids.some(ignored => number.includes(ignored))) {
                        // logService.debug(`[BLOCKED] Mensaje ignorado de ${number}`, userId); // Optional verbose log
                        continue;
                    }

                    if (!messagesByJid[jid]) messagesByJid[jid] = [];
                    messagesByJid[jid].push(msg);
                }

                // Process each chat's batch
                const chatProcessPromises = Object.keys(messagesByJid).map(async (jid) => {
                    const chatMessages = messagesByJid[jid];
                    const isGroup = jid.endsWith('@g.us');

                    // --- GROUP LOGIC (RADAR ONLY) ---
                    if (isGroup) {
                        if (type === 'notify') {
                            for (const msg of chatMessages) {
                                if (msg.key.fromMe) continue;
                                const text = extractMessageContent(msg);
                                if (!text) continue;
                                const sender = msg.key.participant || msg.participant || jid; 
                                const senderName = msg.pushName || 'Unknown';
                                radarService.processGroupMessage(userId, jid, jid, sender, senderName, text).catch(e => console.error(e));
                            }
                        }
                        return; // Stop here for groups
                    }

                    // --- PRIVATE CHAT LOGIC (INBOX) ---
                    // FIX 1: FORCE CONVERSATION EXISTENCE BEFORE PROCESSING
                    // Ensure conversation exists even if messages are skipped later
                    const firstMsg = chatMessages[0];
                    const bestName = firstMsg.pushName || (firstMsg as any).verifiedBizName || undefined;
                    await conversationService.ensureConversationsExist(userId, [{ jid, name: bestName }]);

                    for (const msg of chatMessages) {
                        try {
                            // FIX 3: RELAXED FILTERING (NO SILENT CONTINUE)
                            let messageText = extractMessageContent(msg);
                            
                            if (!messageText) {
                                // Fallback content so we don't lose the message/conversation bump
                                messageText = '[Mensaje de Sistema/Contenido]'; 
                            }

                            const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Date.now() / 1000;
                            const isOldForAI = type === 'append' || (msgTimestamp < (Date.now() / 1000 - 300)); 

                            const userMessage: Message = {
                                id: msg.key.id || Date.now().toString(),
                                text: messageText,
                                sender: msg.key.fromMe ? 'owner' : 'user', 
                                timestamp: new Date(msgTimestamp * 1000)
                            };

                            const senderName = msg.pushName || (msg as any).verifiedBizName || undefined;

                            // 1. SAVE TO DB (Priority)
                            await conversationService.addMessage(userId, jid, userMessage, senderName, isOldForAI);
                            
                            // Log ingestion only for new messages to avoid spam
                            if (!msg.key.fromMe && !isOldForAI) {
                                logService.info(`[INBOX] 📩 Mensaje procesado de ${senderName || jid}: "${messageText.substring(0, 20)}..."`, userId);
                            }

                            // 2. QUEUE FOR AI (If new and not from me)
                            if (!msg.key.fromMe && !isOldForAI && type === 'notify') {
                                aiProcessingQueue.add(`${userId}::${jid}`);
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
    
    // DELAY CLEANUP TO ENSURE DB LOCKS ARE FREE
    await new Promise(resolve => setTimeout(resolve, 500));
    await clearBindedSession(userId); 
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
}

export async function sendMessage(senderId: string, jid: string, text: string, imageUrl?: string) {
    let sock: WASocket | undefined;
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
            await sock.sendMessage(jid, { image: buffer, caption: text });
        } catch (e) {
            console.error(`Error sending image to ${jid}:`, e);
            throw new Error("Failed to send image");
        }
    } else {
        await sock.sendMessage(jid, { text });
    }
}

export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
    const sock = sessions.get(userId);
    if (!sock) {
        throw new Error("WhatsApp no conectado.");
    }
    
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map((g: GroupMetadata) => ({
            id: g.id,
            subject: g.subject,
            size: g.participants.length
        }));
    } catch (e: any) {
        logService.error(`[WA-CLIENT] Error fetching groups for ${userId}`, e);
        throw new Error("Error obteniendo grupos de WhatsApp.");
    }
}

async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const sock = sessions.get(userId);
    
    const latestUser = await db.getUser(userId);
    const safeJid = sanitizeKey(jid);
    const latestConversation = latestUser?.conversations?.[safeJid] || latestUser?.conversations?.[jid];

    if (!latestConversation) return;

    const isTestBot = latestConversation.isTestBotConversation;

    if (!isTestBot && !sock) return; 

    if (!isTestBot && sock) {
        await sock.sendPresenceUpdate('composing', jid);
    }

    const aiResult = await generateBotResponse(latestConversation, latestUser || user, isTestBot);

    if (aiResult?.responseText) {
        if (isTestBot) {
            logService.info(`${logPrefix} Generada respuesta simulada para ${jid}`, userId);
        } else if (sock) {
            await sock.sendMessage(jid, { text: aiResult.responseText });
        }

        const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date(Date.now()) };
        await conversationService.addMessage(userId, jid, botMessage);
    }
    
    if (aiResult) {
        const freshUser = await db.getUser(userId);
        const freshConvo = freshUser?.conversations?.[safeJid] || freshUser?.conversations?.[jid] || latestConversation;

        const updates: Partial<Conversation> = {
            status: aiResult.newStatus,
            tags: [...new Set([...(freshConvo.tags || []), ...(aiResult.tags || [])])],
            suggestedReplies: undefined 
        };

        if (aiResult.newStatus === LeadStatus.HOT) {
            // PROTOCOLO GUARDIA: Solo silenciar si NO está en modo de cierre autónomo
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
    const user = await db.getUser(userId);
    if (!user) return;

    const convs = await conversationService.getConversations(userId);
    const conversation = convs.find(c => c.id === jid);

    if (!conversation) return;

    if (conversation.isTestBotConversation) {
        if (user.plan_status === 'suspended') return;
        return _commonAiProcessingLogic(userId, jid, user, '[WA-CLIENT-ELITE-TEST]');
    }

    if (!force) {
        if (!user.settings.isActive || user.plan_status === 'suspended') return;
        
        const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
        if (isIgnored) return;

        if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
    } else {
        logService.info(`[WA-CLIENT] ⚡ FORZANDO EJECUCIÓN IA para ${jid}`, userId);
    }

    return _commonAiProcessingLogic(userId, jid, user);
}
