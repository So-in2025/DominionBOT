
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
    const [filter, setFilter] = useState<'ALL' | 'BLOCKED' | 'NOT_BLOCKED'>('ALL');

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

    const clearAllBlocked = () => {
        if (!settings) return;
        if (confirm("⚠️ ¿ESTÁS SEGURO?\nEsto eliminará TODOS los bloqueos. La IA volverá a responder a todos los contactos de la lista negra.")) {
            onUpdateSettings({ ...settings, ignoredJids: [] });
        }
    };

    // Filter logic for the Premium Selector
    const filteredContacts = useMemo(() => {
        return conversations
            .filter(c => {
                const number = c.id.split('@')[0];
                const search = searchTerm.toLowerCase();
                const matchesSearch = c.leadName.toLowerCase().includes(search) || number.includes(search);
                const isBlocked = ignoredJids.includes(number);
                
                if (filter === 'BLOCKED') return matchesSearch && isBlocked;
                if (filter === 'NOT_BLOCKED') return matchesSearch && !isBlocked;
                return matchesSearch;
            })
            .sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime());
    }, [conversations, searchTerm, filter, ignoredJids]);

    if (!settings) return null;

    return (
        <div className="flex-1 bg-brand-black p-4 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in relative z-10">
            <div className="max-w-6xl mx-auto space-y-10 pb-32">
                
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            Escudo <span className="text-red-500">Neural</span>
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[9px] font-black uppercase tracking-widest">Premium Node</span>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Gestión de Inmunidad y Filtros de Exclusión</p>
                    </div>
                    {ignoredJids.length > 0 && (
                        <button 
                            onClick={clearAllBlocked}
                            className="px-4 py-2 bg-red-900/20 text-red-400 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg"
                        >
                            Limpiar Lista Negra ({ignoredJids.length})
                        </button>
                    )}
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    
                    {/* LEFT COLUMN: CONTROL PANEL */}
                    <div className="lg:col-span-1 space-y-8">
                        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-red-500/10 transition-colors duration-1000"></div>
                            
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></span>
                                Inyección Manual
                            </h3>

                            <form onSubmit={handleAddManual} className="space-y-4 relative z-10">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Número de WhatsApp</label>
                                    <input 
                                        type="text" 
                                        value={manualInput}
                                        onChange={(e) => setManualInput(e.target.value)}
                                        placeholder="Ej: 5492615551234"
                                        className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-red-500/50 outline-none transition-all font-mono placeholder-gray-800"
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    disabled={!manualInput.trim()}
                                    className="w-full py-4 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                                >
                                    Bloquear Ahora
                                </button>
                            </form>
                            
                            <div className="mt-8 pt-8 border-t border-white/5">
                                <p className="text-[10px] text-gray-400 leading-relaxed font-medium uppercase tracking-tight">
                                    Los números en esta lista están **inmunizados**. Dominion Bot ignorará cualquier mensaje entrante de estos JIDs para proteger tu cuota de IA y evitar interacciones no deseadas.
                                </p>
                            </div>
                        </section>

                        {/* STATS MINI CARD */}
                        <div className="bg-black/20 border border-white/5 rounded-2xl p-6 flex justify-between items-center">
                            <div>
                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Tasa de Exclusión</p>
                                <p className="text-2xl font-black text-white">{conversations.length > 0 ? Math.round((ignoredJids.length / conversations.length) * 100) : 0}% <span className="text-xs text-gray-600 font-medium">del total</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Total</p>
                                <p className="text-2xl font-black text-red-500">{ignoredJids.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: ELITE SELECTOR */}
                    <div className="lg:col-span-2 space-y-8">
                        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl h-full flex flex-col min-h-[650px]">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Selector Táctico</h3>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Elegir contactos de la base de datos activa</p>
                                </div>
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-full md:w-auto">
                                    {(['ALL', 'BLOCKED', 'NOT_BLOCKED'] as const).map(f => (
                                        <button 
                                            key={f}
                                            onClick={() => setFilter(f)}
                                            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            {f === 'ALL' ? 'Todos' : f === 'BLOCKED' ? 'Bloqueados' : 'Libres'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="relative mb-6">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Filtrar por nombre, empresa o número..."
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3.5 px-5 pl-12 text-sm text-white focus:border-brand-gold/30 outline-none transition-all"
                                />
                                <svg className="absolute left-4 top-3.5 w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                {filteredContacts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center">
                                        <svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        <p className="text-xs font-bold uppercase tracking-widest">No hay contactos que coincidan con el filtro</p>
                                    </div>
                                ) : (
                                    filteredContacts.map(chat => {
                                        const number = chat.id.split('@')[0];
                                        const isBlocked = ignoredJids.includes(number);
                                        
                                        return (
                                            <div 
                                                key={chat.id} 
                                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group ${
                                                    isBlocked 
                                                    ? 'bg-red-500/5 border-red-500/20' 
                                                    : 'bg-black/40 border-white/5 hover:border-white/20'
                                                }`}
                                                onClick={() => toggleBlock(number)}
                                            >
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-inner transition-colors ${isBlocked ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-500'}`}>
                                                        {chat.leadName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className={`text-sm font-bold truncate ${isBlocked ? 'text-red-400' : 'text-white'}`}>{chat.leadName}</h4>
                                                        <p className="text-[10px] font-mono text-gray-500 truncate tracking-tight">{formatPhoneNumber(number)}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {isBlocked && (
                                                        <span className="hidden md:block text-[8px] font-black uppercase text-red-500 tracking-widest animate-pulse">BLOQUEADO</span>
                                                    )}
                                                    <div className={`w-12 h-6 rounded-full p-1 transition-all relative ${isBlocked ? 'bg-red-600' : 'bg-gray-800'}`}>
                                                        <div className={`w-4 h-4 bg-white rounded-full shadow-lg transform transition-transform duration-300 ${isBlocked ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default BlacklistPanel;
