
import React, { useRef, useEffect, useState } from 'react';
import { Conversation, LeadStatus, InternalNote, BotSettings } from '../types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import SalesContextSidebar from './SalesContextSidebar';
import { formatPhoneNumber } from '../utils/textUtils';
import { BACKEND_URL, getAuthHeaders } from '../config';

interface ChatWindowProps {
  conversation: Conversation | null;
  onSendMessage: (text: string) => void;
  onToggleBot: (id: string) => Promise<void>; 
  isTyping: boolean;
  isBotGloballyActive: boolean;
  isMobile: boolean;
  onBack: () => void;
  onUpdateConversation?: (id: string, updates: Partial<Conversation>) => void;
  isPlanExpired?: boolean;
  settings?: BotSettings | null; // Added settings
  onUpdateSettings?: (newSettings: BotSettings) => void; // Added updater
}

const statusBadgeClass = {
  [LeadStatus.COLD]: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  [LeadStatus.WARM]: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  [LeadStatus.HOT]: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
  [LeadStatus.PERSONAL]: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
};

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  conversation, 
  onSendMessage, 
  onToggleBot, 
  isTyping, 
  isBotGloballyActive, 
  isMobile, 
  onBack,
  onUpdateConversation,
  isPlanExpired,
  settings,
  onUpdateSettings
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isTogglingBot, setIsTogglingBot] = useState(false);
  const [isForcingAi, setIsForcingAi] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [conversation?.messages, isTyping, conversation?.suggestedReplies]);

  const handleSuggestionClick = (suggestion: string) => {
      onSendMessage(suggestion);
      if (conversation && onUpdateConversation) {
          onUpdateConversation(conversation.id, { suggestedReplies: undefined });
      }
  };

  const handleToggleClick = async () => {
      if (!conversation) return;
      setIsTogglingBot(true);
      try {
          await onToggleBot(conversation.id);
      } finally {
          setIsTogglingBot(false);
      }
  };

  const handleForceAiRun = async () => {
      if (!conversation) return;
      setIsForcingAi(true);
      try {
          const token = localStorage.getItem('saas_token');
          await fetch(`${BACKEND_URL}/api/conversation/force-run`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ id: conversation.id })
          });
      } catch (e) {
          console.error("Failed to force AI run", e);
      } finally {
          setIsForcingAi(false);
      }
  };

  const toggleBlacklist = () => {
      if (!conversation || !settings || !onUpdateSettings) return;
      
      const number = conversation.id.split('@')[0];
      const ignoredJids = settings.ignoredJids || [];
      const isBlocked = ignoredJids.includes(number);

      if (isBlocked) {
          if (confirm(`¿Desbloquear a ${conversation.leadName}? La IA volverá a responder.`)) {
              onUpdateSettings({ ...settings, ignoredJids: ignoredJids.filter(n => n !== number) });
          }
      } else {
          if (confirm(`¿Bloquear a ${conversation.leadName}? La IA ignorará este chat para siempre.`)) {
              onUpdateSettings({ ...settings, ignoredJids: [...ignoredJids, number] });
          }
      }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black text-gray-600">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 animate-pulse">
            <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </div>
        <p className="text-lg font-medium text-gray-400 font-sans tracking-tight">Selecciona un Signal</p>
        <p className="text-sm opacity-60 mt-2">La infraestructura está lista.</p>
      </div>
    );
  }
  
  const currentBadge = statusBadgeClass[conversation.status];
  const displayTitle = isNaN(Number(conversation.leadName.replace(/\+/g, ''))) 
      ? conversation.leadName 
      : formatPhoneNumber(conversation.leadName);

  // Check blacklist status
  const currentNumber = conversation.id.split('@')[0];
  const isBlacklisted = settings?.ignoredJids?.includes(currentNumber);

  return (
    <div className="flex-1 flex flex-row h-full overflow-hidden">
      <div className="flex-1 flex flex-col bg-brand-black h-full relative overflow-hidden">
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
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-gray-700 to-black border border-white/10 flex items-center justify-center font-bold text-white shadow-inner overflow-hidden">
                      {/* Show initials or icon */}
                      {conversation.leadName.charAt(0).toUpperCase()}
                  </div>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-brand-surface rounded-full ${isBlacklisted ? 'bg-red-500' : 'bg-green-500'}`}></div>
              </div>

              <div>
                <h2 className="text-sm md:text-base font-bold text-white leading-tight flex items-center gap-2">
                    {displayTitle}
                    {isBlacklisted && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Bloqueado</span>}
                </h2>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-wider">{formatPhoneNumber(conversation.leadIdentifier)}</p>
              </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className={`hidden md:inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${currentBadge}`}>
                {conversation.status}
            </span>

            {isPlanExpired ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-red-900/20 border border-red-500/50 text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Licencia Requerida
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    {/* BLACKLIST TOGGLE BUTTON */}
                    {settings && (
                        <button 
                            onClick={toggleBlacklist}
                            className={`p-2 rounded-lg border transition-all ${isBlacklisted ? 'bg-red-500 text-white border-red-600' : 'bg-white/5 text-gray-400 border-white/10 hover:text-red-400 hover:border-red-500/50'}`}
                            title={isBlacklisted ? "Desbloquear número" : "Bloquear número (Lista Negra)"}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </button>
                    )}

                    {/* NEW: FORCE AI BUTTON */}
                    {conversation.isBotActive && !conversation.isMuted && isBotGloballyActive && !isBlacklisted && (
                        <button 
                            onClick={handleForceAiRun}
                            disabled={isForcingAi}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-gold/10 hover:bg-brand-gold/20 text-brand-gold border border-brand-gold/30 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                            title="Forzar análisis de historial"
                        >
                            {isForcingAi ? (
                                <div className="w-3 h-3 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            )}
                            <span className="hidden md:inline">Ejecutar IA</span>
                        </button>
                    )}

                    <button 
                    onClick={handleToggleClick}
                    disabled={!isBotGloballyActive || conversation.isMuted || isTogglingBot || isBlacklisted}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all min-w-[100px] justify-center
                        ${conversation.isBotActive 
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white' 
                            : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500 hover:text-white'}
                        ${(!isBotGloballyActive || conversation.isMuted || isBlacklisted) ? 'opacity-50 cursor-not-allowed grayscale' : ''}
                    `}
                    >
                    {isTogglingBot ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        conversation.isMuted ? (
                            <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg> Copiloto</>
                        ) : (
                            conversation.isBotActive ? "PAUSAR IA" : "ACTIVAR IA"
                        )
                    )}
                    </button>
                </div>
            )}

            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className={`hidden lg:flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${showSidebar ? 'bg-brand-gold text-black border-brand-gold' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
              title="Sales Context Layer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            </button>
          </div>
        </header>

        {/* MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-4 md:space-y-6 custom-scrollbar relative z-0 pb-32">
          
          {isBlacklisted && (
              <div className="bg-red-500/20 border border-red-500/40 p-4 rounded-xl mb-6 flex items-start gap-4 animate-fade-in shadow-lg">
                  <div className="p-2 bg-red-500 text-white rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </div>
                  <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-tight">Escudo Activado</h4>
                      <p className="text-xs text-gray-300 mt-1">Este contacto está en la lista negra. La IA ignorará todos los mensajes entrantes.</p>
                  </div>
              </div>
          )}

          {conversation.isMuted && !conversation.suggestedReplies && !isPlanExpired && !isBlacklisted && (
              <div className="bg-brand-gold/10 border border-brand-gold/20 p-4 rounded-xl mb-6 flex items-start gap-4 animate-fade-in shadow-[0_4px_20px_rgba(212,175,55,0.05)]">
                  <div className="p-2 bg-brand-gold/20 rounded-lg text-brand-gold">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-tight">Shadow Mode Activo</h4>
                      <p className="text-xs text-gray-400 mt-1">El control manual es requerido. Revisa el panel lateral.</p>
                  </div>
              </div>
          )}

          {conversation.messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isTyping && !isBlacklisted && (
               <div className="flex items-center gap-2 text-gray-500 text-[10px] italic ml-4 animate-pulse uppercase tracking-widest font-bold">
                  <span>Signal Core Procesando</span>
                  <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                  <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
               </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* COPILOT SUGGESTIONS PANEL */}
        {conversation.suggestedReplies && conversation.suggestedReplies.length > 0 && !isBlacklisted && (
            <div className="absolute bottom-[88px] left-0 right-0 p-4 bg-gradient-to-t from-brand-black via-brand-black/95 to-transparent z-20">
                <div className="flex items-center gap-2 mb-2 px-2">
                    <span className="w-2 h-2 bg-brand-gold rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Sugerencias de Cierre (Copiloto)</span>
                </div>
                <div className="flex flex-col md:flex-row gap-2 overflow-x-auto pb-2">
                    {conversation.suggestedReplies.map((reply, idx) => (
                        <button 
                            key={idx}
                            onClick={() => handleSuggestionClick(reply)}
                            className="flex-1 text-left bg-white/5 backdrop-blur-md border border-brand-gold/30 hover:bg-brand-gold/20 hover:border-brand-gold p-3 rounded-xl transition-all group min-w-[200px]"
                        >
                            <span className="block text-[10px] text-gray-500 font-bold uppercase mb-1 group-hover:text-brand-gold">Opción {idx + 1}</span>
                            <p className="text-xs text-gray-200 line-clamp-2">{reply}</p>
                        </button>
                    ))}
                </div>
            </div>
        )}

        <ChatInput
          onSendMessage={onSendMessage}
          disabled={!isBotGloballyActive || (conversation.isBotActive && !conversation.isMuted) || (isPlanExpired && conversation.isBotActive) || isBlacklisted}
          placeholder={isPlanExpired ? 'Modo Lectura - Licencia Requerida' : (isBlacklisted ? 'Conversación Bloqueada' : (conversation.isMuted ? 'Escribe o selecciona una sugerencia...' : (conversation.isBotActive ? 'La IA está respondiendo...' : 'Escribe un mensaje...')))}
        />
      </div>

      {/* SALES CONTEXT SIDEBAR */}
      {showSidebar && !isMobile && (
        <SalesContextSidebar 
          conversation={conversation}
          onUpdateTags={(tags) => onUpdateConversation?.(conversation.id, { tags })}
          onAddNote={(note) => {
            const newNote: InternalNote = {
              id: Date.now().toString(),
              author: 'HUMAN',
              timestamp: new Date(),
              note
            };
            onUpdateConversation?.(conversation.id, { 
              internalNotes: [...(conversation.internalNotes || []), newNote] 
            });
          }}
          onUpdateConversation={onUpdateConversation}
        />
      )}
    </div>
  );
};

export default ChatWindow;
