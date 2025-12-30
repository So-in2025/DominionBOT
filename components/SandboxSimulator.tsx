
import React, { useState, useRef, useEffect } from 'react';
import { BotSettings, Message, LeadStatus } from '../types';

interface SandboxSimulatorProps {
  settings: BotSettings;
  backendUrl: string;
  token: string;
}

const SandboxSimulator: React.FC<SandboxSimulatorProps> = ({ settings, backendUrl, token }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSignal, setLastSignal] = useState<{ status: string, tags: string[], action?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const simulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: input, history: messages })
      });
      
      if (res.ok) {
        const data = await res.json();
        const botMsg: Message = { id: `bot-${Date.now()}`, text: data.responseText, sender: 'bot', timestamp: new Date() };
        setMessages(prev => [...prev, botMsg]);
        setLastSignal({ status: data.newStatus, tags: data.tags, action: data.recommendedAction });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-brand-black overflow-hidden font-sans">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col border-r border-white/10">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Neural Sandbox</h3>
                <button onClick={() => setMessages([])} className="text-[9px] text-gray-500 hover:text-white font-bold uppercase tracking-widest">Reiniciar</button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-20 flex-col gap-4">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                        <p className="text-xs font-bold uppercase tracking-widest">Inicia una simulación para ver la IA en acción</p>
                    </div>
                )}
                {messages.map(m => (
                    <div key={m.id} className={`flex flex-col max-w-[80%] ${m.sender === 'user' ? 'self-start' : 'self-end ml-auto items-end'}`}>
                        <div className={`p-4 rounded-2xl text-xs leading-relaxed ${m.sender === 'user' ? 'bg-white/10 text-gray-300 rounded-bl-none' : 'bg-brand-gold text-black font-bold rounded-br-none'}`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="self-end ml-auto bg-brand-gold/20 p-3 rounded-xl rounded-br-none animate-pulse">
                        <div className="w-8 h-2 bg-brand-gold rounded-full"></div>
                    </div>
                )}
            </div>
            <form onSubmit={simulate} className="p-6 border-t border-white/10 bg-brand-surface">
                <input 
                    value={input} onChange={e => setInput(e.target.value)}
                    placeholder="Escribe como si fueras un cliente..."
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-brand-gold transition-all"
                />
            </form>
        </div>

        {/* Signals Preview Area */}
        <div className="w-full lg:w-80 bg-brand-surface flex flex-col p-6 animate-fade-in">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-gold mb-8">Signal Intel Output</h4>
            {lastSignal ? (
                <div className="space-y-8 animate-fade-in">
                    <div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">Lead Temperature</p>
                        <span className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${lastSignal.status === LeadStatus.HOT ? 'bg-red-500/10 border-red-500 text-red-500' : (lastSignal.status === LeadStatus.WARM ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-blue-500/10 border-blue-500 text-blue-500')}`}>
                            {lastSignal.status}
                        </span>
                    </div>
                    <div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">Signals (Tags)</p>
                        <div className="flex flex-wrap gap-2">
                            {lastSignal.tags.map(t => (
                                <span key={t} className="px-2 py-1 bg-white/5 border border-white/10 text-gray-300 text-[8px] font-bold uppercase rounded">{t}</span>
                            ))}
                        </div>
                    </div>
                    {lastSignal.action && (
                        <div className="p-4 bg-brand-gold/10 border border-brand-gold/20 rounded-xl shadow-lg">
                            <p className="text-[9px] text-brand-gold font-black uppercase tracking-widest mb-2">Acción Sugerida</p>
                            <p className="text-[11px] text-white font-medium italic leading-relaxed">"{lastSignal.action}"</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-[10px] text-gray-600 italic">Esperando primera interacción...</p>
            )}
        </div>
    </div>
  );
};

export default SandboxSimulator;
