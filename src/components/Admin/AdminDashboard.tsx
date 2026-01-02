
import React, { useEffect, useState } from 'react';
import { User, LogEntry, GlobalDashboardMetrics, SystemSettings, LogLevel } from '../../types';
import { getAuthHeaders } from '../../config';

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

// --- Placeholder Components for AdminDashboard View Sections ---
const DashboardView: React.FC<{ metrics: GlobalDashboardMetrics | null; onAudit: (user: User) => void; }> = ({ metrics, onAudit }) => {
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
            {/* You can add more detailed metrics or charts here */}
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
    // FIX: Initialize SystemSettings with dominionNetworkJid
    const [systemSettings, setSystemSettings] = useState<SystemSettings>({ supportWhatsappNumber: '', logLevel: 'INFO', dominionNetworkJid: '5491110000000@s.whatsapp.net' });
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
                        <DashboardView metrics={metrics} onAudit={onAudit} />
                        
                        {/* System Settings */}
                        <div className="bg-brand-surface border border-brand-gold/20 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="flex items-center gap-3 mb-6">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Configuración Global</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-end">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">WhatsApp Soporte</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={supportNumberInput} onChange={(e) => setSupportNumberInput(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white" placeholder="549..." />
                                        <button onClick={testSupportLink} className="p-4 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white" title="Probar Link">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </button>
                                    </div>
                                    <button onClick={handleSupportNumberSave} className="w-full py-2 bg-white/10 text-xs rounded-lg hover:bg-white/20">Guardar Número</button>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Nivel de Logs del Servidor (Tiempo Real)</label>
                                     <select
                                        value={systemSettings.logLevel}
                                        onChange={(e) => handleLogLevelChange(e.target.value as LogLevel)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white"
                                    >
                                        <option value="DEBUG">DEBUG (Todo)</option>
                                        <option value="INFO">INFO (Normal)</option>
                                        <option value="WARN">WARN (Advertencias)</option>
                                        <option value="ERROR">ERROR (Solo Errores)</option>
                                    </select>
                                    <p className="text-[9px] text-gray-600 italic">Cambia la verbosidad de la terminal del servidor al instante.</p>
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-red-900/10 border border-red-500/20 rounded-2xl p-6">
                            <h3 className="text-sm font-black text-red-500 uppercase tracking-widest mb-6">Zona de Peligro</h3>
                            <div className="flex items-end gap-4">
                                <div className="flex-1 space-y-2">
                                    <label className="text-[9px] font-bold text-red-400 uppercase">Confirmación</label>
                                    <input 
                                        type="text" 
                                        placeholder='Escribe "RESET" para confirmar' 
                                        value={resetConfirmation}
                                        onChange={(e) => setResetConfirmation(e.target.value)}
                                        className="w-full bg-black/50 border border-red-500/30 rounded-xl p-3 text-red-500 text-xs font-black placeholder-red-900/50"
                                    />
                                </div>
                                <button 
                                    onClick={executeReset}
                                    disabled={resetConfirmation !== 'RESET'}
                                    className="px-8 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 hover:bg-red-500 transition-all"
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
                    <div className="bg-brand-surface border border-white/5 rounded-2xl p-8 space-y-8">
                        <div className="border-b border-white/10 pb-6">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Simulador de Bot Élite</h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">Inyecta conversaciones de prueba en cuentas de clientes</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="block text-xs font-bold text-brand-gold uppercase tracking-widest">Cliente Objetivo</label>
                                <select 
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold"
                                    value={selectedTestClient || ''}
                                    onChange={(e) => setSelectedTestClient(e.target.value)}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.business_name} ({c.username})</option>)}
                                </select>
                            </div>
                            
                            <div className="flex flex-col gap-4 justify-end">
                                <button 
                                    onClick={handleStartTestBot}
                                    disabled={!selectedTestClient || isTestBotRunning}
                                    className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isTestBotRunning ? 'Ejecutando...' : 'Iniciar Secuencia de Prueba'}
                                </button>
                                <button 
                                    onClick={handleClearTestBotConversation}
                                    disabled={!selectedTestClient}
                                    className="w-full py-4 bg-white/5 text-gray-400 border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-white/10 transition-all disabled:opacity-50"
                                >
                                    Limpiar Conversación
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-black/30 p-6 rounded-xl border border-white/5">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Script de Prueba</h4>
                            <ul className="space-y-2 text-xs text-gray-400 font-mono">
                                <li>1. Hola, estoy interesado en tus servicios. ¿Cómo funciona?</li>
                                <li>2. ¿Podrías explicarme un poco más sobre el plan PRO?</li>
                                <li>3. ¿Cuál es el costo mensual?</li>
                                <li>4. ¿Ofrecen alguna garantía o prueba?</li>
                                <li>5. Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?</li>
                            </ul>
                        </div>
                    </div>
                );
            case 'depth_control':
                return (
                    <section className="bg-brand-surface border border-white/5 rounded-2xl p-8 shadow-2xl">
                        <div className="flex justify-between items-end border-b border-white/5 pb-6 mb-8">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <span className="w-3 h-3 bg-purple-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.8)]"></span>
                                    Control de <span className="text-purple-400">Profundidad</span>
                                </h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">Ajuste Neural Fino</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="block text-xs font-bold text-brand-gold uppercase tracking-widest">Cliente Objetivo</label>
                                <select 
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold"
                                    value={selectedDepthClient || ''}
                                    onChange={(e) => setSelectedDepthClient(e.target.value)}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.business_name} ({c.username}) (Nivel: {c.depthLevel || 1})</option>)}
                                </select>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-xs font-bold text-brand-gold uppercase tracking-widest">Nivel Base de Profundidad</label>
                                <input 
                                    type="number" min="1" max="10" 
                                    value={newDepthLevel} 
                                    onChange={(e) => setNewDepthLevel(parseInt(e.target.value))} 
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold"
                                />
                                <button 
                                    onClick={handleUpdateDepth} 
                                    disabled={!selectedDepthClient} 
                                    className="w-full py-3 bg-purple-600/20 text-purple-400 border border-purple-600/50 rounded-xl font-black text-xs uppercase hover:bg-purple-600 hover:text-white transition-all disabled:opacity-50"
                                >
                                    Actualizar Nivel Base
                                </button>
                            </div>

                            <div className="md:col-span-2 space-y-4 pt-6 border-t border-white/5">
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Aplicar Boost Temporal</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Delta de Profundidad (+)</label>
                                        <input 
                                            type="number" min="1" max="5" 
                                            value={boostDelta} 
                                            onChange={(e) => setBoostDelta(parseInt(e.target.value))} 
                                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Duración (Horas)</label>
                                        <input 
                                            type="number" min="1" max="168" 
                                            value={boostHours} 
                                            onChange={(e) => setBoostHours(parseInt(e.target.value))} 
                                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={handleApplyBoost} 
                                    disabled={!selectedDepthClient} 
                                    className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase hover:scale-[1.02] transition-all disabled:opacity-50"
                                >
                                    Aplicar Boost Ahora
                                </button>
                                <p className="text-[9px] text-gray-600 italic mt-2">Un Boost temporal aumenta el nivel de profundidad sobre el base por un período limitado.</p>
                            </div>
                        </div>
                    </section>
                );
            case 'network':
                return <NetworkMonitor backendUrl={backendUrl} token={token} showToast={showToast} />;
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans relative">
            <div className="max-w-7xl mx-auto space-y-8 relative z-10 pb-32">
                <header className="flex justify-between items-end border-b border-white/5 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
                            Panel <span className="text-brand-gold">Global</span>
                        </h1>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">NODO ADMINISTRATIVO SUPREMO</p>
                    </div>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                        <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'dashboard' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Dashboard</button>
                        <button onClick={() => setView('clients')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'clients' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Clientes</button>
                        <button onClick={() => setView('logs')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'logs' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Logs</button>
                        <button onClick={() => setView('test_bot')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'test_bot' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Simulador</button>
                        <button onClick={() => setView('depth_control')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'depth_control' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Profundidad</button>
                        <button onClick={() => setView('network')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'network' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Red</button>
                    </div>
                </header>

                {renderContent()}
            </div>
        </div>
    );
};

export default AdminDashboard;