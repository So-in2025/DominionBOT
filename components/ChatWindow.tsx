import React, { useRef, useEffect } from 'react';
import { Conversation, LeadStatus } from '../types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

interface ChatWindowProps {
  conversation: Conversation | null;
  onSendMessage: (text: string) => void;
  onToggleBot: (id: string) => void;
  isTyping: boolean;
  isBotGloballyActive: boolean;
  isMobile: boolean;
  onBack: () => void;
  onUpdateConversation?: (id: string, updates: Partial<Conversation>) => void;
}

const statusBadgeClass = {
  [LeadStatus.COLD]: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  [LeadStatus.WARM]: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  [LeadStatus.HOT]: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
};

const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onSendMessage, onToggleBot, isTyping, isBotGloballyActive, isMobile, onBack }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [conversation?.messages, isTyping]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black text-gray-600">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 animate-pulse">
            <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </div>
        <p className="text-lg font-medium text-gray-400">Selecciona una conversación</p>
        <p className="text-sm opacity-60 mt-2">Para ver el historial y gestionar el lead.</p>
      </div>
    );
  }
  
  const currentBadge = statusBadgeClass[conversation.status];

  return (
    <div className="flex-1 flex flex-col bg-brand-black h-full relative overflow-hidden">
      {/* Optional Noise Texture Background */}
      <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none"></div>

      {/* HEADER */}
      <header className="relative z-10 px-4 py-3 md:px-6 border-b border-white/10 bg-brand-surface/90 backdrop-blur-md flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3 md:gap-4">
            {isMobile && (
                <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
            )}
            
            <div className="relative">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-gray-700 to-black border border-white/10 flex items-center justify-center font-bold text-white shadow-inner">
                    {conversation.leadName.charAt(0).toUpperCase()}
                </div>
                {/* Online Status Dot */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-brand-surface rounded-full"></div>
            </div>

            <div>
              <h2 className="text-sm md:text-base font-bold text-white leading-tight flex items-center gap-2">
                  {conversation.leadName}
              </h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{conversation.leadIdentifier}</p>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
          <span className={`hidden md:inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${currentBadge}`}>
              {conversation.status}
          </span>

          <button 
            onClick={() => onToggleBot(conversation.id)}
            disabled={!isBotGloballyActive}
            className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${conversation.isBotActive 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white' 
                    : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500 hover:text-white'}
                ${!isBotGloballyActive ? 'opacity-50 cursor-not-allowed grayscale' : ''}
            `}
          >
            {conversation.isBotActive ? (
                <><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> Detener Bot</>
            ) : (
                <><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Activar Bot</>
            )}
          </button>
        </div>
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-4 md:space-y-6 custom-scrollbar relative z-0">
        {conversation.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isTyping && (
             <div className="flex items-center gap-2 text-gray-500 text-xs italic ml-4 animate-pulse">
                <span>Dominion Bot escribiendo</span>
                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSendMessage={onSendMessage}
        disabled={!isBotGloballyActive || conversation.isBotActive}
        placeholder={!isBotGloballyActive ? 'Sistema pausado globalmente' : (conversation.isBotActive ? 'El bot tiene el control...' : 'Escribe un mensaje...')}
      />
    </div>
  );
};

export default ChatWindow;