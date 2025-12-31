
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
import { sseService } from '../services/sseService.js';
import { ConnectionStatus, Message, LeadStatus } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import * as QRCode from 'qrcode';

const sessions = new Map<string, WASocket>();
const qrCache = new Map<string, string>(); 
const codeCache = new Map<string, string>(); 
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
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
  console.log(`[WA-STABLE-INIT] Nodo ${userId} - Reiniciando motor.`);
  
  const oldSock = sessions.get(userId);
  if (oldSock) {
      try { 
          oldSock.ev.removeAllListeners('connection.update'); 
          oldSock.ev.removeAllListeners('messages.upsert');
          oldSock.end(undefined); 
      } catch(e) {}
      sessions.delete(userId);
  }
  qrCache.delete(userId);
  codeCache.delete(userId);

  if (phoneNumber) {
      await clearBindedSession(userId);
  }

  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.GENERATING_QR });
  
  try {
      const { version } = await fetchLatestBaileysVersion();
      const user = await db.getUser(userId);
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
        connectTimeoutMs: 90000, 
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 30000,
      });

      sessions.set(userId, sock);
      sock.ev.on('creds.update', saveCreds);

      if (phoneNumber && !sock.authState.creds.registered) {
          setTimeout(async () => {
              try {
                  if (!sessions.has(userId)) return;
                  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                  const code = await sock.requestPairingCode(cleanNumber);
                  codeCache.set(userId, code);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
              } catch (err) {
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
              }
          }, 4000); 
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          if (qr && !phoneNumber) {
            const qrImage = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
            qrCache.set(userId, qrImage);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, qr: qrImage });
          }
          if (connection === 'close') {
            const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
            if (error === DisconnectReason.loggedOut) {
                await disconnectWhatsApp(userId);
            } else {
                const delay = 5000 + Math.random() * 5000;
                setTimeout(() => connectToWhatsApp(userId, phoneNumber), delay);
            }
          } else if (connection === 'open') {
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED });
          }
      });

      sock.ev.on('messages.upsert', async (m) => {
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid?.endsWith('@g.us')) return;
          
          const jid = msg.key.remoteJid!;
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
          if (!text) return;

          const userMessage: Message = {
            id: msg.key.id!,
            text,
            sender: 'user',
            timestamp: new Date(Number(msg.messageTimestamp) * 1000),
          };
          
          await conversationService.addMessage(userId, jid, userMessage, msg.pushName || undefined);
          sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], text });

          const debounceKey = `${userId}_${jid}`;
          if (messageDebounceMap.has(debounceKey)) clearTimeout(messageDebounceMap.get(debounceKey));

          const timeout = setTimeout(async () => {
              messageDebounceMap.delete(debounceKey); 
              try {
                const user = await db.getUser(userId);
                if(!user || user.governance.systemState !== 'ACTIVE' || !user.settings.isActive) return;
                
                // --- ESCUDO DE PRIVACIDAD CRÍTICO ---
                const cleanJid = jid.split('@')[0];
                const isIgnored = user.settings.ignoredJids?.some(id => id.includes(cleanJid));
                if (isIgnored) {
                    console.log(`[WA-SHIELD] Ignorando contacto personal: ${cleanJid}`);
                    return;
                }
                // ------------------------------------

                const userConvs = await conversationService.getConversations(userId);
                const conversation = userConvs.find(c => c.id === jid);
                
                // Si el status es PERSONAL, el bot no responde jamás
                if (!conversation || conversation.isMuted || !conversation.isBotActive || conversation.status === LeadStatus.PERSONAL) return;
                
                await sock.sendPresenceUpdate('composing', jid);
                const aiResult = await generateBotResponse(conversation.messages, user.settings);
                
                if (aiResult) {
                    await sock.sendPresenceUpdate('paused', jid);
                    if (aiResult.responseText) {
                        await sock.sendMessage(jid, { text: aiResult.responseText });
                        const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date() };
                        await conversationService.addMessage(userId, jid, botMessage);
                    }
                    
                    conversation.status = aiResult.newStatus;
                    conversation.tags = [...new Set([...(conversation.tags || []), ...(aiResult.tags || [])])];
                    
                    if (aiResult.newStatus === LeadStatus.HOT) {
                        conversation.isMuted = true;
                        conversation.suggestedReplies = aiResult.suggestedReplies;
                    }
                    await db.saveUserConversation(userId, conversation);
                }
              } catch (err) { console.error(`[AI-PROC-ERR]`, err); }
          }, DEBOUNCE_TIME_MS);
          messageDebounceMap.set(debounceKey, timeout);
      });
  } catch (err) {
      sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
  }
}

export async function disconnectWhatsApp(userId: string) {
    const sock = sessions.get(userId);
    if (sock) {
        try { sock.ev.removeAllListeners('connection.update'); sock.end(undefined); } catch(e) {}
    }
    sessions.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    await clearBindedSession(userId);
    sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Nodo no activo.');
  await sock.sendMessage(jid, { text });
}
