
import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../config';
import { User, IntentSignal, ConnectionOpportunity, NetworkProfile, BotSettings } from '../types';
import { formatPhoneNumber } from '../utils/textUtils';

interface NetworkPanelProps {
    token: string;
    backendUrl: string;
    currentUser: User | null;
    settings: BotSettings | null;
    onUpdateSettings: (newSettings: BotSettings) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const NETWORK_CATEGORIES = [
    'Marketing Digital', 'Desarrollo Web', 'Diseño Gráfico', 'Consultoría de Negocios',
    'Servicios Financieros', 'Real Estate', 'Coaching', 'E-commerce', 'Fitness y Salud',
    'Software SaaS', 'Eventos', 'Logística', 'Educación Online', 'Recursos Humanos'
];

const NetworkPanel: React.FC<NetworkPanelProps> = ({ token, backendUrl, currentUser, settings, onUpdateSettings, showToast }) => {
    const [activeTab, setActiveTab] = useState<'CONTRIBUTIONS' | 'OPPORTUNITIES' | 'SETTINGS'>('OPPORTUNITIES');
    const [isInitialLoading, setIsInitialLoading] = useState(true); // Changed from simple loading
    const [intentSignals, setIntentSignals] = useState<IntentSignal[]>([]);
    const [opportunities, setOpportunities] = useState<ConnectionOpportunity[]>([]
);
    const [networkProfile, setNetworkProfile] = useState<NetworkProfile | null>(null);

    const fetchNetworkData = useCallback(async (isPolling = false) => {
        if (!isPolling) setIsInitialLoading(true);
        try {
            const [signalsRes, opportunitiesRes, profileRes] = await Promise.all([
                fetch(`${backendUrl}/api/network/signals`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/network/opportunities`, { headers: getAuthHeaders(token) }),
                fetch(`${backendUrl}/api/network/profile`, { headers: getAuthHeaders(token) }),
            ]);

            if (signalsRes.ok) setIntentSignals(await signalsRes.json());
            if (opportunitiesRes.ok) setOpportunities(await opportunitiesRes.json());
            if (profileRes.ok) setNetworkProfile(await profileRes.json());

        } catch (error) {
            console.error("Error fetching network data:", error);
            if(!isPolling) showToast("Error al cargar datos de la red.", "error");
        } finally {
            if (!isPolling) setIsInitialLoading(false);
        }
    }, [token, backendUrl, showToast]);

    useEffect(() => {
        fetchNetworkData(false);
        const interval = setInterval(() => fetchNetworkData(true), 15000); // Silent poll every 15s
        return () => clearInterval(interval);
    }, [fetchNetworkData]);

    const handleToggleNetworkEnabled = async () => {
        if (!settings || !currentUser) return;
        const newStatus = !settings.isNetworkEnabled;
        onUpdateSettings({ ...settings, isNetworkEnabled: newStatus });
        
        // Also update network profile's enabled status
        if (networkProfile) {
            await saveNetworkProfile({ ...networkProfile, networkEnabled: newStatus });
        } else {
            // If no profile exists, create a default one with the new status
            await saveNetworkProfile({ networkEnabled: newStatus, categoriesOfInterest: [], contributionScore: 0, receptionScore: 0 });
        }
        showToast(`Red Dominion ${newStatus ? 'Activada' : 'Desactivada'}`, 'info');
        setTimeout(() => fetchNetworkData(true), 500);
    };

    const handleToggleCategory = (category: string) => {
        if (!networkProfile) return;
        const newCategories = networkProfile.categoriesOfInterest.includes(category)
            ? networkProfile.categoriesOfInterest.filter(c => c !== category)
            : [...networkProfile.categoriesOfInterest, category];
        setNetworkProfile(prev => prev ? { ...prev, categoriesOfInterest: newCategories } : null);
    };

    const saveNetworkProfile = async (profileToSave?: NetworkProfile) => {
        const payload = profileToSave || networkProfile;
        if (!payload || !token) return;
        try {
            const res = await fetch(`${backendUrl}/api/network/profile`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setNetworkProfile(await res.json());
                showToast("Perfil de red guardado.", "success");
            } else {
                showToast("Error al guardar perfil de red.", "error");
            }
        } catch (error) {
            showToast("Error de conexión al guardar perfil.", "error");
        }
    };

    const requestPermission = async (opportunityId: string) => {
        if (!token) return;
        if (!confirm("¿Confirmas que quieres solicitar permiso a este prospecto para contactarlo? Se le enviará un mensaje neutral explicando el motivo.")) return;

        try {
            const res = await fetch(`${backendUrl}/api/network/opportunities/${opportunityId}/request-permission`, {
                method: 'POST',
                headers: getAuthHeaders(token),
            });
            if (res.ok) {
                showToast("Solicitud de permiso enviada al prospecto.", "success");
                fetchNetworkData(true);
            } else {
                showToast("Error al solicitar permiso.", "error");
            }
        } catch (error) {
            showToast("Error de conexión.", "error");
        }
    };

    const revealContact = async (opportunityId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`${backendUrl}/api/network/opportunities/${opportunityId}/reveal-contact`, {
                method: 'GET',
                headers: getAuthHeaders(token),
            });
            if (res.ok) {
                const data = await res.json();
                const formattedNumber = formatPhoneNumber(data.prospectOriginalJid);
                window.open(`https://wa.me/${data.prospectOriginalJid.split('@')[0]}?text=${encodeURIComponent(`Hola ${data.prospectName}, te contacto desde ${currentUser?.business_name || 'Dominion Network'} porque mostraste interés en ${data.intentDescription}.`)}`, '_blank');
                showToast(`Contacto revelado: ${data.prospectName} (${formattedNumber})`, "success");
            } else {
                showToast("Error al revelar contacto. ¿Permiso otorgado?", "error");
            }
        } catch (error) {
            showToast("Error de conexión.", "error");
        }
    };

    if (isInitialLoading) return (
        <div className="flex-1 flex flex-col items-center justify-center bg-brand-black">
            <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mb-6"></div>
            <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Sincronizando Red Dominion...</p>
        </div>
    );

    // --- SALES PAGE / ONBOARDING ---
    if (!settings?.isNetworkEnabled) {
        return (
            <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans relative flex items-center justify-center">
                <div className="absolute inset-0 neural-grid opacity-20 pointer-events-none"></div>
                <div className="max-w-4xl mx-auto space-y-12 relative z-10 text-center pb-20">
                    
                    <div className="space-y-4 animate-fade-in">
                        <div className="inline-block p-4 bg-blue-500/10 rounded-full border border-blue-500/20 mb-4 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                            <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 009-9m-9 9a9 9 0 00-9-9" /></svg>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-tight">
                            Red Colaborativa <span className="text-blue-500">Dominion</span>
                        </h2>
                        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                            Transforma tus leads "descartados" en oportunidades reales para otros, y recibe contactos calificados que buscan exactamente lo que ofreces.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <div className="bg-brand-surface border border-white/10 p-6 rounded-2xl hover:border-blue-500/30 transition-all group">
                            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform origin-left">🔄</div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Economía Circular</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">¿Un cliente pide algo que no vendes? No lo pierdas. Compártelo a la red y gana reputación (y futuros leads a cambio).</p>
                        </div>
                        <div className="bg-brand-surface border border-white/10 p-6 rounded-2xl hover:border-brand-gold/30 transition-all group">
                            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform origin-left">🎯</div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Oportunidades Reales</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">Recibe alertas cuando alguien en la red tiene un cliente listo para comprar tu servicio. Sin buscar, solo cerrar.</p>
                        </div>
                        <div className="bg-brand-surface border border-white/10 p-6 rounded-2xl hover:border-green-500/30 transition-all group">
                            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform origin-left">🛡️</div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Privacidad Total</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">El cliente final siempre tiene el control. Nunca revelamos datos de contacto sin su permiso explícito vía WhatsApp.</p>
                        </div>
                    </div>

                    <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl animate-fade-in" style={{ animationDelay: '0.2s' }}>
                        <h4 className="text-lg font-bold text-white mb-6">¿Cómo funciona el intercambio?</h4>
                        <div className="flex flex-col md:flex-row justify-center items-center gap-4 text-xs font-mono text-gray-400">
                            <div className="bg-black/40 px-4 py-3 rounded-xl border border-white/5">1. Tu Bot califica un Lead como "Caliente"</div>
                            <span className="text-blue-500 text-xl">➔</span>
                            <div className="bg-black/40 px-4 py-3 rounded-xl border border-white/5">2. Decides compartir la "Intención" (Anonimizado)</div>
                            <span className="text-blue-500 text-xl">➔</span>
                            <div className="bg-black/40 px-4 py-3 rounded-xl border border-white/5">3. La Red busca el match perfecto</div>
                            <span className="text-blue-500 text-xl">➔</span>
                            <div className="bg-black/40 px-4 py-3 rounded-xl border border-white/5">4. Se pide permiso y se conecta</div>
                        </div>
                    </div>

                    <button 
                        onClick={handleToggleNetworkEnabled}
                        className="px-10 py-5 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(37,99,235,0.4)] hover:scale-105 hover:bg-blue-500 transition-all animate-fade-in"
                        style={{ animationDelay: '0.3s' }}
                    >
                        Activar Nodo de Red
                    </button>
                    
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-6">
                        Al activar, aceptas los <button className="text-blue-400 underline hover:text-blue-300" onClick={() => showToast("Ver términos legales...", "info")}>términos de colaboración</button> de la red.
                    </p>
                </div>
            </div>
        );
    }

    const renderOpportunityCard = (opportunity: ConnectionOpportunity) => (
        <div key={opportunity.id} className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col space-y-3 relative">
            <div className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                opportunity.permissionStatus === 'GRANTED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                opportunity.permissionStatus === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse' :
                'bg-gray-500/10 text-gray-400 border border-gray-500/20'
            }`}>
                {opportunity.permissionStatus}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20">{opportunity.opportunityScore}% Match</span>
                <span className="text-[9px] text-gray-500 font-mono">{new Date(opportunity.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-xs font-bold text-white line-clamp-3">{opportunity.intentDescription}</p>
            <div className="flex flex-wrap gap-1">
                {opportunity.intentCategories.map(cat => (
                    <span key={cat} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[8px] font-bold uppercase">{cat}</span>
                ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                {opportunity.permissionStatus === 'NOT_REQUESTED' && (
                    <button onClick={() => requestPermission(opportunity.id)} className="flex-1 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-xl font-black text-[10px] uppercase hover:bg-blue-600 hover:text-white transition-all">
                        Solicitar Permiso
                    </button>
                )}
                {opportunity.permissionStatus === 'PENDING' && (
                    <button disabled className="flex-1 py-2 bg-yellow-600/20 text-yellow-400 border border-yellow-600/50 rounded-xl font-black text-[10px] uppercase opacity-70 animate-pulse">
                        Esperando Permiso...
                    </button>
                )}
                {opportunity.permissionStatus === 'GRANTED' && (
                    <button onClick={() => revealContact(opportunity.id)} className="flex-1 py-2 bg-green-600/20 text-green-400 border border-green-600/50 rounded-xl font-black text-[10px] uppercase hover:bg-green-600 hover:text-white transition-all">
                        Revelar Contacto
                    </button>
                )}
            </div>
        </div>
    );

    const renderSignalCard = (signal: IntentSignal) => (
        <div key={signal.id} className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20">{signal.signalScore}% Intent</span>
                <span className="text-[9px] text-gray-500 font-mono">{new Date(signal.contributedAt).toLocaleDateString()}</span>
            </div>
            <p className="text-xs font-bold text-white line-clamp-3">{signal.intentDescription}</p>
            <div className="flex flex-wrap gap-1">
                {signal.intentCategories.map(cat => (
                    <span key={cat} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[8px] font-bold uppercase">{cat}</span>
                ))}
            </div>
        </div>
    );

    const renderSettings = () => (
        <div className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-in space-y-8">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Estado de Red
                </h3>
                <button onClick={handleToggleNetworkEnabled} className={`w-12 h-6 rounded-full relative transition-colors ${settings?.isNetworkEnabled ? 'bg-blue-500' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${settings?.isNetworkEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
            </div>
            
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-4 tracking-widest">
                Activa tu participación para aportar y recibir oportunidades de la red Dominion.
                <button onClick={() => showToast("Ver términos y condiciones de la red", "info")} className="text-brand-gold underline ml-1">Ver términos.</button> 
            </p>

            {settings?.isNetworkEnabled && networkProfile && (
                <div className="animate-fade-in space-y-6 mt-4">
                    <div>
                        <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Categorías de Interés</label>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-black/50 border border-white/10 rounded-xl">
                            {NETWORK_CATEGORIES.map(category => (
                                <button 
                                    key={category}
                                    type="button"
                                    onClick={() => handleToggleCategory(category)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${networkProfile.categoriesOfInterest.includes(category) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-black/40 text-gray-500 border border-white/10 hover:text-white'}`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-gray-500 mt-2 italic">Selecciona las categorías de leads que te gustaría recibir.</p>
                    </div>
                    <button onClick={() => saveNetworkProfile()} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-all">Guardar Perfil de Red</button>
                </div>
            )}
            
            {/* Network Scores */}
            {networkProfile && (
                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Señales Aportadas</p>
                        <p className="text-2xl font-black text-brand-gold">{networkProfile.contributionScore}</p>
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Oportunidades Recibidas</p>
                        <p className="text-2xl font-black text-blue-400">{networkProfile.receptionScore}</p>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto custom-scrollbar font-sans animate-fade-in relative">
            <div className="absolute inset-0 neural-grid opacity-20 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-8 relative z-10 pb-32">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            Red <span className="text-brand-gold">Dominion</span>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Conexiones Comerciales Colaborativas</p>
                    </div>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full md:w-auto">
                        <button onClick={() => setActiveTab('OPPORTUNITIES')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OPPORTUNITIES' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Oportunidades</button>
                        <button onClick={() => setActiveTab('CONTRIBUTIONS')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CONTRIBUTIONS' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Mis Contribuciones</button>
                        <button onClick={() => setActiveTab('SETTINGS')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'SETTINGS' ? 'bg-brand-gold text-black' : 'text-gray-400 hover:text-white'}`}>Ajustes de Red</button>
                    </div>
                </header>

                {activeTab === 'OPPORTUNITIES' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {opportunities.length === 0 ? (
                            <div className="col-span-full text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">No hay nuevas oportunidades en la red.</p>
                            </div>
                        ) : opportunities.map(renderOpportunityCard)}
                    </div>
                )}

                {activeTab === 'CONTRIBUTIONS' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {intentSignals.length === 0 ? (
                            <div className="col-span-full text-center py-20 bg-brand-surface rounded-3xl border border-white/5">
                                <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Aún no has contribuido ninguna señal.</p>
                            </div>
                        ) : intentSignals.map(renderSignalCard)}
                    </div>
                )}

                {activeTab === 'SETTINGS' && renderSettings()}
            </div>
        </div>
    );
};

export default NetworkPanel;
