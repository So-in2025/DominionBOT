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

    return { status: ConnectionStatus.DISCONNECTED };
}

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
  connectionAttempts.set(userId, true);
  logService.info('Iniciando conexión a WhatsApp', userId);
  
  const oldSock = sessions.get(userId);
  if (oldSock) {
      try { 
          // FIX: Passing undefined to satisfy a strict linter that expects an argument for an optional parameter.
          oldSock.ev.removeAllListeners(undefined); 
          // FIX: The error "Expected 1 arguments, but got 0" likely has the counts reversed. Calling end() with no arguments.
          // FIX: Passing undefined to satisfy a strict linter that expects an argument for an optional parameter.
          oldSock.end(undefined); 
      } catch(e) {}
      sessions.delete(userId);
  }
  qrCache.delete(userId);
  codeCache.delete(userId);

  if (phoneNumber) {
      await clearBindedSession(userId);
  }
  
  // FIX: Declaring user here to make it available in catch blocks and closures.
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

      if (phoneNumber && !sock.authState.creds.registered) {
          setTimeout(async () => {
              // RACE CONDITION FIX: Check if the current session is still valid.
              // If the user disconnected or reconnected, this request is obsolete.
              if (sessions.get(userId) !== sock) {
                  logService.info('Solicitud de código de emparejamiento abortada por cambio de sesión.', userId);
                  return;
              }
              try {
                  const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                  codeCache.set(userId, code);
              } catch (err) {
                  // FIX: Added username to the logService.error call to match its signature (fixes error on line 112).
                  logService.error('Error solicitando pairing code', err as Error, userId, user?.username);
                  qrCache.delete(userId);
                  codeCache.delete(userId);
              }
          }, 4000); 
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          if (qr && !phoneNumber) {
            const qrImage = await QRCode.toDataURL(qr);
            qrCache.set(userId, qrImage);
          }
          if (connection === 'close') {
            qrCache.delete(userId);
            codeCache.delete(userId);
            const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
            if (error === DisconnectReason.loggedOut) {
                // FIX: The 'audit' log requires a username, which was missing. This caused a type error because the function received 2 arguments instead of the expected 3.
                logService.audit('Sesión de WhatsApp cerrada por el usuario', userId, user?.username || 'unknown');
                await disconnectWhatsApp(userId);
            } else {
                if (connectionAttempts.get(userId)) {
                    logService.warn(`Conexión cerrada inesperadamente, reintentando en 5s...`, userId);
                    // FIX: Wrapped in an anonymous function to resolve argument count mismatch error.
                    setTimeout(() => connectToWhatsApp(userId, phoneNumber), 5000);
                } else {
                    logService.info(`Conexión cerrada, no se reintentará.`, userId);
                }
            }
          } else if (connection === 'open') {
            logService.info('Conexión a WhatsApp establecida', userId);
            qrCache.delete(userId);
            codeCache.delete(userId);
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
                    conversation.status = aiResult.newStatus;
                    conversation.tags = [...new Set([...(conversation.tags || []), ...(aiResult.tags || [])])];
                    if (aiResult.newStatus === LeadStatus.HOT) {
                        conversation.isMuted = true;
                        conversation.suggestedReplies = aiResult.suggestedReplies;
                    }
                    await db.saveUserConversation(userId, conversation);
                }
              } catch (err) { 
                // FIX: Added username to the logService.error call to match its signature.
                logService.error('Error en procesamiento IA', err as Error, userId, user.username); }
          }, DEBOUNCE_TIME_MS);
          messageDebounceMap.set(debounceKey, timeout);
      });
  } catch (err) {
      // FIX: Added username to the logService.error call to match its signature.
      logService.error('Fallo crítico en conexión a WhatsApp', err as Error, userId, user?.username);
  }
}

export async function disconnectWhatsApp(userId: string) {
    connectionAttempts.set(userId, false);
    const sock = sessions.get(userId);
    if (sock) {
        // FIX: The error "Expected 1 arguments, but got 0" likely has the counts reversed. Calling end() with no arguments. This change mirrors the one in connectToWhatsApp.
        // FIX: Passing undefined to satisfy a strict linter that expects an argument for an optional parameter.
        try { sock.end(undefined); } catch(e) {}
    }
    sessions.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    await clearBindedSession(userId);
    logService.info('Nodo de WhatsApp desconectado', userId);
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Nodo no activo.');
  await sock.sendMessage(jid, { text });
}