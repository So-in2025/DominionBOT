
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, LeadStatus, Conversation, SimulationScenario, User, SimulationRun } from '../../types';
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

const SCENARIOS: { id: SimulationScenario; label: string; desc: string }[] = [
    { id: 'STANDARD_FLOW', label: 'Estándar', desc: 'Flujo ideal de consulta y cierre.' },
    { id: 'PRICE_OBJECTION', label: 'Objeción Precio', desc: 'Cliente sensible al precio. Testea persuasión.' },
    { id: 'COMPETITOR_COMPARISON', label: 'Competencia', desc: 'Cliente compara con rivales. Testea diferenciación.' },
    { id: 'GHOSTING_RISK', label: 'Riesgo Ghosting', desc: 'Respuestas cortas y secas. Testea re-engagement.' },
    { id: 'CONFUSED_BUYER', label: 'Confundido', desc: 'Preguntas fuera de contexto. Testea clarificación.' },
];

type Tab = 'LAB' | 'VAULT';

const TestBotSimulator: React.FC<TestBotSimulatorProps> = ({ token, backendUrl, userId, showToast }) => {
  const [activeTab, setActiveTab] = useState<Tab>('LAB');
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentLeadStatus, setCurrentLeadStatus] = useState<LeadStatus>(LeadStatus.COLD);
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario>('STANDARD_FLOW');
  const [labData, setLabData] = useState<any>(null); 
  const scrollRef = useRef<HTMLDivElement>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Data Fetching
  const fetchData = useCallback(async () => {
    try {
      const [convRes, userRes] = await Promise.all([
          fetch(`${backendUrl}/api/conversations`, { headers: getAuthHeaders(token) }),
          fetch(`${backendUrl}/api/user/me`, { headers: getAuthHeaders(token) })
      ]);

      if (convRes.ok) {
        const conversations: Conversation[] = await convRes.json();
        const testConversation = conversations.find(c => c.id === ELITE_BOT_JID);
        if (testConversation) {
          const simulatedHistory: SimulatedMessage[] = testConversation.messages.map(msg => ({
              ...msg, 
              sender: msg.sender === 'elite_bot' ? 'user' : msg.sender 
          }));
          simulatedHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setMessages(simulatedHistory);
          setCurrentLeadStatus(testConversation.status); 
        } else if (!isSimulating) {
            setMessages([]);
            setCurrentLeadStatus(LeadStatus.COLD);
        }
      }

      if (userRes.ok) {
          const userData: User = await userRes.json();
          setLabData(userData.simulationLab);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [backendUrl, token, isSimulating]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // UPDATED: 8s interval
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [messages]);

  // Actions
  const handleStartSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setMessages([]); 
    try {
      const res = await fetch(`${backendUrl}/api/client/test-bot/start`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId, scenario: selectedScenario })
      });
      if (res.ok) {
        showToast(`Entrenamiento iniciado: ${selectedScenario}`, 'success');
        setTimeout(fetchData, 500); 
      } else {
        const data = await res.json();
        showToast(data.message || 'Error al iniciar.', 'error');
        setIsSimulating(false);
      }
    } catch (error) {
      showToast('Error de conexión.', 'error');
      setIsSimulating(false);
    }
  };

  const handleStopSimulation = async () => {
      setIsSimulating(false); 
      try {
          await fetch(`${backendUrl}/api/client/test-bot/stop`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ userId })
          });
          showToast('Simulación abortada manualmente.', 'info');
      } catch (e) {
          showToast('Error enviando señal de stop.', 'error');
      }
  };

  const handleClear = async () => {
    if (isSimulating) await handleStopSimulation();
    try {
      await fetch(`${backendUrl}/api/client/test-bot/clear`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ userId })
      });
      setMessages([]);
      setCurrentLeadStatus(LeadStatus.COLD);
      showToast('Memoria del simulador purgada.', 'success');
    } catch (error) {
      showToast('Error al limpiar.', 'error');
    }
  };

  // Helpers
  const scoreColor = (score: number) => {
      if (score >= 80) return 'text-green-400';
      if (score >= 50) return 'text-yellow-400';
      return 'text-red-400';
  };

  const renderVault = () => {
      const experiments = (labData?.experiments || []) as SimulationRun[];
      const reversedExperiments = [...experiments].reverse();

      return (
          <div className="p-6 md:p-8 animate-fade-in min-h-[550px]">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                      <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Experimentos Totales</h4>
                      <p className="text-3xl font-black text-white">{experiments.length}</p>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                      <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Score Promedio Global</h4>
                      <p className={`text-3xl font-black ${scoreColor(labData?.aggregatedScore || 0)}`}>{labData?.aggregatedScore || 0}</p>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                      <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Patrón de Fallo #1</h4>
                      <p className="text-lg font-bold text-red-400 truncate">
                          {labData?.topFailurePatterns ? Object.keys(labData.topFailurePatterns).sort((a,b) => labData.topFailurePatterns[b] - labData.topFailurePatterns[a])[0] || 'Ninguno' : 'Ninguno'}
                      </p>
                  </div>
              </div>

              <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left">
                          <thead>
                              <tr className="border-b border-white/5 bg-white/5 text-[9px] uppercase font-black text-gray-400 tracking-widest">
                                  <th className="p-4">Fecha / ID</th>
                                  <th className="p-4">Escenario</th>
                                  <th className="p-4">Arquetipo</th>
                                  <th className="p-4">Resultado</th>
                                  <th className="p-4">Score</th>
                                  <th className="p-4">Patrón Detectado</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-xs font-mono">
                              {reversedExperiments.length === 0 ? (
                                  <tr>
                                      <td colSpan={6} className="p-8 text-center text-gray-500 italic">Sin datos de simulación registrados.</td>
                                  </tr>
                              ) : (
                                  reversedExperiments.map((run) => (
                                      <tr key={run.id} className="hover:bg-white/5 transition-colors">
                                          <td className="p-4 text-gray-500">
                                              {new Date(run.timestamp).toLocaleDateString()} <br/>
                                              <span className="opacity-50">{run.id.slice(-6)}</span>
                                          </td>
                                          <td className="p-4 font-bold text-white">{run.scenario}</td>
                                          <td className="p-4 text-gray-400">{run.brainVersionSnapshot?.archetype?.replace('_', ' ')} (T:{run.brainVersionSnapshot?.tone})</td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${
                                                  run.evaluation.outcome === 'SUCCESS' ? 'bg-green-500/10 text-green-400' : 
                                                  run.evaluation.outcome === 'FAILURE' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
                                              }`}>
                                                  {run.evaluation.outcome}
                                              </span>
                                          </td>
                                          <td className={`p-4 font-black ${scoreColor(run.evaluation.score)}`}>{run.evaluation.score}</td>
                                          <td className="p-4 text-red-300">
                                              {run.evaluation.detectedFailurePattern || <span className="text-gray-600">-</span>}
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <section className="bg-brand-surface border border-white/5 rounded-[32px] overflow-hidden shadow-2xl mt-10 relative group">
        {/* Glow Effects */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-gold/10 transition-colors duration-1000"></div>

        {/* Main Header */}
        <div className="p-6 md:p-8 border-b border-white/5 bg-black/20 flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
            <div>
                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                    <span className="w-2 h-2 bg-brand-gold rounded-full animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></span>
                    Laboratorio Elite++ <span className="text-brand-gold">v3.0.0</span>
                </h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1 ml-5">
                    Entrenamiento Adversarial y Evaluación de Robustez
                </p>
            </div>
            
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                <button 
                    onClick={() => setActiveTab('LAB')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAB' ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-500 hover:text-white'}`}
                >
                    Laboratorio
                </button>
                <button 
                    onClick={() => setActiveTab('VAULT')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'VAULT' ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-500 hover:text-white'}`}
                >
                    Data Vault
                </button>
            </div>
        </div>

        {activeTab === 'VAULT' ? renderVault() : (
            // FIX: Set fixed height AND relative positioning context
            <div className="grid grid-cols-1 lg:grid-cols-2 h-[600px] relative z-10">
                {/* Controls Overlay (Mobile optimized) */}
                <div className="lg:hidden p-4 border-b border-white/5 bg-black/40">
                     <select 
                        value={selectedScenario} 
                        onChange={(e) => setSelectedScenario(e.target.value as SimulationScenario)}
                        disabled={isSimulating}
                        className="w-full bg-black/50 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-3 outline-none mb-3"
                    >
                        {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {!isSimulating ? (
                        <button onClick={handleStartSimulation} className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-widest">Ejecutar</button>
                    ) : (
                        <button onClick={handleStopSimulation} className="w-full py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest animate-pulse">Abortar</button>
                    )}
                </div>

                {/* LEFT: Chat Interface */}
                {/* FIX: added min-h-0 to allow flex child scrolling */}
                <div className="bg-[#050505] border-r border-white/5 p-6 flex flex-col relative h-full min-h-0">
                    <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none"></div>
                    
                    {/* Desktop Controls embedded in chat header area */}
                    <div className="hidden lg:flex justify-between items-center mb-4 relative z-20">
                         <div className="flex gap-2">
                            <select 
                                value={selectedScenario} 
                                onChange={(e) => setSelectedScenario(e.target.value as SimulationScenario)}
                                disabled={isSimulating}
                                className="bg-white/5 border border-white/10 text-gray-300 text-[10px] font-bold uppercase tracking-widest rounded-lg px-3 py-2 outline-none focus:border-brand-gold hover:bg-white/10 cursor-pointer transition-colors"
                            >
                                {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                         </div>
                         <div className="flex gap-2">
                            <button onClick={handleClear} className="px-3 py-2 bg-white/5 text-gray-500 border border-white/10 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all" title="Limpiar Chat">↺</button>
                            {!isSimulating ? (
                                <button onClick={handleStartSimulation} className="px-4 py-2 bg-brand-gold text-black rounded-lg font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/10">
                                    Ejecutar
                                </button>
                            ) : (
                                <button onClick={handleStopSimulation} className="px-4 py-2 bg-red-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 animate-pulse">
                                    Abortar
                                </button>
                            )}
                         </div>
                    </div>

                    {/* FIX: added min-h-0 to allow scrolling inside flex container */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pt-4 pb-20 min-h-0" ref={scrollRef}>
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4">
                                <svg className="w-16 h-16 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                                <p className="text-[10px] uppercase tracking-widest font-bold">Laboratorio inactivo</p>
                                <p className="text-[9px] text-gray-600 max-w-xs text-center">{SCENARIOS.find(s => s.id === selectedScenario)?.desc}</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <MessageBubble key={i} message={msg} />
                            ))
                        )}
                        {isSimulating && messages.length > 0 && messages[messages.length - 1].sender === 'user' && (
                            <div className="flex items-center gap-2 text-gray-600 text-[10px] italic ml-4 animate-pulse uppercase tracking-widest font-bold">
                                <span>Evaluando Estrategia...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Neural Telemetry & Evaluation */}
                {/* FIX: added min-h-0 */}
                <div className="bg-[#0a0a0a] p-6 flex flex-col h-full min-h-0">
                    <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-2 flex-shrink-0">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Telemetría en Vivo</h4>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest">ONLINE</span>
                        </div>
                    </div>
                    
                    {/* Temperature Gauge */}
                    <div className="mb-6 bg-black/40 p-4 rounded-2xl border border-white/5 flex-shrink-0">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-gray-300 uppercase">Temperatura del Lead</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${currentLeadStatus === LeadStatus.HOT ? 'text-red-400 bg-red-900/20' : 'text-gray-400'}`}>
                                {currentLeadStatus || 'N/A'}
                            </span>
                        </div>
                        <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ease-out ${
                                    currentLeadStatus === LeadStatus.HOT ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' :
                                    currentLeadStatus === LeadStatus.WARM ? 'bg-yellow-500' : 
                                    currentLeadStatus === LeadStatus.COLD ? 'bg-blue-500' : 'bg-gray-500'
                                }`} 
                                style={{ width: `${
                                    currentLeadStatus === LeadStatus.HOT ? 100 :
                                    currentLeadStatus === LeadStatus.WARM ? 50 : 
                                    currentLeadStatus === LeadStatus.COLD ? 10 : 0
                                }%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Live Log */}
                    {/* FIX: added min-h-0 to flex child */}
                    <div className="flex-1 bg-black/60 rounded-2xl border border-white/5 p-4 overflow-hidden flex flex-col mb-4 min-h-0">
                        {/* FIX: added flex-1 and min-h-0 to scroll container */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 min-h-0" ref={logScrollRef}>
                            {messages.map((msg, i) => (
                                <div key={i} className="animate-fade-in">
                                    {msg.sender === 'user' ? (
                                        <div className="flex gap-3 text-[10px]">
                                            <span className="text-gray-600 font-mono w-12 shrink-0">{new Date(msg.timestamp).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}</span>
                                            <span className="text-brand-gold font-bold">INPUT &gt;</span>
                                            <span className="text-gray-400 truncate">{msg.text.substring(0, 40)}...</span>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 text-[10px]">
                                            <span className="text-gray-600 font-mono w-12 shrink-0">{new Date(msg.timestamp).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}</span>
                                            <span className="text-blue-400 font-bold">OUTPUT &lt;</span>
                                            <span className="text-gray-300">Inferencia Neural</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Comparison Mini-Stats */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-shrink-0">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="text-[9px] font-black uppercase tracking-widest text-gray-400">Rendimiento Histórico</h5>
                            <span className={`text-[10px] font-black ${scoreColor(labData?.aggregatedScore || 0)}`}>{labData?.aggregatedScore || 0}/100</span>
                        </div>
                        <div className="text-[9px] text-gray-500 font-medium">
                            <p>Experimentos: <span className="text-white">{labData?.experiments?.length || 0}</span></p>
                            <p className="mt-1">Mayor Riesgo: <span className="text-red-400">{labData?.topFailurePatterns ? Object.keys(labData.topFailurePatterns)[0] || 'N/A' : 'N/A'}</span></p>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </section>
  );
};

export default TestBotSimulator;
