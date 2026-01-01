
import React, { useState, useMemo } from 'react';
import { BotSettings, Conversation } from '../types';
import { formatPhoneNumber } from '../utils/textUtils';

interface BlacklistPanelProps {
    settings: BotSettings | null;
    conversations: Conversation[];
    onUpdateSettings: (newSettings: BotSettings) => void;
}

const BlacklistPanel: React.FC<BlacklistPanelProps> = ({ settings, conversations, onUpdateSettings }) => {
    const [manualInput, setManualInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const ignoredJids = useMemo(() => settings?.ignoredJids || [], [settings]);

    const handleAddManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualInput.trim() || !settings) return;
        
        const clean = manualInput.replace(/[^0-9]/g, '');
        if (clean && !ignoredJids.includes(clean)) {
            onUpdateSettings({ ...settings, ignoredJids: [...ignoredJids, clean] });
            setManualInput('');
        }
    };

    const toggleBlock = (number: string) => {
        if (!settings) return;
        const clean = number.replace(/[^0-9]/g, '');
        if (ignoredJids.includes(clean)) {
            // Unblock
            onUpdateSettings({ ...settings, ignoredJids: ignoredJids.filter(n => n !== clean) });
        } else {
            // Block
            onUpdateSettings({ ...settings, ignoredJids: [...ignoredJids, clean] });
        }
    };

    // Filter recent chats for the smart list
    const filteredChats = useMemo(() => {
        return conversations
            .filter(c => {
                const number = c.id.split('@')[0];
                const search = searchTerm.toLowerCase();
                return c.leadName.toLowerCase().includes(search) || number.includes(search);
            })
            .sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime())
            .slice(0, 50); // Limit to 50 recent
    }, [conversations, searchTerm]);

    if (!settings) return null;

    return (
        <div className="flex-1 bg-brand-black p-4 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in">
            <div className="max-w-6xl mx-auto space-y-10 pb-32">
                
                <header className="border-b border-white/5 pb-8">
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Escudo <span className="text-red-500">Neural</span></h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Gestión de Lista Negra e Inmunidad</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    
                    {/* LEFT COLUMN: STATUS & MANUAL */}
                    <div className="space-y-8">
                        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>
                            
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                Bloqueo Manual
                            </h3>

                            <form onSubmit={handleAddManual} className="relative mb-8">
                                <input 
                                    type="text" 
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    placeholder="Ingresa número (Ej: 549261...)"
                                    className="w-full bg-black/60 border border-white/10 rounded-xl p-4 pr-32 text-sm text-white focus:border-red-500/50 outline-none transition-all font-mono"
                                />
                                <button 
                                    type="submit"
                                    disabled={!manualInput.trim()}
                                    className="absolute right-2 top-2 bottom-2 px-4 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    Bloquear
                                </button>
                            </form>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Números Bloqueados ({ignoredJids.length})</h4>
                                <div className="flex flex-wrap gap-2 max-h-[400px] overflow-y-auto custom-scrollbar p-2 bg-black/20 rounded-xl border border-white/5">
                                    {ignoredJids.length === 0 && <p className="text-xs text-gray-600 italic p-4">La lista negra está vacía.</p>}
                                    {ignoredJids.map(num => (
                                        <div key={num} className="flex items-center gap-3 pl-3 pr-2 py-2 bg-brand-surface border border-white/10 rounded-lg group hover:border-red-500/30 transition-colors">
                                            <span className="text-xs font-mono text-gray-300">{num}</span>
                                            <button 
                                                onClick={() => toggleBlock(num)} 
                                                className="p-1.5 rounded-md text-gray-600 hover:text-white hover:bg-red-500 transition-all"
                                                title="Desbloquear"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* RIGHT COLUMN: SMART LIST (RECENT CHATS) */}
                    <div className="space-y-8">
                        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl h-full flex flex-col">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Sugerencias Inteligentes</h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-6">Bloquea rápidamente contactos recientes sin copiar y pegar.</p>

                            <div className="relative mb-4">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar en chats recientes..."
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-2.5 px-4 pl-10 text-xs text-white focus:border-brand-gold/30 outline-none"
                                />
                                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 max-h-[600px]">
                                {filteredChats.length === 0 && (
                                    <div className="text-center py-10 opacity-50">
                                        <p className="text-xs text-gray-500">No hay chats recientes coincidentes.</p>
                                    </div>
                                )}
                                {filteredChats.map(chat => {
                                    const number = chat.id.split('@')[0];
                                    const isBlocked = ignoredJids.includes(number);
                                    
                                    return (
                                        <div 
                                            key={chat.id} 
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                                                isBlocked 
                                                ? 'bg-red-500/5 border-red-500/20' 
                                                : 'bg-black/40 border-white/5 hover:bg-white/5'
                                            }`}
                                            onClick={() => toggleBlock(number)}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${isBlocked ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-400'}`}>
                                                    {chat.leadName.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className={`text-xs font-bold truncate ${isBlocked ? 'text-red-400' : 'text-white'}`}>{chat.leadName}</h4>
                                                    <p className="text-[10px] font-mono text-gray-500 truncate">{formatPhoneNumber(number)}</p>
                                                </div>
                                            </div>

                                            <div className={`w-10 h-5 rounded-full p-0.5 transition-colors relative ${isBlocked ? 'bg-red-500' : 'bg-gray-700'}`}>
                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isBlocked ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default BlacklistPanel;
