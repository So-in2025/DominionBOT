
import React, { useState, useEffect, useRef } from 'react';
import { RadarSignal, RadarSettings, WhatsAppGroup, BotSettings } from '../types';
import { getAuthHeaders } from '../config';
import { audioService } from '../services/audioService';
import { GoogleGenAI } from '@google/genai';

interface RadarPanelProps {
    token: string;
    backendUrl: string;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface LogTrace {
    timestamp: string;
    message: string;
}

const RadarPanel: React.FC<RadarPanelProps> = ({ token, backendUrl, showToast }) => {
    const [view, setView] = useState<'LIVE' | 'HISTORY' | 'CONFIG' | 'WIZARD'>('LIVE');
    const [signals, setSignals] = useState<RadarSignal[]>([]);
    const [traces, setTraces] = useState<LogTrace[]>([]);
    const [settings, setSettings] = useState<RadarSettings | null>(null);
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [isSimulating, setIsSimulating] = useState(false);
    
    // WIZARD STATE
    const [wizardStep, setWizardStep] = useState(0);
    const [calibration, setCalibration] = useState({
        opportunityDefinition: '',
        noiseDefinition: '',
        sensitivity: 5
    });
    const [isEnhancing, setIsEnhancing] = useState(false);
    
    const prevSignalsLength = useRef(0);
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchConfigData();
    }, []);

    useEffect(() => {
        if (view === 'LIVE') {
            fetchSignals(false);
            fetchTraces();
        }
        if (view === 'HISTORY') fetchSignals(true);
        if (view === 'CONFIG' && groups.length === 0) fetchConfigData();
    }, [view]);

    useEffect(() => {
        if (view !== 'LIVE') return;
        const interval = setInterval(() => {
            fetchSignals(false);
            fetchTraces();
        }, 10000); 
        return () => clearInterval(interval);
    }, [view]);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [traces]);

    const fetchTraces = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/radar/activity`, { headers: getAuthHeaders(token) });
            if (res.ok) setTraces(await res.json());
        } catch(e) {}
    };

    const fetchSignals = async (history: boolean) => {
        try {
            const endpoint = history ? `/api/radar/signals?history=true` : `/api/radar/signals`;
            const res = await fetch(`${backendUrl}${endpoint}`, { headers: getAuthHeaders(token) });
            if (res.ok) {
                const data: RadarSignal[] = await res.json();
                if (!history && data.length > prevSignalsLength.current) {
                    const latest = data[0];
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
        try {
            const [settingsRes, groupsRes] = await Promise.all([
                fetch(`${backendUrl}/api/radar/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/whatsapp/groups`, { headers: getAuthHeaders(token) })
            ]);
            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setSettings(data);
                if (data.calibration) setCalibration(data.calibration);
            }
            if (groupsRes.ok) setGroups(await groupsRes.json());
        } catch (e) {}
    };

    const saveSettings = async (overrideSettings?: RadarSettings, silent: boolean = false) => {
        const payload = overrideSettings || settings;
        if (!payload) return;
        try {
            const res = await fetch(`${backendUrl}/api/radar/settings`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify(payload)
            });
            if (res.ok && !silent) showToast('Configuración de Radar actualizada.', 'success');
        } catch (e) {
            showToast('Error guardando configuración.', 'error');
        }
    };

    const handleToggleRadar = async () => {
        if (!settings) return;
        const newStatus = !settings.isEnabled;
        const newSettings = { ...settings, isEnabled: newStatus };
        setSettings(newSettings);
        await saveSettings(newSettings, true); 
        if (newStatus) showToast('Radar activado. Escuchando...', 'success');
        else showToast('Radar en reposo.', 'info');
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

    const handleSimulate = async () => {
        setIsSimulating(true);
        try {
            const res = await fetch(`${backendUrl}/api/radar/simulate`, {
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            if (res.ok) {
                showToast('Señal de prueba inyectada.', 'success');
                setTimeout(() => fetchSignals(false), 1000);
            } else {
                showToast('Error simulando señal.', 'error');
            }
        } catch (e) {
            showToast('Error de conexión.', 'error');
        } finally {
            setIsSimulating(false);
        }
    };

    // --- WIZARD LOGIC ---
    const handleWizardSave = () => {
        if (!settings) return;
        const newSettings = { ...settings, calibration: calibration };
        setSettings(newSettings);
        saveSettings(newSettings);
        setView('CONFIG');
        setWizardStep(0);
    };

    const autoCalibrateWithAI = async () => {
        setIsEnhancing(true);
        try {
            const settingsRes = await fetch(`${backendUrl}/api/settings`, { headers: getAuthHeaders(token) });
            const botSettings: BotSettings = await settingsRes.json();
            
            if (!botSettings.geminiApiKey) {
                showToast('Se requiere API Key de Gemini en Configuración.', 'error');
                setIsEnhancing(false);
                return;
            }

            const ai = new GoogleGenAI({ apiKey: botSettings.geminiApiKey });
            const prompt = `
            Actúa como un experto en Inteligencia de Negocios.
            Basado en la siguiente descripción del negocio: "${botSettings.productDescription}",
            genera dos definiciones breves y precisas para un sistema de Radar de Oportunidades:
            1. "Opportunity Definition": Qué buscar exactamente en grupos de WhatsApp (intención de compra, preguntas específicas).
            2. "Noise Definition": Qué ignorar (spam, competencia, irrelevante).
            
            Formato JSON: { "opportunity": "...", "noise": "..." }
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            const result = JSON.parse(response.text || '{}');
            if (result.opportunity && result.noise) {
                setCalibration({
                    ...calibration,
                    opportunityDefinition: result.opportunity,
                    noiseDefinition: result.noise
                });
                showToast('Calibración generada por IA.', 'success');
            }
        } catch (e) {
            showToast('Error en autocalibración.', 'error');
        } finally {
            setIsEnhancing(false);
        }
    };

    const getUrgencyColor = (level?: string) => {
        if (level === 'CRITICAL') return 'bg-red-500 animate-pulse';
        if (level === 'HIGH') return 'bg-orange-500';
        if (level === 'MEDIUM') return 'bg-yellow-500';
        return 'bg-blue-500';
    };

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in relative">
            <div className="absolute inset-0 neural-grid opacity-20 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-8 relative z-10 pb-32">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            Inteligencia <span className="text-brand-gold">De Mercado</span>
                            {settings?.isEnabled && (
                                <div className="relative flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/30">
                                    <div className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </div>
                                    <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Live</span>
                                </div>
                            )}
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Radar de Oportunidades 4.0</p>
                    </div>
                    {view !== 'WIZARD' && (
                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full md:w-auto">
                            <button onClick={() => setView('LIVE')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIVE' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Trading Desk</button>
                            <button onClick={() => setView('HISTORY')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'HISTORY' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Historial</button>
                            <button onClick={() => setView('CONFIG')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'CONFIG' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Ajustes</button>
                        </div>
                    )}
                </header>

                {(view === 'LIVE' || view === 'HISTORY') ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {signals.length === 0 && (
                            <div className="col-span-full text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mx-auto mb-4"></div>
                                <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">{view === 'LIVE' ? 'Escaneando grupos...' : 'Sin historial.'}</p>
                                {view === 'LIVE' && (
                                    <button onClick={handleSimulate} disabled={isSimulating} className="mt-6 px-6 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-black uppercase transition-all hover:text-brand-gold">
                                        {isSimulating ? 'Simulando...' : 'Inyectar Señal de Prueba'}
                                    </button>
                                )}
                            </div>
                        )}
                        
                        {signals.map(signal => (
                            <div key={signal.id} className={`bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 hover:border-brand-gold/30 transition-all group relative overflow-hidden flex flex-col justify-between h-[280px] ${signal.status === 'DISMISSED' ? 'opacity-50 grayscale' : ''}`}>
                                {/* Status Indicator */}
                                <div className={`absolute top-4 right-4 w-3 h-3 rounded-full ${getUrgencyColor(signal.predictedWindow?.urgencyLevel)}`}></div>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20">{signal.strategicScore}% MATCH</span>
                                        <span className="text-[9px] text-gray-500 font-mono">{signal.analysis.intentType}</span>
                                    </div>
                                    
                                    <p className="text-xs font-bold text-white leading-relaxed line-clamp-4">"{signal.messageContent}"</p>
                                    
                                    <div className="space-y-1">
                                        <p className="text-[9px] text-gray-500 font-mono truncate">Grupo: {signal.groupName}</p>
                                        <p className="text-[9px] text-gray-500 font-mono truncate">Usuario: {signal.senderName || 'Anon'}</p>
                                        <p className="text-[9px] text-gray-400 italic line-clamp-2 mt-2 border-l-2 border-white/10 pl-2">AI: {signal.predictedWindow?.reasoning || signal.analysis.reasoning}</p>
                                    </div>
                                </div>

                                {signal.status === 'NEW' && (
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                                        <button onClick={() => handleContact(signal)} className="flex-1 py-2 bg-brand-gold text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                                            Capturar
                                        </button>
                                        <button onClick={() => dismissSignal(signal.id)} className="px-3 py-2 bg-white/5 text-gray-500 hover:text-red-400 rounded-lg border border-white/10 transition-colors">
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : view === 'WIZARD' ? (
                    // WIZARD COMPONENT (Kept same logic, just wrapper)
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in max-w-4xl mx-auto min-h-[500px] flex flex-col relative">
                         {/* Reusing existing wizard JSX logic here... */}
                         <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Protocolo de Precisión</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">Calibración de Sensores V4</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={autoCalibrateWithAI} disabled={isEnhancing} className="px-4 py-2 bg-brand-gold/10 text-brand-gold border border-brand-gold/30 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold hover:text-black transition-all flex items-center gap-2">
                                    {isEnhancing ? <span className="animate-pulse">Calibrando...</span> : <><span>✨</span> Autocompletar con IA</>}
                                </button>
                                <button onClick={() => setView('CONFIG')} className="text-gray-500 hover:text-white px-4 py-2 text-[10px] font-bold uppercase">Cancelar</button>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-10">
                            {/* Steps logic same as previous RadarPanel... */}
                             {wizardStep === 0 && (
                                <div className="space-y-6 animate-slide-in-right">
                                    <h4 className="text-lg font-black text-white">1. Definición de Oportunidad</h4>
                                    <textarea value={calibration.opportunityDefinition} onChange={(e) => setCalibration({...calibration, opportunityDefinition: e.target.value})} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none" placeholder="¿Qué buscas exactamente?" />
                                    <div className="flex justify-end"><button onClick={() => setWizardStep(1)} disabled={!calibration.opportunityDefinition} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50">Siguiente &rarr;</button></div>
                                </div>
                            )}
                            {wizardStep === 1 && (
                                <div className="space-y-6 animate-slide-in-right">
                                    <h4 className="text-lg font-black text-white">2. Filtro de Ruido</h4>
                                    <textarea value={calibration.noiseDefinition} onChange={(e) => setCalibration({...calibration, noiseDefinition: e.target.value})} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-red-500/50 outline-none" placeholder="¿Qué ignorar?" />
                                    <div className="flex justify-between"><button onClick={() => setWizardStep(0)} className="text-gray-500 font-bold text-xs uppercase">Atrás</button><button onClick={() => setWizardStep(2)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest">Siguiente &rarr;</button></div>
                                </div>
                            )}
                            {wizardStep === 2 && (
                                <div className="space-y-8 animate-slide-in-right">
                                    <h4 className="text-lg font-black text-white">3. Sensibilidad (1-10)</h4>
                                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <input type="range" min="1" max="10" value={calibration.sensitivity} onChange={(e) => setCalibration({...calibration, sensitivity: parseInt(e.target.value)})} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold mb-6" />
                                        <div className="text-center"><span className="text-4xl font-black text-white">{calibration.sensitivity}</span></div>
                                    </div>
                                    <div className="flex justify-between pt-4"><button onClick={() => setWizardStep(1)} className="text-gray-500 font-bold text-xs uppercase">Atrás</button><button onClick={handleWizardSave} className="px-10 py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all">Activar Protocolo</button></div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // CONFIG VIEW (Simplified)
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in space-y-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Configuración de Sensores</h3>
                            <button onClick={handleToggleRadar} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${settings?.isEnabled ? 'bg-green-500 text-black' : 'bg-red-500/20 text-red-500'}`}>{settings?.isEnabled ? 'ACTIVO' : 'INACTIVO'}</button>
                        </div>
                        <div className="bg-black/30 border border-brand-gold/20 rounded-2xl p-6 flex justify-between items-center">
                            <div>
                                <h4 className="text-[10px] font-black text-brand-gold uppercase tracking-widest mb-1">Calibración Actual</h4>
                                <p className="text-xs text-gray-300 font-medium">{settings?.calibration?.opportunityDefinition ? "Protocolo de Precisión Activado" : "Configuración Genérica"}</p>
                            </div>
                            <button onClick={() => setView('WIZARD')} className="px-4 py-2 bg-white/5 border border-white/10 hover:border-brand-gold/50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Recalibrar</button>
                        </div>
                        {/* Group list logic remains same */}
                        <div>
                            <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-4">Grupos Monitoreados</label>
                            <div className="bg-black/50 border border-white/10 rounded-xl p-4 max-h-[400px] overflow-y-auto custom-scrollbar space-y-2">
                                {groups.map(g => (
                                    <div key={g.id} onClick={() => settings && setSettings({...settings, monitoredGroups: settings.monitoredGroups.includes(g.id) ? settings.monitoredGroups.filter(id => id !== g.id) : [...settings.monitoredGroups, g.id]})} className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${settings?.monitoredGroups.includes(g.id) ? 'bg-brand-gold/20 border-brand-gold text-white' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'}`}>
                                        <span className="text-xs font-bold truncate pr-2">{g.subject}</span>
                                        <span className="text-[9px] bg-black/40 px-2 py-0.5 rounded text-gray-500">{g.size || '?'}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => saveSettings()} className="w-full mt-6 py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em]">Guardar Configuración</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RadarPanel;
