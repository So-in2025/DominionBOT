import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';
import { ELITE_BOT_JID } from '../whatsapp/client.js'; 
import { createHash } from 'crypto';
import { normalizeJid } from '../utils/jidUtils.js';

class ConversationService {
  
  async getConversations(userId: string, since?: string): Promise<Conversation[]> {
    const allConversations = await db.getUserConversations(userId);
    
    if (!since) {
        return allConversations;
    }

    const sinceTime = new Date(since).getTime();
    
    return allConversations.filter(c => {
        const lastActive = c.lastActivity ? new Date(c.lastActivity).getTime() : 0;
        return lastActive > sinceTime;
    });
  }

  /**
   * BULK HYDRATION PROTOCOL (Optimized)
   */
  async ensureConversationsExist(userId: string, items: { jid: string; name?: string; timestamp?: number }[]) {
      if (!items || items.length === 0) return;

      const user = await db.getUser(userId);
      if (!user) return;

      const conversations = user.conversations || {};
      const updates: Record<string, Conversation> = {};
      let hasUpdates = false;

      for (const item of items) {
          const canonicalJid = normalizeJid(item.jid); // BLOQUE 1
          if (!canonicalJid) continue;
          
          if (canonicalJid === 'status@broadcast' || canonicalJid.endsWith('@g.us') || canonicalJid.endsWith('@newsletter')) continue;
          
          const safeJid = sanitizeKey(canonicalJid);
          // BLOQUE 4: Acceso Determinístico
          let conversation = conversations[safeJid] || conversations[canonicalJid] || updates[safeJid];
          
          const leadIdentifier = canonicalJid.split('@')[0];
          const isEliteBotJid = canonicalJid === ELITE_BOT_JID;

          if (!conversation) {
              // History hydration creates entries regardless of sender, but ensures consistency
              conversation = {
                id: canonicalJid,
                leadIdentifier: leadIdentifier,
                leadName: item.name || (isEliteBotJid ? 'Simulador Neural' : leadIdentifier),
                status: LeadStatus.COLD,
                messages: [],
                isBotActive: isEliteBotJid, 
                isMuted: false,
                tags: ['HISTORY_IMPORT'],
                internalNotes: [],
                isAiSignalsEnabled: true,
                isTestBotConversation: isEliteBotJid, 
                lastActivity: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : new Date().toISOString()
              };
              updates[safeJid] = conversation;
              hasUpdates = true;
          } else {
              if (item.name && (!conversation.leadName || conversation.leadName === leadIdentifier)) {
                  conversation.leadName = item.name;
                  updates[safeJid] = conversation;
                  hasUpdates = true;
              }
          }
      }

      if (hasUpdates) {
          await db.saveUserConversationsBatch(userId, updates);
      }
  }

  async ensureConversationExists(userId: string, jid: string, name?: string, timestamp?: number) {
      const canonicalJid = normalizeJid(jid); // BLOQUE 1
      if (!canonicalJid) return;
      return this.ensureConversationsExist(userId, [{ jid: canonicalJid, name, timestamp }]);
  }

  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    const canonicalJid = normalizeJid(jid); // BLOQUE 1
    if (!canonicalJid) return;
    
    if (canonicalJid.endsWith('@g.us') || canonicalJid.endsWith('@newsletter')) return;

    const user = await db.getUser(userId);
    if(!user) {
        logService.warn(`[ConversationService] User ${userId} not found.`, userId);
        return;
    }

    const conversations = user.conversations || {};
    const safeJid = sanitizeKey(canonicalJid);
    // BLOQUE 4: Acceso Determinístico
    let conversation = conversations[safeJid] || conversations[canonicalJid];

    const isEliteBotJid = canonicalJid === ELITE_BOT_JID;
    const effectiveLastActivity = new Date().toISOString();

    if (!conversation) {
      // BLOQUE 2: SEGURIDAD SECUNDARIA
      // Si el mensaje es del dueño y no existe chat, abortar.
      if (message.sender === 'owner') {
          return; 
      }
      const leadIdentifier = canonicalJid.split('@')[0];
      
      const initialBotState = isEliteBotJid ? true : (isHistoryImport ? false : true);

      conversation = {
        id: canonicalJid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || (isEliteBotJid ? 'Simulador Neural' : leadIdentifier),
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: initialBotState, 
        isMuted: false,
        firstMessageAt: message.timestamp,
        tags: isHistoryImport ? ['HISTORY_IMPORT'] : [], // AJUSTE SEMÁNTICO: Consistencia en tags
        internalNotes: [],
        isAiSignalsEnabled: true,
        isTestBotConversation: isEliteBotJid, 
        lastActivity: effectiveLastActivity
      };
    } else {
        if (isEliteBotJid) { 
            conversation.isTestBotConversation = true;
            conversation.isBotActive = true;
            conversation.isMuted = false;
            conversation.leadName = 'Simulador Neural'; 
        }

        if (leadName && leadName !== conversation.leadName && !isEliteBotJid) {
             const currentIsNumber = !isNaN(Number(conversation.leadName.replace(/[^0-9]/g, '')));
             const newIsNumber = !isNaN(Number(leadName.replace(/[^0-9]/g, '')));
             if (currentIsNumber && !newIsNumber) {
                 conversation.leadName = leadName;
             }
        }
    }
    
    if (!message.id) {
        const timestamp = new Date(message.timestamp).getTime();
        message.id = createHash('sha256').update(canonicalJid + message.text + message.sender + timestamp.toString()).digest('hex').slice(0, 16);
    }

    // IDEMPOTENCY CHECK
    if (conversation.messages.some(m => m.id === message.id)) {
        return; 
    }

    conversation.messages.push(message);
    conversation.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    conversation.lastActivity = effectiveLastActivity;

    if (message.sender === 'owner') {
        conversation.isMuted = false;
        
        if (!conversation.tags.includes('HUMAN_TOUCH')) {
            conversation.tags.push('HUMAN_TOUCH');
        }

        if (conversation.status === LeadStatus.HOT) {
            conversation.status = LeadStatus.WARM;
            logService.info(`[ConversationService] Lead degradado HOT -> WARM por intervención humana en ${canonicalJid}`, userId);
        }
    }

    if (message.sender === 'user' && !isHistoryImport) {
        if (!conversation.isMuted && conversation.status !== LeadStatus.PERSONAL) {
             conversation.isBotActive = true;
        }
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD && !isHistoryImport && !isEliteBotJid) {
        conversation.status = LeadStatus.WARM;
    }
    
    await db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();