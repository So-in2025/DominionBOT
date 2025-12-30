
import React from 'react';
import { ConnectionStatus } from '../types';

interface ConnectionPanelProps {
    status: ConnectionStatus;
    qrCode: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
}

const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    const statusInfo = {
        [ConnectionStatus.CONNECTED]: { text: 'Conectado a WhatsApp', color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
        [ConnectionStatus.DISCONNECTED]: { text: 'Desconectado', color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
        [ConnectionStatus.GENERATING_QR]: { text: 'Generando código QR...', color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
        [ConnectionStatus.AWAITING_SCAN]: { text: 'Esperando escaneo', color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
    };
    const info = statusInfo[status];
    return (
        <div className={`px-4 py-2 rounded-full border ${info.border} ${info.bg} ${info.color} font-bold text-sm uppercase tracking-wider animate-fade-in`}>
            {info.text}
        </div>
    );
};

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ status, qrCode, onConnect, onDisconnect }) => {

    const renderContent = () => {
        switch (status) {
            case ConnectionStatus.DISCONNECTED:
                return (
                    <div className="text-center animate-fade-in">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        </div>
                        <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
                            Para activar el bot, necesitas vincular tu dispositivo móvil de WhatsApp.
                        </p>
                        <button
                            onClick={onConnect}
                            className="bg-brand-gold text-black font-bold py-3 px-8 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:scale-105 transition-transform uppercase text-sm tracking-wide"
                        >
                            Conectar WhatsApp
                        </button>
                    </div>
                );
            case ConnectionStatus.GENERATING_QR:
                return (
                    <div className="flex flex-col items-center py-10">
                        <div className="w-12 h-12 border-4 border-white/20 border-t-brand-gold rounded-full animate-spin mb-4"></div>
                        <p className="text-gray-400 text-sm font-mono">Estableciendo túnel seguro...</p>
                    </div>
                );
            case ConnectionStatus.AWAITING_SCAN:
                return (
                    <div className="text-center animate-fade-in">
                        <h3 className="text-xl font-bold text-white mb-2">Escanea el código QR</h3>
                        <p className="text-gray-500 mb-6 text-xs">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                        
                        <div className="p-4 bg-white rounded-xl inline-block shadow-2xl">
                            {qrCode ? (
                             <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                            ) : (
                                <div className="w-64 h-64 bg-gray-200 animate-pulse rounded flex items-center justify-center text-gray-400 text-xs">Cargando...</div>
                            )}
                        </div>
                        
                        <div className="mt-8">
                            <button
                                onClick={onDisconnect}
                                className="text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-wide border-b border-red-400/30 hover:border-red-400 pb-0.5 transition-colors"
                            >
                                Cancelar Operación
                            </button>
                        </div>
                    </div>
                );
            case ConnectionStatus.CONNECTED:
                return (
                    <div className="text-center py-6 animate-fade-in">
                         <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Sistema Operativo</h3>
                        <p className="text-gray-500 mb-8 max-w-sm mx-auto text-sm">
                            La sesión de WhatsApp está activa y sincronizada. Dominion Bot está listo para interceptar leads.
                        </p>
                        <button
                            onClick={onDisconnect}
                            className="bg-red-500/10 text-red-400 border border-red-500/30 font-bold py-3 px-8 rounded-xl hover:bg-red-500 hover:text-white transition-all uppercase text-sm tracking-wide"
                        >
                            Desconectar Sesión
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="flex-1 bg-brand-black p-4 flex items-center justify-center h-full">
            <div className="w-full max-w-md bg-brand-surface p-8 md:p-12 rounded-2xl border border-white/5 shadow-2xl relative overflow-hidden">
                {/* Decorative background blur */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold opacity-5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
                
                <div className="flex flex-col items-center relative z-10">
                    <StatusIndicator status={status} />
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default ConnectionPanel;
