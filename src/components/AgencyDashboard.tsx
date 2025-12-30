
import React, { useEffect, useState } from 'react';
import { BotSettings, DashboardMetrics, User } from '../types';

interface AgencyDashboardProps {
  token: string;
  backendUrl: string;
  settings: BotSettings;
  onUpdateSettings: (newSettings: BotSettings) => void;
}

// --- COMPONENTS ---

const KpiCard: React.FC<{ 
    label: string; 
    value: string | number; 
    trend?: string; 
    icon: React.ReactNode;
    isGold?: boolean;
}> = ({ label, value, trend, icon, isGold }) => (
    <div className={`relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-lg group ${
        isGold 
        ? 'bg-gradient-to-br from-brand-gold/10 to-brand-black border-brand-gold/30 hover:shadow-brand-gold/10' 
        : 'bg-brand-surface border-white/5 hover:border-white/10'
    }`}>
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-lg ${isGold ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/5 text-gray-400'}`}>
                {icon}
            </div>
            {trend && (
                <span className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    {trend}
                </span>
            )}
        </div>
        <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">{label}</p>
            <h3 className={`text-2xl font-black tracking-tighter ${isGold ? 'text-brand-gold' : 'text-white'}`}>
                {value}
            </h3>
        </div>
        <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl opacity-10 pointer-events-none ${isGold ? 'bg-brand-gold' : 'bg-blue-500'}`}></div>
    </div>
);

const PipelineBar: React.FC<{ label: string; count: number; total: number; colorClass: string }> = ({ label, count, total, colorClass }) => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    
    return (
        <div className="mb-4 last:mb-0">
            <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">{label}</span>
                <span className="text-xs font-black text-white">{count} <span className="text-[10px] text-gray-500 font-normal">({percentage}%)</span></span>
            </div>
            <div className="w-full bg-black/50 rounded-full h-2 border border-white/5 overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass}`} 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
};

const UserRow: React.FC<{ 
    user: User; 
    onUpdate: (userId: string, updates: Partial<User>) => void 
}> = ({ user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [notes, setNotes] = useState(user.internalNotes || '');

    const handleSaveNotes = () => {
        onUpdate(user.id, { internalNotes: notes });
        setIsEditing(false);
    };

    const toggleSuspension = () => {
        const newState = !user.isSuspended;
        onUpdate(user.id, { isSuspended: newState });
    };

    const changePlan = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onUpdate(user.id, { planType: e.target.value as any });
    };

    return (
        <tr className="hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
            <td className="p-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center text-black font-black text-xs uppercase shadow-lg shadow-brand-gold/10">
                        {user.settings.productName?.charAt(0) || user.username.charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-white text-sm truncate max-w-[120px] md:max-w-[150px]">{user.settings.productName || 'Sin configurar'}</p>
                        <p className="text-[10px] text-gray-500 font-mono truncate">{user.username}</p>
                    </div>
                </div>
            </td>
            <td className="p-5">
                <select 
                    value={user.planType || 'TRIAL'} 
                    onChange={changePlan}
                    className={`
                        bg-black/50 border text-[10px] rounded px-2 py-1.5 outline-none focus:ring-1 transition-all font-black uppercase tracking-wider
                        ${user.planType === 'ENTERPRISE' ? 'text-purple-400 border-purple-500/30 focus:border-purple-500' : 
                          user.planType === 'STARTER' ? 'text-blue-400 border-blue-500/30 focus:border-blue-500' : 
                          'text-gray-400 border-white/10 focus:border-white/30'}
                    `}
                >
                    <option value="TRIAL">TRIAL</option>
                    <option value="STARTER">STARTER</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
            </td>
            <td className="p-5">
                {isEditing ? (
                    <div className="flex gap-2 items-center animate-fade-in">
                        <input 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                            className="bg-black/50 border border-brand-gold/50 text-[10px] text-white rounded px-2 py-1 w-32 outline-none font-bold"
                            placeholder="Nota..."
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveNotes()}
                        />
                        <button onClick={handleSaveNotes} className="text-green-500 hover:text-green-400 text-[10px] bg-green-500/10 px-2 py-1 rounded border border-green-500/20 font-bold">OK</button>
                    </div>
                ) : (
                    <div onClick={() => setIsEditing(true)} className="cursor-pointer group/notes flex items-center gap-2">
                        <span className={`text-[11px] truncate max-w-[120px] ${user.internalNotes ? 'text-gray-300' : 'text-gray-600 italic'}`}>
                            {user.internalNotes || 'Añadir nota...'}
                        </span>
                        <svg className="w-3 h-3 text-gray-600 group-hover/notes:text-brand-gold transition-colors opacity-0 group-hover/notes:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </div>
                )}
            </td>
            <td className="p-5">
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${!user.isSuspended && user.settings.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : (user.isSuspended ? 'bg-red-500' : 'bg-gray-500')}`}></div>
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${user.isSuspended ? 'text-red-500' : (user.settings.isActive ? 'text-green-500' : 'text-gray-500')}`}>
                        {user.isSuspended ? 'Suspendido' : (user.settings.isActive ? 'Online' : 'Pausado')}
                    </span>
                </div>
            </td>
            <td className="p-5 text-right">
                <button 
                    onClick={toggleSuspension}
                    className={`text-[9px] font-black px-3 py-1.5 rounded transition-all uppercase tracking-widest border ${
                        user.isSuspended 
                        ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500 hover:text-white' 
                        : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white'
                    }`}
                >
                    {user.isSuspended ? 'Reactivar' : 'Suspender'}
                </button>
            </td>
        </tr>
    );
};

