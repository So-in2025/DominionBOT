

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
    
    const confirmed = window.confirm(`¿Eliminar historial de "${displayTitle}"?\n\nEsta acción solo borra los mensajes del panel. EL USUARIO NO SERÁ BLOQUEADO.`);
    
    if (!confirmed) return;

    setIsDeleting(true);
    try {
        const token = localStorage.getItem('saas_token');
        const res = await fetch(`${BACKEND_URL}/api/conversation/${encodeURIComponent(conversation.id)}`, {
            method: 'DELETE',
            headers: getAuthHeaders(token!),
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
        relative flex items-center p-3 md:p-4 cursor-pointer border-b border-white/5 transition-all duration-200 group
        ${isSelected ? 'bg-brand-gold/10' : 'hover:bg-white/5'}
        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Selection Marker */}
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]"></div>}

      {/* Avatar with Status */}
      <div className="relative flex-shrink-0 mr-4">
        <div className="w-12 h-12 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center">
          <span className="text-xl font-black text-white">{displayTitle.charAt(0).toUpperCase()}</span>
        </div>
        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-brand-surface ${colorClass}`}></div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div className="flex-1 truncate pr-2">
              <h3 className={`text-base font-semibold truncate transition-colors ${isSelected ? 'text-brand-gold' : 'text-gray-100 group-hover:text-white'}`}>
                {displayTitle}
              </h3>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-wider hidden md:block">{displaySubtitle}</p>
          </div>
          <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
            {new Date(lastMessage?.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        
        {/* Signal Tags (Desktop Only for clarity) */}
        {conversation.tags && conversation.tags.length > 0 && (
            <div className="hidden md:flex flex-wrap gap-1 mt-2">
                {conversation.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-brand-gold/5 border border-brand-gold/20 text-brand-gold text-[8px] font-black uppercase tracking-tighter">
                        {tag}
                    </span>
                ))}
            </div>
        )}

        <p className="text-sm text-gray-400 truncate group-hover:text-gray-300 transition-colors mt-1">
          {conversation.isMuted ? (
              <span className="text-brand-gold font-bold uppercase text-[9px] mr-2 tracking-tighter">[Escalado]</span>
          ) : (
              <>
                {lastMessage?.sender === 'owner' && <span className="text-brand-gold/80 font-semibold mr-1">Tú:</span>}
                {lastMessage?.sender === 'bot' && <span className="text-blue-400/80 font-semibold mr-1">IA:</span>}
              </>
          )}
          {lastMessage?.text || "Nueva conversación"}
        </p>
      </div>
       <button 
          onClick={handleDelete}
          className="p-2 text-gray-600 hover:text-red-500 rounded-full transition-colors md:opacity-0 md:group-hover:opacity-100 ml-2"
          title="Solo Eliminar Historial (No Bloquea)"
      >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </li>
  );
};

export default ConversationListItem;
