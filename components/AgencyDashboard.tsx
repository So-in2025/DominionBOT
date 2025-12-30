
import React, { useEffect, useState } from 'react';
import { BotSettings, DashboardMetrics, User } from '../types';

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
    <div className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:shadow-2xl group ${
        isGold 
        ? 'bg-gradient-to-br from-brand-gold/10 to-brand-black border-brand-gold/30' 
        : 'bg-brand-surface border-white/5'
    }`}>
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${isGold ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/5 text-gray-400'}`}>
                {icon}
            </div>
            {trend && (
                <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full uppercase tracking-widest">
                    {trend}
                </span>
            )}
        </div>
        <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">{label}</p>
            <h3 className={`text-3xl font-black tracking-tighter ${isGold ? 'text-brand-gold' : 'text-white'}`}>
                {value}
            </h3>
        </div>
    </div>
);

const FunnelStep: React.FC<{ label: string; value: number; total: number; color: string; delay: string }> = ({ label, value, total, color, delay }) => {
    const width = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="space-y-2 animate-fade-in" style={{ animationDelay: delay }}>
            <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</span>
                <span className="text-sm font-black text-white">{value}</span>
            </div>
            <div className="relative h-10 w-full bg-white/5 rounded-lg overflow-hidden border border-white/5">
                <div 
                    className={`h-full ${color} transition-all duration-1000 ease-out flex items-center justify-end pr-4`} 
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

  useEffect(() => {
      const fetchData = async () => {
          try {
            const res = await fetch(`${backendUrl}/api/admin/metrics`, { headers: { 'Authorization': `Bearer ${token}` } });
            if(res.ok) setMetrics(await res.json());
          } catch(e) { console.error(e); } finally { setLoading(false); }
      };
      fetchData();
  }, [token, backendUrl]);

  if (loading && !metrics) return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black">
          <div className="w-12 h-12 border-4 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin mb-4"></div>
          <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.3em] animate-pulse">Sincronizando Nodos...</p>
      </div>
  );

  if (!metrics) return null;

  return (
    <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans">
      <div className="max-w-7xl mx-auto space-y-10">
        
        <header className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/10 pb-8">
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter">Métricas de <span className="text-brand-gold">Rendimiento</span></h1>
                <p className="text-gray-500 mt-2 text-xs uppercase font-bold tracking-widest italic">Visibilidad táctica del funnel de ventas.</p>
            </div>
            <div className="flex gap-4">
                <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-center">
                    <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Status Global</p>
                    <p className="text-green-500 text-xs font-black uppercase tracking-widest">Optimizado</p>
                </div>
            </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard label="ROI Proyectado" value={`$${metrics.revenueEstimated.toLocaleString()}`} isGold icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} trend="+15% MRR" />
            <KpiCard label="Conversión" value={`${metrics.conversionRate}%`} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
            <KpiCard label="Captación Leads" value={metrics.totalLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
            <KpiCard label="Inferencia IA" value={metrics.totalMessages} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl space-y-8">
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Embudo de Conversión</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Efectividad del filtrado neural</p>
                </div>
                <div className="space-y-6">
                    <FunnelStep label="Ingesta (Frío)" value={metrics.coldLeads} total={metrics.totalLeads} color="bg-blue-500" delay="0s" />
                    <FunnelStep label="Interés (Tibio)" value={metrics.warmLeads} total={metrics.totalLeads} color="bg-orange-500" delay="0.1s" />
                    <FunnelStep label="Cierre (Caliente)" value={metrics.hotLeads} total={metrics.totalLeads} color="bg-brand-gold shadow-[0_0_15px_rgba(212,175,55,0.4)]" delay="0.2s" />
                </div>
                <div className="p-4 bg-brand-gold/5 border border-brand-gold/20 rounded-2xl">
                    <p className="text-[10px] text-brand-gold font-bold uppercase tracking-widest mb-1">Sugerencia Estratégica</p>
                    <p className="text-xs text-gray-400 italic">El {Math.round((metrics.hotLeads / metrics.totalLeads) * 100)}% de los leads llegan a fase de cierre. Considere aumentar el presupuesto de pauta.</p>
                </div>
            </div>

            <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl flex flex-col justify-between">
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Salud de la Infraestructura</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Latencia y Respuesta</p>
                </div>
                
                <div className="flex-1 flex flex-col justify-center py-10 gap-8">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-bold uppercase">Latencia IA</span>
                        <span className="text-xl font-black text-green-500">1.2s</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full"><div className="w-[95%] h-full bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div></div>
                    
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-bold uppercase">Tasa de Error</span>
                        <span className="text-xl font-black text-white">0.02%</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full"><div className="w-[2%] h-full bg-brand-gold rounded-full"></div></div>
                </div>

                <button className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all">Exportar Reporte Mensual</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyDashboard;
