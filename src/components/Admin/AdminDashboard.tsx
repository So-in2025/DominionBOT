
import React, { useEffect, useState } from 'react';
import { User, LogEntry, GlobalDashboardMetrics, SystemSettings, LogLevel, Conversation, Message, LeadStatus } from '../../types';
import { getAuthHeaders } from '../../config';
import { conversationService } from '../../services/conversationService';
import { processAiResponseForJid, ELITE_BOT_JID, ELITE_BOT_NAME } from '../../whatsapp/client';
import { sanitizeKey, db } from '../../database';
import { v4 as uuidv4 } from 'uuid';

interface AdminDashboardProps {
    token: string;
    backendUrl: string; 
    onAudit: (user: User) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    onLogout: () => void;
}

type AdminView = 'dashboard' | 'clients' | 'logs' | 'test_bot' | 'depth_control' | 'network';

const KpiCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; isCurrency?: boolean; }> = ({ label, value, icon, isCurrency }) => (
    <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 flex items-center gap-6 group hover:bg-white/5 transition-all">
        <div className="p-4 bg-brand-gold/10 text-brand-gold rounded-xl border border-brand-gold/20 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <div>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{label}</p>
            <h3 className="text-3xl font-black text-white tracking-tighter">
                {isCurrency && <span className="text-xl opacity-50">$</span>}
                {value}
            </h3>
        </div>
    </div>
);

