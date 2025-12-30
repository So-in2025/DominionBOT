
import React, { useEffect, useState } from 'react';
import { GlobalMetrics, User, View } from '../../types';

interface GlobalControlProps {
    token: string;
    backendUrl: string;
    onAudit: (userId: string) => void;
}

const GlobalControl: React.FC<GlobalControlProps> = ({ token, backendUrl, onAudit }) => {
    const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
    const [users, setUsers] = useState<Partial<User>[]>([]);

    const fetchData = async () => {
        const [mRes, uRes] = await Promise.all([
            fetch(`${backendUrl}/api/admin/metrics`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${backendUrl}/api/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        if (mRes.ok) setMetrics(await mRes.json());
        if (uRes.ok) setUsers(await uRes.json());
    };

    useEffect(() => { fetchData(); }, []);

    const updateGovernance = async (userId: string, state: string) => {
        const res = await fetch(`${backendUrl}/api/admin/update-governance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ userId, governance: { systemState: state } })
        });
        if (res.ok) fetchData();
    };

    return (
        <div className="flex-1 bg-brand-black p-8 overflow-y-auto custom-scrollbar font-sans">
            <div className="max-w-[1200px] mx-auto space-y-8">
                {/* Global Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-brand-surface border border-white/5 p-6 rounded-2xl">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Vendedores Activos</p>
                        <h3 className="text-3xl font-black text-brand-gold">{metrics?.activeVendors || 0}</h3>
                    </div>
                    <div className="bg-brand-surface border border-white/5 p-6 rounded-2xl">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Nodos Online</p>
                        <h3 className="text-3xl font-black text-green-500">{metrics?.onlineNodes || 0}</h3>
                    </div>
                    <div className="bg-brand-surface border border-white/5 p-6 rounded-2xl">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Leads Totales</p>
                        <h3 className="text-3xl font-black text-white">{metrics?.globalLeads || 0}</h3>
                    </div>
                    <div className="bg-brand-surface border border-white/5 p-6 rounded-2xl">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Risk Score Alto</p>
                        <h3 className="text-3xl font-black text-red-500">{metrics?.riskAccountsCount || 0}</h3>
                    </div>
                </div>

                {/* User Governance Table */}
                <div className="bg-brand-surface border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Gobernanza de Cuentas</h3>
                        <span className="text-[10px] text-gray-500 font-mono">Control Centralizado v2.6</span>
                    </div>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase font-black tracking-widest bg-black/40">
                                <th className="p-5">Node / Tenant</th>
                                <th className="p-5">Risk</th>
                                <th className="p-5">Estado</th>
                                <th className="p-5 text-right">Acciones de Control</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-brand-gold text-black flex items-center justify-center font-black text-xs">
                                                {user.username?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">{user.username}</p>
                                                <p className="text-[9px] text-gray-500">{user.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex flex-col gap-1">
                                            <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-red-500" style={{ width: `${user.governance?.riskScore || 0}%` }}></div>
                                            </div>
                                            <span className="text-[9px] text-gray-500 font-bold uppercase">{user.governance?.riskScore || 0}% Score</span>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${user.governance?.systemState === 'ACTIVE' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {user.governance?.systemState}
                                        </span>
                                    </td>
                                    <td className="p-5 text-right space-x-2">
                                        <button onClick={() => onAudit(user.id!)} className="text-[9px] font-black uppercase bg-white/5 text-gray-400 px-3 py-1.5 rounded hover:text-white transition-all">Audit</button>
                                        <button 
                                            onClick={() => updateGovernance(user.id!, user.governance?.systemState === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
                                            className={`text-[9px] font-black uppercase px-3 py-1.5 rounded transition-all ${user.governance?.systemState === 'ACTIVE' ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white'}`}
                                        >
                                            {user.governance?.systemState === 'ACTIVE' ? 'Suspend' : 'Resume'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default GlobalControl;
