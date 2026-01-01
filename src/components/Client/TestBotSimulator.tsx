
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, LeadStatus, Conversation } from '../../types';
import { getAuthHeaders } from '../../config';
import MessageBubble from '../MessageBubble'; 

interface TestBotSimulatorProps {
  token: string;
  backendUrl: string;
  userId: string;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';

interface SimulatedMessage extends Message {
    status?: LeadStatus;
    tags?: string[];
}

const TestBotSimulator: React.FC<TestBotSimulatorProps> = ({ token, backendUrl, userId, showToast }) => {
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentLeadStatus, setCurrentLeadStatus] = useState<LeadStatus | null>(null);
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchConversation = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/conversations`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const conversations: Conversation[] = await res.json();
        const testConversation = conversations.find(c => c.id === ELITE_BOT_JID);
        if (testConversation) {
          const simulatedHistory: SimulatedMessage[] = testConversation.messages.map(msg => {
              // IMPORTANT: Visual mapping. 'elite_bot' is the sender in DB, but we want it to look like a 'user' (left side bubble)
              return { ...msg, sender: msg.sender === 'elite_bot' ? 'user' : msg.sender };
          });
          
          // Ensure messages are sorted by timestamp to stack correctly
          simulatedHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          setMessages(simulatedHistory);
          setCurrentLeadStatus(testConversation.status); 
          setCurrentTags(testConversation.tags || []);
        } else {
          // Only clear if we are NOT simulating (avoids flashing empty state during race conditions)
          if (!isSimulating) {
              setMessages([]);
              setCurrentLeadStatus(null);
              setCurrentTags([]);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching test conversation:", error);
    }
  }, [backendUrl, token, isSimulating]);

  useEffect(() => {
    fetchConversation();
    const interval = setInterval(fetchConversation, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [fetchConversation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStartSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    // Don't clear messages immediately to avoid flicker if resuming, let fetchConversation handle update
    
    try {
      const res = await fetch(`${backendUrl}/api/client/test-bot/start`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId })
      });

      if (res.ok) {
        showToast('Simulación iniciada. Observa cómo responde tu IA.', 'success');
        setTimeout(fetchConversation, 500); 
      } else {
        const data = await res.json();
        showToast(data.message || 'Error al iniciar la simulación.', 'error');
        setIsSimulating(false);
      }
    } catch (error) {
      console.error("Error starting client test bot:", error);
      showToast('Error de red al iniciar la simulación.', 'error');
      setIsSimulating(false);
    }
  };

  const handleStopSimulation = async () => {
      // Optimistic UI update
      setIsSimulating(false); 
      try {
          const res = await fetch(`${backendUrl}/api/client/test-bot/stop`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ userId })
          });
          if (res.ok) {
              showToast('Simulación detenida correctamente.', 'info');
          } else {
              showToast('El servidor reportó un error al detener.', 'error');
          }
      } catch (e) {
          showToast('Error de conexión al detener.', 'error');
      }
  };

  const handleClearClick = () => {
      setShowConfirmModal(true);
  };

  const confirmClear = async () => {
    setShowConfirmModal(false);
    if (isSimulating) {
        await handleStopSimulation();
    }

    try {
      const res = await fetch(`${backendUrl}/api/client/test-bot/clear`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId })
      });

      if (res.ok) {
        showToast('Historial borrado.', 'success');
        setMessages([]);
        setCurrentLeadStatus(null);
        setCurrentTags([]);
      } else {
        showToast('Error al limpiar historial.', 'error');
      }
    } catch (error) {
      showToast('Error de red al limpiar.', 'error');
    }
  };
  
  const getStatusBadge = (status: LeadStatus | null) => {
    if (!status) return null;
    const colorClass = {
        [LeadStatus.COLD]: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        [LeadStatus.WARM]: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        [LeadStatus.HOT]: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
        [LeadStatus.PERSONAL]: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
    };
    return (
        <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass[status]}`}>
            {status}
        </span>
    );
  };

  return (
    <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 mt-10 relative overflow-hidden">
        {showConfirmModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center">
                    <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </div>
                    <h3 className="text-white font-black text-lg uppercase tracking-tight mb-2">¿Borrar Todo?</h3>
                    <p className="text-gray-400 text-xs mb-6 leading-relaxed">
                        Se detendrá la simulación y se eliminará el chat de prueba.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold text-xs uppercase tracking-wider">Cancelar</button>
                        <button onClick={confirmClear} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider">Confirmar</button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex justify-between items-center">
            <div>
                <h3 className="text-xl font-black text-white uppercase tracking-widest">Simulador <span className="text-brand-gold">Neural</span></h3>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-[0.3em] mt-1">
                    Entorno de Pruebas Seguro
                </p>
            </div>
            {isSimulating && <span className="text-[9px] font-black text-green-400 bg-green-900/20 px-3 py-1 rounded-full border border-green-500/30 animate-pulse">EJECUTANDO</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
                onClick={isSimulating ? handleStopSimulation : handleStartSimulation}
                className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg ${isSimulating ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20' : 'bg-brand-gold text-black hover:scale-[1.02] shadow-brand-gold/20'}`}
            >
                {isSimulating ? 'DETENER SIMULACIÓN' : 'INICIAR PRUEBA'}
            </button>
            
            <button
                onClick={handleClearClick}
                disabled={messages.length === 0}
                className="w-full py-3 bg-white/5 text-gray-400 border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Limpiar Chat
            </button>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-2xl p-6 h-[400px] flex flex-col relative overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2" ref={scrollRef}>
                {messages.length === 0 && !isSimulating ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 opacity-50">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-xs font-bold uppercase tracking-widest">Listo para iniciar</p>
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div key={index} className="animate-fade-in">
                            <MessageBubble message={{ ...msg, sender: msg.sender === 'elite_bot' ? 'user' : msg.sender as 'bot' | 'user' | 'owner' }} />
                            {index === messages.length - 1 && msg.sender === 'bot' && (currentLeadStatus || currentTags.length > 0) && (
                                <div className="mt-2 ml-auto w-fit flex items-center gap-2 animate-fade-in justify-end">
                                    {getStatusBadge(currentLeadStatus)}
                                    {currentTags && currentTags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {currentTags.map(tag => (
                                                <span key={tag} className="px-1.5 py-0.5 rounded bg-brand-gold/5 border border-brand-gold/20 text-brand-gold text-[8px] font-black uppercase tracking-tighter">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            {isSimulating && (
                <div className="absolute bottom-6 left-6 right-6 pointer-events-none">
                     <div className="flex items-center gap-2 text-gray-500 text-[10px] italic animate-pulse uppercase tracking-widest font-bold bg-black/60 p-2 rounded-lg w-fit backdrop-blur-sm">
                        <span>Procesando...</span>
                        <span className="w-1 h-1 bg-brand-gold rounded-full animate-bounce"></span>
                        <span className="w-1 h-1 bg-brand-gold rounded-full animate-bounce delay-75"></span>
                        <span className="w-1 h-1 bg-brand-gold rounded-full animate-bounce delay-150"></span>
                    </div>
                </div>
            )}
        </div>
    </section>
  );
};

export default TestBotSimulator;
