
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
    const [loading, setLoading] = useState(false);
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
        if (view === 'LIVE') {
            fetchSignals(false);
            fetchTraces();
        }
        if (view === 'HISTORY') fetchSignals(true);
        if (view === 'CONFIG' || view === 'WIZARD') fetchConfigData();
    }, [view]);

    useEffect(() => {
        if (view !== 'LIVE') return;
        const interval = setInterval(() => {
            fetchSignals(false);
            fetchTraces();
        }, 3000); 
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
            if (res.ok) {
                const data = await res.json();
                setTraces(data);
            }
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
        setLoading(true);
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
        } catch (e) {
            showToast('Error cargando configuración.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async (overrideSettings?: RadarSettings) => {
        const payload = overrideSettings || settings;
        if (!payload) return;
        try {
            const res = await fetch(`${backendUrl}/api/radar/settings`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify(payload)
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
        if (level === 'CRITICAL') return 'bg-red-500 text-white animate-pulse';
        if (level === 'HIGH') return 'bg-orange-500 text-white';
        if (level === 'MEDIUM') return 'bg-yellow-500 text-black';
        return 'bg-blue-500 text-white';
    };

    const renderTraceLine = (trace: LogTrace, idx: number) => {
        const msg = trace.message.replace('[RADAR-TRACE]', '').trim();
        let color = 'text-gray-400';
        if (msg.includes('📡')) color = 'text-blue-400';
        if (msg.includes('🧠')) color = 'text-purple-400';
        if (msg.includes('✅')) color = 'text-green-400';
        if (msg.includes('📉')) color = 'text-gray-600';
        if (msg.includes('❌')) color = 'text-red-400';

        return (
            <div key={idx} className="flex gap-3 text-[10px] font-mono leading-tight">
                <span className="text-gray-700 select-none flex-shrink-0">{new Date(trace.timestamp).toLocaleTimeString()}</span>
                <span className={`${color} break-all`}>{msg}</span>
            </div>
        );
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
                            {settings?.isEnabled && (
                                <div className="relative flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/30">
                                    <div className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </div>
                                    <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Escaneando</span>
                                </div>
                            )}
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Predictive Advantage Engine</p>
                    </div>
                    {view !== 'WIZARD' && (
                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full md:w-auto">
                            <button onClick={() => setView('LIVE')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIVE' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Live Feed</button>
                            <button onClick={() => setView('HISTORY')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'HISTORY' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Historial</button>
                            <button onClick={() => setView('CONFIG')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'CONFIG' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Configuración</button>
                        </div>
                    )}
                </header>

                {(view === 'LIVE' || view === 'HISTORY') ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* SIGNALS COLUMN */}
                        <div className="lg:col-span-2 space-y-6">
                            {signals.length === 0 && (
                                <div className="text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                    <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">{view === 'LIVE' ? 'Escaneando espectro...' : 'Sin historial registrado.'}</p>
                                    {view === 'LIVE' && (
                                        <div className="mt-6 flex flex-col items-center gap-3">
                                            <p className="text-gray-600 text-[10px]">El sistema espera pasivamente nuevos mensajes.</p>
                                            <button 
                                                onClick={handleSimulate} 
                                                disabled={isSimulating}
                                                className="px-6 py-2 bg-white/5 hover:bg-brand-gold/10 hover:text-brand-gold text-gray-400 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                {isSimulating ? 'Simulando...' : 'Prueba de Sistema (Simular Señal)'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {signals.map(signal => (
                                <div key={signal.id} className={`bg-brand-surface border border-white/5 rounded-3xl p-6 hover:bg-white/5 transition-all group relative overflow-hidden animate-slide-in-right ${signal.status === 'DISMISSED' ? 'opacity-50 grayscale' : ''}`}>
                                    {/* Strategic Score Bar */}
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-gold to-transparent opacity-50"></div>
                                    
                                    <div className="flex flex-col gap-4">
                                        {/* HEADER */}
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-white/10 ${getUrgencyColor(signal.predictedWindow?.urgencyLevel)}`}>
                                                    {signal.predictedWindow?.urgencyLevel || 'NORMAL'}
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider bg-black/40 px-2 py-1 rounded">{signal.analysis.intentType}</span>
                                            </div>
                                            <span className="text-[10px] font-black text-brand-gold">{signal.strategicScore}% MATCH</span>
                                        </div>
                                        
                                        <p className="text-sm font-bold text-white leading-relaxed font-sans pl-2 border-l-2 border-white/10">"{signal.messageContent}"</p>
                                        
                                        <div className="flex justify-between items-end border-t border-white/5 pt-3">
                                            <div className="space-y-1">
                                                <div className="flex gap-2 text-[10px] text-gray-500 font-mono">
                                                    <span>👥 {signal.groupName}</span>
                                                    <span>👤 {signal.senderName || 'Anon'}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 italic">"{signal.predictedWindow?.reasoning || signal.analysis.reasoning}"</p>
                                            </div>

                                            {signal.status === 'NEW' && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleContact(signal)}
                                                        className="px-4 py-2 bg-brand-gold text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                                                    >
                                                        Actuar
                                                    </button>
                                                    <button 
                                                        onClick={() => dismissSignal(signal.id)}
                                                        className="px-3 py-2 bg-white/5 text-gray-500 hover:text-red-400 rounded-lg transition-colors border border-white/10"
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

                        {/* LIVE TERMINAL COLUMN (NEW) */}
                        {view === 'LIVE' && (
                            <div className="lg:col-span-1">
                                <div className="bg-[#050505] border border-white/10 rounded-2xl p-4 h-[500px] flex flex-col shadow-2xl sticky top-28">
                                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                                        <h4 className="text-[10px] font-black text-brand-gold uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-pulse"></span>
                                            Telemetría Neural
                                        </h4>
                                        <span className="text-[9px] text-gray-600 font-mono">LIVE LINK</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 font-mono p-1" ref={terminalRef}>
                                        {traces.length === 0 ? (
                                            <p className="text-[10px] text-gray-700 italic text-center mt-20">Esperando actividad de red...</p>
                                        ) : (
                                            traces.map((trace, idx) => renderTraceLine(trace, idx))
                                        )}
                                        <div className="h-4"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : view === 'WIZARD' ? (
                    // --- PRECISION PROTOCOL WIZARD ---
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in max-w-4xl mx-auto min-h-[500px] flex flex-col relative">
                        <div className="absolute top-0 right-0 p-6 opacity-50 pointer-events-none">
                            <div className="w-64 h-64 bg-brand-gold/5 rounded-full blur-3xl"></div>
                        </div>

                        <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Protocolo de Precisión</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">Calibración de Sensores V4</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={autoCalibrateWithAI}
                                    disabled={isEnhancing}
                                    className="px-4 py-2 bg-brand-gold/10 text-brand-gold border border-brand-gold/30 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold hover:text-black transition-all flex items-center gap-2"
                                >
                                    {isEnhancing ? (
                                        <span className="animate-pulse">Calibrando...</span>
                                    ) : (
                                        <><span>✨</span> Autocompletar con IA</>
                                    )}
                                </button>
                                <button onClick={() => setView('CONFIG')} className="text-gray-500 hover:text-white px-4 py-2 text-[10px] font-bold uppercase">Cancelar</button>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center space-y-10">
                            {wizardStep === 0 && (
                                <div className="space-y-6 animate-slide-in-right">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-brand-gold text-black flex items-center justify-center font-black text-lg">1</div>
                                        <div>
                                            <h4 className="text-lg font-black text-white uppercase tracking-tight">Definición de Oportunidad</h4>
                                            <p className="text-xs text-gray-400">Describe EXÁCTAMENTE qué estás buscando. Sé específico.</p>
                                        </div>
                                    </div>
                                    <textarea 
                                        value={calibration.opportunityDefinition}
                                        onChange={(e) => setCalibration({...calibration, opportunityDefinition: e.target.value})}
                                        className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none"
                                        placeholder="Ej: Busco personas preguntando por alquileres en zona centro, dueños de negocios buscando agencias de marketing, o gente vendiendo autos usados."
                                    />
                                    <div className="flex justify-end">
                                        <button 
                                            disabled={!calibration.opportunityDefinition}
                                            onClick={() => setWizardStep(1)} 
                                            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
                                        >
                                            Siguiente &rarr;
                                        </button>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 1 && (
                                <div className="space-y-6 animate-slide-in-right">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center font-black text-lg">2</div>
                                        <div>
                                            <h4 className="text-lg font-black text-white uppercase tracking-tight">Filtro de Ruido (Negativos)</h4>
                                            <p className="text-xs text-gray-400">¿Qué debemos ignorar absolutamente? (Competencia, Spam, etc.)</p>
                                        </div>
                                    </div>
                                    <textarea 
                                        value={calibration.noiseDefinition}
                                        onChange={(e) => setCalibration({...calibration, noiseDefinition: e.target.value})}
                                        className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-red-500/50 outline-none resize-none"
                                        placeholder="Ej: Ignorar ofertas de otros agentes inmobiliarios, spam de criptomonedas, gente buscando trabajo, mensajes de 'buenos días'."
                                    />
                                    <div className="flex justify-between">
                                        <button onClick={() => setWizardStep(0)} className="text-gray-500 font-bold text-xs uppercase">Atrás</button>
                                        <button 
                                            onClick={() => setWizardStep(2)} 
                                            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                                        >
                                            Siguiente &rarr;
                                        </button>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 2 && (
                                <div className="space-y-8 animate-slide-in-right">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center font-black text-lg">3</div>
                                        <div>
                                            <h4 className="text-lg font-black text-white uppercase tracking-tight">Sensibilidad del Sensor</h4>
                                            <p className="text-xs text-gray-400">¿Qué tan estricto debe ser el Radar?</p>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <input 
                                            type="range" min="1" max="10" 
                                            value={calibration.sensitivity}
                                            onChange={(e) => setCalibration({...calibration, sensitivity: parseInt(e.target.value)})}
                                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold mb-6"
                                        />
                                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                            <span className={calibration.sensitivity < 4 ? 'text-brand-gold' : 'text-gray-600'}>Amplio (Más Ruido)</span>
                                            <span className={calibration.sensitivity > 7 ? 'text-brand-gold' : 'text-gray-600'}>Quirúrgico (Menos Leads)</span>
                                        </div>
                                        <div className="mt-4 text-center">
                                            <span className="text-4xl font-black text-white">{calibration.sensitivity}</span>
                                            <p className="text-[10px] text-gray-500 mt-1">Nivel de Precisión</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-4">
                                        <button onClick={() => setWizardStep(1)} className="text-gray-500 font-bold text-xs uppercase">Atrás</button>
                                        <button 
                                            onClick={handleWizardSave} 
                                            className="px-10 py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-[0_0_30px_rgba(212,175,55,0.3)]"
                                        >
                                            Activar Protocolo
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
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

                        {/* CALIBRATION SUMMARY CARD */}
                        <div className="bg-black/30 border border-brand-gold/20 rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-brand-gold/10 rounded-full blur-2xl group-hover:bg-brand-gold/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-[10px] font-black text-brand-gold uppercase tracking-widest mb-1">Calibración Actual</h4>
                                    <p className="text-xs text-gray-300 font-medium">
                                        {settings?.calibration?.opportunityDefinition 
                                            ? "Protocolo de Precisión Activado" 
                                            : "Configuración Básica (Genérica)"}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setView('WIZARD')}
                                    className="px-4 py-2 bg-white/5 border border-white/10 hover:border-brand-gold/50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                    {settings?.calibration?.opportunityDefinition ? 'Recalibrar' : 'Iniciar Wizard'}
                                </button>
                            </div>
                            {settings?.calibration?.opportunityDefinition && (
                                <div className="grid grid-cols-2 gap-4 text-[10px] text-gray-500">
                                    <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                                        <span className="block font-bold text-gray-400 mb-1">Objetivo</span>
                                        <p className="line-clamp-2">{settings.calibration.opportunityDefinition}</p>
                                    </div>
                                    <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                                        <span className="block font-bold text-gray-400 mb-1">Sensibilidad</span>
                                        <p className="text-brand-gold font-bold text-lg">{settings.calibration.sensitivity}/10</p>
                                    </div>
                                </div>
                            )}
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
                                    <button onClick={() => saveSettings()} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-lg">
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
