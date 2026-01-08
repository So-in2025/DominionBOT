
import React, { useState, useMemo, useEffect } from 'react';
import { Conversation, ConnectionStatus, LeadStatus } from '../types';
import ConversationListItem from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  backendError: string | null;
  onRequestHistory: () => Promise<void>; 
  isRequestingHistory: boolean;
  connectionStatus: ConnectionStatus;
  onDeleteConversation?: (id: string) => void; 
  onRefresh?: () => void; 
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  backendError,
  connectionStatus,
  onDeleteConversation,
  onRefresh
}) => {
  const [filter, setFilter] = useState<'ALL' | 'HOT' | 'WARM' | 'COLD'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Update timestamp whenever conversations change (implies a fetch or socket update)
  useEffect(() => {
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, [conversations]);

  const handleManualRefresh = () => {
      if (onRefresh) {
          setIsRefreshing(true);
          onRefresh();
          setTimeout(() => setIsRefreshing(false), 1000);
      }
  };

  const filteredConversations = useMemo(() => {
    return conversations
      .filter(c => {
        // Filter by Status Tab
        if (filter !== 'ALL') {
             if (filter === 'HOT' && c.status !== LeadStatus.HOT) return false;
             if (filter === 'WARM' && c.status !== LeadStatus.WARM) return false;
             if (filter === 'COLD' && c.status !== LeadStatus.COLD) return false;
        }

        // Filter by Search
        if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          const matchesName = c.leadName.toLowerCase().includes(lowerTerm);
          const matchesNumber = c.leadIdentifier.toLowerCase().includes(lowerTerm);
          const matchesTags = c.tags?.some(t => t.toLowerCase().includes(lowerTerm));
          
          return matchesName || matchesNumber || matchesTags;
        }

        return true;
      });
  }, [conversations, filter, searchTerm]);

  return (
    <div className="w-full md:w-80 lg:w-96 flex flex-col border-r border-white/10 bg-brand-surface h-full">
      {/* Search & Filter Header */}
      <div className="p-4 border-b border-white/10 space-y-4 bg-black/20">
        <div className="flex gap-2">
            <div className="relative flex-1">
                <input
                    type="text"
                    placeholder="Buscar chats, etiquetas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-gray-500 focus:border-brand-gold outline-none transition-all"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <button 
                onClick={handleManualRefresh}
                className={`p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all ${isRefreshing ? 'animate-spin text-brand-gold border-brand-gold/30' : ''}`}
                title="Actualizar Lista"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
        </div>

        <div className="flex justify-between items-center">
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar no-scrollbar flex-1">
                {['ALL', 'HOT', 'WARM', 'COLD'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f as any)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                            filter === f 
                            ? 'bg-brand-gold text-black border-brand-gold' 
                            : 'bg-white/5 text-gray-500 border-transparent hover:text-white hover:border-white/10'
                        }`}
                    >
                        {f === 'ALL' ? 'Todos' : f === 'HOT' ? 'Caliente' : f === 'WARM' ? 'Tibio' : 'Frío'}
                    </button>
                ))}
            </div>
            {lastUpdated && (
                <span className="text-[8px] text-gray-600 font-mono ml-2 whitespace-nowrap hidden sm:block" title="Última sincronización con el servidor">
                    Sinc: {lastUpdated}
                </span>
            )}
        </div>
      </div>

      {/* Connection Status Banner */}
      {connectionStatus !== ConnectionStatus.CONNECTED && (
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/20">
              <p className="text-[9px] text-red-400 font-bold text-center uppercase tracking-widest animate-pulse">
                  {connectionStatus === ConnectionStatus.DISCONNECTED ? 'Desconectado' : 'Sincronizando...'}
              </p>
          </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {backendError && (
            <div className="p-4 text-center text-red-400 text-xs font-bold border-b border-red-500/20 bg-red-900/10">
                {backendError}
            </div>
        )}
        
        {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 opacity-50 text-center p-4">
                <svg className="w-10 h-10 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">No se encontraron chats</p>
            </div>
        ) : (
            <ul>
                {filteredConversations.map(conversation => (
                    <ConversationListItem
                        key={conversation.id}
                        conversation={conversation}
                        isSelected={selectedConversationId === conversation.id}
                        onSelect={() => onSelectConversation(conversation.id)}
                        onDelete={onDeleteConversation}
                    />
                ))}
            </ul>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
