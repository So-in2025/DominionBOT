
import React from 'react';
import { Conversation, LeadStatus } from '../types';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
}

const statusColorClass = {
  [LeadStatus.COLD]: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
  [LeadStatus.WARM]: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]',
  [LeadStatus.HOT]: 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse',
};

const ConversationListItem: React.FC<ConversationListItemProps> = ({ conversation, isSelected, onSelect }) => {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const colorClass = statusColorClass[conversation.status];
  const isHot = conversation.status === LeadStatus.HOT;

  const handleClick = () => {
    if (isHot && 'vibrate' in navigator) {
        navigator.vibrate([100, 30, 100]);
    }
    onSelect();
  };

  return (
    <li
      onClick={handleClick}
      className={`
        relative flex items-start p-4 cursor-pointer border-b border-white/5 transition-all duration-300 group
        ${isSelected ? 'bg-brand-gold/10' : 'hover:bg-white/5'}
        ${isHot && !isSelected ? 'bg-red-500/5' : ''}
      `}
    >
      {/* Dynamic Hot Glow */}
      {isHot && (
          <div className="absolute inset-0 bg-red-500/5 opacity-20 pointer-events-none animate-pulse"></div>
      )}

      {/* Selection Marker */}
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-gold shadow-[0_0_15px_rgba(212,175,55,0.6)]"></div>}

      {/* Status Dot / Mute Icon */}
      <div className="mt-1.5 mr-3 flex-shrink-0 relative z-10">
          <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`}></div>
          {conversation.isMuted && (
              <div className="absolute -top-1.5 -right-1.5 bg-brand-black rounded-full p-0.5 border border-brand-gold/50 shadow-lg">
                  <svg className="w-2.5 h-2.5 text-brand-gold" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
              </div>
          )}
      </div>
      
      <div className="flex-1 min-w-0 z-10">
        <div className="flex justify-between items-center mb-1">
          <h3 className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-brand-gold' : 'text-gray-200 group-hover:text-white'}`}>
            {conversation.leadName}
          </h3>
          <span className="text-[10px] text-gray-500 flex-shrink-0 ml-2 font-mono">
            {new Date(lastMessage?.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        
        {/* Signal Tags */}
        {conversation.tags && conversation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                {conversation.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded-sm bg-brand-gold/5 border border-brand-gold/20 text-brand-gold text-[7px] font-black uppercase tracking-widest">
                        {tag}
                    </span>
                ))}
                {conversation.tags.length > 2 && <span className="text-[7px] text-gray-600 font-bold ml-1">+{conversation.tags.length - 2}</span>}
            </div>
        )}

        <p className={`text-xs truncate transition-colors ${isHot ? 'text-red-300 font-medium' : 'text-gray-400 group-hover:text-gray-300'}`}>
          {conversation.isMuted ? (
              <span className="text-brand-gold font-black uppercase text-[8px] mr-2 tracking-widest">⚠️ INTERVENIR</span>
          ) : (
              <>
                {lastMessage?.sender === 'owner' && <span className="text-brand-gold mr-1 opacity-70">Tú:</span>}
                {lastMessage?.sender === 'bot' && <span className="text-blue-400 mr-1 opacity-70">AI:</span>}
              </>
          )}
          {lastMessage?.text || "Nueva señal entrante"}
        </p>
      </div>
    </li>
  );
};

export default ConversationListItem;
