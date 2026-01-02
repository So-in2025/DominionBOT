
import React, { useEffect, useState } from 'react';
import { BotSettings, DashboardMetrics, User } from '../types.js';
import { getAuthHeaders } from '../config';
import { GoogleGenAI } from '@google/genai';
import TestBotSimulator from './Client/TestBotSimulator.js'; 
import { openSupportWhatsApp } from '../utils/textUtils';

interface AgencyDashboardProps {
  token: string;
  backendUrl: string;
  settings: BotSettings;
  onUpdateSettings: (newSettings: BotSettings) => void | Promise<void>;
  currentUser: User | null; 
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const KpiCard: React.FC<{ 
    label: string; 
    value: string | number; 
    trend?: string; 
    icon: React.ReactNode;
    isGold?: boolean;
}> = ({ label, value, trend, icon, isGold }) => (
    <div className={`relative overflow-hidden rounded-[24px] border p-6 transition-all duration-500 hover:translate-y-[-4px] group ${
        isGold 
        ? 'bg-gradient-to-br from-brand-gold/15 to-brand-black border-brand-gold/20 shadow-[0_20px_50px_rgba(212,175,55,0.05)]' 
        : 'bg-brand-surface border-white/5'
    }`}>
        <div className="flex justify-between items-start mb-6">
            <div className={`p-3 rounded-xl transition-colors ${isGold ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/5 text-gray-500'}`}>
                {icon}
            </div>
            {trend && (
                <span className="text-[9px] font-black text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full uppercase tracking-widest border border-green-400/20">
                    {trend}
                </span>
            )}
        </div>
        <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black mb-1.5">{label}</p>
            <h3 className={`text-5xl font-black tracking-tighter ${isGold ? 'text-brand-gold' : 'text-white'}`}>
                {value}
            </h3>
        </div>
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-brand-gold opacity-[0.03] rounded-full blur-3xl group-hover:opacity-[0.08] transition-opacity"></div>
    </div>
);

const FunnelStep: React.FC<{ label: string; value: number; total: number; color: string; delay: string }> = ({ label, value, total, color, delay }) => {
    const width = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="space-y-2 animate-fade-in" style={{ animationDelay: delay }}>
            <div className="flex justify-between items-end">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</span>
                <span className="text-xs font-black text-white uppercase tracking-widest">{value} <span className="opacity-40 ml-1">LDS</span></span>
            </div>
            <div className="relative h-14 w-full bg-black/40 rounded-2xl overflow-hidden border border-white/5 p-1">
                <div 
                    className={`h-full ${color} rounded-xl transition-all duration-1000 ease-out flex items-center justify-end pr-4 shadow-xl border-r-2 border-white/20`} 
                    style={{ width: `${width}%` }}
                >
                    <span className="text-[10px] font-black text-black/80">{Math.round(width)}%</span>
                </div>
            </div>
        </div>
    );
};

