
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
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

// CAMBIO: Logger visible para ver qué pasa internamente
const logger = pino({ level: 'info' }); 

export function getSessionStatus(userId: string): { status: ConnectionStatus, qr?: string, pairingCode?: string } {
    const sock = sessions.get(userId);
    const qr = qrCache.get(userId);
    const code = codeCache.get(userId);

    if (code) return { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code };
    if (qr) return { status: ConnectionStatus.AWAITING_SCAN, qr };

    if (sock && sock.user) {
        return { status: ConnectionStatus.CONNECTED };
    }

    return { status: ConnectionStatus.DISCONNECTED };
}

export async function connectToWhatsApp(userId: string, phoneNumber?: string) {
  console.log(`[WA-INIT] Iniciando secuencia de conexión para ${userId}`);
  
  // 1. Limpieza preventiva
  const existingSock = sessions.get(userId);
  if (existingSock) {
      console.log(`[WA-INIT] Cerrando sesión anterior en memoria para ${userId}`);
      existingSock.end(undefined);
      sessions.delete(userId);
  }

  // Notificar UI
  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.GENERATING_QR });
  
  try {
      const { state, saveCreds } = await useMongoDBAuthState(userId);
      console.log(`[WA-AUTH] Credenciales cargadas desde Mongo para ${userId}`);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger, // Logger activado
        // CONFIGURACIÓN DE SEGURIDAD ESTÁNDAR
        browser: ['Ubuntu', 'Chrome', '20.0.04'], 
        syncFullHistory: false, 
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000, 
        keepAliveIntervalMs: 30000,
        emitOwnEvents: false,
        retryRequestDelayMs: 2000,
      });

      sessions.set(userId, sock);
      sock.ev.on('creds.update', saveCreds);

      // Pairing Code Logic
      if (phoneNumber && !sock.authState.creds.registered) {
          console.log(`[WA-PAIR] Preparando solicitud de código para ${phoneNumber}`);
          setTimeout(async () => {
              try {
                  if (!sessions.has(userId)) return; 
                  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                  const code = await sock.requestPairingCode(cleanNumber);
                  console.log(`[WA-PAIR] Código generado para ${userId}: ${code}`);
                  codeCache.set(userId, code);
                  sseService.sendEvent(userId, 'pairing_code', { code }); 
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
              } catch (err) {
                  console.error("[WA-PAIR] Error solicitando código:", err);
                  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
              }
          }, 4000); 
      }
      
      sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr && !phoneNumber) {
            console.log(`[WA-QR] QR Recibido para ${userId}`);
            qrCache.set(userId, qr);
            sseService.sendEvent(userId, 'qr', { qr });
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, qr });
          }

          if (connection === 'close') {
            const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const reason = (lastDisconnect?.error as Boom)?.output?.payload?.message || (lastDisconnect?.error as any)?.message;
            console.log(`[WA-CLOSE] Conexión cerrada ${userId}. Code: ${error}, Reason: ${reason}`);
            
            // Limpiamos caché visual
            qrCache.delete(userId);
            codeCache.delete(userId);

            // LOGICA DE RECONEXIÓN INTELIGENTE
            // 401: Unauthorized (Logged out)
            // 403: Forbidden (Banned/Geo-blocked)
            // 405: Method Not Allowed (Browser signature rejected)
            // 428: Precondition Required (Rate limited)
            // 515: Stream Errored (Restart required)

            if (error === DisconnectReason.loggedOut || error === 401 || error === 403 || error === 405) {
                console.log(`[WA-CRITICAL] Error fatal (${error}). Purgando sesión y deteniendo.`);
                await disconnectWhatsApp(userId); // Borra DB y Memoria
                sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
            } else if (error === 428) {
                console.log(`[WA-WARN] Rate Limit detectado. Esperando 10s antes de reintentar.`);
                setTimeout(() => connectToWhatsApp(userId, phoneNumber), 10000);
            } else {
                // Errores temporales (515, timeouts), reintentar rápido
                console.log(`[WA-RETRY] Reconectando socket...`);
                connectToWhatsApp(userId, phoneNumber);
            }
          } else if (connection === 'open') {
            console.log(`[WA-OPEN] CONEXIÓN ESTABLECIDA ${userId}`);
            qrCache.delete(userId);
            codeCache.delete(userId);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED });
          }
      });

      sock.ev.on('messages.upsert', async (m) => {
          // (Lógica de mensajes sin cambios, abreviada para claridad del patch)
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
          
          const jid = msg.key.remoteJid!;
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
          if (!text) return;

          const signal: Signal = {
              id: msg.key.id!,
              source: 'WHATSAPP',
              senderId: jid,
              senderName: msg.pushName || undefined,
              content: text,
              timestamp: new Date(Number(msg.messageTimestamp) * 1000)
          };

          const userMessage: Message = {
            id: signal.id,
            text: signal.content,
            sender: 'user',
            timestamp: signal.timestamp,
          };
          
          conversationService.addMessage(userId, jid, userMessage, signal.senderName);
          sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], name: signal.senderName || jid.split('@')[0], text: signal.content });

          // Procesamiento IA (Simplificado para este archivo)
          const debounceKey = `${userId}_${jid}`;
          if (messageDebounceMap.has(debounceKey)) clearTimeout(messageDebounceMap.get(debounceKey));

          const timeout = setTimeout(async () => {
              messageDebounceMap.delete(debounceKey); 
              try {
                const user = db.getUser(userId);
                if(!user || user.governance.systemState !== 'ACTIVE') return;
                const conversation = user.conversations[jid];
                if (!conversation || conversation.isMuted) return;
                
                if (user.settings.isActive && conversation.isBotActive) {
                    await sock.sendPresenceUpdate('composing', jid);
                    const aiResult = await generateBotResponse(conversation.messages, user.settings);
                    if (aiResult) {
                        await sock.sendPresenceUpdate('paused', jid);
                        conversation.status = aiResult.newStatus;
                        if (aiResult.responseText) {
                            await sock.sendMessage(jid, { text: aiResult.responseText });
                            const botMessage: Message = { id: `bot-${Date.now()}`, text: aiResult.responseText, sender: 'bot', timestamp: new Date() };
                            conversationService.addMessage(userId, jid, botMessage);
                            sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], name: 'Dominion Bot', text: aiResult.responseText });
                        }
                        // ... resto de lógica de estado ...
                        db.saveUserConversation(userId, conversation);
                    }
                }
              } catch (err) { console.error(`Error processing msg:`, err); }
          }, DEBOUNCE_TIME_MS);
          messageDebounceMap.set(debounceKey, timeout);
      });
  } catch (err) {
      console.error("[WA-FATAL] Fallo al crear socket:", err);
      sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
  }
}

export async function disconnectWhatsApp(userId: string) {
    console.log(`[WA-DISCONNECT] Solicitud de desconexión para ${userId}`);
    const sock = sessions.get(userId);
    
    if (sock) {
        try {
            sock.end(undefined);
        } catch(e) {}
    }
    
    sessions.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);

    // LIMPIEZA NUCLEAR DE DB PARA EVITAR SESIONES ZOMBIES
    await clearBindedSession(userId);

    sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Sesión no activa.');
  await sock.sendMessage(jid, { text });
}
