
import React, { useState, useEffect } from 'react';
import { Campaign, WhatsAppGroup } from '../types';
import { getAuthHeaders } from '../config';

interface CampaignsPanelProps {
    token: string;
    backendUrl: string;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CampaignsPanel: React.FC<CampaignsPanelProps> = ({ token, backendUrl, showToast }) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [view, setView] = useState<'LIST' | 'CREATE'>('LIST');
    const [loading, setLoading] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [scheduleType, setScheduleType] = useState<'ONCE' | 'DAILY'>('ONCE');

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/campaigns`, { headers: getAuthHeaders(token) });
            if (res.ok) setCampaigns(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/whatsapp/groups`, { headers: getAuthHeaders(token) });
            if (res.ok) setGroups(await res.json());
            else showToast('No se pudieron cargar los grupos. ¿Bot conectado?', 'error');
        } catch (e) {
            showToast('Error de red al cargar grupos.', 'error');
        }
    };

    const handleCreateClick = () => {
        setView('CREATE');
        fetchGroups();
    };

    const handleSave = async () => {
        if (!name || !message || selectedGroups.length === 0) {
            showToast('Completa todos los campos obligatorios.', 'error');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                name,
                message,
                groups: selectedGroups,
                schedule: { type: scheduleType, startDate: new Date().toISOString() }, // Default run now
                config: { minDelaySec: 5, maxDelaySec: 20 }
            };

            const res = await fetch(`${backendUrl}/api/campaigns`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast('Campaña creada (Borrador).', 'success');
                setView('LIST');
                fetchCampaigns();
                // Reset form
                setName(''); setMessage(''); setSelectedGroups([]);
            } else {
                showToast('Error al crear campaña.', 'error');
            }
        } catch (e) {
            showToast('Error de conexión.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (campaign: Campaign) => {
        const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        try {
            const res = await fetch(`${backendUrl}/api/campaigns/${campaign.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                fetchCampaigns();
                showToast(`Campaña ${newStatus === 'ACTIVE' ? 'Activada' : 'Pausada'}.`, 'info');
            }
        } catch (e) { console.error(e); }
    };

    const deleteCampaign = async (id: string) => {
        if(!confirm('¿Eliminar campaña?')) return;
        try {
            await fetch(`${backendUrl}/api/campaigns/${id}`, { method: 'DELETE', headers: getAuthHeaders(token) });
            fetchCampaigns();
        } catch(e) {}
    };

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in">
            <div className="max-w-6xl mx-auto space-y-8 pb-32">
                <header className="flex justify-between items-end border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Motor de <span className="text-brand-gold">Campañas</span></h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Broadcast Táctico Autónomo</p>
                    </div>
                    {view === 'LIST' && (
                        <button onClick={handleCreateClick} className="px-6 py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20">
                            + Nueva Campaña
                        </button>
                    )}
                </header>

                {view === 'CREATE' ? (
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Configuración de Impacto</h3>
                            <button onClick={() => setView('LIST')} className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest">Cancelar</button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Nombre de la Campaña</label>
                                <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" placeholder="Ej: Promo Verano - Grupos VIP" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Mensaje (Rich Text)</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none" placeholder="Hola equipo, les comparto..." />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Grupos Objetivo ({selectedGroups.length})</label>
                                <div className="bg-black/50 border border-white/10 rounded-xl p-4 max-h-60 overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {groups.length === 0 ? <p className="text-xs text-gray-500 col-span-2 text-center">Cargando grupos o no hay grupos disponibles...</p> : groups.map(g => (
                                        <div key={g.id} onClick={() => {
                                            if (selectedGroups.includes(g.id)) setSelectedGroups(prev => prev.filter(id => id !== g.id));
                                            else setSelectedGroups(prev => [...prev, g.id]);
                                        }} className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${selectedGroups.includes(g.id) ? 'bg-brand-gold/20 border-brand-gold text-white' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xs font-bold truncate pr-2">{g.subject}</span>
                                            <span className="text-[9px] bg-black/40 px-2 py-0.5 rounded text-gray-500">{g.size || '?'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <button onClick={handleSave} disabled={loading} className="w-full py-4 bg-white/10 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-brand-gold hover:text-black transition-all disabled:opacity-50">
                                    {loading ? 'Creando...' : 'Guardar Borrador'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {campaigns.length === 0 && (
                            <div className="text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">No hay campañas activas.</p>
                            </div>
                        )}
                        {campaigns.map(c => (
                            <div key={c.id} className="bg-brand-surface border border-white/5 rounded-2xl p-6 hover:bg-white/5 transition-all group">
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                                    <div>
                                        <h3 className="text-lg font-black text-white">{c.name}</h3>
                                        <div className="flex gap-4 mt-2 text-[10px] font-mono text-gray-500">
                                            <span>GRUPOS: {c.groups.length}</span>
                                            <span>ENVIADOS: {c.stats.totalSent}</span>
                                            <span className="text-red-400">FALLOS: {c.stats.totalFailed}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded text-[9px] font-black uppercase border ${c.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' : (c.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30')}`}>
                                            {c.status}
                                        </span>
                                        {c.status !== 'COMPLETED' && (
                                            <button onClick={() => toggleStatus(c)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full hover:bg-brand-gold hover:text-black transition-all">
                                                {c.status === 'ACTIVE' ? '⏸' : '▶'}
                                            </button>
                                        )}
                                        <button onClick={() => deleteCampaign(c.id)} className="w-8 h-8 flex items-center justify-center bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">✕</button>
                                    </div>
                                </div>
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                    <p className="text-xs text-gray-400 italic line-clamp-2">"{c.message}"</p>
                                </div>
                                {c.stats.nextRunAt && c.status === 'ACTIVE' && (
                                    <p className="text-[9px] text-brand-gold font-bold uppercase tracking-widest mt-3 text-right animate-pulse">
                                        Próxima ejecución: {new Date(c.stats.nextRunAt).toLocaleTimeString()}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CampaignsPanel;
