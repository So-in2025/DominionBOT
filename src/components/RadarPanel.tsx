
import React, { useState, useEffect, useRef } from 'react';
import { RadarSignal, RadarSettings, WhatsAppGroup } from '../types';
import { getAuthHeaders } from '../config';
import { audioService } from '../services/audioService';

interface RadarPanelProps {
    token: string;
    backendUrl: string;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const RadarPanel: React.FC<RadarPanelProps> = ({ token, backendUrl, showToast }) => {
    const [view, setView] = useState<'LIVE' | 'HISTORY' | 'CONFIG'>('LIVE');
    const [signals, setSignals] = useState<RadarSignal[]>([]);
    const [settings, setSettings] = useState<RadarSettings | null>(null);
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [loading, setLoading] = useState(false);
    
    const prevSignalsLength = useRef(0);

    useEffect(() => {
        if (view === 'LIVE') fetchSignals(false);
        if (view === 'HISTORY') fetchSignals(true);
        if (view === 'CONFIG') fetchConfigData();
    }, [view]);

    useEffect(() => {
        if (view !== 'LIVE') return;
        const interval = setInterval(() => fetchSignals(false), 8000);
        return () => clearInterval(interval);
    }, [view]);

    const fetchSignals = async (history: boolean) => {
        try {
            const endpoint = history ? `/api/radar/signals?history=true` : `/api/radar/signals`;
            const res = await fetch(`${backendUrl}${endpoint}`, { headers: getAuthHeaders(token) });
            if (res.ok) {
                const data: RadarSignal[] = await res.json();
                
                if (!history && data.length > prevSignalsLength.current) {
                    const latest = data[0];
                    // Alert logic based on Strategic Score (V4)
                    if (latest && (latest.strategicScore || latest.analysis.score) >= 80) {
                        audioService.play('radar_ping'); 
                        showToast(`¡Radar! Oportunidad Crítica (${latest.strategicScore}%)`, 'info');
                    }
                }
                setSignals(data);
                prevSignalsLength.current = data.length;
            }
        } catch (e) { console.error(e); }
    };

    const fetchConfigData = async () => {
        setLoading(true);
        try {
            const [settingsRes, groupsRes] = await Promise.all([
                fetch(`${backendUrl}/api/radar/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/whatsapp/groups`, { headers: getAuthHeaders(token) })
            ]);
            if (settingsRes.ok) setSettings(await settingsRes.json());
            if (groupsRes.ok) setGroups(await groupsRes.json());
        } catch (e) {
            showToast('Error cargando configuración.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!settings) return;
        try {
            const res = await fetch(`${backendUrl}/api/radar/settings`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify(settings)
            });
            if (res.ok) showToast('Configuración de Radar actualizada.', 'success');
        } catch (e) {
            showToast('Error guardando configuración.', 'error');
        }
    };

    const dismissSignal = async (id: string) => {
        try {
            await fetch(`${backendUrl}/api/radar/signals/${id}/dismiss`, {
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            setSignals(prev => prev.filter(s => s.id !== id));
        } catch (e) {
            showToast('Error al descartar.', 'error');
        }
    };

    const handleContact = async (signal: RadarSignal) => {
        showToast('Iniciando protocolo de contacto...', 'info');
        try {
            const res = await fetch(`${backendUrl}/api/radar/signals/${signal.id}/convert`, {
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            
            if (res.ok) {
                const phone = signal.senderJid.split('@')[0];
                window.open(`https://wa.me/${phone}`, '_blank');
                setSignals(prev => prev.filter(s => s.id !== signal.id));
            } else {
                showToast('Error al crear Lead en CRM.', 'error');
            }
        } catch (e) {
            showToast('Error de conexión.', 'error');
        }
    };

    const getUrgencyColor = (level?: string) => {
        if (level === 'CRITICAL') return 'bg-red-500 text-white animate-pulse';
        if (level === 'HIGH') return 'bg-orange-500 text-white';
        if (level === 'MEDIUM') return 'bg-yellow-500 text-black';
        return 'bg-blue-500 text-white';
    };

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in relative">
            {/* Background Grid */}
            <div className="absolute inset-0 neural-grid opacity-20 pointer-events-none"></div>

            <div className="max-w-6xl mx-auto space-y-8 relative z-10 pb-32">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            Radar <span className="text-brand-gold">4.0</span>
                            <div className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-gold opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-gold"></span>
                            </div>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Predictive Advantage Engine</p>
                    </div>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full md:w-auto">
                        <button onClick={() => setView('LIVE')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIVE' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Live Feed</button>
                        <button onClick={() => setView('HISTORY')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'HISTORY' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Historial</button>
                        <button onClick={() => setView('CONFIG')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'CONFIG' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Configuración</button>
                    </div>
                </header>

                {(view === 'LIVE' || view === 'HISTORY') ? (
                    <div className="grid grid-cols-1 gap-6">
                        {signals.length === 0 && (
                            <div className="text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mx-auto mb-4"></div>
                                <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">{view === 'LIVE' ? 'Escaneando espectro...' : 'Sin historial registrado.'}</p>
                                {view === 'LIVE' && <p className="text-gray-600 text-[10px] mt-2">El sistema predictivo está buscando ventanas de oportunidad.</p>}
                            </div>
                        )}
                        {signals.map(signal => (
                            <div key={signal.id} className={`bg-brand-surface border border-white/5 rounded-3xl p-6 hover:bg-white/5 transition-all group relative overflow-hidden ${signal.status === 'DISMISSED' ? 'opacity-50 grayscale' : ''}`}>
                                
                                {/* Strategic Score Bar */}
                                <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-gold to-transparent opacity-50"></div>
                                
                                <div className="flex flex-col lg:flex-row gap-8">
                                    {/* LEFT: Context & Content */}
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-white/10 ${getUrgencyColor(signal.predictedWindow?.urgencyLevel)}`}>
                                                {signal.predictedWindow?.urgencyLevel || 'NORMAL'}
                                            </span>
                                            <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider bg-black/40 px-2 py-1 rounded">{signal.analysis.intentType}</span>
                                            <span className="text-[10px] text-gray-600">Hace {Math.floor((Date.now() - new Date(signal.timestamp).getTime()) / 60000)} min</span>
                                        </div>
                                        
                                        <p className="text-base font-bold text-white leading-relaxed font-sans">"{signal.messageContent}"</p>
                                        
                                        <div className="flex gap-6 text-[10px] text-gray-500 font-mono pt-2 border-t border-white/5">
                                            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-gray-600 rounded-full"></span> {signal.groupName}</span>
                                            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-gray-600 rounded-full"></span> {signal.senderName || signal.senderJid.split('@')[0]}</span>
                                        </div>

                                        {/* V4 Hidden Signals */}
                                        {signal.hiddenSignals && signal.hiddenSignals.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {signal.hiddenSignals.map((hs, idx) => (
                                                    <span key={idx} className="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-1 rounded flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        {hs.type.replace('_', ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* RIGHT: Predictive Intelligence */}
                                    <div className="flex flex-col gap-4 min-w-[280px] bg-black/20 p-4 rounded-2xl border border-white/5">
                                        
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Ventana Predictiva</span>
                                            <span className="text-xl font-black text-white">{signal.strategicScore || signal.analysis.score}%</span>
                                        </div>
                                        
                                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                                            <div className="h-full bg-brand-gold" style={{width: `${signal.strategicScore || signal.analysis.score}%`}}></div>
                                        </div>

                                        {/* Action Intel */}
                                        {signal.actionIntelligence && (
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Estrategia Recomendada</p>
                                                <p className="text-[11px] text-white font-bold">{signal.actionIntelligence.suggestedEntryType} ENTRY</p>
                                                <p className="text-[10px] text-gray-500 italic mt-1">{signal.actionIntelligence.communicationFraming}</p>
                                            </div>
                                        )}

                                        <p className="text-[10px] text-gray-400 italic leading-snug">"{signal.predictedWindow?.reasoning || signal.analysis.reasoning}"</p>

                                        {signal.status === 'NEW' && (
                                            <div className="flex gap-2 mt-auto">
                                                <button 
                                                    onClick={() => handleContact(signal)}
                                                    className="flex-1 py-3 bg-brand-gold text-black rounded-xl text-[10px] font-black uppercase tracking-widest text-center hover:scale-105 transition-all shadow-lg"
                                                >
                                                    Ejecutar Acción
                                                </button>
                                                <button 
                                                    onClick={() => dismissSignal(signal.id)}
                                                    className="px-4 py-3 bg-white/5 text-gray-500 hover:text-red-400 rounded-xl transition-colors border border-white/10"
                                                    title="Ignorar Señal"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // CONFIG VIEW
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in space-y-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Configuración de Sensores</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Estado:</span>
                                <button 
                                    onClick={() => settings && setSettings({...settings, isEnabled: !settings.isEnabled})}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${settings?.isEnabled ? 'bg-green-500 text-black' : 'bg-red-500/20 text-red-500'}`}
                                >
                                    {settings?.isEnabled ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <p className="text-center text-gray-500 text-xs py-10">Cargando grupos...</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-4">Grupos Monitoreados ({settings?.monitoredGroups.length})</label>
                                    <div className="bg-black/50 border border-white/10 rounded-xl p-4 max-h-[400px] overflow-y-auto custom-scrollbar space-y-2">
                                        {groups.map(g => (
                                            <div 
                                                key={g.id} 
                                                onClick={() => {
                                                    if (!settings) return;
                                                    const current = settings.monitoredGroups || [];
                                                    const newGroups = current.includes(g.id) 
                                                        ? current.filter(id => id !== g.id)
                                                        : [...current, g.id];
                                                    setSettings({...settings, monitoredGroups: newGroups});
                                                }}
                                                className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${settings?.monitoredGroups.includes(g.id) ? 'bg-brand-gold/20 border-brand-gold text-white' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'}`}
                                            >
                                                <span className="text-xs font-bold truncate pr-2">{g.subject}</span>
                                                <span className="text-[9px] bg-black/40 px-2 py-0.5 rounded text-gray-500">{g.size || '?'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Keywords Pre-Filtro (Opcional)</label>
                                        <p className="text-[9px] text-gray-500 mb-2">Solo analizar mensajes que contengan estas palabras (separar por comas).</p>
                                        <input 
                                            value={settings?.keywordsInclude?.join(', ') || ''} 
                                            onChange={(e) => settings && setSettings({...settings, keywordsInclude: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" 
                                            placeholder="ej: busco, necesito, agencia, precio" 
                                        />
                                    </div>
                                    <button onClick={saveSettings} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-lg">
                                        Guardar Configuración
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RadarPanel;
