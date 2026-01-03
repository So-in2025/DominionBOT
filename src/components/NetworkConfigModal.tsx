
import React, { useState, useEffect } from 'react';
import { BACKEND_URL, STORAGE_KEY_BACKEND } from '../config';

interface NetworkConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const NetworkConfigModal: React.FC<NetworkConfigModalProps> = ({ isOpen, onClose }) => {
    const [url, setUrl] = useState(BACKEND_URL || '');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setUrl(BACKEND_URL || '');
        }
    }, [isOpen]);

    const handleSave = () => {
        let cleanUrl = url.trim().replace(/\/$/, '');
        localStorage.setItem(STORAGE_KEY_BACKEND, cleanUrl);
        setIsSaved(true);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    const handleReset = () => {
        if(confirm("¿Restaurar a la configuración por defecto (Vercel/Localhost)?")) {
            localStorage.removeItem(STORAGE_KEY_BACKEND);
            window.location.reload();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-brand-surface border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center border border-red-500/20 mb-4 animate-pulse">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Enlace Satelital Perdido</h2>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                        El nodo central no responde. Es probable que la URL de Ngrok haya cambiado.
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Nueva Coordenada (URL)</label>
                        <input 
                            type="text" 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://xxxx-xxxx.ngrok-free.app"
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xs font-mono focus:border-brand-gold outline-none transition-all"
                        />
                        <p className="text-[9px] text-gray-600 mt-2 italic">Consulta la consola del servidor (Backend) para ver la nueva URL detectada.</p>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleReset} className="px-4 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 font-black text-xs uppercase transition-all">
                            Reset
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={isSaved}
                            className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all ${isSaved ? 'bg-green-600 text-white' : 'bg-brand-gold text-black hover:scale-105'}`}
                        >
                            {isSaved ? 'Reiniciando...' : 'Restablecer Enlace'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NetworkConfigModal;
