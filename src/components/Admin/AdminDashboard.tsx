
import React, { useEffect, useState } from 'react';
import { User, LogEntry, GlobalDashboardMetrics, SystemSettings, LogLevel, Conversation, Message, LeadStatus, Testimonial } from '../../types';
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

type AdminView = 'dashboard' | 'clients' | 'logs' | 'test_bot' | 'depth_control' | 'network' | 'testimonials';

// --- UI COMPONENTS ---

const KpiCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; isCurrency?: boolean; trend?: string }> = ({ label, value, icon, isCurrency, trend }) => (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col justify-between hover:border-brand-gold/30 transition-all duration-300 relative group overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-brand-gold/10 transition-colors"></div>
        
        <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3 bg-white/5 text-gray-300 rounded-xl group-hover:text-brand-gold group-hover:bg-brand-gold/10 transition-colors">
                {icon}
            </div>
            {trend && <span className="text-[9px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-full">{trend}</span>}
        </div>
        
        <div className="relative z-10">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-1">
                {isCurrency && <span className="text-xl text-gray-500 font-medium mr-1">$</span>}
                {value}
            </h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">{label}</p>
        </div>
    </div>
);

const SectionHeader: React.FC<{ title: string; subtitle: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6 mb-8 animate-fade-in">
        <div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                <span className="w-1.5 h-8 bg-brand-gold rounded-full"></span>
                {title}
            </h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1 ml-5">{subtitle}</p>
        </div>
        {action && <div>{action}</div>}
    </div>
);

const PlanEditorCard: React.FC<{ 
    title: string; 
    priceUSD: number; 
    desc: string; 
    onChange: (field: string, val: any) => void;
    fields: { title: string, price: string, desc: string } 
}> = ({ title, priceUSD, desc, onChange, fields }) => (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 relative group hover:border-white/20 transition-all">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-800 to-gray-600 group-hover:from-brand-gold group-hover:to-brand-gold-dark transition-all"></div>
        <div className="flex justify-between items-center">
            <input 
                type="text" 
                value={title} 
                onChange={(e) => onChange(fields.title, e.target.value)} 
                className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-brand-gold outline-none text-sm font-black text-white uppercase tracking-widest w-2/3 transition-all"
                placeholder="NOMBRE PLAN"
            />
            <div className="flex items-center">
                <span className="text-gray-500 text-xs mr-1">$</span>
                <input 
                    type="number" 
                    value={priceUSD} 
                    onChange={(e) => onChange(fields.price, Number(e.target.value))} 
                    className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-brand-gold outline-none text-xl font-black text-white w-16 text-right transition-all"
                />
            </div>
        </div>
        <textarea 
            value={desc} 
            onChange={(e) => onChange(fields.desc, e.target.value)} 
            className="w-full h-24 bg-white/5 border border-white/5 rounded-xl p-3 text-xs text-gray-300 custom-scrollbar focus:border-brand-gold/50 outline-none resize-none transition-all leading-relaxed" 
            placeholder="Descripción del plan..."
        />
    </div>
);

// --- SUB-COMPONENTS ---

