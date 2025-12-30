
import React, { useState, useEffect } from 'react';
import { ConnectionStatus } from '../types';

interface ConnectionPanelProps {
    status: ConnectionStatus;
    qrCode: string | null;
    pairingCode?: string | null;
    onConnect: (phoneNumber?: string) => Promise<void>; 
    onDisconnect: () => void;
}

const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    const statusInfo = {
        [ConnectionStatus.CONNECTED]: { text: 'Conectado a WhatsApp', color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
        [ConnectionStatus.DISCONNECTED]: { text: 'Desconectado', color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
        [ConnectionStatus.GENERATING_QR]: { text: 'Estableciendo Túnel...', color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
        [ConnectionStatus.AWAITING_SCAN]: { text: 'Pendiente de Enlace', color: 'text-brand-gold', border: 'border-brand-gold/50', bg: 'bg-brand-gold/10' },
    };
    const info = statusInfo[status];
    return (
        <div className={`px-4 py-2 rounded-full border ${info.border} ${info.bg} ${info.color} font-black text-[10px] uppercase tracking-[0.2em] animate-fade-in`}>
            {info.text}
        </div>
    );
};

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ status, qrCode, pairingCode, onConnect, onDisconnect }) => {
    const [linkMode, setLinkMode] = useState<'QR' | 'NUMBER'>('QR');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleStartConnect = async () => {
        setIsLoading(true);
        try {
            await onConnect(linkMode === 'NUMBER' ? phoneNumber : undefined);
            // Si después de 30s no hay cambio, liberamos el botón para reintentar
            setTimeout(() => {
                if (status === ConnectionStatus.DISCONNECTED || status === ConnectionStatus.GENERATING_QR) {
                    setIsLoading(false);
                }
            }, 30000); 
        } catch (e) {
            console.error(e);
            setIsLoading(false);
        }
    };

    const handleForceReset = () => {
        setIsLoading(true);
        onDisconnect(); // Forzar desconexión local/remota
        setTimeout(() => setIsLoading(false), 2000);
    };

    // Si el estado cambia (por SSE), actualizamos isLoading
    useEffect(() => {
        if (status === ConnectionStatus.AWAITING_SCAN || status === ConnectionStatus.CONNECTED) {
            setIsLoading(false);
        }
        // Si el servidor nos dice explícitamente "Desconectado" después de haber intentado conectar, apagamos el loading
        if (status === ConnectionStatus.DISCONNECTED) {
            setIsLoading(false);
        }
    }, [status]);

    const renderContent = () => {
        switch (status) {
            case ConnectionStatus.DISCONNECTED:
                return (
                    <div className="text-center animate-fade-in space-y-6">
                        <div className="flex p-1 bg-black/40 border border-white/5 rounded-xl mb-6">
                            <button 
                                onClick={() => setLinkMode('QR')}
                                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${linkMode === 'QR' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Código QR (PC)
                            </button>
                            <button 
                                onClick={() => setLinkMode('NUMBER')}
                                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${linkMode === 'NUMBER' ? 'bg-brand-gold text-black' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Teléfono (Móvil)
                            </button>
                        </div>

                        {linkMode === 'NUMBER' ? (
                            <div className="space-y-4">
                                <p className="text-gray-400 text-[11px] leading-relaxed">Vincula Dominion directamente en tu móvil sin usar la cámara. Recibirás un código de 8 dígitos.</p>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="549261..."
                                        className="w-full bg-black/60 border border-white/10 rounded-xl px-5 py-4 text-white text-sm focus:border-brand-gold outline-none transition-all placeholder-gray-800 font-mono"
                                    />
                                    <span className="absolute right-4 top-4 text-[8px] font-black text-gray-700 uppercase">Incluir Cód. País</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-[11px] leading-relaxed max-w-[280px] mx-auto">Ideal si tienes una computadora a mano para escanear el código QR con la cámara de tu WhatsApp.</p>
                        )}

                        <button
                            onClick={handleStartConnect}
                            disabled={isLoading || (linkMode === 'NUMBER' && phoneNumber.length < 8)}
                            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all ${
                                isLoading ? 'bg-white/5 text-gray-700 animate-pulse cursor-wait' : 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20 hover:scale-[1.02]'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-3 h-3 border-2 border-black/50 border-t-black rounded-full animate-spin"></span>
                                    Iniciando Motor...
                                </span>
                            ) : 'Iniciar Vinculación'}
                        </button>
                        
                        {isLoading && (
                            <div className="space-y-2">
                                <p className="text-[9px] text-gray-500 animate-pulse">Generando sesión criptográfica...</p>
                                <button onClick={handleForceReset} className="text-[8px] text-red-400 hover:underline cursor-pointer">
                                    ¿Tarda mucho? Forzar reinicio
                                </button>
                            </div>
                        )}
                    </div>
                );
            case ConnectionStatus.GENERATING_QR:
                return (
                    <div className="flex flex-col items-center py-10 space-y-4">
                        <div className="w-12 h-12 border-2 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin"></div>
                        <p className="text-brand-gold text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">Generando Nodo de Enlace...</p>
                        <button onClick={handleForceReset} className="text-gray-600 text-[8px] max-w-[200px] text-center hover:text-red-400">
                            Si esto tarda más de 30s, haz click para reiniciar.
                        </button>
                    </div>
                );
            case ConnectionStatus.AWAITING_SCAN:
                return (
                    <div className="text-center animate-fade-in">
                        {pairingCode ? (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Código de Enlace</h3>
                                    <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest">Ve a WhatsApp &rarr; Disp. Vinculados &rarr; Vincular con Código</p>
                                </div>
                                <div className="flex gap-2 justify-center">
                                    {pairingCode.split('').map((char, i) => (
                                        <div key={i} className="w-9 h-12 bg-black/80 border border-brand-gold/30 rounded-lg flex items-center justify-center text-brand-gold text-xl font-black shadow-inner">
                                            {char}
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 bg-brand-gold/5 border border-brand-gold/10 rounded-xl">
                                    <p className="text-[10px] text-brand-gold font-bold italic leading-relaxed">"Toca la notificación que aparecerá en tu móvil para ingresar este código."</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Escanea el QR</h3>
                                <div className="p-4 bg-white rounded-2xl inline-block shadow-2xl">
                                    {qrCode ? (
                                     <img src={qrCode} alt="WhatsApp QR" className="w-64 h-64" />
                                    ) : (
                                        <div className="w-64 h-64 bg-gray-100 animate-pulse rounded flex items-center justify-center text-gray-400 text-xs font-black uppercase">Obteniendo...</div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <div className="mt-10">
                            <button
                                onClick={onDisconnect}
                                className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-[0.2em] border-b border-red-500/20 pb-1"
                            >
                                Cancelar Proceso
                            </button>
                        </div>
                    </div>
                );
            case ConnectionStatus.CONNECTED:
                return (
                    <div className="text-center py-6 animate-fade-in space-y-8">
                         <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/30 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         </div>
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Nodo Sincronizado</h3>
                            <p className="text-gray-500 mt-2 max-w-[280px] mx-auto text-xs font-medium leading-relaxed">
                                La infraestructura Dominion está operando sobre tu cuenta de WhatsApp.
                            </p>
                        </div>
                        <button
                            onClick={onDisconnect}
                            className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                            Terminar Sesión
                        </button>
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
