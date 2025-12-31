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
import { ConnectionStatus, Message, LeadStatus, User } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import { logService } from '../services/logService.js';
import * as QRCode from 'qrcode';
// import { sseService } from '../services/sseService.js'; // Removed SSE service import

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const connectionAttempts = new Map<string, boolean>();
const DEBOUNCE_TIME_MS = 6000; 

const logger = pino({ level: 'silent' }); 

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

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
  connectionAttempts.set(userId, true);
  logService.info('Iniciando conexión a WhatsApp', userId);
  console.log(`[WA-CLIENT-DEBUG] Connect initiated for user ${userId}. Phone number provided: ${!!phoneNumber}`);
  
  const oldSock = sessions.get(userId);
  if (oldSock) {
      logService.warn(`[WA-CLIENT-DEBUG] Existing session found for ${userId}. Attempting to clear.`, userId);
      try { 
          oldSock.ev.removeAllListeners(undefined); 
          oldSock.end(undefined); 
      } catch(e) {
          console.error(`[WA-CLIENT-DEBUG] Error clearing old socket for ${userId}:`, e);
      }
      sessions.delete(userId);
  }
  qrCache.delete(userId);
  codeCache.delete(userId);
  // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event: Notify immediately of state change

  if (phoneNumber) {
      logService.info(`[WA-CLIENT-DEBUG] Phone number ${phoneNumber} provided. Clearing binded session.`, userId);
      await clearBindedSession(userId);
  }
  
  let user: User | null = null;
  try {
      const { version } = await fetchLatestBaileysVersion();
      user = await db.getUser(userId);
      const proxyUrl = user?.settings?.proxyUrl;
      let agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

      const { state, saveCreds } = await useMongoDBAuthState(userId);

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger as any),
        },
        printQRInTerminal: false,
        logger: logger as any,
        agent, 
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
      });

      sessions.set(userId, sock);
      sock.ev.on('creds.update', saveCreds);

      // CRITICAL FIX: Request pairing code immediately if phone number is provided, without setTimeout.
      if (phoneNumber && !sock.authState.creds.registered) {
          logService.info(`[WA-CLIENT-DEBUG] Requesting pairing code for ${phoneNumber}...`, userId);
          try {
              const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
              codeCache.set(userId, code);
              logService.info(`[WA-CLIENT-DEBUG] Pairing code generated for ${userId}: ${code}`, userId);
              // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event
          } catch (err) {
              logService.error('Error solicitando pairing code', err as Error, userId, user?.username);
              qrCache.delete(userId);
              codeCache.delete(userId);
              // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event
          }
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          // FIX: Safely access statusCode only if lastDisconnect.error is a Boom object.
          const disconnectError = lastDisconnect?.error;
          const error = disconnectError instanceof Boom ? disconnectError.output?.statusCode : undefined;
          console.log(`[WA-CLIENT-DEBUG] Connection update for ${userId}: connection=${connection}, qr=${!!qr}, lastDisconnect=${error}`);
          
          if (qr && !phoneNumber) { // Only set QR if not using pairing code method
            const qrImage = await QRCode.toDataURL(qr);
            qrCache.set(userId, qrImage);
            logService.info(`[WA-CLIENT-DEBUG] QR code generated for ${userId}.`, userId);
            // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event: Notify frontend of QR
          }
          if (connection === 'close') {
            qrCache.delete(userId);
            codeCache.delete(userId);
            // Re-using the 'error' variable which already holds the safely extracted status code.

            if (error === DisconnectReason.loggedOut) {
                logService.audit('Sesión de WhatsApp cerrada por el usuario', userId, user?.username || 'unknown');
                await disconnectWhatsApp(userId); // Use existing disconnect logic
            } else {
                if (connectionAttempts.get(userId)) {
                    logService.warn(`Conexión cerrada inesperadamente, reintentando en 5s...`, userId);
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 5000);
                } else {
                    logService.info(`Conexión cerrada, no se reintentará.`, userId);
                }
            }
            // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event: Notify frontend of disconnection
          } else if (connection === 'open') {
            logService.info('Conexión a WhatsApp establecida', userId);
            qrCache.delete(userId);
            codeCache.delete(userId);
            // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event: Notify frontend of successful connection
          }
      });

      sock.ev.on('messages.upsert', async (m) => {
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe || msg.key.remoteJid?.endsWith('@g.us')) return;
          
          const jid = msg.key.remoteJid!;
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
          if (!text) return;

          const user = await db.getUser(userId);
          if(!user) return;
          
          // CRITICAL: Plan & Trial Expiration Check
          if (new Date() > new Date(user.billing_end_date) && (user.plan_status === 'active' || user.plan_status === 'trial')) {
              user.plan_status = 'expired';
              await db.updateUser(userId, { plan_status: 'expired' });
              logService.audit('Plan/Prueba expirado, downgrade automático', userId, user.username);
          }

          const userMessage: Message = { id: msg.key.id!, text, sender: 'user', timestamp: new Date() };
          await conversationService.addMessage(userId, jid, userMessage, msg.pushName);

          const debounceKey = `${userId}_${jid}`;
          if (messageDebounceMap.has(debounceKey)) clearTimeout(messageDebounceMap.get(debounceKey));

          const timeout = setTimeout(async () => {
              messageDebounceMap.delete(debounceKey); 
              try {
                if(!user.settings.isActive || user.plan_status === 'suspended') return;
                
                const isIgnored = user.settings.ignoredJids?.some(id => id.includes(jid.split('@')[0]));
                if (isIgnored) return;

                const convs = await conversationService.getConversations(userId);
                const conversation = convs.find(c => c.id === jid);
                if (!conversation || conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
                
                await sock.sendPresenceUpdate('composing', jid);
                const aiResult = await generateBotResponse(conversation.messages, user);
                
                if (aiResult?.responseText) {
                    await sock.sendMessage(jid, { text: aiResult.responseText });
                    const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date() };
                    await conversationService.addMessage(userId, jid, botMessage);
                }
                
                if (aiResult) {
                    const previousStatus = conversation.status;
                    conversation.status = aiResult.newStatus;
                    conversation.tags = [...new Set([...(conversation.tags || []), ...(aiResult.tags || [])])];
                    if (aiResult.newStatus === LeadStatus.HOT) {
                        conversation.isMuted = true;
                        conversation.suggestedReplies = aiResult.suggestedReplies;
                    }

                    // PHASE 2 LOGIC: Trial by result (LIMITADO A 3 LEADS)
                    if (user.plan_status === 'trial' && aiResult.newStatus === LeadStatus.HOT && previousStatus !== LeadStatus.HOT) {
                        const currentCount = (user.trial_qualified_leads_count || 0) + 1;
                        if (currentCount >= 3) { // Changed from 2 to 3
                            await db.updateUser(userId, { plan_status: 'expired', trial_qualified_leads_count: currentCount });
                            logService.audit(`Prueba finalizada por alcanzar 3 leads calificados`, userId, user.username);
                        } else {
                            await db.updateUser(userId, { trial_qualified_leads_count: currentCount });
                        }
                    }
                    
                    await db.saveUserConversation(userId, conversation);
                }
              } catch (err) { 
                logService.error('Error en procesamiento IA', err as Error, userId, user.username); }
          }, DEBOUNCE_TIME_MS);
          messageDebounceMap.set(debounceKey, timeout);
      });
  } catch (err) {
      logService.error('Fallo crítico en conexión a WhatsApp', err as Error, userId, user?.username);
      // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event: Ensure SSE event is sent even on critical failure
  }
}

export async function disconnectWhatsApp(userId: string) {
    connectionAttempts.set(userId, false);
    const sock = sessions.get(userId);
    if (sock) {
        logService.info(`[WA-CLIENT-DEBUG] Disconnecting socket for user ${userId}.`, userId);
        try { sock.end(undefined); } catch(e) {
            console.error(`[WA-CLIENT-DEBUG] Error ending socket for ${userId} during disconnect:`, e);
        }
    }
    sessions.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    await clearBindedSession(userId);
    logService.info('Nodo de WhatsApp desconectado', userId);
    // sseService.sendEvent(userId, 'connection_status', getSessionStatus(userId)); // Removed SSE event
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Nodo no activo.');
  await sock.sendMessage(jid, { text });
}