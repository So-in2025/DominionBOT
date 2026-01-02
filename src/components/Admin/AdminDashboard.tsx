
import React, { useEffect, useState } from 'react';
import { User, LogEntry, GlobalDashboardMetrics, SystemSettings } from '../../types';
import { getAuthHeaders } from '../../config';

interface AdminDashboardProps {
    token: string;
    backendUrl: string; 
    onAudit: (user: User) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    onLogout: () => void;
}

type AdminView = 'dashboard' | 'clients' | 'logs' | 'test_bot' | 'depth_control';

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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ token, backendUrl, onAudit, showToast, onLogout }) => {
    const [clients, setClients] = useState<User[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [metrics, setMetrics] = useState<GlobalDashboardMetrics | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings>({ supportWhatsappNumber: '' });
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
        const interval = setInterval(fetchData, 20000); 
        return () => clearInterval(interval);
    }, [token, backendUrl]);

    const updateSystemSettings = async () => {
        if (!supportNumberInput || supportNumberInput.length < 10) {
            showToast('Número incompleto.', 'error');
            return;
        }
        try {
            const res = await fetch(`${backendUrl}/api/admin/system/settings`, {
                method: 'PUT',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ supportWhatsappNumber: supportNumberInput })
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">WhatsApp Soporte</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={supportNumberInput} onChange={(e) => setSupportNumberInput(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white" placeholder="549..." />
                                        <button onClick={testSupportLink} className="p-4 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white" title="Probar Link">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <button onClick={updateSystemSettings} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em]">Guardar</button>
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
                                <li>5. Suena interesante. Creo que estoy listo...</li>
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
                                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.8)]"></span>
                                    Control de Profundidad Cognitiva
                                </h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">
                                    Administración del Depth Engine v1.0
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* LEFT: Client Selection & Current State */}
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-brand-gold uppercase tracking-widest mb-3">Cliente Objetivo</label>
                                    <select 
                                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-gold transition-all"
                                        value={selectedDepthClient || ''}
                                        onChange={(e) => {
                                            setSelectedDepthClient(e.target.value);
                                            const client = clients.find(c => c.id === e.target.value);
                                            if (client) setNewDepthLevel(client.depthLevel || 1);
                                        }}
                                    >
                                        <option value="">-- Seleccionar Cliente --</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.business_name} (Nivel Actual: {c.depthLevel || 1})</option>)}
                                    </select>
                                </div>

                                {selectedDepthClient && (
                                    <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nivel Base</h4>
                                        <div className="flex items-center gap-4">
                                            <input 
                                                type="range" min="1" max="10" 
                                                value={newDepthLevel} 
                                                onChange={(e) => setNewDepthLevel(parseInt(e.target.value))}
                                                className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer accent-brand-gold"
                                            />
                                            <span className="text-2xl font-black text-white w-12 text-center">{newDepthLevel}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 italic">
                                            Nivel 1: Básico (Rápido) &rarr; Nivel 10: Profundo (Lento, Costoso)
                                        </p>
                                        <button onClick={handleUpdateDepth} className="w-full py-3 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                                            Establecer Nivel Base
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT: Boosts */}
                            <div className="space-y-6 opacity-90">
                                <div className="p-6 bg-brand-gold/5 rounded-2xl border border-brand-gold/10 space-y-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/10 rounded-full blur-3xl"></div>
                                    
                                    <div>
                                        <h4 className="text-[10px] font-black text-brand-gold uppercase tracking-widest mb-4">Aplicar Depth Boost Temporarl</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[9px] text-gray-500 font-bold block mb-2">Potencia (+Niveles)</label>
                                                <input type="number" value={boostDelta} onChange={e => setBoostDelta(parseInt(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white text-center font-black" min="1" max="5" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-gray-500 font-bold block mb-2">Duración (Horas)</label>
                                                <input type="number" value={boostHours} onChange={e => setBoostHours(parseInt(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white text-center font-black" min="1" max="72" />
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handleApplyBoost} 
                                        disabled={!selectedDepthClient}
                                        className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] shadow-lg shadow-brand-gold/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Inyectar Boost
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                );
            default: return null;
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans">
            <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
                <header className="border-b border-white/10 pb-6">
                    <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Nodo de Control Global</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">SaaS Governance v3.0.0 Elite</p>
                </header>

                <div className="flex gap-2 p-1 bg-brand-surface border border-white/5 rounded-xl overflow-x-auto">
                    <button onClick={() => setView('dashboard')} className={`flex-1 min-w-[100px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'dashboard' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Visión</button>
                    <button onClick={() => setView('clients')} className={`flex-1 min-w-[100px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'clients' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Clientes</button>
                    <button onClick={() => setView('logs')} className={`flex-1 min-w-[100px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'logs' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Logs</button>
                    <button onClick={() => setView('test_bot')} className={`flex-1 min-w-[100px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'test_bot' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Test Bot</button>
                    <button onClick={() => setView('depth_control')} className={`flex-1 min-w-[120px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'depth_control' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-gray-500 hover:bg-white/5'}`}>Depth Control</button>
                </div>

                {renderContent()}
            </div>
        </div>
    );
};

// --- Helper Components ---

const DashboardView: React.FC<{metrics: GlobalDashboardMetrics | null, onAudit: (user: User) => void}> = ({ metrics, onAudit }) => {
    if (!metrics) return null;
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <KpiCard label="Clientes Activos" value={metrics.totalClients} icon={<span className="text-xl">👥</span>} />
             <KpiCard label="MRR" value={metrics.mrr.toLocaleString()} icon={<span className="text-xl">$</span>} isCurrency />
             <KpiCard label="Leads Totales" value={metrics.globalLeads} icon={<span className="text-xl">🔥</span>} />
             <KpiCard label="Nodos Online" value={metrics.onlineNodes} icon={<span className="text-xl text-green-500">●</span>} />
             <KpiCard label="Cuentas Riesgo" value={metrics.atRiskAccounts} icon={<span className="text-xl text-red-500">⚠️</span>} />
        </div>
    );
};

const ClientTable: React.FC<{clients: User[], getPlanPill: Function, onAudit: Function}> = ({ clients, getPlanPill, onAudit }) => (
    <div className="bg-brand-surface rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-widest">
                    <tr>
                        <th className="p-4">Negocio / ID</th>
                        <th className="p-4">Plan</th>
                        <th className="p-4">Vencimiento</th>
                        <th className="p-4">Profundidad</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4">Acción</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                    {clients.map(client => (
                        <tr key={client.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                                <div className="font-bold text-white">{client.business_name}</div>
                                <div className="text-gray-500 text-[10px] font-mono">{client.username}</div>
                            </td>
                            <td className="p-4">
                                {getPlanPill(client.plan_status, client.plan_type)}
                            </td>
                            <td className="p-4 text-gray-400 font-mono">
                                {new Date(client.billing_end_date).toLocaleDateString()}
                            </td>
                            <td className="p-4 font-black text-brand-gold">
                                Lvl {client.depthLevel || 1}
                            </td>
                            <td className="p-4">
                                <span className={`w-2 h-2 rounded-full inline-block mr-2 ${client.settings.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                {client.settings.isActive ? 'Bot ON' : 'Bot OFF'}
                            </td>
                            <td className="p-4">
                                <button onClick={() => onAudit(client)} className="text-[9px] font-black bg-brand-gold text-black px-3 py-1.5 rounded uppercase hover:scale-105 transition-transform">
                                    Gestionar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const LogTable: React.FC<{logs: LogEntry[], getLogLevelPill: Function}> = ({ logs, getLogLevelPill }) => (
    <div className="bg-brand-surface rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-widest">
                    <tr>
                        <th className="p-4">Tiempo</th>
                        <th className="p-4">Nivel</th>
                        <th className="p-4">Usuario</th>
                        <th className="p-4">Mensaje</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[10px] font-mono">
                    {logs.map((log) => (
                        <tr key={log._id} className="hover:bg-white/5">
                            <td className="p-4 text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                            <td className="p-4">{getLogLevelPill(log.level)}</td>
                            <td className="p-4 text-gray-400">{log.username || 'System'}</td>
                            <td className="p-4 text-gray-300 w-1/2">{log.message}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

export default AdminDashboard;