const AgencyDashboard: React.FC<AgencyDashboardProps> = ({ token, backendUrl, settings, onUpdateSettings }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
      try {
        const [mRes, uRes] = await Promise.all([
            fetch(`${backendUrl}/api/admin/metrics`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${backendUrl}/api/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if(mRes.ok) setMetrics(await mRes.json());
        if(uRes.ok) setUsers(await uRes.json());

      } catch(e) {
          console.error("Failed to fetch admin data");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchData();
      const interval = setInterval(fetchData, 15000); 
      return () => clearInterval(interval);
  }, [token, backendUrl]);

  const handleUpdateUser = async (targetUserId: string, updates: Partial<User>) => {
      try {
          setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, ...updates } : u));
          const res = await fetch(`${backendUrl}/api/admin/update_user`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ targetUserId, updates })
          });
          if (!res.ok) fetchData(); 
      } catch (e) {
          console.error(e);
      }
  };

  if (loading && !metrics) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-brand-black text-brand-gold">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-gold mb-4"></div>
              <p className="text-xs uppercase tracking-[0.3em] animate-pulse font-black">Sincronizando Neural Core...</p>
          </div>
      );
  }

  if (!metrics) return null;
  const clientUsers = users.filter(u => u.role !== 'admin');

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto h-full font-sans custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8 pb-10">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
            <div>
                <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tighter">
                    Dashboard <span className="text-brand-gold">Signal Engine</span>
                </h1>
                <p className="text-gray-500 mt-2 text-xs uppercase font-bold tracking-widest">Infraestructura comercial v2.3 Enterprise</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 bg-brand-surface border border-white/10 px-4 py-2 rounded-lg shadow-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[10px] text-gray-300 uppercase tracking-[0.2em] font-black">{metrics.activeSessions} Nodos Activos</span>
                </div>
            </div>
        </div>

        {/* KPI GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard 
                label="Signal Yield" 
                value={`$${metrics.revenueEstimated.toLocaleString()}`} 
                trend="MRR Proyectado"
                isGold
                icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
             <KpiCard 
                label="Conversion Rate" 
                value={`${metrics.conversionRate}%`} 
                trend="Signal/Lead Ratio"
                icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
            />
            <KpiCard 
                label="Signal Velocity" 
                value={`${metrics.avgEscalationTimeMinutes}m`} 
                trend="Avg. HOT Detection"
                icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <KpiCard 
                label="Throughput" 
                value={metrics.totalMessages} 
                trend="Total AI Signals"
                icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
            />
        </div>

        {/* MAIN CONTENT SPLIT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT: SIGNAL PIPELINE */}
            <div className="bg-brand-surface rounded-xl border border-white/5 p-6 shadow-2xl lg:col-span-1 h-fit sticky top-24">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        Signal Pipeline
                    </h3>
                    <div className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></div>
                </div>
                
                <div className="space-y-6">
                    <PipelineBar 
                        label="🔥 Signals (HOT)" 
                        count={metrics.hotLeads} 
                        total={metrics.totalLeads} 
                        colorClass="bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_10px_rgba(220,38,38,0.5)]" 
                    />
                    <PipelineBar 
                        label="⚡ Nurturing (WARM)" 
                        count={metrics.warmLeads} 
                        total={metrics.totalLeads} 
                        colorClass="bg-gradient-to-r from-orange-500 to-yellow-400" 
                    />
                    <PipelineBar 
                        label="❄️ Inbound (COLD)" 
                        count={metrics.coldLeads} 
                        total={metrics.totalLeads} 
                        colorClass="bg-gradient-to-r from-blue-600 to-blue-400" 
                    />
                </div>

                <div className="mt-8 p-4 bg-brand-gold/5 rounded-lg border border-brand-gold/10">
                    <p className="text-[10px] text-brand-gold font-black uppercase tracking-widest mb-1">Infrastructure Health</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed italic">
                        La infraestructura está operando al 100%. La velocidad de detección de señales HOT es óptima.
                    </p>
                </div>
            </div>

            {/* RIGHT: INFRASTRUCTURE MANAGEMENT */}
            <div className="bg-brand-surface rounded-xl border border-white/5 shadow-2xl lg:col-span-2 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Nodos de Infraestructura</h3>
                        <p className="text-[10px] text-gray-500 mt-1 font-bold">Gestión de aprovisionamiento de señales.</p>
                    </div>
                    <div className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded text-gray-400 font-bold uppercase">
                        Total Nodos: {clientUsers.length}
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-gray-500 text-[9px] uppercase tracking-[0.2em] bg-black/40">
                                <th className="p-5 font-bold">Signal Node</th>
                                <th className="p-5 font-bold">Provisioning</th>
                                <th className="p-5 font-bold">Internal Metadata</th>
                                <th className="p-5 font-bold">State</th>
                                <th className="p-5 font-bold text-right">Governance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {clientUsers.length > 0 ? (
                                clientUsers.map(user => (
                                    <UserRow key={user.id} user={user} onUpdate={handleUpdateUser} />
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-gray-600 text-xs font-bold uppercase italic tracking-widest">
                                        No active nodes in infrastructure.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default AgencyDashboard;
