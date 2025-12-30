
import { Conversation, LeadStatus, Message } from '../types';
import { db } from '../database';

class ConversationService {
  
  getConversations(userId: string): Conversation[] {
    return db.getUserConversations(userId);
  }

  addMessage(userId: string, jid: string, message: Message, leadName?: string) {
    const user = db.getUser(userId);
    if(!user) return;

    let conversation = user.conversations[jid];

    if (!conversation) {
      const leadIdentifier = jid.split('@')[0];
      conversation = {
        id: jid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || leadIdentifier,
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: true,
        lastActivity: new Date(),
        isMuted: false,
        firstMessageAt: new Date(),
        tags: [],
        internalNotes: [],
        isAiSignalsEnabled: true // Default ON for new leads
      };
    }

    conversation.messages.push(message);
    conversation.lastActivity = new Date();
    
    // HUMAN INTERVENTION LOGIC
    if (message.sender === 'owner') {
        conversation.isMuted = false;
        console.log(`[SIGNAL] Unmuted conversation ${jid} due to human intervention.`);
    }

    // Auto-status update (legacy fallback)
    if (message.sender === 'user' && conversation.status === LeadStatus.COLD) {
        conversation.status = LeadStatus.WARM;
    }

    db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();
