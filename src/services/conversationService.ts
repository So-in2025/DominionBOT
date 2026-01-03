
import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';
import { ELITE_BOT_JID } from '../whatsapp/client.js'; 

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
  }

  /**
   * HYDRATION PROTOCOL: Creates a conversation entry just from the Chat List ID.
   * This mimics WhatsApp Web loading the sidebar before messages arrive.
   */
  async ensureConversationExists(userId: string, jid: string, name?: string, timestamp?: number) {
      const user = await db.getUser(userId);
      if (!user) return;

      const safeJid = sanitizeKey(jid);
      const conversations = user.conversations || {};
      let conversation = conversations[safeJid] || conversations[jid];

      const leadIdentifier = jid.split('@')[0];
      const isEliteBotJid = jid === ELITE_BOT_JID;
      
      // If conversation doesn't exist, create skeleton
      if (!conversation) {
          conversation = {
            id: jid,
            leadIdentifier: leadIdentifier,
            leadName: name || (isEliteBotJid ? 'Simulador Neural' : leadIdentifier),
            status: LeadStatus.COLD,
            messages: [], // Empty initially, messages will append via history sync
            isBotActive: isEliteBotJid, 
            isMuted: false,
            tags: ['HISTORY_IMPORT'],
            internalNotes: [],
            isAiSignalsEnabled: true,
            isTestBotConversation: isEliteBotJid, 
            lastActivity: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString()
          };
          
          await db.saveUserConversation(userId, conversation);
          // console.log(`[DB-HYDRATION] Skeleton creado para ${jid}`);
      } else {
          // If exists, just update name if we found a better one
          if (name && (!conversation.leadName || conversation.leadName === leadIdentifier)) {
              conversation.leadName = name;
              await db.saveUserConversation(userId, conversation);
          }
      }
  }

  // Updated signature to accept isHistoryImport flag
  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    // Retriev fresh user data to ensure we don't overwrite with stale state
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
    
    // FORCE NOW for sorting, unless it's strictly history import
    // This ensures new messages ALWAYS jump to top, even if device time is off
    const effectiveLastActivity = isHistoryImport ? (message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date(message.timestamp).toISOString()) : new Date().toISOString();

    if (!conversation) {
      const leadIdentifier = jid.split('@')[0];
      
      // Elite Bot is always active and never muted initially
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
        
        // UPDATE LAST ACTIVITY TO FORCE SORTING
        conversation.lastActivity = effectiveLastActivity;
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
    
    // TRACE LOG
    if (!isHistoryImport && message.sender === 'user') {
        // console.log(`[DB-SAVE] Guardado mensaje de ${conversation.leadName} (${jid})`);
    }
  }
}

export const conversationService = new ConversationService();
