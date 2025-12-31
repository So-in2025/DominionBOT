
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
  console.log(`[WA-INIT] Nodo ${userId} - Inicio de secuencia.`);
  
  // Limpieza agresiva previa
  const oldSock = sessions.get(userId);
  if (oldSock) {
      try { oldSock.ev.removeAllListeners('connection.update'); oldSock.end(undefined); } catch(e) {}
      sessions.delete(userId);
  }
  qrCache.delete(userId);
  codeCache.delete(userId);

  // Si se usa número, purgar la sesión de DB es OBLIGATORIO para evitar "No se pudo vincular"
  if (phoneNumber) {
      console.log(`[WA-PAIR] Purgando sesión previa para vinculación por código.`);
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
        // Cambiamos a Chrome en Windows para máxima compatibilidad con Pairing Code
        browser: Browsers.windows('Chrome'),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
      });

      sessions.set(userId, sock);
      sock.ev.on('creds.update', saveCreds);

      // Manejo de Pairing Code
      if (phoneNumber && !sock.authState.creds.registered) {
          setTimeout(async () => {
              try {
                  if (!sessions.has(userId)) return;
                  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                  console.log(`[WA-PAIR] Solicitando código para: ${cleanNumber}`);
                  const code = await sock.requestPairingCode(cleanNumber);
                  codeCache.set(userId, code);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
              } catch (err) {
                  console.error("[WA-PAIR-ERR]", err);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
              }
          }, 5000); 
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr && !phoneNumber) {
            // CONVERSIÓN DE STRING A IMAGEN BASE64
            const qrImage = await QRCode.toDataURL(qr);
            qrCache.set(userId, qrImage);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, qr: qrImage });
          }

          if (connection === 'close') {
            const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
            console.log(`[WA-CLOSE] ${userId} Cerrado. Code: ${error}`);

            if (error === DisconnectReason.loggedOut) {
                await disconnectWhatsApp(userId);
            } else {
                setTimeout(() => connectToWhatsApp(userId, phoneNumber), 5000);
            }
          } else if (connection === 'open') {
            console.log(`[WA-SUCCESS] Nodo ${userId} conectado.`);
            qrCache.delete(userId);
            codeCache.delete(userId);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED });
          }
      });

      sock.ev.on('messages.upsert', async (m) => {
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
          
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
                
                const userConvs = await conversationService.getConversations(userId);
                const conversation = userConvs.find(c => c.id === jid);
                
                if (!conversation || conversation.isMuted || !conversation.isBotActive) return;
                
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
      console.error("[WA-FATAL]", err);
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