const TestimonialManager: React.FC<{ token: string; backendUrl: string; showToast: (msg: string, type: 'success'|'error') => void }> = ({ token, backendUrl, showToast }) => {
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchTestimonials();
    }, []);

    const fetchTestimonials = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/testimonials`, { headers: getAuthHeaders(token) });
            if (res.ok) setTestimonials(await res.json());
        } catch (e) {
            showToast('Error cargando testimonios', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleVisibility = async (t: Testimonial) => {
        try {
            const res = await fetch(`${backendUrl}/api/admin/testimonials/${t._id}`, {
                method: 'PUT',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ isVisible: !t.isVisible })
            });
            if (res.ok) {
                setTestimonials(prev => prev.map(item => item._id === t._id ? { ...item, isVisible: !item.isVisible } : item));
                showToast(`Testimonio ${!t.isVisible ? 'activado' : 'oculto'}.`, 'success');
            }
        } catch (e) { showToast('Error al actualizar.', 'error'); }
    };

    const deleteTestimonial = async (id: string) => {
        if (!confirm('¿Eliminar testimonio permanentemente?')) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/testimonials/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(token)
            });
            if (res.ok) {
                setTestimonials(prev => prev.filter(item => item._id !== id));
                showToast('Testimonio eliminado.', 'success');
            }
        } catch (e) { showToast('Error al eliminar.', 'error'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Base de Datos de Reseñas</h3>
                <button onClick={fetchTestimonials} className="text-xs text-gray-500 hover:text-white">Refrescar</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {testimonials.map(t => (
                    <div key={t._id} className={`p-4 rounded-xl border transition-all relative group ${t.isVisible ? 'bg-green-900/10 border-green-500/30' : 'bg-black/40 border-white/5 opacity-70 hover:opacity-100'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="text-xs font-bold text-white">{t.name || 'Anónimo'}</p>
                                <p className="text-[10px] text-gray-500">{t.location || 'Ubicación desconocida'}</p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${t.isVisible ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                        </div>
                        <p className="text-xs text-gray-300 italic mb-4 line-clamp-3">"{t.text}"</p>
                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <span className="text-[9px] text-gray-600 font-mono">{new Date(t.createdAt).toLocaleDateString()}</span>
                            <div className="flex gap-2">
                                <button onClick={() => deleteTestimonial(t._id!)} className="text-[9px] text-red-500 hover:text-red-400 font-bold uppercase">Borrar</button>
                                <button 
                                    onClick={() => toggleVisibility(t)} 
                                    className={`text-[9px] font-bold uppercase px-2 py-1 rounded border ${t.isVisible ? 'border-red-500/30 text-red-400 hover:bg-red-900/20' : 'border-green-500/30 text-green-400 hover:bg-green-900/20'}`}
                                >
                                    {t.isVisible ? 'Ocultar' : 'Publicar'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const LandingPageManager: React.FC<{
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
}> = ({ settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    const [hasChanges, setHasChanges] = useState(false);
    
    useEffect(() => { setLocalSettings(settings); }, [settings]);

    const handleChange = (key: keyof SystemSettings, value: string | number | undefined) => {
        setLocalSettings(prev => ({ ...prev!, [key]: value }));
        setHasChanges(true);
    };

    const handleSave = () => {
        onSave(localSettings);
        setHasChanges(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Configuración Comercial (Landing)</h3>
                {hasChanges && (
                    <button onClick={handleSave} className="px-4 py-2 bg-brand-gold text-black rounded-lg text-xs font-black uppercase tracking-widest animate-pulse hover:scale-105 transition-all">
                        Guardar Cambios
                    </button>
                )}
            </div>
            
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 flex items-center gap-6">
                <div className="p-3 bg-green-900/20 text-green-400 rounded-xl border border-green-500/20">
                    <span className="text-2xl">💵</span>
                </div>
                <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Cotización Dólar Blue (ARS)</label>
                    <input 
                        type="number"
                        value={localSettings.dolarBlueRate || 1450}
                        onChange={e => handleChange('dolarBlueRate', Number(e.target.value))}
                        className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-lg font-mono text-white focus:border-green-500 outline-none w-40" 
                    />
                </div>
                <div className="text-xs text-gray-500 max-w-sm border-l border-white/10 pl-6">
                    Esta tasa se usa para mostrar los precios aproximados en Pesos Argentinos en la sección de precios de la Landing.
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <PlanEditorCard 
                    title={localSettings.planStandardTitle || ''} 
                    priceUSD={localSettings.planStandardPriceUSD || 0} 
                    desc={localSettings.planStandardDescription || ''}
                    onChange={handleChange}
                    fields={{ title: 'planStandardTitle', price: 'planStandardPriceUSD', desc: 'planStandardDescription' }}
                />
                <PlanEditorCard 
                    title={localSettings.planSniperTitle || ''} 
                    priceUSD={localSettings.planSniperPriceUSD || 0} 
                    desc={localSettings.planSniperDescription || ''}
                    onChange={handleChange}
                    fields={{ title: 'planSniperTitle', price: 'planSniperPriceUSD', desc: 'planSniperDescription' }}
                />
                <PlanEditorCard 
                    title={localSettings.planNeuroBoostTitle || ''} 
                    priceUSD={localSettings.planNeuroBoostPriceUSD || 0} 
                    desc={localSettings.planNeuroBoostDescription || ''}
                    onChange={handleChange}
                    fields={{ title: 'planNeuroBoostTitle', price: 'planNeuroBoostPriceUSD', desc: 'planNeuroBoostDescription' }}
                />
            </div>
        </div>
    );
};

const ClientTable: React.FC<{ clients: User[]; getPlanPill: (status: string, type: string) => React.ReactNode; onAudit: (user: User) => void; }> = ({ clients, getPlanPill, onAudit }) => {
    const [filter, setFilter] = useState('');

    // Defensive check: Ensure clients is an array
    const safeClients = Array.isArray(clients) ? clients : [];

    const filteredClients = safeClients.filter(c => 
        (c.username || '').toLowerCase().includes(filter.toLowerCase()) || 
        (c.business_name || '').toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="bg-brand-surface border border-white/5 rounded-[24px] overflow-hidden shadow-2xl flex flex-col h-full min-h-[600px]">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Base de Datos de Clientes ({safeClients.length})</h3>
                <input 
                    type="text" 
                    placeholder="Buscar cliente..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:border-brand-gold outline-none w-64 transition-all"
                />
            </div>
            <div className="overflow-x-auto custom-scrollbar flex-1">
                <table className="w-full text-left table-auto">
                    <thead className="sticky top-0 bg-[#0f0f0f] z-10">
                        <tr className="text-[9px] uppercase font-black text-gray-500 tracking-widest border-b border-white/5">
                            <th className="p-5">Entidad</th>
                            <th className="p-5">Credenciales</th>
                            <th className="p-5">Estado Licencia</th>
                            <th className="p-5">Vencimiento</th>
                            <th className="p-5 text-right">Control</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                        {filteredClients.map(client => (
                            <tr key={client.id || Math.random().toString()} className="hover:bg-white/5 transition-colors group">
                                <td className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center text-xs font-bold text-white shadow-inner">
                                            {client.business_name ? client.business_name.substring(0, 2).toUpperCase() : 'NA'}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{client.business_name || 'Sin Nombre'}</div>
                                            <div className="text-[9px] text-gray-500 font-mono">{client.id ? client.id.substring(0, 8) : '???'}...</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-5">
                                    <span className="font-mono text-gray-400 bg-black/40 px-2 py-1 rounded border border-white/5">{client.username || 'Sin Usuario'}</span>
                                </td>
                                <td className="p-5">{getPlanPill(client.plan_status || 'unknown', client.plan_type || 'unknown')}</td>
                                <td className="p-5">
                                    <span className={`font-mono text-[10px] ${client.billing_end_date && new Date(client.billing_end_date) < new Date() ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                        {client.billing_end_date ? new Date(client.billing_end_date).toLocaleDateString() : 'Sin Fecha'}
                                    </span>
                                </td>
                                <td className="p-5 text-right">
                                    <button onClick={() => onAudit(client)} className="px-4 py-2 bg-white/5 text-gray-300 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-gold hover:text-black hover:border-brand-gold transition-all shadow-lg">
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
};

const LogTable: React.FC<{ logs: LogEntry[]; getLogLevelPill: (level: string) => React.ReactNode; }> = ({ logs, getLogLevelPill }) => {
    const getLevelConfig = (level: string) => {
        switch (level) {
            case 'ERROR': return {
                rowClass: 'bg-red-900/10 border-l-2 border-l-red-500 hover:bg-red-900/20',
                textClass: 'text-red-300 font-bold'
            };
            case 'WARN': return {
                rowClass: 'bg-yellow-900/10 border-l-2 border-l-yellow-500 hover:bg-yellow-900/20',
                textClass: 'text-yellow-300 font-medium'
            };
            case 'AUDIT': return {
                rowClass: 'bg-purple-900/10 border-l-2 border-l-purple-500 hover:bg-purple-900/20',
                textClass: 'text-purple-300 font-bold'
            };
            case 'INFO': return {
                rowClass: 'bg-transparent border-l-2 border-l-blue-500/30 hover:bg-blue-900/10',
                textClass: 'text-gray-300'
            };
            case 'DEBUG': return {
                rowClass: 'bg-transparent border-l-2 border-l-gray-700/30 hover:bg-white/5 opacity-70',
                textClass: 'text-gray-500 font-mono'
            };
            default: return {
                rowClass: 'hover:bg-white/5 border-l-2 border-l-transparent',
                textClass: 'text-gray-400'
            };
        }
    };

    return (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[600px]">
            <div className="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
                <h3 className="text-xs font-mono text-brand-gold">SYSTEM_LOGS_STREAM</h3>
                <div className="flex gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest">LIVE</span>
                </div>
            </div>
            <div className="overflow-auto custom-scrollbar flex-1 p-2">
                <table className="w-full text-left table-auto border-collapse border-spacing-y-1">
                    <tbody className="text-[10px] font-mono">
                        {logs.map((log, idx) => {
                            const styles = getLevelConfig(log.level);
                            return (
                                <tr key={log._id || idx} className={`transition-all border-b border-white/5 last:border-0 ${styles.rowClass}`}>
                                    <td className="p-3 text-gray-500 whitespace-nowrap align-top w-28">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </td>
                                    <td className="p-3 align-top w-24">{getLogLevelPill(log.level)}</td>
                                    <td className={`p-3 align-top break-words ${styles.textClass}`}>
                                        <div className="flex flex-col">
                                            <span>
                                                {log.message}
                                                {log.username && <span className="ml-2 opacity-60 font-normal text-[9px] border border-current px-1 rounded inline-block">User: {log.username}</span>}
                                            </span>
                                            {log.metadata && (
                                                <div className="mt-2 text-[9px] opacity-70 bg-black/40 p-2 rounded border border-white/10 overflow-x-auto whitespace-pre-wrap font-mono">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- MAIN DASHBOARD ---

const AdminDashboard: React.FC<AdminDashboardProps> = ({ token, backendUrl, onAudit, showToast, onLogout }) => {
    const [clients, setClients] = useState<User[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [metrics, setMetrics] = useState<GlobalDashboardMetrics | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings>({ supportWhatsappNumber: '', logLevel: 'INFO', dominionNetworkJid: '5491110000000@s.whatsapp.net', isOutboundKillSwitchActive: false });
    const [view, setView] = useState<AdminView>('dashboard');
    const [loading, setLoading] = useState(true);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [supportNumberInput, setSupportNumberInput] = useState('');

    // State for Test Bot
    const [selectedTestClient, setSelectedTestClient] = useState<string | null>(null);
    const [isTestBotRunning, setIsTestBotRunning] = useState(false);

    // State for Depth Control
    const [selectedDepthClient, setSelectedDepthClient] = useState<string | null>(null);
    const [newDepthLevel, setNewDepthLevel] = useState<number>(1);
    const [boostHours, setBoostHours] = useState(24);
    const [boostDelta, setBoostDelta] = useState(2);

    const fetchData = async () => {
        // Silent loading for updates
        try {
            const [clientsRes, logsRes, metricsRes, settingsRes] = await Promise.all([
                fetch(`${backendUrl}/api/admin/clients`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/logs`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/dashboard-metrics`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/admin/system/settings`, { headers: getAuthHeaders(token) })
            ]);
            
            if (clientsRes.ok) {
                const data = await clientsRes.json();
                setClients(Array.isArray(data) ? data : []);
            }
            if (logsRes.ok) setLogs(await logsRes.json());
            if (metricsRes.ok) setMetrics(await metricsRes.json());
            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                setSystemSettings(settings);
                // Only set local input if it hasn't been edited
                if(supportNumberInput === '') setSupportNumberInput(settings.supportWhatsappNumber || '');
            }
        } catch (e) {
            console.error("Fetch Error", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); 
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
                showToast('Ajuste aplicado.', 'success');
            }
        } catch (e) { showToast('Error de conexión.', 'error'); }
    };

    const handleSupportNumberSave = () => {
        updateSystemSettings({ supportWhatsappNumber: supportNumberInput });
    };

    const executeReset = async () => {
        if (resetConfirmation !== 'RESET') return;
        if (!confirm("⚠️ ¿CONFIRMAS EL RESETEO TOTAL? Se perderán todos los datos.")) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/system/reset`, { method: 'POST', headers: getAuthHeaders(token) });
            if (res.ok) {
                showToast("Sistema reseteado a fábrica.", 'success');
                setTimeout(onLogout, 2000);
            }
        } catch(e) {}
    };

    // --- Action Handlers (TestBot, Depth) ---
    // (Kept same logic as before, just ensuring they are wired up)
    const handleStartTestBot = async () => {
        if (!selectedTestClient) return;
        setIsTestBotRunning(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/test-bot/start`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ targetUserId: selectedTestClient })
            });
            if (res.ok) showToast("Simulación iniciada.", 'success');
            else showToast("Error al iniciar.", 'error');
        } catch (e) { showToast("Error de conexión.", 'error'); } 
        finally { setIsTestBotRunning(false); }
    };

    const handleUpdateDepth = async () => {
        if (!selectedDepthClient) return;
        try {
            const res = await fetch(`${backendUrl}/api/admin/depth/update`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ userId: selectedDepthClient, depthLevel: newDepthLevel })
            });
            if (res.ok) showToast('Nivel actualizado.', 'success');
        } catch(e) { showToast('Error.', 'error'); }
    };

    // --- Helpers ---
    const getPlanPill = (status: string, type: string) => {
        const style = status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 
                      status === 'trial' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 
                      'bg-red-500/10 text-red-400 border-red-500/30';
        return (
            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${style}`}>
                {type.toUpperCase()} • {status}
            </span>
        );
    };

    const getLogLevelPill = (level: string) => {
        let color = 'text-gray-400 bg-gray-500/10 border-gray-500/20';
        if (level === 'ERROR') color = 'text-red-400 bg-red-500/10 border-red-500/20';
        if (level === 'WARN') color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
        if (level === 'AUDIT') color = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        if (level === 'INFO') color = 'text-blue-400 bg-blue-500/10 border-blue-500/20';

        return <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${color}`}>{level}</span>;
    };

    const tabs: { id: AdminView, label: string, icon: string }[] = [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'clients', label: 'Clientes', icon: '👥' },
        { id: 'network', label: 'Red Dominion', icon: '🌐' },
        { id: 'depth_control', label: 'Depth Engine', icon: '🧠' },
        { id: 'test_bot', label: 'Simulador', icon: '🧪' },
        { id: 'testimonials', label: 'Reviews', icon: '⭐' },
        { id: 'logs', label: 'Logs', icon: '📜' },
    ];

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
            <div className="max-w-7xl mx-auto pb-32">
                
                {/* TOP HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">
                            Dominion <span className="text-brand-gold">God Mode</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Sistema Operativo Central</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setView(tab.id)}
                                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${view === tab.id ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span className="text-sm">{tab.icon}</span>
                                    <span className="hidden lg:inline">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={onLogout} className="p-3 bg-red-900/20 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white transition-all">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-50">
                        <div className="w-16 h-16 border-4 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin mb-4"></div>
                        <p className="text-xs font-black uppercase tracking-widest text-brand-gold">Sincronizando Nodos...</p>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        {/* VIEW: DASHBOARD */}
                        {view === 'dashboard' && metrics && (
                            <div className="space-y-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <KpiCard label="MRR Mensual" value={metrics.mrr} isCurrency icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                                    <KpiCard label="Clientes Totales" value={metrics.totalClients} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg>} />
                                    <KpiCard label="Leads Activos" value={metrics.hotLeads} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.25-5.5S14 4 14 4V3c-1-.5-3-2-3-2V2s-1-.5-3-2c0 0 0 0 0 0L4 12v3l2.657 2.657z" /></svg>} trend={`${metrics.globalLeads} Totales`} />
                                    <KpiCard label="Nodos Online" value={metrics.onlineNodes} icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
                                </div>

                                <SectionHeader title="Gestión de Producto" subtitle="Configuración de Landing Page y Precios" />
                                <LandingPageManager settings={systemSettings} onSave={updateSystemSettings} />

                                <SectionHeader title="Configuración de Sistema" subtitle="Variables Globales y Seguridad" />
                                <div className="bg-brand-surface border border-white/5 rounded-2xl p-8 shadow-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">WhatsApp Soporte</label>
                                        <div className="flex gap-2">
                                            <input value={supportNumberInput} onChange={e => setSupportNumberInput(e.target.value)} className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs" />
                                            <button onClick={handleSupportNumberSave} className="px-3 bg-brand-gold text-black rounded-lg text-[10px] font-bold">Guardar</button>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Kill Switch (Emergencia)</label>
                                        <button onClick={() => updateSystemSettings({ isOutboundKillSwitchActive: !systemSettings.isOutboundKillSwitchActive })} className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${systemSettings.isOutboundKillSwitchActive ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600/20 text-green-400 border border-green-600/30'}`}>
                                            {systemSettings.isOutboundKillSwitchActive ? '⚠️ SISTEMA BLOQUEADO' : 'SISTEMA OPERATIVO'}
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Zona de Peligro</label>
                                        <div className="flex gap-2">
                                            <input placeholder='"RESET"' value={resetConfirmation} onChange={e => setResetConfirmation(e.target.value)} className="flex-1 bg-red-900/10 border border-red-500/20 rounded-lg p-2 text-red-200 text-xs placeholder-red-500/30" />
                                            <button onClick={executeReset} disabled={resetConfirmation !== 'RESET'} className="px-4 bg-red-600 text-white rounded-lg text-[10px] font-bold disabled:opacity-50">NUKE</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VIEW: CLIENTS */}
                        {view === 'clients' && (
                            <ClientTable clients={clients} getPlanPill={getPlanPill} onAudit={onAudit} />
                        )}

                        {/* VIEW: LOGS */}
                        {view === 'logs' && (
                            <LogTable logs={logs} getLogLevelPill={getLogLevelPill} />
                        )}

                        {/* VIEW: DEPTH CONTROL */}
                        {view === 'depth_control' && (
                            <div className="max-w-3xl mx-auto space-y-8">
                                <SectionHeader title="Depth Engine" subtitle="Gestión de Potencia Cognitiva" />
                                <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 space-y-8">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-500 font-bold block mb-2">Cliente Objetivo</label>
                                            <select value={selectedDepthClient || ''} onChange={e => { setSelectedDepthClient(e.target.value); const c = clients.find(cl => cl.id === e.target.value); if(c) setNewDepthLevel(c.depthLevel || 1); }} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-brand-gold">
                                                <option value="">Seleccionar...</option>
                                                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name} (Lvl {c.depthLevel})</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <div className="w-full bg-black/30 rounded-xl p-3 border border-white/5 flex items-center justify-between">
                                                <span className="text-xs text-gray-400 font-bold">Nivel Actual</span>
                                                <span className="text-xl font-black text-brand-gold">{selectedDepthClient ? newDepthLevel : '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedDepthClient && (
                                        <div className="space-y-6 pt-6 border-t border-white/5 animate-fade-in">
                                            <div>
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-xs text-brand-gold font-bold uppercase">Ajuste de Nivel Base</label>
                                                    <span className="text-xs text-white font-bold">{newDepthLevel}/10</span>
                                                </div>
                                                <input type="range" min="1" max="10" value={newDepthLevel} onChange={e => setNewDepthLevel(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold" />
                                                <button onClick={handleUpdateDepth} className="mt-4 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">Actualizar Nivel</button>
                                            </div>

                                            <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-6">
                                                <h4 className="text-sm font-black text-purple-400 uppercase tracking-widest mb-4">Inyección de Neuro-Boost</h4>
                                                <div className="grid grid-cols-2 gap-4 mb-4">
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Potencia (+Lvl)</label>
                                                        <input type="number" value={boostDelta} onChange={e => setBoostDelta(Number(e.target.value))} className="w-full bg-black/50 border border-purple-500/30 rounded-lg p-2 text-white text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Duración (Horas)</label>
                                                        <input type="number" value={boostHours} onChange={e => setBoostHours(Number(e.target.value))} className="w-full bg-black/50 border border-purple-500/30 rounded-lg p-2 text-white text-center" />
                                                    </div>
                                                </div>
                                                <button onClick={() => {/* Call boost handler */}} className="w-full py-3 bg-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-500 shadow-lg shadow-purple-600/20 transition-all">Aplicar Boost</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* VIEW: TEST BOT */}
                        {view === 'test_bot' && (
                            <div className="max-w-2xl mx-auto space-y-8">
                                <SectionHeader title="Simulador Elite" subtitle="Entorno de Pruebas de Regresión" />
                                <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 space-y-6 shadow-xl">
                                    <div>
                                        <label className="text-xs text-gray-500 font-bold block mb-2">Cliente a Simular</label>
                                        <select value={selectedTestClient || ''} onChange={e => setSelectedTestClient(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-brand-gold">
                                            <option value="">Seleccionar...</option>
                                            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name} ({c.username})</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-4 items-start">
                                        <div className="text-2xl">🤖</div>
                                        <p className="text-xs text-blue-200 leading-relaxed">
                                            Al iniciar, el sistema creará un chat falso ("Simulador Neural") en la cuenta del cliente y ejecutará un guion de venta completo para verificar que la IA responde correctamente a objeciones y cierres.
                                        </p>
                                    </div>

                                    <button onClick={handleStartTestBot} disabled={!selectedTestClient || isTestBotRunning} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50 disabled:grayscale">
                                        {isTestBotRunning ? 'Ejecutando Prueba...' : 'Iniciar Simulación'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIEW: NETWORK PLACEHOLDER */}
                        {view === 'network' && (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="text-4xl mb-4">🌐</div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Red Dominion Global</h3>
                                <p className="text-gray-500 text-xs mt-2">Métricas agregadas de la red de intercambio de leads.</p>
                                <div className="mt-8 grid grid-cols-2 gap-8">
                                    <div className="bg-black/30 p-6 rounded-2xl border border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Nodos Activos</p>
                                        <p className="text-3xl font-black text-blue-400">--</p>
                                    </div>
                                    <div className="bg-black/30 p-6 rounded-2xl border border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Leads Intercambiados</p>
                                        <p className="text-3xl font-black text-brand-gold">--</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* VIEW: TESTIMONIALS MANAGER */}
                        {view === 'testimonials' && (
                             <div className="max-w-5xl mx-auto space-y-8">
                                <SectionHeader title="Gestor de Testimonios" subtitle="Administración de Reseñas para la Landing Page" />
                                <TestimonialManager token={token} backendUrl={backendUrl} showToast={showToast} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
