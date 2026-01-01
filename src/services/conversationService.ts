
import { Conversation, LeadStatus, Message } from '../types.js';
import { db } from '../database.js';
import { logService } from './logService.js'; // Import logService

// --- Test Bot Specifics (Duplicated for clarity) ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
// --- END Test Bot Specifics ---

class ConversationService {
  
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.getUserConversations(userId);
  }

  // Updated signature to accept isHistoryImport flag
  async addMessage(userId: string, jid: string, message: Message, leadName?: string, isHistoryImport: boolean = false) {
    logService.info(`[ConversationService] [addMessage] Called for userId: ${userId}, jid: ${jid}, isHistoryImport: ${isHistoryImport}.`, userId);
    logService.info(`[ConversationService] [addMessage] Message being added: ${JSON.stringify(message).substring(0, 200)}...`, userId);

    const user = await db.getUser(userId);
    if(!user) {
        logService.warn(`[ConversationService] [addMessage] User ${userId} not found. Cannot add message.`, userId);
        return;
    }

    // Asegurar que conversations existe
    const conversations = user.conversations || {};
    let conversation = conversations[jid];

    const isEliteBotJid = jid === ELITE_BOT_JID;

    if (!conversation) {
      logService.info(`[ConversationService] [addMessage] Creating new conversation for jid: ${jid}.`, userId);
      const leadIdentifier = jid.split('@')[0];
      
      // LOGIC: If it's a history import, default isBotActive to FALSE.
      // If it's a live message (new conversation), default isBotActive to TRUE.
      // NEW: Explicitly set isBotActive true and isMuted false for Elite Bot JID
      const initialBotState = isEliteBotJid ? true : (isHistoryImport ? false : true);

      conversation = {
        id: jid,
        leadIdentifier: leadIdentifier,
        leadName: leadName || leadIdentifier,
        status: LeadStatus.COLD,
        messages: [],
        isBotActive: initialBotState, 
        isMuted: isEliteBotJid ? false : false, // NEW: Elite bot should never be muted by default
        firstMessageAt: new Date(message.timestamp), // Use message timestamp
        tags: [],
        internalNotes: [],
        isAiSignalsEnabled: true,
        isTestBotConversation: isEliteBotJid, 
      };
    } else {
        // Update logic for existing conversations
        if (isEliteBotJid) { // Only update these flags if it's explicitly the Elite Bot
            // NEW: Ensure existing Elite Bot conversations are marked as active and not muted
            if (!conversation.isTestBotConversation) { // Mark if not already marked
                logService.info(`[ConversationService] [addMessage] Marking existing conversation ${jid} as test bot conversation.`, userId);
                conversation.isTestBotConversation = true;
            }
            if (!conversation.isBotActive) { // Ensure bot is active for test convos
                logService.info(`[ConversationService] [addMessage] Activating bot for existing Elite Bot conversation ${jid}.`, userId);
                conversation.isBotActive = true;
            }
            if (conversation.isMuted) { // Ensure bot is not muted for test convos
                logService.info(`[ConversationService] [addMessage] Unmuting existing Elite Bot conversation ${jid}.`, userId);
                conversation.isMuted = false;
            }
        }

        // Update Lead Name if provided and better than current
        if (leadName && leadName !== conversation.leadName) {
             const currentIsNumber = !isNaN(Number(conversation.leadName.replace(/[^0-9]/g, '')));
             const newIsNumber = !isNaN(Number(leadName.replace(/[^0-9]/g, '')));
             
             // Prefer non-numbers names (PushNames) over numbers
             if (currentIsNumber && !newIsNumber) {
                 conversation.leadName = leadName;
             }
        }
    }
    
    logService.info(`[ConversationService] [addMessage] Conversation BEFORE adding message for ${jid}: ${JSON.stringify(conversation.messages.map(m => m.id)).substring(0, 200)}...`, userId);

    // Prevent duplicates based on Message ID
    if (!conversation.messages.some(m => m.id === message.id)) {
        conversation.messages.push(message);
        logService.info(`[ConversationService] [addMessage] Message ${message.id} added to conversation ${jid}. Total messages: ${conversation.messages.length}`, userId);
        
        // Sort messages by timestamp to ensure history is in order
        conversation.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Update activity timestamp only if this message is newer than the last recorded activity
        const msgDate = new Date(message.timestamp);
        const lastDate = new Date(conversation.lastActivity || 0);
        if (msgDate > lastDate) {
            conversation.lastActivity = msgDate;
        }
    } else {
        logService.warn(`[ConversationService] [addMessage] Duplicate message ID ${message.id} for conversation ${jid}. Skipping.`, userId);
    }
    
    logService.info(`[ConversationService] [addMessage] Conversation AFTER adding message for ${jid}: ${JSON.stringify(conversation.messages.map(m => m.id)).substring(0, 200)}...`, userId);

    if (message.sender === 'owner') {
        conversation.isMuted = false;
        logService.info(`[ConversationService] [addMessage] Owner message detected for ${jid}. Unmuting conversation.`, userId);
    }

    if (message.sender === 'user' && conversation.status === LeadStatus.COLD && !isHistoryImport) {
        conversation.status = LeadStatus.WARM;
        logService.info(`[ConversationService] [addMessage] First live user message for ${jid}. Changing status to WARM.`, userId);
    }
    
    logService.info(`[ConversationService] [addMessage] About to save conversation for ${jid}. Current user.conversations: ${Object.keys(user.conversations || {}).join(', ')}.`, userId);
    await db.saveUserConversation(userId, conversation);
    logService.info(`[ConversationService] [addMessage] Successfully saved conversation for ${jid}.`, userId);
  }
}

export const conversationService = new ConversationService();
