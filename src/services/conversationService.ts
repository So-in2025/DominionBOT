
import { Conversation, LeadStatus, Message } from '../types.js';
import { db } from '../database.js';

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
  }

  async addMessage(userId: string, jid: string, message: Message, leadName?: string) {
    const user = await db.getUser(userId);
    if(!user) return;

    // Asegurar que conversations existe
    const conversations = user.conversations || {};
    let conversation = conversations[jid];

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
        isAiSignalsEnabled: true 
      };
    }

    conversation.messages.push(message);
    conversation.lastActivity = new Date();
    
    if (message.sender === 'owner') {
        conversation.isMuted = false;
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD) {
        conversation.status = LeadStatus.WARM;
    }

    await db.saveUserConversation(userId, conversation);
  }
}

export const conversationService = new ConversationService();
