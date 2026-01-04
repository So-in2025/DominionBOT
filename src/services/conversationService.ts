

import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';
import { ELITE_BOT_JID } from '../whatsapp/client.js'; 
import { createHash } from 'crypto';

class ConversationService {
  
  // OPTIMIZED DELTA POLLING: Accepts optional 'since' timestamp
  async getConversations(userId: string, since?: string): Promise<Conversation[]> {
    const allConversations = await db.getUserConversations(userId);
    
    if (!since) {
        return allConversations;
    }

    const sinceTime = new Date(since).getTime();
    
    // Filter only conversations active AFTER the 'since' timestamp
    return allConversations.filter(c => {
        const lastActive = c.lastActivity ? new Date(c.lastActivity).getTime() : 0;
        return lastActive > sinceTime;
    });
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
          const normalizedJid = item.jid.replace(/@lid/g, '@s.whatsapp.net');
          
          // FILTER: Ignore Status Broadcasts, Groups (@g.us), and Newsletters for the main Inbox
          if (normalizedJid === 'status@broadcast' || normalizedJid.endsWith('@g.us') || normalizedJid.endsWith('@newsletter')) continue;
          
          const safeJid = sanitizeKey(normalizedJid);
          let conversation = conversations[safeJid] || conversations[normalizedJid] || updates[safeJid];
          
          const leadIdentifier = normalizedJid.split('@')[0];
          const isEliteBotJid = normalizedJid === ELITE_BOT_JID;

          if (!conversation) {
              conversation = {
                id: normalizedJid,
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
                // FIX: Changed to string to match type definition.
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
      const normalizedJid = jid.replace(/@lid/g, '@s.whatsapp.net');
      return this.ensureConversationsExist(userId, [{ jid: normalizedJid, name, timestamp }]);
  }

  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    const normalizedJid = jid.replace(/@lid/g, '@s.whatsapp.net');
    
    // FILTER: Ignore messages from Groups and Newsletters
    if (normalizedJid.endsWith('@g.us') || normalizedJid.endsWith('@newsletter')) return;

    // Retrieve fresh user data to ensure we don't overwrite with stale state
    const user = await db.getUser(userId);
    if(!user) {
        logService.warn(`[ConversationService] User ${userId} not found.`, userId);
        return;
    }

    const conversations = user.conversations || {};
    // Handle potentially unsanitized keys from legacy data, but prefer sanitized
    const safeJid = sanitizeKey(normalizedJid);
    let conversation = conversations[safeJid] || conversations[normalizedJid];

    const isEliteBotJid = normalizedJid === ELITE_BOT_JID;
    
    // FIX: Force update lastActivity for ANY new message processing to ensure it shows up in Delta Polling,
    // even if it's a history backfill. This fixes "Ghost Messages".
    const effectiveLastActivity = new Date().toISOString();

    if (!conversation) {
      const leadIdentifier = normalizedJid.split('@')[0];
      
      // Elite Bot is always active. History imports start inactive to avoid auto-replying to old messages.
      const initialBotState = isEliteBotJid ? true : (isHistoryImport ? false : true);

      conversation = {
        id: normalizedJid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || (isEliteBotJid ? 'Simulador Neural' : leadIdentifier),
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: initialBotState, 
        isMuted: false,
        // FIX: Changed to match type definition.
        firstMessageAt: message.timestamp,
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
    
    // Blindaje de IDs (Message ID Safety) using crypto hash
    if (!message.id) {
        const timestamp = new Date(message.timestamp).getTime();
        message.id = createHash('sha256').update(normalizedJid + message.text + message.sender + timestamp.toString()).digest('hex').slice(0, 16);
    }

    // IDEMPOTENCY CHECK: STRICTLY PREVENT DUPLICATES
    // Using a Map or simple scan. Since array is relatively small per chat (sharded/limit), .some() is acceptable.
    if (conversation.messages.some(m => m.id === message.id)) {
        // logService.debug(`[ConversationService] Ignorando mensaje duplicado (ID: ${message.id}) en ${jid}`, userId);
        return; 
    }

    // ATOMIC-LIKE APPEND:
    conversation.messages.push(message);
    
    // Sort to maintain chronological order
    conversation.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // CRITICAL FIX: Always bump lastActivity on new ingestion to trigger sync
    conversation.lastActivity = effectiveLastActivity;

    // Protocolo de Reactivación y Degradación por Intervención Humana
    if (message.sender === 'owner') {
        // 1. Quitar silenciador manual
        conversation.isMuted = false;
        
        // 2. MARCA DE INTERVENCIÓN: Añadimos HUMAN_TOUCH para que la IA sepa que debe ser "Asistente" y no "Sombra"
        if (!conversation.tags.includes('HUMAN_TOUCH')) {
            conversation.tags.push('HUMAN_TOUCH');
        }

        // 3. DEGRADACIÓN TÁCTICA: Si el humano interviene en un lead HOT, 
        // asumimos que la emergencia terminó. Bajamos a WARM para que la IA 
        // pueda retomar el seguimiento autónomo en el siguiente turno.
        if (conversation.status === LeadStatus.HOT) {
            conversation.status = LeadStatus.WARM;
            logService.info(`[ConversationService] Lead degradado HOT -> WARM por intervención humana en ${normalizedJid}`, userId);
        }
    }

    // Reactivate Bot on new Real User Message
    if (message.sender === 'user' && !isHistoryImport) {
        if (!conversation.isMuted && conversation.status !== LeadStatus.PERSONAL) {
             conversation.isBotActive = true;
        }
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD && !isHistoryImport && !isEliteBotJid) {
        conversation.status = LeadStatus.WARM;
    }
    
    // Save back to DB
    await db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();
