
import React, { useState, useEffect } from 'react';
import { ConnectionStatus, User } from '../types';

interface ConnectionPanelProps {
    status: ConnectionStatus;
    qrCode: string | null;
    pairingCode?: string | null;
    onConnect: (phoneNumber?: string) => Promise<any>; 
    onDisconnect: () => void;
    onWipe: () => void;
    user: User | null;
}

const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    const statusInfo = {
        [ConnectionStatus.CONNECTED]: { text: 'Conectado a WhatsApp', color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
        [ConnectionStatus.DISCONNECTED]: { text: 'Desconectado', color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
        [ConnectionStatus.GENERATING_QR]: { text: 'Estableciendo Túnel...', color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
        [ConnectionStatus.AWAITING_SCAN]: { text: 'Pendiente de Enlace', color: 'text-brand-gold', border: 'border-brand-gold/50', bg: 'bg-brand-gold/10' },
        [ConnectionStatus.RESETTING]: { text: 'Reseteando...', color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
    };
    const info = statusInfo[status];
    return (
        <div className={`px-4 py-2 rounded-full border ${info.border} ${info.bg} ${info.color} font-black text-[10px] uppercase tracking-[0.2em] animate-fade-in`}>
            {info.text}
        </div>
    );
};

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ status, qrCode, pairingCode, onConnect, onDisconnect, onWipe, user }) => {
    const [linkMode, setLinkMode] = useState<'QR' | 'NUMBER'>('QR');
    // FIX: Initialize phoneNumber with an empty string fallback
    const [phoneNumber, setPhoneNumber] = useState(user?.whatsapp_number || '');
    const [qrError, setQrError] = useState(false);
    
    const isLoading = status === ConnectionStatus.GENERATING_QR;

    useEffect(() => {
        if (user?.whatsapp_number) {
            setPhoneNumber(user.whatsapp_number);
        }
    }, [user]);

    // AUTO-SWITCH TAB BASED ON AVAILABLE DATA
    useEffect(() => {
        if (pairingCode) {
            setLinkMode('NUMBER');
        } else if (qrCode) {
            setLinkMode('QR');
        }
    }, [pairingCode, qrCode]);

    const handleStartConnect = async () => {
        setQrError(false); // Reset error state on new attempt
        try {
            await onConnect(linkMode === 'NUMBER' ? phoneNumber : undefined);
        } catch (e) {
            // El error es manejado por el componente padre, que mostrará un toast.
        }
    };

    const forceWipe = () => {
        if(confirm("⚠️ HARD RESET: Esto eliminará todas las credenciales de sesión en el servidor y te obligará a escanear de nuevo.\n\nÚsalo SOLO si no recibes mensajes o la conexión está 'bugeada'.")) {
            onWipe();
        }
    };

    const renderContent = () => {
        switch (status) {
            case ConnectionStatus.RESETTING:
                return (
                    <div className="flex flex-col items-center py-10 space-y-4 text-center">
                        <div className="w-12 h-12 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
                        <p className="text-red-400 text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">Purgando Sesión...</p>
                    </div>
                );
            case ConnectionStatus.DISCONNECTED:
                return (
                    <div className="text-center animate-fade-in space-y-6">
                        <div className="flex p-1 bg-black/40 border border-white/5 rounded-xl mb-6">
                            <button 
                                onClick={() => setLinkMode('QR')}
                                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${linkMode === 'QR' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Código QR
                            </button>
                            <button 
                                onClick={() => setLinkMode('NUMBER')}
                                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${linkMode === 'NUMBER' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Vincular Teléfono
                            </button>
                        </div>

                        {linkMode === 'NUMBER' ? (
                            <div className="space-y-4">
                                <p className="text-gray-400 text-[11px] leading-relaxed">Tu número de WhatsApp registrado se usará para la conexión.</p>
                                <div className="relative">
                                    <input 
                                        type="tel" // Changed to type="tel" for better mobile UX
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="549..."
                                        className="w-full bg-black/60 border border-white/10 rounded-xl px-5 py-4 text-white text-sm focus:border-brand-gold outline-none transition-all placeholder-gray-800 font-mono"
                                    />
                                    <span className="absolute right-4 top-4 text-[8px] font-black text-gray-700 uppercase">Num. Completo</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-[11px] leading-relaxed max-w-[280px] mx-auto">Escanea el código QR desde "Dispositivos Vinculados" en tu aplicación de WhatsApp.</p>
                        )}

                        <button
                            onClick={handleStartConnect}
                            disabled={isLoading || (linkMode === 'NUMBER' && phoneNumber.length < 8)}
                            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all ${
                                isLoading ? 'bg-white/5 text-gray-700 animate-pulse cursor-wait' : 'bg-brand-gold text-black shadow-lg hover:scale-[1.02]'
                            }`}
                        >
                            {isLoading ? 'Iniciando Motor...' : 'Vincular Ahora'}
                        </button>
                        
                        <div className="pt-6 border-t border-white/5">
                            <p className="text-[9px] text-gray-500 mb-2">¿Problemas recurrentes?</p>
                            <button onClick={forceWipe} className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest border-b border-red-500/30 pb-0.5">
                                Limpiar caché de sesión antigua
                            </button>
                        </div>
                    </div>
                );
            case ConnectionStatus.GENERATING_QR:
                return (
                    <div className="flex flex-col items-center py-10 space-y-4 text-center">
                        <div className="w-12 h-12 border-2 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin"></div>
                        <p className="text-brand-gold text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">Estableciendo Nodo...</p>
                        <button onClick={forceWipe} className="text-red-500 text-[10px] font-bold underline mt-4">Cancelar y Resetear</button>
                    </div>
                );
            case ConnectionStatus.AWAITING_SCAN:
                return (
                    <div className="text-center animate-fade-in">
                        {pairingCode ? (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Código de Enlace</h3>
                                    <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest">Toca la notificación de WhatsApp en tu móvil e ingresa este código</p>
                                </div>
                                <div className="flex gap-2 justify-center flex-wrap">
                                    {pairingCode.split('').map((char, i) => (
                                        char === '-' ? (
                                            <div key={i} className="w-4 h-12 flex items-center justify-center text-brand-gold font-bold">-</div>
                                        ) : (
                                            <div key={i} className="w-9 h-12 bg-black/80 border border-brand-gold/30 rounded-lg flex items-center justify-center text-brand-gold text-xl font-black shadow-inner">
                                                {char}
                                            </div>
                                        )
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Escanea el QR</h3>
                                <div className="p-4 bg-white rounded-2xl inline-block shadow-2xl relative min-h-[256px] min-w-[256px] flex items-center justify-center">
                                    {qrCode && !qrError ? (
                                     <img 
                                        src={qrCode} 
                                        alt="WhatsApp QR" 
                                        className="w-64 h-64 object-contain" 
                                        onError={() => setQrError(true)}
                                     />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                                            {qrError ? (
                                                <>
                                                    <p className="text-red-500 text-xs font-bold mb-2">Error cargando imagen QR</p>
                                                    <button onClick={forceWipe} className="text-[10px] text-blue-500 underline">Reiniciar</button>
                                                </>
                                            ) : (
                                                <div className="w-64 h-64 bg-gray-100 animate-pulse rounded flex items-center justify-center text-gray-400 text-xs font-black">Generando...</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="mt-10">
                            <button onClick={forceWipe} className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-[0.2em] border-b border-red-500/20 pb-1">Resetear Conexión</button>
                        </div>
                    </div>
                );
            case ConnectionStatus.CONNECTED:
                return (
                    <div className="text-center py-6 animate-fade-in space-y-8">
                         <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         </div>
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Nodo Sincronizado</h3>
                            <p className="text-gray-500 mt-2 text-xs font-medium">Todo listo. La IA ya puede operar sobre tu cuenta.</p>
                        </div>
                        
                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <button onClick={onDisconnect} className="w-full py-4 bg-white/5 text-gray-400 border border-white/10 font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:bg-white/10 hover:text-white transition-all">
                                Pausar Conexión
                            </button>

                            {/* EMERGENCY RESYNC BUTTON */}
                            <div className="bg-red-900/10 border border-red-500/20 p-4 rounded-xl">
                                <p className="text-[9px] text-red-300 mb-3 font-bold uppercase tracking-wide">¿No recibes mensajes aunque estás conectado?</p>
                                <button onClick={forceWipe} className="w-full py-3 bg-red-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-lg hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all">
                                    Forzar Resincronización
                                </button>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-4 flex items-center justify-center h-full relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-gold opacity-[0.03] rounded-full blur-[120px] pointer-events-none"></div>
            <div className="w-full max-w-md bg-brand-surface p-8 md:p-12 rounded-[32px] border border-white/5 shadow-2xl relative z-10">
                <div className="flex flex-col items-center">
                    <StatusIndicator status={status} />
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent my-10"></div>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default ConnectionPanel;
