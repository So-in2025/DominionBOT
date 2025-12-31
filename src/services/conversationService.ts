

import { Conversation, LeadStatus, Message } from '../types.js';
import { db } from '../database.js';

// --- Test Bot Specifics (Duplicated for clarity) ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
// --- END Test Bot Specifics ---

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
  }

  // Updated signature to accept isHistoryImport flag
  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    const user = await db.getUser(userId);
    if(!user) return;

    // Asegurar que conversations existe
    const conversations = user.conversations || {};
    let conversation = conversations[jid];

    const isEliteBotJid = jid === ELITE_BOT_JID;

    if (!conversation) {
      const leadIdentifier = jid.split('@')[0];
      
      // LOGIC: If it's a history import, default isBotActive to FALSE.
      // If it's a live message (new conversation), default isBotActive to TRUE.
      const initialBotState = isHistoryImport ? false : true;

      conversation = {
        id: jid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || leadIdentifier,
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: isEliteBotJid ? true : initialBotState, // Elite bot always active, others depend on history
        lastActivity: new Date(message.timestamp), // Use message timestamp
        isMuted: false,
        firstMessageAt: new Date(message.timestamp),
        tags: [],
        internalNotes: [],
        isAiSignalsEnabled: true,
        isTestBotConversation: isEliteBotJid, 
      };
    } else if (isEliteBotJid && !conversation.isTestBotConversation) {
        conversation.isTestBotConversation = true;
    }

    // Prevent duplicates based on Message ID
    if (!conversation.messages.some(m => m.id === message.id)) {
        conversation.messages.push(message);
        
        // Sort messages by timestamp to ensure history is in order
        conversation.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Update activity timestamp only if this message is newer than the last recorded activity
        const msgDate = new Date(message.timestamp);
        const lastDate = new Date(conversation.lastActivity || 0);
        if (msgDate > lastDate) {
            conversation.lastActivity = msgDate;
        }
    }
    
    if (message.sender === 'owner') {
        conversation.isMuted = false;
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD && !isHistoryImport) {
        conversation.status = LeadStatus.WARM;
    }

    await db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();