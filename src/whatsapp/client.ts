
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
// Lock para evitar múltiples intentos de conexión simultáneos
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
        logService.info(`[WA-CLIENT] Reiniciando sesión existente en memoria para ${userId}.`, userId);
        try {
            const oldSock = sessions.get(userId);
            oldSock?.end(undefined);
            sessions.delete(userId);
        } catch (e) {
            console.error("Error limpiando sesión vieja:", e);
        }
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
            // IGNORE BROADCASTS AND GROUPS by default to prevent spamming
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
                
                // --- DETECTOR DE SESIÓN CORRUPTA (428 / 515 Loop) ---
                const isConflict = disconnectError?.message === 'Stream Errored' && disconnectError?.data === 'conflict';
                const isCorrupt428 = statusCode === 428; 
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                if (isConflict || isCorrupt428) {
                    logService.error(`[WA-CLIENT] 🚨 ERROR CRÍTICO (${statusCode}). Sesión corrupta. PURGANDO para reiniciar limpio.`, disconnectError, userId);
                    
                    sessions.delete(userId);
                    qrCache.delete(userId);
                    codeCache.delete(userId);
                    connectionLocks.delete(userId);
                    await clearBindedSession(userId); // Borrar de MongoDB
                    
                    // No reconectamos automáticamente. El usuario debe escanear de nuevo.
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
            
            // TRY-CATCH WRAPPER para evitar que un mensaje corrupto mate el proceso
            try {
                // 1. Group messages by Chat JID
                const messagesByJid: Record<string, typeof messages> = {};
                for (const msg of messages) {
                    const jid = msg.key.remoteJid;
                    if (!jid) continue;
                    // Ignore groups explicitly here as well, just in case
                    if (jid.endsWith('@g.us')) continue; 
                    
                    if (!messagesByJid[jid]) messagesByJid[jid] = [];
                    messagesByJid[jid].push(msg);
                }

                // 2. Process each chat concurrently
                const chatProcessPromises = Object.keys(messagesByJid).map(async (jid) => {
                    const chatMessages = messagesByJid[jid];
                    
                    for (const msg of chatMessages) {
                        try {
                            if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

                            const isFromMe = msg.key.fromMe;
                            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                            if (!jid || !messageText) continue;

                            const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any).low;
                            const isHistory = msgTimestamp < (BOOT_TIMESTAMP - 10); 

                            const userMessage: Message = {
                                id: msg.key.id || Date.now().toString(),
                                text: messageText,
                                sender: isFromMe ? 'owner' : 'user', 
                                timestamp: new Date(msgTimestamp * 1000)
                            };

                            // Guardar mensaje en BD
                            await conversationService.addMessage(userId, jid, userMessage, undefined, isHistory);

                            // IA Trigger (Solo si hay API Key y no es history)
                            if (!isFromMe && !isHistory && type === 'notify') {
                                if (messageDebounceMap.has(jid)) {
                                    clearTimeout(messageDebounceMap.get(jid)!);
                                }
                                messageDebounceMap.set(jid, setTimeout(() => {
                                    processAiResponseForJid(userId, jid).catch(err => {
                                        console.error(`AI Error for ${jid}:`, err);
                                    });
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
                console.error(`[WA-CLIENT] Error procesando batch de mensajes:`, batchError);
            }
        });

    } catch (error) {
        logService.error(`[WA-CLIENT] Fallo fatal al iniciar conexión`, error, userId);
        qrCache.delete(userId);
        codeCache.delete(userId);
        sessions.delete(userId);
        connectionLocks.delete(userId);
    }
}

export async function disconnectWhatsApp(userId: string) {
    logService.info(`[WA-CLIENT] Desconexión manual solicitada para: ${userId}`, userId);
    
    const sock = sessions.get(userId);
    
    if (sock) {
        try {
            sock.end(undefined);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            console.error(`Error cerrando socket`, e);
        }
        sessions.delete(userId);
    }

    qrCache.delete(userId);
    codeCache.delete(userId);
    connectionLocks.delete(userId);
    
    await clearBindedSession(userId); 
    
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
    
    logService.info(`[WA-CLIENT] Sesión purgada completamente.`, userId);
}

export async function sendMessage(userId: string, jid: string, text: string) {
    const sock = sessions.get(userId);
    if (!sock) throw new Error(`WhatsApp no conectado.`);
    await sock.sendMessage(jid, { text });
}

// Lógica de IA compartida (sin cambios mayores)
async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const sock = sessions.get(userId);
    if (!sock) return;

    await sock.sendPresenceUpdate('composing', jid);
    const latestUser = await db.getUser(userId); 
    // FIX: Access safely with sanitized key or raw key, since getUser returns Mixed now
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
                // log test bot
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
