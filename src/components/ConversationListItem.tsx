
import React, { useState } from 'react';
import { Conversation, LeadStatus } from '../types';
import { formatPhoneNumber } from '../utils/textUtils';
import { BACKEND_URL, getAuthHeaders } from '../config';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: (id: string) => void;
}

const statusColorClass = {
  [LeadStatus.COLD]: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
  [LeadStatus.WARM]: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]',
  [LeadStatus.HOT]: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse',
  [LeadStatus.PERSONAL]: 'bg-gray-500 shadow-[0_0_8px_rgba(107,114,128,0.5)]',
};

const ConversationListItem: React.FC<ConversationListItemProps> = ({ conversation, isSelected, onSelect, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const colorClass = statusColorClass[conversation.status] || 'bg-gray-500';
  
  const displayTitle = conversation.leadName;
  const displaySubtitle = formatPhoneNumber(conversation.leadIdentifier);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // SAFETY FIX: Explicitly clarify this is DELETE ONLY.
    // We removed the ambiguity. Blocking must be done via the Blacklist Panel or Chat Header.
    const confirmed = window.confirm(`¿Eliminar historial de "${displayTitle}"?\n\nEsta acción solo borra los mensajes del panel. EL USUARIO NO SERÁ BLOQUEADO.`);
    
    if (!confirmed) return;

    setIsDeleting(true);
    try {
        const token = localStorage.getItem('saas_token');
        const res = await fetch(`${BACKEND_URL}/api/conversation/${encodeURIComponent(conversation.id)}`, {
            method: 'DELETE',
            headers: getAuthHeaders(token!),
            // CRITICAL: Hardcoded to false to prevent accidental bans
            body: JSON.stringify({ blacklist: false }) 
        });
        if (res.ok) {
            onDelete?.(conversation.id);
        }
    } catch (e) {
        console.error("Delete Error", e);
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <li
      onClick={onSelect}
      className={`
        relative flex items-start p-4 cursor-pointer border-b border-white/5 transition-all duration-200 group
        ${isSelected ? 'bg-brand-gold/10' : 'hover:bg-white/5'}
        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Selection Marker */}
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]"></div>}

      {/* Status Dot / Mute Icon */}
      <div className="mt-1.5 mr-3 flex-shrink-0 relative">
          <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`}></div>
          {conversation.isMuted && (
              <div className="absolute -top-1 -right-1 bg-black rounded-full p-0.5 border border-white/20">
                  <svg className="w-2 h-2 text-brand-gold" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
              </div>
          )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <h3 className={`text-sm font-semibold truncate transition-colors ${isSelected ? 'text-brand-gold' : 'text-gray-200 group-hover:text-white'}`}>
            {displayTitle}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">
              {new Date(lastMessage?.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button 
                onClick={handleDelete}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-gray-600 hover:text-red-500 rounded-lg transition-all"
                title="Solo Eliminar Historial (No Bloquea)"
            >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
        
        {/* Always display formatted phone number as a subtitle */}
        <p className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-wider">{displaySubtitle}</p>

        {/* Signal Tags (Signals) */}
        {conversation.tags && conversation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5 mt-2">
                {conversation.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-brand-gold/5 border border-brand-gold/20 text-brand-gold text-[8px] font-black uppercase tracking-tighter">
                        {tag}
                    </span>
                ))}
                {conversation.tags.length > 3 && <span className="text-[8px] text-gray-600 font-bold">+{conversation.tags.length - 3}</span>}
            </div>
        )}

        <p className="text-xs text-gray-400 truncate group-hover:text-gray-300 transition-colors opacity-80 mt-1">
          {conversation.isMuted ? (
              <span className="text-brand-gold font-bold uppercase text-[9px] mr-2 tracking-tighter">[Escalado]</span>
          ) : (
              <>
                {lastMessage?.sender === 'owner' && <span className="text-brand-gold mr-1">Tú:</span>}
                {lastMessage?.sender === 'bot' && <span className="text-blue-400 mr-1">AI:</span>}
              </>
          )}
          {lastMessage?.text || "Nueva conversación"}
        </p>
      </div>
    </li>
  );
};

export default ConversationListItem;
