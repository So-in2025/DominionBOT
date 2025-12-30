
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { sseService } from '../services/sseService';
import { ConnectionStatus, Message, LeadStatus, InternalNote } from '../types';
import { conversationService } from '../services/conversationService';
import { db } from '../database';
import { generateBotResponse } from '../services/aiService';
import { useMongoDBAuthState } from './mongoAuth';
import { v4 as uuidv4 } from 'uuid';

const sessions = new Map<string, WASocket>();
const messageDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_TIME_MS = 6000; 
const logger = pino({ level: 'silent' });

export function getActiveSessionsCount() {
    return sessions.size;
}

export async function connectToWhatsApp(userId: string) {
  if (sessions.has(userId)) {
    sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.CONNECTED });
    return;
  }

  sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.GENERATING_QR });
  const { state, saveCreds } = await useMongoDBAuthState(userId);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false, 
    logger,
    browser: ['Dominion Signal Engine', 'Chrome', '2.4.1'],
  });

  sessions.set(userId, sock);
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        sseService.sendEvent(userId, 'qr', qr);
        sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.AWAITING_SCAN });
      }
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
        sessions.delete(userId);
        if (shouldReconnect) connectToWhatsApp(userId);
      } else if (connection === 'open') {
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
      
      conversationService.addMessage(userId, jid, userMessage, msg.pushName || undefined);
      sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], name: msg.pushName || jid.split('@')[0], text });

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
                    await sock.sendMessage(jid, { text: aiResult.responseText });

                    const botMessage: Message = {
                        id: `bot-${Date.now()}`,
                        text: aiResult.responseText,
                        sender: 'bot',
                        timestamp: new Date()
                    };
                    conversationService.addMessage(userId, jid, botMessage);
                    
                    // Actualizamos estado
                    conversation.status = aiResult.newStatus;
                    
                    // SIGNAL INTELLIGENCE (Refined v2.4.1)
                    if (conversation.isAiSignalsEnabled !== false) { // Default true
                        conversation.tags = Array.from(new Set([...(conversation.tags || []), ...aiResult.tags]));
                    }

                    if (aiResult.newStatus === LeadStatus.HOT) {
                        conversation.isMuted = true;
                        conversation.escalatedAt = new Date();
                        
                        // NOTA HOT ESTRUCTURADA
                        const hotNote: InternalNote = {
                          id: uuidv4(),
                          author: 'AI',
                          timestamp: new Date(),
                          note: `🔥 LEAD HOT DETECTADO\n- Intención: ${aiResult.tags.join(', ')}\n- Acción Sugerida: ${aiResult.recommendedAction || 'Intervenir para cierre inmediato.'}`
                        };
                        conversation.internalNotes = [...(conversation.internalNotes || []), hotNote];
                    }

                    db.saveUserConversation(userId, conversation);
                    sseService.sendEvent(userId, 'new_message', { from: jid.split('@')[0], name: 'Dominion Bot', text: aiResult.responseText });
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
    if (sock) {
        await sock.logout();
        sessions.delete(userId);
        sseService.sendEvent(userId, 'status_update', { status: ConnectionStatus.DISCONNECTED });
    }
}

export async function sendMessage(userId: string, jid: string, text: string) {
  const sock = sessions.get(userId);
  if (!sock) throw new Error('Sesión no activa.');
  await sock.sendMessage(jid, { text });
}
