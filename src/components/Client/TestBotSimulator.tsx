
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, LeadStatus, Conversation } from '../../types';
import { getAuthHeaders } from '../../config';
import MessageBubble from '../MessageBubble'; // Assuming MessageBubble can handle 'elite_bot' as 'user' type

interface TestBotSimulatorProps {
  token: string;
  backendUrl: string;
  userId: string;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// --- Test Bot Specifics (Duplicated from Backend for Frontend Logic) ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
const ELITE_BOT_NAME = 'Dominion Elite Test Bot';

// These are messages that the "elite bot" sends to the client's bot
const TEST_SCRIPT = [
    { text: "Hola, estoy interesado en tus servicios. ¿Cómo funciona?", delay: 1000 },
    { text: "¿Podrías explicarme un poco más sobre el plan PRO?", delay: 2000 },
    { text: "¿Cuál es el costo mensual?", delay: 1500 },
    { text: "¿Ofrecen alguna garantía o prueba?", delay: 2000 },
    { text: "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?", delay: 2500 },
];
// --- END Test Bot Specifics ---

interface SimulatedMessage extends Message {
    status?: LeadStatus;
    tags?: string[];
}

const TestBotSimulator: React.FC<TestBotSimulatorProps> = ({ token, backendUrl, userId, showToast }) => {
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentLeadStatus, setCurrentLeadStatus] = useState<LeadStatus | null>(null);
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchConversation = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/conversations`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const conversations: Conversation[] = await res.json();
        const testConversation = conversations.find(c => c.id === ELITE_BOT_JID);
        if (testConversation) {
          const simulatedHistory: SimulatedMessage[] = testConversation.messages.map(msg => {
              // Adjust sender for display: elite_bot messages should appear as 'user' to the client
              return { ...msg, sender: msg.sender === 'elite_bot' ? 'user' : msg.sender };
          });
          setMessages(simulatedHistory);
          // Always update current status and tags from the conversation object directly
          setCurrentLeadStatus(testConversation.status); 
          setCurrentTags(testConversation.tags || []);
        } else {
          setMessages([]);
          setCurrentLeadStatus(null);
          setCurrentTags([]);
        }
      }
    } catch (error) {
      console.error("Error fetching test conversation:", error);
      // Only show toast if actually simulating, otherwise it's just polling for a non-existent convo
      if (isSimulating) { // Check isSimulating state here
        showToast('Error al cargar la conversación de prueba.', 'error');
      }
    }
  }, [backendUrl, token, showToast, isSimulating]); // Add isSimulating to dependencies

  useEffect(() => {
    fetchConversation();
    const interval = setInterval(fetchConversation, 5000); // Poll for updates during simulation
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
    setMessages([]); // Clear messages to start fresh
    setCurrentLeadStatus(null);
    setCurrentTags([]);

    try {
      const res = await fetch(`${backendUrl}/api/client/test-bot/start`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId }) // userId is implicitly the current user's ID
      });

      if (res.ok) {
        showToast('Simulación iniciada. Las interacciones se mostrarán en breve.', 'success');
        // Initial fetch to get first message/status quickly
        setTimeout(fetchConversation, 1000); // Explicit fetch after starting
      } else {
        const data = await res.json();
        showToast(data.message || 'Error al iniciar la simulación.', 'error');
      }
    } catch (error) {
      console.error("Error starting client test bot:", error);
      showToast('Error de red al iniciar la simulación.', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleClearSimulation = async () => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar la conversación de prueba?')) return;
    try {
      const res = await fetch(`${backendUrl}/api/client/test-bot/clear`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId }) // userId is implicitly the current user's ID
      });

      if (res.ok) {
        showToast('Conversación de prueba eliminada.', 'success');
        setMessages([]);
        setCurrentLeadStatus(null);
        setCurrentTags([]);
        setTimeout(fetchConversation, 500); // Explicit fetch after clearing
      } else {
        const data = await res.json();
        showToast(data.message || 'Error al limpiar la conversación de prueba.', 'error');
      }
    } catch (error) {
      console.error("Error clearing client test bot conversation:", error);
      showToast('Error de red al limpiar la conversación de prueba.', 'error');
    }
  };
  
  const getStatusBadge = (status: LeadStatus | null) => {
    if (!status) return null;
    const colorClass = {
        [LeadStatus.COLD]: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        [LeadStatus.WARM]: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        [LeadStatus.HOT]: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
        [LeadStatus.PERSONAL]: 'text-gray-400 bg-gray-500/10 border-gray-500/20', // Should not appear for elite_bot convos
    };
    return (
        <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass[status]}`}>
            {status}
        </span>
    );
  };

  return (
    <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 mt-10">
        <h3 className="text-xl font-black text-white uppercase tracking-widest">Simulador <span className="text-brand-gold">Neural</span></h3>
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-[0.3em] mt-1">
            Prueba cómo tu IA califica y responde antes de desplegarla.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
                onClick={handleStartSimulation}
                disabled={isSimulating}
                className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-gold/20"
            >
                {isSimulating ? 'Iniciando Simulación...' : 'Iniciar Simulación'}
            </button>
            <button
                onClick={handleClearSimulation}
                disabled={isSimulating || messages.length === 0}
                className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Limpiar Conversación de Prueba
            </button>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-2xl p-6 h-[400px] flex flex-col relative">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4" ref={scrollRef}>
                {messages.length === 0 && !isSimulating ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-xs font-bold uppercase tracking-widest">Aún no hay interacciones de prueba</p>
                        <p className="text-[10px] mt-1">Inicia la simulación para ver tu bot en acción.</p>
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div key={index}>
                            <MessageBubble message={{ ...msg, sender: msg.sender === 'elite_bot' ? 'user' : msg.sender as 'bot' | 'user' | 'owner' }} />
                            {/* Display status and tags for bot's responses IF it's the latest message and it's a bot message */}
                            {index === messages.length - 1 && msg.sender === 'bot' && (currentLeadStatus || currentTags.length > 0) && (
                                <div className="mt-2 ml-auto w-fit flex items-center gap-2 animate-fade-in">
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
                <div className="absolute bottom-6 left-6 flex items-center gap-2 text-gray-500 text-[10px] italic animate-pulse uppercase tracking-widest font-bold">
                    <span>Simulador Analizando</span>
                    <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                    <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                </div>
            )}
        </div>

        {/* Current State Indicator */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between animate-fade-in">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Estado de Lead Actual</span>
                {getStatusBadge(currentLeadStatus)}
            </div>
            <div className="p-4 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center animate-fade-in">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 mb-2">Señales Detectadas</span>
                <div className="flex flex-wrap gap-1">
                    {currentTags.length > 0 ? currentTags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-brand-gold/5 border border-brand-gold/20 text-brand-gold text-[8px] font-black uppercase tracking-tighter">
                            {tag}
                        </span>
                    )) : <span className="text-[9px] text-gray-500 italic">Ninguna</span>}
                </div>
            </div>
        </div>
    </section>
  );
};

export default TestBotSimulator;