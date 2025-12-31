
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
// FIX: Corrected malformed import statement for logService.
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';
// Removed SSE service import as it was previously commented out.

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const connectionAttempts = new Map<string, boolean>();
const DEBOUNCE_TIME_MS = 6000; 

// TIMESTAMP to differentiate History vs Live messages
const BOOT_TIMESTAMP = Date.now() / 1000;

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
    
    // SAFETY: If a session object exists but we are reconnecting, it might be stale. Kill it.
    if (sessions.has(userId)) {
        logService.warn(`[WA-CLIENT] Found existing session object for ${userId} during connect. Killing it to ensure fresh start.`, userId);
        try {
            sessions.get(userId)?.end(undefined);
            sessions.delete(userId);
        } catch (e) {
            console.error("Error killing stale session:", e);
        }
    }

    connectionAttempts.set(userId, true);
    qrCache.delete(userId);
    codeCache.delete(userId);

    try {
        logService.info(`[WA-CLIENT] Initiating WhatsApp connection for user: ${userId}`, userId);
        const { state, saveCreds } = await useMongoDBAuthState(userId);
        
        // FIX: Removed 'is' from destructuring, as it does not exist on fetchLatestBaileysVersion type.
        const { version } = await fetchLatestBaileysVersion();
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
            // FIX: Removed `pairingCode: phoneNumber ? true : false,` as it's not a direct config option for makeWASocket
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'), // Ignore broadcast messages
            syncFullHistory: true, // EXPLICITLY REQUEST HISTORY
        });

        sessions.set(userId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => { // FIX: Cast update to any for pairingCode destructuring
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
                const disconnectError = lastDisconnect?.error as Boom;
                const statusCode = disconnectError?.output?.statusCode;
                const errorPayload = disconnectError?.output?.payload;
                
                // CRITICAL FIX: Handle '428 Precondition Required' (Corruption) AND 'Stream Errored (conflict)'
                // This prevents infinite crash loops by nuking the bad session immediately.
                const isConflict = disconnectError?.message === 'Stream Errored' && disconnectError?.data === 'conflict';
                const isCorruptSession = statusCode === 428 || (errorPayload && errorPayload.statusCode === 428);

                if (isConflict || isCorruptSession) {
                    const reason = isConflict ? 'CONFLICTO (Otra sesión abierta)' : 'CORRUPCIÓN DE SESIÓN (428)';
                    logService.error(`[WA-CLIENT] 🚨 ${reason} DETECTADO para user ${userId}. Purgando sesión para permitir reconexión limpia.`, disconnectError, userId);
                    
                    // Do NOT attempt to reconnect automatically. Wipe everything.
                    await db.updateUser(userId, { whatsapp_number: '' });
                    await db.updateUserSettings(userId, { isActive: false });
                    await clearBindedSession(userId); // Nuke DB session
                    
                    sessions.delete(userId);
                    qrCache.delete(userId);
                    codeCache.delete(userId);
                    return; // EXIT loop - DO NOT RECONNECT
                }

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                logService.warn(`[WA-CLIENT] Connection closed for user ${userId}. Reason: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`, userId);
                
                qrCache.delete(userId);
                codeCache.delete(userId);

                if (shouldReconnect) {
                    // Exponential backoff or simple retry
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 2000); 
                } else {
                    logService.info(`[WA-CLIENT] User ${userId} logged out. Clearing session.`, userId);
                    await db.updateUser(userId, { whatsapp_number: '' });
                    await db.updateUserSettings(userId, { isActive: false });
                    await clearBindedSession(userId); 
                    sessions.delete(userId); 
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

        // FIX: Add logic to request pairing code if phoneNumber is provided, after sock is created.
        if (phoneNumber) {
            logService.info(`[WA-CLIENT] Requesting pairing code for user ${userId} with phone number.`, userId);
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                if (code) {
                    codeCache.set(userId, code);
                    logService.info(`[WA-CLIENT] Pairing code ${code} obtained for user ${userId}.`, userId);
                    // sseService.sendEvent(userId, 'pairing_code', { pairingCode: code }); // Re-enable if SSE is used
                } else {
                    logService.error(`[WA-CLIENT] Failed to obtain pairing code for user ${userId}.`, null, userId);
                }
            } catch (pairingCodeError) {
                logService.error(`[WA-CLIENT] Error requesting pairing code for user ${userId}.`, pairingCodeError, userId);
            }
        }

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            // Process ALL messages. 'type' can be 'notify' (new message) or 'append' (history).
            for (const msg of messages) {
                // Ignore status messages and messages without content
                if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

                // Basic Filtering & Extraction
                const jid = msg.key.remoteJid;
                const isFromMe = msg.key.fromMe;
                const contactName = msg.pushName || jid?.split('@')[0];
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                if (!jid || !messageText) continue;

                // HISTORY VS LIVE DETECTION
                // If the message is older than the server boot time (minus a small buffer), it's history.
                // We assume BOOT_TIMESTAMP is when this node process started.
                const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any).low;
                const isHistory = msgTimestamp < (BOOT_TIMESTAMP - 10); // 10s buffer

                const userMessage: Message = {
                    id: msg.key.id || Date.now().toString(),
                    text: messageText,
                    sender: isFromMe ? 'owner' : 'user', // Determine sender role
                    timestamp: new Date(msgTimestamp * 1000)
                };

                // Ingest the message (History or Live).
                // `isHistoryImport` flag tells `conversationService` to set `isBotActive: false` by default for these.
                await conversationService.addMessage(userId, jid, userMessage, contactName, isHistory);

                // AI TRIGGER LOGIC: Only trigger AI for NEW, INCOMING, NON-HISTORICAL messages.
                if (!isFromMe && !isHistory && type === 'notify') {
                    logService.info(`[WA-CLIENT] Live message detected from ${jid}. Queuing AI response.`, userId);
                    
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
                } else if (isHistory) {
                    logService.info(`[WA-CLIENT] History message ingested for ${jid} (timestamp: ${new Date(msgTimestamp * 1000).toLocaleString()}). AI not triggered.`, userId);
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
    logService.info(`[WA-CLIENT] Force disconnecting WhatsApp for user: ${userId}`, userId);
    
    // 1. Close socket if exists
    const sock = sessions.get(userId);
    if (sock) {
        try {
            sock.end(undefined); // Close connection
            await new Promise(resolve => setTimeout(resolve, 500)); // Give it a moment
        } catch (e) {
            console.error(`[WA-CLIENT] Error closing socket for ${userId}`, e);
        }
        sessions.delete(userId);
    }

    // 2. Clear Caches
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    // 3. FORCE Clear DB Session
    // Even if socket wasn't open, we must nuke the DB records to prevent ghost sessions
    await clearBindedSession(userId); 

    // 4. Update User Profile
    await db.updateUser(userId, { whatsapp_number: '' });
    await db.updateUserSettings(userId, { isActive: false });
    
    logService.info(`[WA-CLIENT] WhatsApp disconnected and session wiped for user: ${userId}`, userId);
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
 * Helper function for the common AI response generation and conversation update.
 * Extracted to ensure consistent logic after various checks and bypasses.
 */
async function _commonAiProcessingLogic(userId: string, jid: string, user: User, logPrefix: string = '[WA-CLIENT]') {
    const sock = sessions.get(userId);
    if (!sock) {
        logService.warn(`${logPrefix} Socket not found for user ${userId}, cannot send response to JID ${jid}.`, userId);
        return;
    }

    await sock.sendPresenceUpdate('composing', jid);
    const latestUser = await db.getUser(userId); // Re-fetch to get latest state
    const latestConversation = latestUser?.conversations?.[jid];

    if (!latestConversation) {
        logService.error(`${logPrefix} Latest conversation for JID ${jid} not found after message processing for user ${userId}.`, null, userId);
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
            if (latestConversation.isTestBotConversation) { // NEW: Use the explicit flag
                logService.info(`${logPrefix} Lead calificado por bot élite no cuenta para el trial de ${userId}.`, userId);
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

    // Fetch conversation immediately to get its flags
    const convs = await conversationService.getConversations(userId);
    const conversation = convs.find(c => c.id === jid);

    // NEW LOG: Debug Elite Bot conversation flags right before bypass logic
    if (jid === ELITE_BOT_JID) {
        logService.info(`[WA-CLIENT-DEBUG-ELITE] === ELITE BOT DEBUG START ===`, userId);
        logService.info(`[WA-CLIENT-DEBUG-ELITE] User ${userId} state: isActive=${user.settings.isActive}, plan_status=${user.plan_status}`, userId);
        if (conversation) {
            logService.info(`[WA-CLIENT-DEBUG-ELITE] Elite Bot convo ${jid} from DB: isTestBotConversation=${conversation.isTestBotConversation}, isMuted=${conversation.isMuted}, isBotActive=${conversation.isBotActive}, status=${conversation.status}`, userId);
            logService.info(`[WA-CLIENT-DEBUG-ELITE] Full conversation object for Elite Bot: ${JSON.stringify(conversation).substring(0, 500)}...`, userId);
        } else {
            logService.info(`[WA-CLIENT-DEBUG-ELITE] No conversation object found in DB for Elite Bot JID ${jid}.`, userId);
        }
        logService.info(`[WA-CLIENT-DEBUG-ELITE] === ELITE BOT DEBUG END ===`, userId);
    }
    
    // --- GLOBAL CHECKS (Apply to ALL JIDs, including test bot) ---
    // If the user's bot is globally inactive or plan is suspended, we skip AI processing for *any* JID.
    if (!user.settings.isActive || user.plan_status === 'suspended') {
        logService.info(`[WA-CLIENT] AI processing skipped for JID ${jid} (bot inactive or plan suspended globally for user ${userId}).`, userId);
        
        // Special handling for expired/suspended for REAL conversations, not test bot.
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
        return; // IMPORTANT: Return here if global checks fail
    }

    // --- ELITE BOT SPECIFIC BYPASS ---
    // If it's a test bot conversation (explicitly flagged in DB), and it passed global checks,
    // then we should *always* proceed to AI generation, bypassing conversation-specific rules.
    // This check is CRITICAL and must come before other conversation-specific filters.
    if (conversation?.isTestBotConversation) { 
        logService.info(`[WA-CLIENT] ELITE_BOT_JID ${jid} detected via conversation flag. Proceeding directly to AI generation.`, userId);
        return _commonAiProcessingLogic(userId, jid, user, '[WA-CLIENT-ELITE-TEST]'); // Call common logic and return
    }
    
    // --- REGULAR CONVERSATIONS: Apply standard conversation-specific checks. ---
    const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
    if (isIgnored) {
        logService.info(`[WA-CLIENT] JID ${jid} ignored for user ${userId}.`, userId);
        return;
    }

    // If conversation still doesn't exist, it's an edge case, maybe a message came before convo creation
    if (!conversation) {
        logService.warn(`[WA-CLIENT] No conversation object found for JID ${jid} after initial message ingestion and not an Elite Bot. Skipping AI.`, userId);
        return;
    }

    if (conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) {
        logService.info(`[WA-CLIENT] AI processing skipped for JID ${jid} (muted, inactive, or personal).`, userId);
        return;
    }

    // --- Fall through for regular JIDs that passed all checks ---
    return _commonAiProcessingLogic(userId, jid, user);
}
