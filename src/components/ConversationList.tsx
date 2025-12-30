
import React, { useState, useMemo } from 'react';
import { Conversation, LeadStatus } from '../types';
import ConversationListItem from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  backendError: string | null;
}

const ConversationList: React.FC<ConversationListProps> = ({ conversations, selectedConversationId, onSelectConversation, backendError }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'ALL'>('ALL');

  const filteredConversations = useMemo(() => {
      return conversations.filter(c => {
          const matchesSearch = c.leadName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                               c.leadIdentifier.includes(searchTerm) ||
                               c.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
          const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
          return matchesSearch && matchesStatus;
      });
  }, [conversations, searchTerm, statusFilter]);

  return (
    // SE ELIMINÓ 'hidden md:flex' para permitir visualización en móviles (controlado por App.tsx)
    <aside className="flex flex-col w-full md:w-80 bg-brand-surface border-r border-white/10 h-full flex-shrink-0 backdrop-blur-md">
      {/* Search & Filter Header */}
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="relative">
             <input
                type="text"
                placeholder="Buscar Signal o Lead..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg py-2.5 px-4 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/50 transition-all font-bold"
            />
            <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <div className="flex gap-1">
            {['ALL', LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT].map((f) => (
                <button
                    key={f}
                    onClick={() => setStatusFilter(f as any)}
                    className={`flex-1 py-1 text-[9px] font-black uppercase tracking-widest rounded border transition-all ${
                        statusFilter === f 
                        ? 'bg-brand-gold text-black border-brand-gold' 
                        : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
                    }`}
                >
                    {f === 'ALL' ? 'Todos' : f}
                </button>
            ))}
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredConversations.length > 0 ? (
          <ul className="flex flex-col">
            {filteredConversations.map(convo => (
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
            <p className="text-sm font-medium">No hay señales filtradas.</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default ConversationList;