const LandingPageManager: React.FC<{
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
}> = ({ settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = () => {
        onSave(localSettings);
    };

    const handleChange = (key: keyof SystemSettings, value: string | number) => {
        setLocalSettings(prev => ({ ...prev!, [key]: value }));
    };

    return (
        <div className="bg-brand-surface border border-brand-gold/20 rounded-2xl p-6 shadow-xl relative overflow-hidden group space-y-8 mt-8">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Gestión de Landing Page</h3>
            
            <div>
                <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Cotización Dólar Blue (ARS)</label>
                <input 
                    type="number"
                    value={localSettings.dolarBlueRate || 1450}
                    onChange={e => handleChange('dolarBlueRate', Number(e.target.value))}
                    className="w-full mt-2 bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white" 
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4 bg-black/30 p-4 rounded-lg border border-white/5">
                    <h4 className="text-xs font-bold text-white uppercase">Plan Standard</h4>
                    <input type="number" value={localSettings.planStandardPriceUSD || 19} onChange={e => handleChange('planStandardPriceUSD', Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-sm text-white" placeholder="Precio USD"/>
                    <textarea value={localSettings.planStandardDescription || ''} onChange={e => handleChange('planStandardDescription', e.target.value)} className="w-full h-24 bg-black/50 border border-white/10 rounded-xl p-2 text-xs text-white custom-scrollbar" placeholder="Descripción..."/>
                </div>
                <div className="space-y-4 bg-black/30 p-4 rounded-lg border border-white/5">
                    <h4 className="text-xs font-bold text-white uppercase">Plan Sniper</h4>
                    <input type="number" value={localSettings.planSniperPriceUSD || 39} onChange={e => handleChange('planSniperPriceUSD', Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-sm text-white" placeholder="Precio USD"/>
                    <textarea value={localSettings.planSniperDescription || ''} onChange={e => handleChange('planSniperDescription', e.target.value)} className="w-full h-24 bg-black/50 border border-white/10 rounded-xl p-2 text-xs text-white custom-scrollbar" placeholder="Descripción..."/>
                </div>
                <div className="space-y-4 bg-black/30 p-4 rounded-lg border border-white/5">
                    <h4 className="text-xs font-bold text-white uppercase">Neuro-Boost</h4>
                    <input type="number" value={localSettings.planNeuroBoostPriceUSD || 5} onChange={e => handleChange('planNeuroBoostPriceUSD', Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-sm text-white" placeholder="Precio USD"/>
                    <textarea value={localSettings.planNeuroBoostDescription || ''} onChange={e => handleChange('planNeuroBoostDescription', e.target.value)} className="w-full h-24 bg-black/50 border border-white/10 rounded-xl p-2 text-xs text-white custom-scrollbar" placeholder="Descripción..."/>
                </div>
            </div>

            <button onClick={handleSave} className="w-full py-3 bg-brand-gold text-black font-black uppercase tracking-widest rounded-xl text-xs hover:scale-[1.01] transition-transform">
                Guardar Cambios de Landing
            </button>
        </div>
    );
};


// --- Placeholder Components for AdminDashboard View Sections ---
const DashboardView: React.FC<{ 
    metrics: GlobalDashboardMetrics | null; 
    onAudit: (user: User) => void;
    settings: SystemSettings;
    onSaveSettings: (updates: Partial<SystemSettings>) => void;
}> = ({ metrics, onAudit, settings, onSaveSettings }) => {
    if (!metrics) return null;
    return (
        <div className="space-y-8">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">Métricas Globales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard label="Clientes Activos" value={metrics.totalClients} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg>} />
                <KpiCard label="MRR Estimado" value={metrics.mrr} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} isCurrency={true} />
                <KpiCard label="Nodos Online" value={metrics.onlineNodes} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
                <KpiCard label="Leads Calientes" value={metrics.hotLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.25-5.5S14 4 14 4V3c-1-.5-3-2-3-2V2s-1-.5-3-2c0 0 0 0 0 0L4 12v3l2.657 2.657z" /></svg>} />
            </div>
            <LandingPageManager settings={settings} onSave={onSaveSettings} />
        </div>
    );
};

const ClientTable: React.FC<{ clients: User[]; getPlanPill: (status: string, type: string) => React.ReactNode; onAudit: (user: User) => void; }> = ({ clients, getPlanPill, onAudit }) => {
    return (
        <div className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-xl">
            <h3 className="text-xl font-black text-white uppercase tracking-widest p-6 border-b border-white/5">Gestión de Clientes</h3>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left table-auto">
                    <thead>
                        <tr className="bg-black/20 text-[9px] uppercase font-black text-gray-400 tracking-widest border-b border-white/5">
                            <th className="p-4">ID</th>
                            <th className="p-4">Nombre Comercial</th>
                            <th className="p-4">WhatsApp</th>
                            <th className="p-4">Plan</th>
                            <th className="p-4">Vencimiento</th>
                            <th className="p-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                        {clients.map(client => (
                            <tr key={client.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 font-mono text-gray-400">{client.id.substring(0, 8)}...</td>
                                <td className="p-4 font-bold text-white">{client.business_name || 'N/A'}</td>
                                <td className="p-4 text-gray-300">{client.username}</td>
                                <td className="p-4">{getPlanPill(client.plan_status, client.plan_type)}</td>
                                <td className="p-4 text-gray-400">{new Date(client.billing_end_date).toLocaleDateString()}</td>
                                <td className="p-4">
                                    <button onClick={() => onAudit(client)} className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-600 hover:text-white transition-all">Auditar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const LogTable: React.FC<{ logs: LogEntry[]; getLogLevelPill: (level: string) => React.ReactNode; }> = ({ logs, getLogLevelPill }) => {
    return (
        <div className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-xl">
            <h3 className="text-xl font-black text-white uppercase tracking-widest p-6 border-b border-white/5">Logs del Sistema</h3>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left table-auto">
                    <thead>
                        <tr className="bg-black/20 text-[9px] uppercase font-black text-gray-400 tracking-widest border-b border-white/5">
                            <th className="p-4">Tiempo</th>
                            <th className="p-4">Nivel</th>
                            <th className="p-4">Mensaje</th>
                            <th className="p-4">Usuario</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs font-mono">
                        {logs.map((log) => (
                            <tr key={log._id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                <td className="p-4">{getLogLevelPill(log.level)}</td>
                                <td className="p-4 text-white">{log.message}</td>
                                <td className="p-4 text-gray-400">{log.username || (log.userId ? log.userId.substring(0, 8) + '...' : 'N/A')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const NetworkMonitor: React.FC<{ backendUrl: string, token: string, showToast: any }> = ({ backendUrl, token, showToast }) => {
    const [stats, setStats] = useState<any>(null);
    const [activity, setActivity] = useState<any>(null);

    useEffect(() => {
        const fetchNetworkStats = async () => {
            try {
                const res = await fetch(`${backendUrl}/api/admin/network/overview`, { headers: getAuthHeaders(token) });
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                    setActivity(data.activity);
                }
            } catch (e) {
                console.error("Error fetching network stats", e);
            }
        };
        fetchNetworkStats();
        const interval = setInterval(fetchNetworkStats, 5000);
        return () => clearInterval(interval);
    }, [backendUrl, token]);

    if (!stats) return <div className="text-center py-20 text-gray-500 animate-pulse font-mono text-xs uppercase">Cargando datos de red...</div>;

    return (
        <div className="space-y-8">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">Monitor de Red Comercial</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <KpiCard label="Nodos Participantes" value={stats.activeNodes} icon={<span className="text-2xl">🌐</span>} />
                <KpiCard label="Señales Aportadas" value={stats.totalSignals} icon={<span className="text-2xl">📡</span>} />
                <KpiCard label="Oportunidades Generadas" value={stats.totalOpportunities} icon={<span className="text-2xl">🎯</span>} />
                <KpiCard label="Conexiones Exitosas" value={stats.successfulConnections} icon={<span className="text-2xl">🤝</span>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest p-6 border-b border-white/5">Últimas Señales (Aportes)</h4>
                    <div className="overflow-auto max-h-96 custom-scrollbar p-4 space-y-2">
                        {activity?.signals?.map((s: any) => (
                            <div key={s.id} className="p-3 bg-white/5 rounded-lg border border-white/5 text-xs">
                                <div className="flex justify-between mb-1">
                                    <span className="text-brand-gold font-bold">{s.signalScore}% Intent</span>
                                    <span className="text-gray-500">{new Date(s.contributedAt).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-gray-300">{s.intentDescription}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {s.intentCategories.map((c: string) => <span key={c} className="px-1.5 py-0.5 bg-black rounded text-[8px] text-gray-400 uppercase">{c}</span>)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest p-6 border-b border-white/5">Últimos Matches (Conexiones)</h4>
                    <div className="overflow-auto max-h-96 custom-scrollbar p-4 space-y-2">
                        {activity?.opportunities?.map((o: any) => (
                            <div key={o.id} className="p-3 bg-white/5 rounded-lg border border-white/5 text-xs flex justify-between items-center">
                                <div>
                                    <div className="flex gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                            o.permissionStatus === 'GRANTED' ? 'bg-green-500/20 text-green-400' :
                                            o.permissionStatus === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-gray-500/20 text-gray-400'
                                        }`}>{o.permissionStatus}</span>
                                        <span className="text-gray-500">{new Date(o.createdAt).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-gray-300 truncate max-w-[200px]">{o.intentDescription}</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-brand-gold font-bold">{o.opportunityScore}%</span>
                                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">Match</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
// --- End Placeholder Components ---


const AdminDashboard: React.FC<AdminDashboardProps> = ({ token, backendUrl, onAudit, showToast, onLogout }) => {
    const [clients, setClients] = useState<User[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [metrics, setMetrics] = useState<GlobalDashboardMetrics | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings>({ supportWhatsappNumber: '', logLevel: 'INFO', dominionNetworkJid: '5491110000000@s.whatsapp.net', isOutboundKillSwitchActive: false });
    const [view, setView] = useState<AdminView>('dashboard');
    const [loading, setLoading] = useState(true);
    const [isResetArmed, setIsResetArmed] = useState(false);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [supportNumberInput, setSupportNumberInput] = useState('');

    // State for Test Bot section
    const [selectedTestClient, setSelectedTestClient] = useState<string | null>(null);
    const [isTestBotRunning, setIsTestBotRunning] = useState(false);

    // State for Depth Control
    const [selectedDepthClient, setSelectedDepthClient] = useState<string | null>(null);
    const [newDepthLevel, setNewDepthLevel] = useState<number>(1);
    const [boostHours, setBoostHours] = useState(24);
    const [boostDelta, setBoostDelta] = useState(2);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [clientsRes, logsRes, metricsRes, settingsRes] = await Promise.all([
                fetch(`${backendUrl}/api/admin/clients`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/logs`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/dashboard-metrics`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/system/settings`, { headers: getAuthHeaders(token) })
            ]);
            if (clientsRes.ok) setClients(await clientsRes.json());
            if (logsRes.ok) setLogs(await logsRes.json());
            if (metricsRes.ok) setMetrics(await metricsRes.json());
            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                setSystemSettings(settings);
                setSupportNumberInput(settings.supportWhatsappNumber || '');
            }

        } catch (e: any) {
            console.error("Admin Dashboard Error:", e);
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                showToast("Error de red.", 'error');
            } else {
                showToast("Error de conexión.", 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); 
        return () => clearInterval(interval);
    }, [token, backendUrl]);

    const updateSystemSettings = async (updates: Partial<SystemSettings>) => {
        try {
            const res = await fetch(`${backendUrl}/api/admin/system/settings`, {
                method: 'PUT',
                headers: getAuthHeaders(token),
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                const updated = await res.json();
                setSystemSettings(updated);
                showToast('Configuración actualizada.', 'success');
            } else {
                showToast('Error al actualizar.', 'error');
            }
        } catch (e) {
            showToast('Error de conexión.', 'error');
        }
    };
    
    const handleSupportNumberSave = () => {
        if (!supportNumberInput || supportNumberInput.length < 10) {
            showToast('Número incompleto.', 'error');
            return;
        }
        updateSystemSettings({ supportWhatsappNumber: supportNumberInput });
    };

    const handleLogLevelChange = (level: LogLevel) => {
        updateSystemSettings({ logLevel: level });
    };

    const handleKillSwitchToggle = () => {
        const newValue = !systemSettings.isOutboundKillSwitchActive;
        if (newValue) {
            if (!confirm("☢️ PELIGRO: ¿ACTIVAR KILL SWITCH GLOBAL?\n\nEsto bloqueará TODAS las campañas salientes de TODOS los clientes inmediatamente.\nÚsalo solo en emergencias.")) return;
        }
        updateSystemSettings({ isOutboundKillSwitchActive: newValue });
    };

    const handleNetworkFeatureToggle = () => {
        const newValue = !systemSettings.isNetworkGlobalFeatureEnabled;
        updateSystemSettings({ isNetworkGlobalFeatureEnabled: newValue });
        showToast(`Red Dominion Global ${newValue ? 'Activada' : 'Desactivada'}`, 'info');
    };

    const testSupportLink = () => {
        if (!supportNumberInput) return;
        window.open(`https://wa.me/${supportNumberInput}`, '_blank');
    };

    const executeReset = async () => {
        if (resetConfirmation !== 'RESET') return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/system/reset`, { method: 'POST', headers: getAuthHeaders(token) });
            if (res.ok) {
                showToast("Sistema reseteado.", 'success');
                setTimeout(onLogout, 2000);
            }
        } catch(e) {}
    };

    const handleStartTestBot = async () => {
        if (!selectedTestClient) return;
        setIsTestBotRunning(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/test-bot/start`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ targetUserId: selectedTestClient })
            });
            if (res.ok) {
                showToast("Simulación iniciada en background.", 'success');
            } else {
                showToast("Error al iniciar simulación.", 'error');
            }
        } catch (e) {
            showToast("Error de conexión.", 'error');
        } finally {
            setIsTestBotRunning(false);
        }
    };

    const handleClearTestBotConversation = async () => {
        if (!selectedTestClient) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/test-bot/clear`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ targetUserId: selectedTestClient })
            });
            if (res.ok) {
                showToast("Conversación de prueba eliminada.", 'success');
            }
        } catch (e) {
            showToast("Error de conexión.", 'error');
        }
    };

    // NEW: Depth Control Handlers
    const handleUpdateDepth = async () => {
        if (!selectedDepthClient) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/depth/update`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ userId: selectedDepthClient, depthLevel: newDepthLevel })
            });
            if (res.ok) {
                showToast('Nivel de profundidad actualizado.', 'success');
                fetchData(); // Refresh list
            }
        } catch(e) { showToast('Error al actualizar profundidad.', 'error'); }
    };

    const handleApplyBoost = async () => {
        if (!selectedDepthClient) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/depth/boost`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ userId: selectedDepthClient, depthDelta: boostDelta, durationHours: boostHours })
            });
            if (res.ok) {
                showToast(`Boost de +${boostDelta} aplicado por ${boostHours}h.`, 'success');
            }
        } catch(e) { showToast('Error al aplicar boost.', 'error'); }
    };

    const getPlanPill = (status: string, type: string) => {
        const colors: Record<string, string> = {
            active: 'bg-green-500/10 text-green-400 border-green-500/20',
            expired: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
            trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
        const label = type === 'starter' ? 'Fallback' : type.toUpperCase();
        return <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${colors[status]} border`}>{label} - {status}</span>;
    };

    const getLogLevelPill = (level: string) => {
        const colors: Record<string, string> = {
            INFO: 'bg-blue-500/10 text-blue-400',
            WARN: 'bg-yellow-500/10 text-yellow-400',
            ERROR: 'bg-red-500/10 text-red-400',
            AUDIT: 'bg-purple-500/10 text-purple-400',
            DEBUG: 'bg-gray-500/10 text-gray-400'
        };
        return <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${colors[level]}`}>{level}</span>;
    };

    const renderContent = () => {
        if (loading) return <div className="text-center text-brand-gold text-xs font-bold uppercase animate-pulse py-20">Sincronizando con el Núcleo...</div>;

        switch(view) {
            case 'dashboard':
                return (
                    <div className="space-y-8">
                        <DashboardView metrics={metrics} onAudit={onAudit} settings={systemSettings} onSaveSettings={updateSystemSettings} />
                        
                        {/* System Settings */}
                        <div className="bg-brand-surface border border-brand-gold/20 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="flex items-center gap-3 mb-6">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Configuración Global</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-end">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">WhatsApp Soporte</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={supportNumberInput}
                                            onChange={(e) => setSupportNumberInput(e.target.value)}
                                            placeholder="549..."
                                            className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white"
                                        />
                                        <button onClick={handleSupportNumberSave} className="px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold">Guardar</button>
                                        <button onClick={testSupportLink} className="px-3 bg-green-500/20 text-green-400 rounded-lg text-[10px] font-bold">Probar</button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Nivel de Logs</label>
                                    <select 
                                        value={systemSettings.logLevel} 
                                        onChange={(e) => handleLogLevelChange(e.target.value as LogLevel)}
                                        className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white"
                                    >
                                        <option value="INFO">INFO</option>
                                        <option value="WARN">WARN</option>
                                        <option value="ERROR">ERROR</option>
                                        <option value="DEBUG">DEBUG</option>
                                        <option value="AUDIT">AUDIT</option>
                                    </select>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Kill Switch (Global)</label>
                                    <button 
                                        onClick={handleKillSwitchToggle}
                                        className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${systemSettings.isOutboundKillSwitchActive ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600/20 text-green-400'}`}
                                    >
                                        {systemSettings.isOutboundKillSwitchActive ? 'BLOQUEO ACTIVO' : 'SISTEMA ONLINE'}
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Red Dominion</label>
                                    <button 
                                        onClick={handleNetworkFeatureToggle}
                                        className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${systemSettings.isNetworkGlobalFeatureEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                                    >
                                        {systemSettings.isNetworkGlobalFeatureEnabled ? 'RED ACTIVA' : 'RED DESACTIVADA'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Dangerous Zone */}
                        <div className="bg-red-900/10 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <h3 className="text-red-500 font-black uppercase tracking-widest text-sm mb-1">Zona de Peligro</h3>
                                <p className="text-xs text-red-300">Reseteo total de base de datos. Solo para desarrollo.</p>
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder='Escribe "RESET"' 
                                    value={resetConfirmation}
                                    onChange={(e) => setResetConfirmation(e.target.value)}
                                    className="bg-black/50 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-200 outline-none focus:border-red-500"
                                />
                                <button 
                                    onClick={executeReset} 
                                    disabled={resetConfirmation !== 'RESET'}
                                    className="px-6 py-2 bg-red-600 text-white font-black text-xs rounded-lg uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500"
                                >
                                    Hard Reset
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case 'clients':
                return <ClientTable clients={clients} getPlanPill={getPlanPill} onAudit={onAudit} />;
            case 'logs':
                return <LogTable logs={logs} getLogLevelPill={getLogLevelPill} />;
            case 'test_bot':
                return (
                    <div className="bg-brand-surface border border-white/5 rounded-2xl p-8 shadow-xl max-w-2xl mx-auto">
                        <h3 className="text-xl font-black text-white uppercase tracking-widest mb-6">Simulador Elite Bot</h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cliente Objetivo</label>
                                <select 
                                    value={selectedTestClient || ''} 
                                    onChange={(e) => setSelectedTestClient(e.target.value)}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white"
                                >
                                    <option value="">Seleccionar Cliente...</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.business_name} ({c.username})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl">
                                <p className="text-xs text-blue-200 leading-relaxed">
                                    Esto inyectará un chat simulado ("Simulador Neural") en la cuenta del cliente y ejecutará una conversación de venta automática para probar la IA.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <button 
                                    onClick={handleStartTestBot} 
                                    disabled={!selectedTestClient || isTestBotRunning}
                                    className="flex-1 py-4 bg-brand-gold text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-transform disabled:opacity-50"
                                >
                                    {isTestBotRunning ? 'Ejecutando...' : 'Iniciar Prueba'}
                                </button>
                                <button 
                                    onClick={handleClearTestBotConversation}
                                    disabled={!selectedTestClient}
                                    className="px-6 py-4 bg-white/5 text-gray-400 font-bold text-xs uppercase rounded-xl hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case 'depth_control':
                return (
                    <div className="bg-brand-surface border border-white/5 rounded-2xl p-8 shadow-xl max-w-2xl mx-auto space-y-8">
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">Control de Profundidad</h3>
                        
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cliente</label>
                            <select 
                                value={selectedDepthClient || ''} 
                                onChange={(e) => {
                                    setSelectedDepthClient(e.target.value);
                                    const client = clients.find(c => c.id === e.target.value);
                                    if(client) setNewDepthLevel(client.depthLevel || 1);
                                }}
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white"
                            >
                                <option value="">Seleccionar Cliente...</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.business_name} (Lvl {c.depthLevel || 1})</option>
                                ))}
                            </select>
                        </div>

                        {selectedDepthClient && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="p-6 bg-black/30 rounded-xl border border-white/5">
                                    <h4 className="text-sm font-bold text-white mb-4">Nivel Base</h4>
                                    <div className="flex gap-4 items-center">
                                        <input 
                                            type="range" min="1" max="10" 
                                            value={newDepthLevel} 
                                            onChange={(e) => setNewDepthLevel(parseInt(e.target.value))}
                                            className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                                        />
                                        <span className="text-2xl font-black text-brand-gold w-12 text-center">{newDepthLevel}</span>
                                    </div>
                                    <button onClick={handleUpdateDepth} className="mt-4 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold uppercase">
                                        Actualizar Nivel Base
                                    </button>
                                </div>

                                <div className="p-6 bg-purple-900/10 rounded-xl border border-purple-500/20">
                                    <h4 className="text-sm font-bold text-purple-400 mb-4">Neuro-Boost (Temporal)</h4>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Potencia (+Lvl)</label>
                                            <input type="number" value={boostDelta} onChange={e => setBoostDelta(parseInt(e.target.value))} className="w-full bg-black/50 border border-purple-500/30 rounded-lg p-2 text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Duración (Horas)</label>
                                            <input type="number" value={boostHours} onChange={e => setBoostHours(parseInt(e.target.value))} className="w-full bg-black/50 border border-purple-500/30 rounded-lg p-2 text-white" />
                                        </div>
                                    </div>
                                    <button onClick={handleApplyBoost} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold uppercase shadow-lg shadow-purple-600/20">
                                        Aplicar Boost
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'network':
                return <NetworkMonitor backendUrl={backendUrl} token={token} showToast={showToast} />;
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
            <div className="max-w-7xl mx-auto space-y-10 pb-32">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            Panel <span className="text-brand-gold">Dios</span>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Administración de Infraestructura</p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onLogout} className="px-4 py-2 text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors">Cerrar Sesión</button>
                    </div>
                </header>

                {/* Navigation */}
                <div className="flex bg-brand-surface border border-white/5 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                    {[
                        { id: 'dashboard', label: 'Dashboard' },
                        { id: 'clients', label: 'Clientes' },
                        { id: 'logs', label: 'Logs' },
                        { id: 'test_bot', label: 'Simulador' },
                        { id: 'depth_control', label: 'Depth Engine' },
                        { id: 'network', label: 'Red Dominion' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setView(tab.id as AdminView)}
                            className={`flex-1 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${view === tab.id ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {renderContent()}
            </div>
        </div>
    );
};

export default AdminDashboard;
