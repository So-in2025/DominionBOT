
import React, { useEffect, useState } from 'react';
import { User, LogEntry, GlobalDashboardMetrics, SystemSettings } from '../../types';
import { getAuthHeaders } from '../../config';

interface AdminDashboardProps {
    token: string;
    backendUrl: string; 
    onAudit: (user: User) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    onLogout: () => void;
}

type AdminView = 'dashboard' | 'clients' | 'logs' | 'test_bot';

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
                showToast("Error de red al conectar con el servidor backend. Verifique su conexión a internet y que el servidor esté activo y accesible (Ej: Ngrok funcionando).", 'error');
            } else {
                showToast("Error de conexión con el servidor.", 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 20000); // Auto-refresh
        return () => clearInterval(interval);
    }, [token, backendUrl]);

    const updateSystemSettings = async () => {
        if (!supportNumberInput || supportNumberInput.length < 10) {
            showToast('El número parece incompleto. Use formato internacional (ej: 549...)', 'error');
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
                showToast('Configuración global actualizada.', 'success');
            } else {
                showToast('Error al actualizar configuración.', 'error');
            }
        } catch (e) {
            showToast('Error de conexión.', 'error');
        }
    };

    const testSupportLink = () => {
        if (!supportNumberInput) return;
        const msg = encodeURIComponent("Hola Soporte, esto es una prueba de conexión desde el Admin Panel.");
        window.open(`https://wa.me/${supportNumberInput}?text=${msg}`, '_blank');
    };

    const executeReset = async () => {
        if (resetConfirmation !== 'RESET') {
            showToast("Confirmación incorrecta.", 'error');
            return;
        }

        try {
            const res = await fetch(`${backendUrl}/api/admin/system/reset`, { 
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            if (res.ok) {
                showToast("Sistema reseteado exitosamente. Saliendo...", 'success');
                setTimeout(onLogout, 2000);
            } else {
                const data = await res.json().catch(() => ({ message: 'Error desconocido en el servidor.' }));
                showToast(data.message || "Falló el reseteo del sistema.", 'error');
            }
        } catch(e: any) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                showToast("Error de red al intentar resetear. Verifique su conexión a internet y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).", 'error');
            } else {
                showToast("Error de red al intentar resetear.", 'error');
            }
        } finally {
            setIsResetArmed(false);
            setResetConfirmation('');
        }
    };

    const handleStartTestBot = async () => {
        if (!selectedTestClient) {
            showToast('Por favor, selecciona un cliente para iniciar la prueba.', 'error');
            return;
        }
        setIsTestBotRunning(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/test-bot/start`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ targetUserId: selectedTestClient })
            });
            if (res.ok) {
                showToast('Secuencia de prueba iniciada.', 'success');
            } else {
                const data = await res.json();
                showToast(data.message || 'Error al iniciar la prueba del bot.', 'error');
            }
        } catch (e) {
            console.error("Error starting test bot:", e);
            showToast('Error de red al iniciar la prueba del bot.', 'error');
        } finally {
            setIsTestBotRunning(false);
        }
    };

    const handleClearTestBotConversation = async () => {
        if (!selectedTestClient) {
            showToast('Por favor, selecciona un cliente para limpiar la conversación de prueba.', 'error');
            return;
        }
        if (!window.confirm('¿Estás seguro de que quieres eliminar la conversación de prueba de este cliente?')) return;

        try {
            const res = await fetch(`${backendUrl}/api/admin/test-bot/clear`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ targetUserId: selectedTestClient })
            });
            if (res.ok) {
                showToast('Conversación de prueba eliminada.', 'success');
            } else {
                const data = await res.json();
                showToast(data.message || 'Error al limpiar la conversación de prueba.', 'error');
            }
        } catch (e) {
            console.error("Error clearing test bot conversation:", e);
            showToast('Error de red al limpiar la conversación de prueba.', 'error');
        }
    };

    const getPlanPill = (status: string, type: string) => {
        const colors: Record<string, string> = {
            active: 'bg-green-500/10 text-green-400 border-green-500/20',
            expired: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
            trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
        return <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${colors[status]} border`}>{type} - {status}</span>;
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
                        
                        <div className="bg-brand-surface border border-brand-gold/20 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/5 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-gold/10 transition-colors"></div>
                            
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-brand-gold/10 rounded-lg text-brand-gold">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                </div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Configuración Global de Soporte</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">WhatsApp del Bot (Recaudador)</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={supportNumberInput} 
                                            onChange={(e) => setSupportNumberInput(e.target.value.replace(/[^0-9]/g, ''))}
                                            placeholder="549261..."
                                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/50 outline-none font-mono tracking-wider transition-all placeholder-gray-700"
                                        />
                                        <div className="absolute inset-y-0 right-2 flex items-center">
                                            <button 
                                                onClick={testSupportLink}
                                                disabled={!supportNumberInput}
                                                className="bg-white/10 hover:bg-green-500/20 text-gray-400 hover:text-green-400 p-2 rounded-lg transition-colors"
                                                title="Probar enlace"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-gray-500 font-medium">
                                        Los clientes serán redirigidos a este número cuando su periodo de prueba termine. El mensaje pre-cargado solicitará CBU/Alias automáticamente.
                                    </p>
                                </div>
                                
                                <button onClick={updateSystemSettings} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_30px_rgba(212,175,55,0.2)]">
                                    Guardar Cambios
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
                    <section className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-2xl">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Bot de Pruebas "Elite"</h3>
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-6 tracking-widest">
                            Simula interacciones con el bot de un cliente para testear su configuración en tiempo real.
                        </p>

                        <div className="space-y-6">
                            <div>
                                <label htmlFor="testClientSelect" className="block text-xs font-bold text-gray-400 mb-2">Seleccionar Cliente Objetivo</label>
                                <select
                                    id="testClientSelect"
                                    value={selectedTestClient || ''}
                                    onChange={(e) => setSelectedTestClient(e.target.value)}
                                    className="w-full bg-black/50 border border-white/10 rounded-lg py-2.5 px-4 text-sm text-white focus:border-brand-gold outline-none"
                                >
                                    <option value="" disabled>-- Selecciona un cliente --</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>{client.business_name} ({client.username})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={handleStartTestBot}
                                    disabled={!selectedTestClient || isTestBotRunning}
                                    className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-gold/20"
                                >
                                    {isTestBotRunning ? 'Ejecutando Prueba...' : 'Iniciar Prueba del Bot'}
                                </button>
                                <button
                                    onClick={handleClearTestBotConversation}
                                    disabled={!selectedTestClient || isTestBotRunning}
                                    className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Limpiar Conversación de Prueba
                                </button>
                            </div>

                            {isTestBotRunning && (
                                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-xs text-center flex items-center justify-center gap-2 animate-pulse">
                                    <div className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin"></div>
                                    Ejecutando secuencia de prueba...
                                </div>
                            )}
                        </div>
                    </section>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans">
            <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
                <header className="border-b border-white/10 pb-6">
                    <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Nodo de Control Global</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">SaaS Governance v2.9 Elite</p>
                </header>

                <div className="flex gap-2 p-1 bg-brand-surface border border-white/5 rounded-xl">
                    <button onClick={() => setView('dashboard')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'dashboard' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Visión General</button>
                    <button onClick={() => setView('clients')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'clients' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Clientes ({clients.length})</button>
                    <button onClick={() => setView('logs')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'logs' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Telemetría</button>
                    <button onClick={() => setView('test_bot')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'test_bot' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:bg-white/5'}`}>Test Bot</button>
                </div>

                {renderContent()}

                <section className={`bg-red-900/20 border border-red-500/30 rounded-2xl p-6 mt-12 transition-all duration-300 ${isResetArmed ? 'ring-2 ring-red-500 shadow-2xl shadow-red-500/20' : ''}`}>
                    <h3 className="text-sm font-black text-red-400 uppercase tracking-widest">Acciones de Alto Riesgo</h3>
                    {!isResetArmed ? (
                        <div className="flex flex-col md:flex-row justify-between items-center mt-4 gap-4">
                            <p className="text-xs text-gray-400 flex-1">El reseteo del sistema es una acción destructiva que elimina todos los datos. Úselo solo para una limpieza completa del entorno de producción.</p>
                            <button onClick={() => setIsResetArmed(true)} className="px-6 py-3 bg-red-600/80 text-white border border-red-400/50 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-500 transition-all shadow-lg">
                                Hard Reset del Sistema
                            </button>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-4 animate-fade-in">
                            <p className="text-xs text-yellow-300 font-bold">Esta acción borrará TODOS los clientes, logs y sesiones de WhatsApp. Es irreversible.</p>
                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                <input 
                                    type="text"
                                    value={resetConfirmation}
                                    onChange={(e) => setResetConfirmation(e.target.value)}
                                    placeholder="Escriba 'RESET' para confirmar"
                                    className="flex-1 w-full md:w-auto bg-black/50 border border-red-500/50 rounded-lg py-2.5 px-4 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
                                />
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button onClick={() => { setIsResetArmed(false); setResetConfirmation(''); }} className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={executeReset} 
                                        disabled={resetConfirmation !== 'RESET'}
                                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500"
                                    >
                                        Confirmar Reseteo
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

const DashboardView: React.FC<{metrics: GlobalDashboardMetrics | null, onAudit: (user: User) => void}> = ({ metrics, onAudit }) => {
    if (!metrics) return <div className="text-center text-gray-500 py-10">No hay datos de métricas disponibles.</div>;

    const totalPlans = metrics.planDistribution.pro + metrics.planDistribution.starter;
    
    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <KpiCard label="MRR Estimado" value={metrics.mrr.toLocaleString()} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} isCurrency />
                <KpiCard label="Clientes Activos" value={metrics.totalClients} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg>} />
                <KpiCard label="Nodos Online" value={metrics.onlineNodes} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
                <KpiCard label="Leads Globales" value={metrics.globalLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>} />
                <KpiCard label="Leads Calientes" value={metrics.hotLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.657 7.343A8 8 0 0117.657 18.657z" /></svg>} />
                <KpiCard label="Cuentas en Riesgo" value={metrics.atRiskAccounts} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-brand-surface border border-white/5 rounded-2xl p-6">
                    <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Distribución de Planes</h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold text-white">PRO</span>
                                <span className="text-gray-400">{metrics.planDistribution.pro} Cuentas</span>
                            </div>
                            <div className="w-full bg-black/40 rounded-full h-4 border border-white/5 p-0.5"><div className="bg-brand-gold h-full rounded-full" style={{width: `${totalPlans > 0 ? (metrics.planDistribution.pro / totalPlans) * 100 : 0}%`}}></div></div>
                        </div>
                         <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold text-white">STARTER</span>
                                <span className="text-gray-400">{metrics.planDistribution.starter} Cuentas</span>
                            </div>
                            <div className="w-full bg-black/40 rounded-full h-4 border border-white/5 p-0.5"><div className="bg-gray-500 h-full rounded-full" style={{width: `${totalPlans > 0 ? (metrics.planDistribution.starter / totalPlans) * 100 : 0}%`}}></div></div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-brand-surface border border-white/5 rounded-2xl p-6">
                     <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Clientes con Vencimiento Próximo (7 días)</h4>
                     <div className="space-y-2">
                        {metrics.expiringSoon.length > 0 ? metrics.expiringSoon.map(user => (
                            <div key={user.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-white/5">
                                <span className="text-xs font-bold text-white">{user.business_name}</span>
                                <span className="text-[10px] font-mono text-yellow-400">{new Date(user.billing_end_date).toLocaleDateString()}</span>
                                <button onClick={() => onAudit(user)} className="text-[8px] font-black uppercase px-2 py-1 bg-white/10 rounded">Renovar</button>
                            </div>
                        )) : <p className="text-xs text-gray-600 italic">Ningún cliente vence pronto.</p>}
                     </div>
                </div>
            </div>
        </div>
    )
};

const ClientTable: React.FC<{clients: User[], getPlanPill: Function, onAudit: Function}> = ({ clients, getPlanPill, onAudit }) => (
    <section className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="text-[9px] uppercase font-black text-gray-600 border-b border-white/5 tracking-widest bg-black/20">
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Plan</th>
                        <th className="p-4">Vencimiento</th>
                        <th className="p-4">Última Actividad</th>
                        <th className="p-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {clients.map(acc => (
                        <tr key={acc.id} className="hover:bg-white/5 transition-colors group">
                            <td className="p-4">
                                <p className="text-sm font-bold text-white group-hover:text-brand-gold">{acc.business_name}</p>
                                <p className="text-xs font-mono text-gray-500">{acc.username}</p>
                            </td>
                            <td className="p-4">{getPlanPill(acc.plan_status, acc.plan_type)}</td>
                            <td className="p-4 text-xs text-gray-400 font-mono">{new Date(acc.billing_end_date).toLocaleDateString()}</td>
                            <td className="p-4 text-xs text-gray-500 font-mono">{acc.last_activity_at ? new Date(acc.last_activity_at).toLocaleString() : 'N/A'}</td>
                            <td className="p-4 text-right">
                                <button onClick={() => onAudit(acc)} className="text-[9px] font-black uppercase px-4 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg hover:bg-brand-gold hover:text-black hover:border-brand-gold transition-all">Gestionar</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

const LogTable: React.FC<{logs: LogEntry[], getLogLevelPill: Function}> = ({ logs, getLogLevelPill }) => (
    <section className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-2xl h-[600px] flex flex-col">
        <div className="overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
                <thead className="sticky top-0 bg-black/40 backdrop-blur-sm">
                    <tr className="text-[9px] uppercase font-black text-gray-600 border-b border-white/5 tracking-widest">
                        <th className="p-4">Fecha</th>
                        <th className="p-4">Nivel</th>
                        <th className="p-4">Mensaje</th>
                        <th className="p-4">Usuario</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {logs.map(log => (
                        <tr key={log._id} className="hover:bg-white/5 transition-colors group text-xs">
                            <td className="p-3 font-mono text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="p-3">{getLogLevelPill(log.level)}</td>
                            <td className="p-3 text-gray-300">{log.message}</td>
                            <td className="p-3 font-mono text-brand-gold opacity-70">{log.username || 'Sistema'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

export default AdminDashboard;