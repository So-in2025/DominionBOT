
import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';
import { ELITE_BOT_JID } from '../whatsapp/client.js'; 

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
          // FILTER: Ignore Status Broadcasts AND Groups (@g.us) for the main Inbox
          if (item.jid === 'status@broadcast' || item.jid.endsWith('@g.us')) continue;
          
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
    // FILTER: Ignore messages from Groups for the Inbox (Radar handles groups separately)
    if (jid.endsWith('@g.us')) return;

    // Retrieve fresh user data to ensure we don't overwrite with stale state
    const user = await db.getUser(userId);
    if(!user) {
        logService.warn(`[ConversationService] User ${userId} not found.`, userId);
        return;
    }

    const conversations = user.conversations || {};
    // Handle potentially unsanitized keys from legacy data, but prefer sanitized
    const safeJid = sanitizeKey(jid);
    let conversation = conversations[safeJid] || conversations[jid];

    const isEliteBotJid = jid === ELITE_BOT_JID;
    
    // FIX 1: Robust Timestamp Logic
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
    
    // FIX 2: Blindaje de IDs (Message ID Safety)
    if (!message.id) {
        message.id = `${jid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    
    // Update lastActivity logic
    if (message.sender === 'user' && !isHistoryImport) {
            conversation.lastActivity = new Date().toISOString();
    } else {
            const existingLast = new Date(conversation.lastActivity || 0).getTime();
            const newLast = new Date(effectiveLastActivity).getTime();
            if (newLast > existingLast) {
                conversation.lastActivity = effectiveLastActivity;
            }
    }

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
            logService.info(`[ConversationService] Lead degradado HOT -> WARM por intervención humana en ${jid}`, userId);
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
