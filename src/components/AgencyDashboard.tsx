
import React, { useEffect, useState } from 'react';
import { BotSettings, DashboardMetrics, User } from '../types.js';
import { getAuthHeaders } from '../config.js';

interface AgencyDashboardProps {
  token: string;
  backendUrl: string;
  settings: BotSettings;
  onUpdateSettings: (newSettings: BotSettings) => void;
}

const KpiCard: React.FC<{ 
    label: string; 
    value: string | number; 
    trend?: string; 
    icon: React.ReactNode;
    isGold?: boolean;
}> = ({ label, value, trend, icon, isGold }) => (
    <div className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-500 hover:translate-y-[-4px] group ${
        isGold 
        ? 'bg-gradient-to-br from-brand-gold/20 to-brand-black border-brand-gold/30 shadow-[0_0_30px_rgba(212,175,55,0.05)]' 
        : 'bg-brand-surface border-white/5'
    }`}>
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl transition-colors ${isGold ? 'bg-brand-gold/20 text-brand-gold group-hover:bg-brand-gold group-hover:text-black' : 'bg-white/5 text-gray-400'}`}>
                {icon}
            </div>
            {trend && (
                <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full uppercase tracking-widest animate-pulse">
                    {trend}
                </span>
            )}
        </div>
        <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">{label}</p>
            <h3 className={`text-4xl font-black tracking-tighter ${isGold ? 'text-brand-gold' : 'text-white'}`}>
                {value}
            </h3>
        </div>
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-brand-gold opacity-5 rounded-full blur-3xl group-hover:opacity-10 transition-opacity"></div>
    </div>
);

const FunnelStep: React.FC<{ label: string; value: number; total: number; color: string; delay: string }> = ({ label, value, total, color, delay }) => {
    const width = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="space-y-2 animate-fade-in" style={{ animationDelay: delay }}>
            <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{label}</span>
                <span className="text-sm font-black text-white">{value} <span className="text-[10px] text-gray-600 ml-1">leads</span></span>
            </div>
            <div className="relative h-12 w-full bg-black/40 rounded-xl overflow-hidden border border-white/5 p-1">
                <div 
                    className={`h-full ${color} rounded-lg transition-all duration-1000 ease-out flex items-center justify-end pr-4 shadow-lg`} 
                    style={{ width: `${width}%` }}
                >
                    <span className="text-[10px] font-black text-black/60">{Math.round(width)}%</span>
                </div>
            </div>
        </div>
    );
};

const AgencyDashboard: React.FC<AgencyDashboardProps> = ({ token, backendUrl, settings, onUpdateSettings }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); 

        // FIX: Usamos getAuthHeaders para inyectar ngrok-skip-browser-warning
        const res = await fetch(`${backendUrl}/api/metrics`, { 
            headers: getAuthHeaders(token),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if(res.ok) {
            setMetrics(await res.json());
        } else {
            setError("Error de autenticación o servidor inalcanzable.");
        }
      } catch(e: any) { 
          if (e.name === 'AbortError') {
              setError("Tiempo de espera agotado. El servidor está tardando en responder.");
          } else {
              setError("Fallo de conexión con el nodo central.");
          }
          console.error(e); 
      } finally { 
          setLoading(false); 
      }
  };

  useEffect(() => {
      fetchData();
  }, [token, backendUrl]);

  if (loading) return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black">
          <div className="w-16 h-16 border-b-2 border-brand-gold rounded-full animate-spin mb-6"></div>
          <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Sincronizando Telemetría...</p>
      </div>
  );

  if (error) return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10 text-center">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest">Desconexión del Nodo</h2>
          <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">{error}</p>
          <button onClick={fetchData} className="mt-8 px-8 py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 transition-all">Reintentar Conexión</button>
      </div>
  );

  if (!metrics) return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10 text-center">
          <p className="text-gray-500">No hay datos disponibles.</p>
          <button onClick={fetchData} className="mt-4 text-brand-gold text-sm font-bold">Recargar</button>
      </div>
  );

  return (
    <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans relative">
      <div className="bg-noise"></div>
      
      <div className="max-w-7xl mx-auto space-y-10 relative z-10">
        
        <header className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/10 pb-10">
            <div>
                <h1 className="text-5xl font-black text-white tracking-tighter leading-none">
                    Métricas <span className="text-brand-gold">Elite</span>
                </h1>
                <p className="text-gray-500 mt-3 text-xs uppercase font-black tracking-[0.2em] flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Flujo de Inferencia Omnicanal Activo
                </p>
            </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard label="ROI Proyectado" value={`$${metrics.revenueEstimated.toLocaleString()}`} isGold icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} trend="+18%" />
            <KpiCard label="Conversión" value={`${metrics.conversionRate}%`} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
            <KpiCard label="Captación" value={metrics.totalLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg>} />
            <KpiCard label="Señales" value={metrics.totalMessages} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01" /></svg>} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-brand-surface border border-white/5 rounded-3xl p-10 shadow-2xl space-y-10 relative overflow-hidden">
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">Embudo de Inferencia</h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em]">Estado Neural de tus Ventas</p>
                </div>
                <div className="space-y-8 max-w-3xl">
                    <FunnelStep label="Ingesta (FRÍO)" value={metrics.coldLeads} total={metrics.totalLeads} color="bg-blue-600/80" delay="0s" />
                    <FunnelStep label="Interés (TIBIO)" value={metrics.warmLeads} total={metrics.totalLeads} color="bg-orange-500/80" delay="0.1s" />
                    <FunnelStep label="Cierre (CALIENTE)" value={metrics.hotLeads} total={metrics.totalLeads} color="bg-brand-gold shadow-[0_0_20px_rgba(212,175,55,0.4)]" delay="0.2s" />
                </div>
            </div>

            <div className="bg-brand-surface border border-white/5 rounded-3xl p-10 shadow-2xl flex flex-col justify-between">
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">Salud de la Infraestructura</h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em]">Gobernanza & Calidad</p>
                </div>
                
                <div className="flex-1 flex flex-col justify-center py-6 gap-8">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                            </div>
                            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Acople WhatsApp</span>
                        </div>
                        <span className="text-green-500 font-black text-xs uppercase tracking-widest">ESTABLE (14ms)</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-bold uppercase">Tasa de Desviación Humana</span>
                        <span className="text-xl font-black text-white">{metrics.humanDeviationScore}%</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full relative overflow-hidden">
                        <div className="h-full bg-brand-gold rounded-full transition-all duration-1000" style={{ width: `${metrics.humanDeviationScore}%` }}></div>
                    </div>
                    <p className="text-[9px] text-gray-500 italic">Porcentaje de mensajes enviados manualmente por el humano vs la IA.</p>
                </div>

                <button className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all">Auditar Protocolos</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyDashboard;
