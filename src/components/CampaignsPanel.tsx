
import React, { useState, useEffect, useMemo } from 'react';
import { Campaign, WhatsAppGroup } from '../types';
import { getAuthHeaders } from '../config';

interface CampaignsPanelProps {
    token: string;
    backendUrl: string;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const DAYS_OF_WEEK = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const CampaignsPanel: React.FC<CampaignsPanelProps> = ({ token, backendUrl, showToast }) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
    const [view, setView] = useState<'LIST' | 'CREATE'>('LIST');
    const [loading, setLoading] = useState(false);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [scheduleType, setScheduleType] = useState<'ONCE' | 'DAILY' | 'WEEKLY'>('ONCE');
    const [image, setImage] = useState<string | null>(null);
    
    // Scheduling Configs
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
    const [scheduledTime, setScheduledTime] = useState('09:00'); // HH:MM
    const [selectedDays, setSelectedDays] = useState<number[]>([]); // 0-6

    // Anti-Ban Configs
    const [startHour, setStartHour] = useState(9);
    const [endHour, setEndHour] = useState(20);
    const [useSpintax, setUseSpintax] = useState(true);

    // Conflict Detection Logic (Client Side - Uses Local Time, assuming user is in ARG or compatible)
    const timeConflict = useMemo(() => {
        if (!scheduledTime) return null;
        const hour = parseInt(scheduledTime.split(':')[0]);
        
        let isOutside = false;
        if (startHour <= endHour) {
            isOutside = hour < startHour || hour >= endHour;
        } else {
            isOutside = hour < startHour && hour >= endHour;
        }

        return isOutside ? { hour, start: startHour, end: endHour } : null;
    }, [scheduledTime, startHour, endHour]);

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
        setEditingId(null);
        resetForm();
        setView('CREATE');
        fetchGroups();
    };

    const handleEditClick = (campaign: Campaign) => {
        setEditingId(campaign.id);
        setName(campaign.name);
        setMessage(campaign.message);
        setSelectedGroups(campaign.groups);
        setScheduleType(campaign.schedule.type);
        setImage(campaign.imageUrl || null);
        
        // Parse dates
        if (campaign.schedule.startDate) {
            // Keep ISO substring for date input
            setStartDate(campaign.schedule.startDate.split('T')[0]);
        }
        setScheduledTime(campaign.schedule.time || '09:00');
        setSelectedDays(campaign.schedule.daysOfWeek || []);
        
        if (campaign.config.operatingWindow) {
            setStartHour(campaign.config.operatingWindow.startHour);
            setEndHour(campaign.config.operatingWindow.endHour);
        }
        setUseSpintax(campaign.config.useSpintax);

        setView('CREATE');
        fetchGroups();
    };

    const resetForm = () => {
        setName('');
        setMessage('');
        setSelectedGroups([]);
        setImage(null);
        setSelectedDays([]);
        setScheduledTime('09:00');
        setStartDate(new Date().toISOString().split('T')[0]);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setImage(null);
    };

    const toggleDay = (dayIndex: number) => {
        if (selectedDays.includes(dayIndex)) {
            setSelectedDays(prev => prev.filter(d => d !== dayIndex));
        } else {
            setSelectedDays(prev => [...prev, dayIndex].sort());
        }
    };

    const handleSave = async () => {
        if (!name || (!message && !image) || selectedGroups.length === 0) {
            showToast('Debes incluir un nombre, grupos y un mensaje o imagen.', 'error');
            return;
        }

        if (scheduleType === 'WEEKLY' && selectedDays.length === 0) {
            showToast('Selecciona al menos un día de la semana para la campaña semanal.', 'error');
            return;
        }

        if (timeConflict) {
            if(!confirm("⚠️ ADVERTENCIA: La hora programada está fuera de la ventana operativa. La campaña NO arrancará hasta que abras el horario. ¿Deseas continuar igual?")) {
                return;
            }
        }

        setLoading(true);
        try {
            const combinedStart = new Date(`${startDate}T${scheduledTime}:00`).toISOString();

            const payload = {
                name,
                message,
                imageUrl: image,
                groups: selectedGroups,
                schedule: { 
                    type: scheduleType, 
                    startDate: combinedStart,
                    time: scheduledTime,
                    daysOfWeek: scheduleType === 'WEEKLY' ? selectedDays : undefined
                },
                config: { 
                    minDelaySec: 5, 
                    maxDelaySec: 25,
                    operatingWindow: { startHour, endHour },
                    useSpintax
                },
                status: 'ACTIVE' // Explicitly set to ACTIVE to trigger rescheduling on backend
            };

            let res;
            if (editingId) {
                res = await fetch(`${backendUrl}/api/campaigns/${editingId}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(token),
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${backendUrl}/api/campaigns`, {
                    method: 'POST',
                    headers: getAuthHeaders(token),
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                showToast(editingId ? 'Campaña actualizada y reprogramada.' : 'Campaña programada exitosamente.', 'success');
                setView('LIST');
                fetchCampaigns();
                resetForm();
                setEditingId(null);
            } else {
                showToast('Error al guardar campaña.', 'error');
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

    const executeNow = async (campaign: Campaign) => {
        if(!confirm(`⚠️ ATENCIÓN: ¿Disparar "${campaign.name}" AHORA MISMO?\n\nEsto omitirá la fecha programada y el horario anti-molestia.`)) return;
        
        try {
            const res = await fetch(`${backendUrl}/api/campaigns/${campaign.id}/execute`, {
                method: 'POST',
                headers: getAuthHeaders(token)
            });
            
            if (res.ok) {
                showToast('🚀 Ejecución forzada iniciada.', 'success');
                fetchCampaigns(); // Refresh stats
            } else {
                showToast('Error al forzar ejecución.', 'error');
            }
        } catch (e) {
            showToast('Error de red.', 'error');
        }
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
                        <div className="flex gap-2">
                            <button onClick={fetchCampaigns} className="w-10 h-10 flex items-center justify-center bg-white/5 text-gray-400 rounded-xl hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                ↻
                            </button>
                            <button onClick={handleCreateClick} className="px-6 py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20">
                                + Nueva Campaña
                            </button>
                        </div>
                    )}
                </header>

                {view === 'CREATE' ? (
                    <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">{editingId ? 'Editar Campaña' : 'Configuración de Impacto'}</h3>
                            <button onClick={() => { setView('LIST'); setEditingId(null); resetForm(); }} className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest">Cancelar</button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Nombre de la Campaña</label>
                                    <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" placeholder="Ej: Promo Verano - Grupos VIP" />
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest">Mensaje (Caption)</label>
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" checked={useSpintax} onChange={e => setUseSpintax(e.target.checked)} className="w-3 h-3 rounded bg-black border-white/20 accent-brand-gold" />
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">Spintax (Variaciones)</span>
                                        </div>
                                    </div>
                                    <textarea value={message} onChange={e => setMessage(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-40 focus:border-brand-gold outline-none resize-none" placeholder={useSpintax ? "{Hola|Buen día|Saludos}, les comparto esta {oferta|oportunidad}..." : "Escribe tu mensaje..."} />
                                    {useSpintax && (
                                        <p className="text-[9px] text-gray-500 mt-2 italic">
                                            Tip: Usa <strong>{'{Hola|Buenas}'}</strong> para rotar palabras. Usa <strong>{'{group_name}'}</strong> para insertar el nombre del grupo.
                                        </p>
                                    )}
                                </div>

                                {/* IMAGE UPLOAD */}
                                <div>
                                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Imagen Táctica (Opcional)</label>
                                    <div className="flex items-center gap-4">
                                        <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            Adjuntar Imagen
                                            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                                        </label>
                                        {image && (
                                            <div className="relative group">
                                                <img src={image} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-brand-gold/30" />
                                                <button onClick={handleRemoveImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-lg">✕</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* SCHEDULING SECTION */}
                                <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest">Programación de Disparo</label>
                                            <span className="text-[9px] text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">Zona: GMT-3 (ARG)</span>
                                        </div>
                                        <div className="flex gap-2 mb-4">
                                            {(['ONCE', 'DAILY', 'WEEKLY'] as const).map(type => (
                                                <button 
                                                    key={type}
                                                    onClick={() => setScheduleType(type)}
                                                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${scheduleType === type ? 'bg-brand-gold text-black' : 'bg-black/40 text-gray-500 border border-white/5 hover:text-white'}`}
                                                >
                                                    {type === 'ONCE' ? 'Una Vez' : (type === 'DAILY' ? 'Diario' : 'Semanal')}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <span className="text-[9px] text-gray-500 font-bold block mb-1">Fecha de Inicio</span>
                                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-sm" />
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-gray-500 font-bold block mb-1">Hora de Ejecución</span>
                                                <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-sm" />
                                            </div>
                                        </div>

                                        {scheduleType === 'WEEKLY' && (
                                            <div className="mt-4">
                                                <span className="text-[9px] text-gray-500 font-bold block mb-2">Días de Ejecución</span>
                                                <div className="flex justify-between gap-1">
                                                    {DAYS_OF_WEEK.map((day, idx) => (
                                                        <button 
                                                            key={idx}
                                                            onClick={() => toggleDay(idx)}
                                                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${selectedDays.includes(idx) ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'bg-black/40 text-gray-500 border border-white/5 hover:border-white/20'}`}
                                                        >
                                                            {day}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* OPERATING WINDOW */}
                                    <div className="border-t border-white/5 pt-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest">Ventana Operativa (Anti-Molestia)</label>
                                            {timeConflict && (
                                                <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 px-3 py-1.5 rounded-lg animate-pulse">
                                                    <span className="text-[10px] text-red-400 font-bold uppercase">⚠️ Conflicto Horario</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <span className="text-[9px] text-gray-500 font-bold block mb-1">Hora Inicio</span>
                                                <input type="number" min="0" max="23" value={startHour} onChange={e => setStartHour(parseInt(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-center font-mono" />
                                            </div>
                                            <span className="text-gray-600 font-black">➔</span>
                                            <div className="flex-1">
                                                <span className="text-[9px] text-gray-500 font-bold block mb-1">Hora Fin</span>
                                                <input type="number" min="0" max="23" value={endHour} onChange={e => setEndHour(parseInt(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-center font-mono" />
                                            </div>
                                        </div>
                                        
                                        {timeConflict ? (
                                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                                <p className="text-[10px] text-red-300 leading-relaxed font-medium">
                                                    <strong>Error:</strong> Has programado el envío a las <strong className="text-white">{timeConflict.hour}:00</strong>, pero la ventana operativa solo permite envíos entre las <strong className="text-white">{timeConflict.start}:00</strong> y las <strong className="text-white">{timeConflict.end}:00</strong>.
                                                    <br/>
                                                    <span className="text-[9px] opacity-80 mt-1 block">&gt;&gt; Ajusta el horario o amplia la ventana.</span>
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[9px] text-gray-600 mt-2 italic">El sistema verificará la hora Argentina antes de enviar.</p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Grupos Objetivo ({selectedGroups.length})</label>
                                    <div className="bg-black/50 border border-white/10 rounded-xl p-4 max-h-48 overflow-y-auto custom-scrollbar grid grid-cols-1 gap-2">
                                        {groups.length === 0 ? <p className="text-xs text-gray-500 text-center">Cargando grupos...</p> : groups.map(g => (
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
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <button onClick={handleSave} disabled={loading} className="w-full py-4 bg-white/10 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-brand-gold hover:text-black transition-all disabled:opacity-50">
                                {loading ? 'Procesando...' : (editingId ? 'Actualizar Campaña' : 'Programar Campaña')}
                            </button>
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
                                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                                            {c.name}
                                            {c.imageUrl && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-bold uppercase">IMG</span>}
                                            {c.config.useSpintax && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30 font-bold uppercase">SPINTAX</span>}
                                        </h3>
                                        <div className="flex gap-4 mt-2 text-[10px] font-mono text-gray-500">
                                            <span className="text-brand-gold">{c.schedule.type}</span>
                                            <span>
                                                {c.schedule.time} {c.schedule.type === 'WEEKLY' && c.schedule.daysOfWeek && `[${c.schedule.daysOfWeek.map(d => DAYS_OF_WEEK[d]).join(',')}]`}
                                            </span>
                                            <span>GRUPOS: {c.groups.length}</span>
                                            <span>ENVIADOS: {c.stats.totalSent}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded text-[9px] font-black uppercase border ${c.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' : (c.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30')}`}>
                                            {c.status}
                                        </span>
                                        
                                        {/* IMMEDIATE EXECUTION BUTTON */}
                                        <button 
                                            onClick={() => executeNow(c)} 
                                            className="w-8 h-8 flex items-center justify-center bg-orange-500/10 text-orange-500 border border-orange-500/30 rounded-full hover:bg-orange-500 hover:text-white transition-all shadow-lg shadow-orange-500/10"
                                            title="EJECUTAR AHORA (Omitir Horario)"
                                        >
                                            ⚡
                                        </button>

                                        {/* EDIT BUTTON */}
                                        <button onClick={() => handleEditClick(c)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full hover:bg-brand-gold hover:text-black transition-all text-gray-400">
                                            ✎
                                        </button>
                                        
                                        {c.status !== 'COMPLETED' && (
                                            <button onClick={() => toggleStatus(c)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full hover:bg-brand-gold hover:text-black transition-all">
                                                {c.status === 'ACTIVE' ? '⏸' : '▶'}
                                            </button>
                                        )}
                                        <button onClick={() => deleteCampaign(c.id)} className="w-8 h-8 flex items-center justify-center bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">✕</button>
                                    </div>
                                </div>
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex gap-3 items-center">
                                    {c.imageUrl && (
                                        <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden border border-white/10">
                                            <img src={c.imageUrl} alt="Campaign" className="w-full h-full object-cover opacity-80" />
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-400 italic line-clamp-2">{c.message || "(Solo Imagen)"}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CampaignsPanel;
