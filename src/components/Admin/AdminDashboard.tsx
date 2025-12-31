
import React, { useEffect, useState } from 'react';
import { GlobalTelemetry, User, SystemState } from '../../types';
import { getAuthHeaders } from '../../config';

interface AdminDashboardProps {
    token: string;
    backendUrl: string; 
    onAudit: (user: User) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ token, backendUrl, onAudit }) => {
    const [telemetry, setTelemetry] = useState<GlobalTelemetry | null>(null);
    const [accounts, setAccounts] = useState<User[]>([]);
    const [isResetting, setIsResetting] = useState(false);

    const fetchGlobal = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/admin/metrics`, { headers: getAuthHeaders(token) });
            if (res.ok) setTelemetry(await res.json());
            
            const uRes = await fetch(`${backendUrl}/api/admin/users`, { headers: getAuthHeaders(token) });
            if (uRes.ok) setAccounts(await uRes.json());
        } catch (e) {
            console.error("Admin Dashboard Error:", e);
        }
    };

    useEffect(() => {
        fetchGlobal();
    }, [token, backendUrl]);

    const handleHardReset = async () => {
        const firstConfirm = confirm("⚠️ ATENCIÓN: Estás a punto de ejecutar un HARD RESET del sistema. Se borrarán todos los clientes, conversaciones y sesiones de WhatsApp. ¿Proceder?");
        if (!firstConfirm) return;

        const secondConfirm = prompt("Para confirmar, escribe 'RESETEAR' en mayúsculas:");
        if (secondConfirm !== 'RESETEAR') return;

        setIsResetting(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/system/reset`, {
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            if (res.ok) {
                alert("Base de datos purgada. El sistema se reiniciará visualmente.");
                window.location.reload();
            } else {
                alert("Error al intentar resetear.");
            }
        } catch (e) {
            alert("Error de conexión.");
        } finally {
            setIsResetting(false);
        }
    };

    const kpi = (label: string, value: string | number, color = "text-white") => (
        <div className="bg-brand-surface border border-white/5 p-6 rounded-xl relative overflow-hidden group">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-white opacity-0 group-hover:opacity-[0.03] rounded-full blur-xl transition-opacity"></div>
        </div>
    );

    return (
        <div className="flex-1 bg-brand-black p-8 overflow-y-auto custom-scrollbar font-sans">
            <div className="max-w-[1400px] mx-auto space-y-8 animate-fade-in">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-6 gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Nodo de Control Global</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">SaaS Governance v2.7 Elite Edition</p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={handleHardReset}
                            disabled={isResetting}
                            className={`px-4 py-2 border border-red-500/30 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg ${isResetting ? 'opacity-50 animate-pulse' : ''}`}
                        >
                            {isResetting ? 'Purgando...' : 'Hard Reset DB'}
                        </button>
                        <span className="text-[10px] text-green-500 font-black px-3 py-2 bg-green-500/10 border border-green-500/20 rounded uppercase tracking-widest">SISTEMA SALUDABLE</span>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {kpi("Vendedores Totales", telemetry?.totalVendors || 0)}
                    {kpi("Nodos En Línea", telemetry?.activeNodes || 0, "text-green-500")}
                    {kpi("Señales (IA)", telemetry?.totalSignalsProcessed || 0, "text-brand-gold")}
                    {kpi("Alerta de Riesgo", telemetry?.riskAccounts || 0, telemetry?.riskAccounts ? "text-red-500" : "text-gray-500")}
                </div>

                <section className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 bg-black/40 border-b border-white/5 flex justify-between items-center">
                        <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Ecosistema de Nodos</h3>
                        <button onClick={fetchGlobal} className="text-[9px] text-brand-gold font-bold uppercase hover:underline">Refrescar</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[9px] uppercase font-black text-gray-600 border-b border-white/5 tracking-widest bg-black/20">
                                    <th className="p-6">Vendedor</th>
                                    <th className="p-6">Estado IA</th>
                                    <th className="p-6">Gobernanza</th>
                                    <th className="p-6 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {accounts.length > 0 ? accounts.map(acc => (
                                    <tr key={acc.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-6">
                                            <p className="text-sm font-bold text-white group-hover:text-brand-gold transition-colors">{acc.username}</p>
                                            <p className="text-[10px] text-gray-500 font-mono opacity-60">{acc.id.substring(0,8)}</p>
                                        </td>
                                        <td className="p-6">
                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${acc.settings.isActive ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-gray-500/10 text-gray-500 border border-white/10'}`}>
                                                {acc.settings.isActive ? 'En Línea' : 'Pausado'}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <div className={`flex items-center gap-2 text-[10px] font-black uppercase ${acc.governance.systemState === 'ACTIVE' ? 'text-green-500' : 'text-red-500'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${acc.governance.systemState === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                                                {acc.governance.systemState}
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button onClick={() => onAudit(acc)} className="text-[9px] font-black uppercase px-4 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg hover:bg-brand-gold hover:text-black hover:border-brand-gold transition-all">Auditar</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="p-10 text-center text-gray-600 italic text-sm">No hay nodos registrados en la infraestructura.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AdminDashboard;
