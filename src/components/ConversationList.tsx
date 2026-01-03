
import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';
import { ELITE_BOT_JID } from '../whatsapp/client.js'; 

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
  }

  /**
   * BULK HYDRATION PROTOCOL (Optimized)
   * Process multiple chats/contacts at once to avoid DB locking.
   */
  async ensureConversationsExist(userId: string, items: { jid: string; name?: string; timestamp?: number }[]) {
      if (!items || items.length === 0) return;

      const user = await db.getUser(userId);
      if (!user) return;

      const conversations = user.conversations || {};
      const updates: Record<string, Conversation> = {};
      let hasUpdates = false;

      for (const item of items) {
          if (item.jid === 'status@broadcast') continue;
          
          const safeJid = sanitizeKey(item.jid);
          let conversation = conversations[safeJid] || conversations[item.jid] || updates[safeJid];
          
          const leadIdentifier = item.jid.split('@')[0];
          const isEliteBotJid = item.jid === ELITE_BOT_JID;

          if (!conversation) {
              conversation = {
                id: item.jid,
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
              // Update name if better one provided
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

  // Legacy single method (wraps bulk)
  async ensureConversationExists(userId: string, jid: string, name?: string, timestamp?: number) {
      return this.ensureConversationsExist(userId, [{ jid, name, timestamp }]);
  }

  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    // Retriev fresh user data to ensure we don't overwrite with stale state
    const user = await db.getUser(userId);
    if(!user) {
        logService.warn(`[ConversationService] User ${userId} not found.`, userId);
        return;
    }

    // CAMBIO 1: Blindaje de ID único ANTES de cualquier deduplicación
    message.id = message.id || `${jid}-${Date.now()}-${Math.random()}`;

    const conversations = user.conversations || {};
    // Handle potentially unsanitized keys from legacy data, but prefer sanitized
    const safeJid = sanitizeKey(jid);
    let conversation = conversations[safeJid] || conversations[jid];

    const isEliteBotJid = jid === ELITE_BOT_JID;
    
    // FIX 1: Robust Timestamp Logic
    // If it's a history import, rely on the message's original timestamp.
    // If it's a real-time message, force NOW to ensure it jumps to the top of the inbox.
    const effectiveLastActivity = isHistoryImport 
        ? (message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date(message.timestamp).toISOString()) 
        : new Date().toISOString();

    if (!conversation) {
      const leadIdentifier = jid.split('@')[0];
      
      // Elite Bot is always active. History imports start inactive to avoid auto-replying to old messages.
      const initialBotState = isEliteBotJid ? true : (isHistoryImport ? false : true);

      conversation = {
        id: jid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || (isEliteBotJid ? 'Simulador Neural' : leadIdentifier),
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: initialBotState, 
        isMuted: false,
        firstMessageAt: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date(message.timestamp).toISOString(),
        tags: [],
        internalNotes: [],
        isAiSignalsEnabled: true,
        isTestBotConversation: isEliteBotJid, 
        lastActivity: effectiveLastActivity
      };
    } else {
        // Enforce Test Bot Rules on existing conversation
        if (isEliteBotJid) { 
            conversation.isTestBotConversation = true;
            conversation.isBotActive = true;
            conversation.isMuted = false;
            conversation.leadName = 'Simulador Neural'; // Force correct name
        }

        // Update Lead Name if provided (and not a number)
        if (leadName && leadName !== conversation.leadName && !isEliteBotJid) {
             const currentIsNumber = !isNaN(Number(conversation.leadName.replace(/[^0-9]/g, '')));
             const newIsNumber = !isNaN(Number(leadName.replace(/[^0-9]/g, '')));
             if (currentIsNumber && !newIsNumber) {
                 conversation.leadName = leadName;
             }
        }
    }
    
    // ATOMIC-LIKE APPEND:
    // Check for duplicates
    if (!conversation.messages.some(m => m.id === message.id)) {
        conversation.messages.push(message);
        
        // Sort to maintain chronological order (crucial for display)
        conversation.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // CAMBIO 2: Corrección definitiva de lastActivity
        if (message.sender === 'user') {
            conversation.lastActivity = new Date().toISOString();
        } else {
            conversation.lastActivity = effectiveLastActivity;
        }
    } 

    // CAMBIO 3: Activación automática del bot en mensajes reales
    if (message.sender === 'user' && isHistoryImport === false) {
        conversation.isBotActive = true;
    }

    // Status Automation
    if (message.sender === 'owner') {
        conversation.isMuted = false;
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD && !isHistoryImport && !isEliteBotJid) {
        conversation.status = LeadStatus.WARM;
    }
    
    // Save back to DB
    await db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();
