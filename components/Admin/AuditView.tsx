
import React from 'react';
import { User, LeadStatus } from '../../types';

interface AuditViewProps {
    user: User;
    onClose: () => void;
}

const AuditView: React.FC<AuditViewProps> = ({ user, onClose }) => {
    return (
        <div className="flex-1 bg-brand-black flex flex-col h-full overflow-hidden animate-fade-in font-sans">
            {/* Banner de Auditoría */}
            <div className="bg-brand-gold text-black px-6 py-2 flex justify-between items-center shadow-lg z-20">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modo Auditoría Global (Solo Lectura)</span>
                </div>
                <button onClick={onClose} className="text-[10px] font-black uppercase tracking-widest hover:underline">Finalizar Sesión</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none"></div>
                
                <div className="max-w-5xl mx-auto space-y-12 relative z-10">
                    {/* Header del Perfil Auditado */}
                    <div className="flex items-center gap-6 border-b border-white/10 pb-8">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center text-black font-black text-4xl shadow-2xl">
                            {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tighter">{user.username}</h2>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Tenant ID: {user.id}</p>
                            <div className="flex gap-2 mt-4">
                                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-gray-400 font-black uppercase tracking-widest">{user.planType} PLAN</span>
                                <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded text-[10px] text-green-500 font-black uppercase tracking-widest">{user.governance.systemState}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Configuración del Core */}
                        <section className="space-y-6">
                            <h3 className="text-sm font-black text-brand-gold uppercase tracking-widest border-b border-brand-gold/20 pb-2">Configuración Neural Core</h3>
                            <div className="space-y-4">
                                <div className="bg-brand-surface p-5 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Pitch de Venta</p>
                                    <p className="text-sm text-gray-300 leading-relaxed italic">"{user.settings.productDescription || 'Sin descripción'}"</p>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-brand-surface p-4 rounded-xl border border-white/5 text-center">
                                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-1">Tono</p>
                                        <p className="text-white font-black">{user.settings.toneValue}/5</p>
                                    </div>
                                    <div className="bg-brand-surface p-4 rounded-xl border border-white/5 text-center">
                                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-1">Ritmo</p>
                                        <p className="text-white font-black">{user.settings.rhythmValue}/5</p>
                                    </div>
                                    <div className="bg-brand-surface p-4 rounded-xl border border-white/5 text-center">
                                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-1">Intensidad</p>
                                        <p className="text-white font-black">{user.settings.intensityValue}/5</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Logs de Gobernanza */}
                        <section className="space-y-6">
                            <h3 className="text-sm font-black text-brand-gold uppercase tracking-widest border-b border-brand-gold/20 pb-2">Historial de Gobernanza</h3>
                            <div className="space-y-3">
                                {user.governance.auditLogs.length > 0 ? user.governance.auditLogs.map((log, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                        <div>
                                            <p className="text-[10px] text-white font-black uppercase">{log.action}</p>
                                            <p className="text-[9px] text-gray-500 font-mono mt-0.5">{new Date(log.timestamp).toLocaleString()}</p>
                                        </div>
                                        <span className="text-[9px] text-gray-600 font-bold uppercase">Admin: {log.adminId}</span>
                                    </div>
                                )) : (
                                    <p className="text-xs text-gray-600 italic">No hay registros de gobernanza previos.</p>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Nota de Riesgo */}
                    <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-6">
                         <div className="text-red-500">
                             <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                         </div>
                         <div>
                             <h4 className="text-sm font-black text-white uppercase tracking-widest">Evaluación de Riesgo Sistémico</h4>
                             <p className="text-xs text-gray-500 mt-1">Nivel actual de riesgo: <strong className="text-red-400">{user.governance.riskScore}%</strong>. Patrones de spam: {user.governance.riskScore > 50 ? 'Detectados' : 'No detectados'}.</p>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuditView;
