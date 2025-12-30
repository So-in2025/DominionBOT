
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
const logger = pino({ level: 'silent' });

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
  // Limpieza previa robusta
  await disconnectWhatsApp(userId);

  // Notificar al front inmediatamente
  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.GENERATING_QR });
  
  const { state, saveCreds } = await useMongoDBAuthState(userId);

  console.log(`[WA] Iniciando socket para ${userId}...`);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    // CONFIGURACIÓN OPTIMIZADA PARA RENDER / SERVIDORES LINUX
    browser: ['Ubuntu', 'Chrome', '20.0.04'], 
    syncFullHistory: false, // CRÍTICO: Ahorra memoria y evita crash inicial
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000, 
    keepAliveIntervalMs: 20000,
    emitOwnEvents: false,
    retryRequestDelayMs: 500
  });

  sessions.set(userId, sock);
  sock.ev.on('creds.update', saveCreds);

  if (phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
          try {
              if (!sessions.has(userId)) return; 
              const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
              console.log(`[WA] Pidiendo Pairing Code para ${cleanNumber}`);
              const code = await sock.requestPairingCode(cleanNumber);
              codeCache.set(userId, code);
              sseService.sendEvent(userId, 'pairing_code', { code }); 
              sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, pairingCode: code });
          } catch (err) {
              console.error("[WA] Error Pairing Code:", err);
              sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
              await disconnectWhatsApp(userId);
          }
      }, 4000); 
  }
  
  sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr && !phoneNumber) {
        console.log(`[WA] QR Generado para ${userId}`);
        qrCache.set(userId, qr);
        sseService.sendEvent(userId, 'qr', { qr });
        sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN, qr });
      }

      if (connection === 'close') {
        const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = (lastDisconnect?.error as Boom)?.output?.payload?.message || (lastDisconnect?.error as any)?.message;
        console.log(`[WA] Conexión cerrada para ${userId}. Code: ${error}, Reason: ${reason}`);
        
        const shouldReconnect = error !== DisconnectReason.loggedOut;
        
        // Limpiamos caché visual pero no destruimos la sesión si es reconexión
        qrCache.delete(userId);
        codeCache.delete(userId);

        if (shouldReconnect) {
            // Intentar reconectar automáticamente si no es logout
            connectToWhatsApp(userId, phoneNumber);
        } else {
            // Error fatal (Logout o Ban)
            console.log(`[WA] Cierre definitivo para ${userId}. Limpiando.`);
            sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
            await disconnectWhatsApp(userId);
        }
      } else if (connection === 'open') {
        console.log(`[WA] CONECTADO EXITOSAMENTE ${userId}`);
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

      const debounceKey = `${userId}_${jid}`;
      if (messageDebounceMap.has(debounceKey)) clearTimeout(messageDebounceMap.get(debounceKey));

      const timeout = setTimeout(async () => {
          messageDebounceMap.delete(debounceKey); 
          try {
            const user = db.getUser(userId);
            if(!user || user.governance.systemState !== 'ACTIVE') return;

            const conversation = user.conversations[jid];
            if (!conversation || conversation.isMuted) return;

            const isBotEnabled = user.settings.isActive && conversation.isBotActive;
            if (isBotEnabled) {
                await sock.sendPresenceUpdate('composing', jid);
                const aiResult = await generateBotResponse(conversation.messages, user.settings);

                if (aiResult) {
                    await sock.sendPresenceUpdate('paused', jid);
                    
                    conversation.status = aiResult.newStatus;
                    if (conversation.isAiSignalsEnabled !== false) { 
                        conversation.tags = Array.from(new Set([...(conversation.tags || []), ...aiResult.tags]));
                    }

                    if (aiResult.responseText) {
                        await sock.sendMessage(jid, { text: aiResult.responseText });
                        
                        const botMessage: Message = {
                            id: `bot-${Date.now()}`,
                            text: aiResult.responseText,
                            sender: 'bot',
                            timestamp: new Date()
                        };
                        conversationService.addMessage(userId, jid, botMessage);
                        sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], name: 'Dominion Bot', text: aiResult.responseText });
                    }

                    if (aiResult.newStatus === LeadStatus.HOT) {
                        conversation.isMuted = true;
                        conversation.escalatedAt = new Date();
                        if (aiResult.suggestedReplies && aiResult.suggestedReplies.length > 0) {
                            conversation.suggestedReplies = aiResult.suggestedReplies;
                        }
                        const hotNote: InternalNote = {
                          id: uuidv4(),
                          author: 'AI',
                          timestamp: new Date(),
                          note: `🔥 SHADOW MODE ACTIVADO\n- Acción Sugerida: ${aiResult.recommendedAction || 'Cierre manual requerido.'}`
                        };
                        conversation.internalNotes = [...(conversation.internalNotes || []), hotNote];
                    }
                    db.saveUserConversation(userId, conversation);
                }
            }
          } catch (err) {
              console.error(`Error in Signal Engine for ${userId}:`, err);
          }
      }, DEBOUNCE_TIME_MS);

      messageDebounceMap.set(debounceKey, timeout);
  });
}

export async function disconnectWhatsApp(userId: string) {
    const sock = sessions.get(userId);
    
    // 1. Limpieza de memoria
    sessions.delete(userId);
    qrCache.delete(userId);
    codeCache.delete(userId);
    
    // 2. Cerrar socket
    if (sock) {
        try {
            sock.end(undefined);
        } catch(e) {}
    }

    // 3. LIMPIEZA NUCLEAR DE DB
    await clearBindedSession(userId);

    sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Sesión no activa.');
  await sock.sendMessage(jid, { text });
}
