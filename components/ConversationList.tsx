
import React from 'react';
import { Conversation } from '../types';
import ConversationListItem from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  backendError: string | null;
}

const ConversationList: React.FC<ConversationListProps> = ({ conversations, selectedConversationId, onSelectConversation, backendError }) => {
  return (
    <aside className="hidden md:flex flex-col w-80 bg-brand-surface border-r border-white/10 h-full flex-shrink-0 backdrop-blur-md">
      {/* Search Header */}
      <div className="p-4 border-b border-white/10">
        <div className="relative">
             <input
                type="text"
                placeholder="Buscar conversación..."
                className="w-full bg-black/50 border border-white/10 rounded-lg py-2.5 px-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/50 transition-all"
            />
            <svg className="absolute right-3 top-3 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {conversations.length > 0 ? (
          <ul className="flex flex-col">
            {conversations.map(convo => (
              <ConversationListItem
                key={convo.id}
                conversation={convo}
                isSelected={convo.id === selectedConversationId}
                onSelect={() => onSelectConversation(convo.id)}
              />
            ))}
          </ul>
        ) : backendError ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-red-400 opacity-80">
              <div className="text-3xl mb-2">⚠️</div>
              <h3 className="text-sm font-bold">Sin Conexión</h3>
              <p className="text-xs mt-1 opacity-70">{backendError}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
             </div>
            <p className="text-sm font-medium">No hay conversaciones activas.</p>
            <p className="text-xs mt-1 opacity-60">Los chats entrantes aparecerán aquí.</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default ConversationList;
