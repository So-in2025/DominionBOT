

import { Conversation, LeadStatus, Message } from '../types.js';
import { db, sanitizeKey } from '../database.js';
import { logService } from './logService.js';

// --- Test Bot Specifics ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
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
        firstMessageAt: new Date(message.timestamp),
        tags: [],
        internalNotes: [],
        isAiSignalsEnabled: true,
        isTestBotConversation: isEliteBotJid, 
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        lastActivity: new Date(Date.now())
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
        
        const msgDate = new Date(message.timestamp);
        conversation.lastActivity = msgDate;
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