const NeuralEngineStatus: React.FC<{ depthLevel: number; userId: string; username: string }> = ({ depthLevel, userId, username }) => {
    let mode = 'STANDARD';
    let color = 'text-gray-400';
    let borderColor = 'border-white/10';
    let bg = 'bg-white/5';
    let label = 'Nivel 3';

    if (depthLevel >= 10) {
        mode = 'NEURO-BOOST';
        color = 'text-purple-400';
        borderColor = 'border-purple-500/30';
        bg = 'bg-purple-900/10';
        label = 'Nivel 10 (MAX)';
    } else if (depthLevel >= 7) {
        mode = 'SNIPER';
        color = 'text-brand-gold';
        borderColor = 'border-brand-gold/30';
        bg = 'bg-brand-gold/10';
        label = 'Nivel 7';
    } else {
        label = `Nivel ${depthLevel}`;
    }

    const handleUpgradeRequest = () => {
        const message = `Hola, soy ${username} (ID: ${userId}).\n\nActualmente estoy en *Nivel ${depthLevel}*. Quisiera solicitar un *Aumento de Potencia* para mi Motor Neural.`;
        openSupportWhatsApp(message);
    };

    return (
        <div className={`p-4 rounded-xl border ${borderColor} ${bg} flex items-center justify-between`}>
            <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Motor Cognitivo</p>
                <h4 className={`text-lg font-black tracking-tight ${color}`}>{mode}</h4>
            </div>
            <div className="text-right">
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${borderColor} ${color} mb-1 block`}>
                    {label}
                </span>
                <button onClick={handleUpgradeRequest} className="text-[9px] font-bold text-gray-400 hover:text-white underline">
                    Solicitar Upgrade
                </button>
            </div>
        </div>
    );
};

const AgencyDashboard: React.FC<AgencyDashboardProps> = ({ token, backendUrl, settings, onUpdateSettings, currentUser, showToast }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<'UNKNOWN' | 'VALID' | 'INVALID' | 'VERIFYING'>('UNKNOWN');
  
  const verifyApiKey = async () => {
    // 1. Clean the key (Trim spaces)
    const cleanKey = settings?.geminiApiKey?.trim();
    
    if (!cleanKey) {
        alert('API Key de Gemini no configurada o vacía.');
        setApiKeyStatus('INVALID');
        return;
    }

    setApiKeyStatus('VERIFYING');
    try {
        const ai = new GoogleGenAI({ apiKey: cleanKey });
        // Use gemini-2.0-flash-exp for verification as it's more widely available than 3-preview
        // This ensures we test the KEY, not the Model availability.
        await ai.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: [{ parts: [{text: 'ping'}] }] 
        }); 
        
        setApiKeyStatus('VALID');
        alert('✅ Conexión Exitosa: API Key verificada y operativa.');
    } catch (error: any) {
        setApiKeyStatus('INVALID');
        console.error("API Key verification failed:", error);
        
        let msg = 'Error desconocido.';
        if (error.message?.includes('403')) msg = 'Permisos insuficientes o Key inválida (403).';
        if (error.message?.includes('404')) msg = 'Modelo no encontrado (404). Tu Key funciona, pero el modelo no está disponible en tu región.';
        if (error.message?.includes('400')) msg = 'Petición inválida (400). Verifica el formato de la Key.';
        
        alert(`❌ Error de Verificación: ${msg}\n\nDetalle técnico: ${error.message}`);
    }
  };

  useEffect(() => {
    if (settings?.geminiApiKey) {
      setApiKeyStatus('UNKNOWN');
    }
  }, [settings?.geminiApiKey]);

  const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${backendUrl}/api/metrics`, { headers: getAuthHeaders(token) });
        if(res.ok) {
            setMetrics(await res.json());
        } else {
            setError("Error de autenticación o servidor inalcanzable.");
        }
      } catch(e: any) { 
          setError("Fallo de conexión con el nodo central.");
          console.error(e); 
      } finally { 
          setLoading(false); 
      }
  };

  useEffect(() => { fetchData(); }, [token, backendUrl]);

  if (loading) return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black">
          <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mb-6"></div>
          <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Sincronizando Telemetría...</p>
      </div>
  );

  if (!metrics) return null;

  const statusInfo = {
    'UNKNOWN': { color: 'text-gray-500', text: 'Sin Verificar' },
    'VALID': { color: 'text-green-500', text: 'Operativa' },
    'INVALID': { color: 'text-red-500', text: 'Inválida' },
    'VERIFYING': { color: 'text-yellow-500', text: 'Verificando...' }
  };

  return (
    <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans relative">
      <div className="max-w-7xl mx-auto space-y-10 relative z-10 animate-fade-in">
        
        <header className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/5 pb-10">
            <div>
                <h1 className="text-5xl font-black text-white tracking-tighter leading-none uppercase">
                    Telemetría <span className="text-brand-gold">Pro</span>
                </h1>
                <p className="text-gray-500 mt-3 text-[10px] uppercase font-black tracking-[0.3em] flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
                    Estado Operativo Nominal
                </p>
            </div>
            <button onClick={fetchData} className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all">Actualizar Live Data</button>
        </header>

        {/* METRICS GRID - Now inclusive of Campaigns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <KpiCard label="Retorno Estimado" value={`$${metrics.revenueEstimated.toLocaleString()}`} isGold icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} trend="+14% Sem" />
            <KpiCard label="Tasa Conversión" value={`${metrics.conversionRate}%`} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
            <KpiCard label="Leads Captados" value={metrics.totalLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg>} />
            <KpiCard label="Peticiones IA" value={metrics.totalMessages} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01" /></svg>} />
            {/* NEW CAMPAIGN KPI CARD */}
            <KpiCard label="Difusión (Msgs)" value={metrics.campaignMessagesSent || 0} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>} trend={metrics.campaignsActive > 0 ? `${metrics.campaignsActive} Activas` : 'Inactivo'} />
        </div>

        {/* Client Test Bot Simulator */}
        {currentUser && (
            <TestBotSimulator 
                token={token} 
                backendUrl={backendUrl} 
                userId={currentUser.id} 
                showToast={showToast} 
            />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
            <div className="lg:col-span-2 bg-brand-surface border border-white/5 rounded-[32px] p-10 shadow-2xl space-y-10 relative overflow-hidden">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">Ciclo de Venta</h3>
                        <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em] mt-1">Embudo Neural de Inferencia</p>
                    </div>
                </div>
                <div className="space-y-8">
                    <FunnelStep label="Fase 1: Curiosos (FRÍO)" value={metrics.coldLeads} total={metrics.totalLeads} color="bg-blue-600/60" delay="0s" />
                    <FunnelStep label="Fase 2: Nutrición (TIBIO)" value={metrics.warmLeads} total={metrics.totalLeads} color="bg-orange-500/60" delay="0.1s" />
                    <FunnelStep label="Fase 3: Cierre (CALIENTE)" value={metrics.hotLeads} total={metrics.totalLeads} color="bg-brand-gold shadow-[0_0_30px_rgba(212,175,55,0.3)]" delay="0.2s" />
                </div>
            </div>

            <div className="lg:col-span-1 space-y-8">
                 <div className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl flex flex-col justify-between h-full">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">Salud del Nodo</h3>
                        <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em] mt-1">Conexión y Gobernanza</p>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center py-6 gap-6">
                        
                        {/* NEW: NEURAL ENGINE STATUS */}
                        {currentUser && <NeuralEngineStatus depthLevel={currentUser.depthLevel || 1} userId={currentUser.id} username={currentUser.business_name || currentUser.username} />}

                        <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Estado API Gemini</span>
                            <span className={`font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border ${
                                apiKeyStatus === 'VALID' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                                apiKeyStatus === 'INVALID' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>{statusInfo[apiKeyStatus].text}</span>
                        </div>
                         <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Intervención Humana</span>
                                <span className="text-sm font-black text-white">{metrics.humanDeviationScore}%</span>
                            </div>
                            <div className="w-full bg-white/5 h-2.5 rounded-full relative overflow-hidden p-0.5 border border-white/5">
                                <div className="h-full bg-brand-gold rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(212,175,55,0.5)]" style={{ width: `${metrics.humanDeviationScore}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <button onClick={verifyApiKey} disabled={apiKeyStatus === 'VERIFYING'} className="w-full py-3 bg-brand-gold/10 border border-brand-gold/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-gold hover:bg-brand-gold hover:text-black transition-all disabled:opacity-50">
                        {apiKeyStatus === 'VERIFYING' ? 'Verificando...' : 'Verificar Conexión IA'}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyDashboard;
