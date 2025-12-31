
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { sseService } from '../services/sseService.js';
import { ConnectionStatus, Message, LeadStatus, InternalNote, Signal } from '../types.js';
import { conversationService } from '../services/conversationService.js';
import { db } from '../database.js';
import { generateBotResponse } from '../services/aiService.js';
import { useMongoDBAuthState, clearBindedSession } from './mongoAuth.js';
import { v4 as uuidv4 } from 'uuid';

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
  console.log(`[WA-INIT] Nodo ${userId} en secuencia de inicio.`);
  
  // 1. Limpieza de procesos colgados
  const oldSock = sessions.get(userId);
  if (oldSock) {
      oldSock.ev.removeAllListeners('connection.update');
      oldSock.end(undefined);
      sessions.delete(userId);
  }
  qrCache.delete(userId);
  codeCache.delete(userId);

  // 2. Si hay teléfono, forzamos inicio limpio para el código de emparejamiento
  if (phoneNumber) {
      console.log(`[WA-PAIR] Modo código para ${phoneNumber}. Purgando base de datos previa.`);
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
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        agent, 
        browser: ['Dominion OS', 'Chrome', '114.0.0.0'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 5000,
      });

      sessions.set(userId, sock);
      sock.ev.on('creds.update', saveCreds);

      // 3. Manejo de Pairing Code
      if (phoneNumber && !sock.authState.creds.registered) {
          console.log(`[WA-PAIR] Solicitando código en 6 segundos...`);
          setTimeout(async () => {
              try {
                  if (!sessions.has(userId)) return;
                  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                  const code = await sock.requestPairingCode(cleanNumber);
                  console.log(`[WA-PAIR] Código generado con éxito: ${code}`);
                  codeCache.set(userId, code);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
              } catch (err) {
                  console.error("[WA-PAIR-ERR]", err);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
              }
          }, 6000); 
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr && !phoneNumber) {
            qrCache.set(userId, qr);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, qr });
          }

          if (connection === 'close') {
            const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const reason = (lastDisconnect?.error as any)?.message || 'Unknown';
            
            console.log(`[WA-CLOSE] ${userId} Cerrado. Code: ${error}. Reason: ${reason}`);

            // TRATAMIENTO DE ERRORES CRÍTICOS
            if (error === 405 || error === 403 || error === 401 || reason.includes('Connection Failure')) {
                console.error(`[WA-CRITICAL] Error fatal detectado. Purgando sesión por seguridad.`);
                await disconnectWhatsApp(userId);
                return;
            }

            // RECONEXIÓN AUTOMÁTICA PARA ERRORES TEMPORALES
            if (error !== DisconnectReason.loggedOut) {
                console.log(`[WA-RETRY] Intentando reconectar en 3s...`);
                setTimeout(() => connectToWhatsApp(userId, phoneNumber), 3000);
            }
          } else if (connection === 'open') {
            console.log(`[WA-SUCCESS] Nodo ${userId} conectado y listo.`);
            qrCache.delete(userId);
            codeCache.delete(userId);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED });
          }
      });

      // 4. Procesamiento de Mensajes (IA)
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
                    
                    // Actualizar status del lead según decisión IA
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
    console.log(`[WA-DISCONNECT] Desconectando nodo ${userId}`);
    const sock = sessions.get(userId);
    if (sock) {
        try {
            sock.ev.removeAllListeners('connection.update');
            sock.end(undefined);
        } catch(e) {}
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
