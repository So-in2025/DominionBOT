
import React, { useState, useEffect } from 'react';
import { BACKEND_URL, API_HEADERS } from '../src/config.js';

interface AdminLoginProps {
    onLogin: (token: string, role: string) => void;
}

const playSound = (type: 'hover' | 'click' | 'success' | 'error') => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        
        if (type === 'hover') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
        }
    } catch (e) {}
};

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        playSound('click');
        setLoading(true);
        setError('');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const res = await fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { ...API_HEADERS },
                body: JSON.stringify({ username, password }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await res.json();

            if (res.ok && data.token) {
                if (data.role !== 'admin' && data.role !== 'super_admin') {
                    setError('Acceso denegado: Esta cuenta no tiene permisos administrativos.');
                    setLoading(false);
                    return;
                }
                playSound('success');
                onLogin(data.token, data.role);
            } else {
                playSound('hover'); 
                setError(data.message || 'Credenciales no válidas. Prueba master / dominion2024');
            }
        } catch (err) {
            console.error("LOGIN FAIL:", err);
            setError(`Fallo de conexión con ${BACKEND_URL}. Verifique Ngrok.`);
        } finally {
            setLoading(false);
        }
    };

    const handleInteraction = () => playSound('hover');

    return (
        <div className="fixed inset-0 w-screen h-screen bg-[#050505] flex items-center justify-center p-4 overflow-hidden font-sans z-[9999]">
            <div className="absolute inset-0 bg-noise z-0 opacity-10 pointer-events-none"></div>
            <div className="absolute top-0 -left-20 w-96 h-96 bg-[#D4AF37] opacity-10 rounded-full blur-[100px] animate-blob mix-blend-screen pointer-events-none"></div>
            
            <div className={`relative z-10 w-full max-w-[420px] backdrop-blur-xl bg-[#121212]/95 border border-white/10 rounded-2xl shadow-2xl transition-all duration-1000 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-70"></div>
                
                <div className="p-10">
                    <div className="text-center mb-10">
                        <div className="inline-block p-3 rounded-full bg-gradient-to-br from-gray-900 to-black border border-[#D4AF37]/30 shadow-lg shadow-[#D4AF37]/10 mb-4 animate-float">
                            <svg className="w-8 h-8 text-[#D4AF37]" style={{width: '32px', height: '32px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            Acceso <span className="text-[#D4AF37]">Dominion</span>
                        </h1>
                        <p className="text-gray-400 text-xs mt-2 uppercase tracking-[0.2em]">Restricted Administrative Node</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="group">
                            <label className="block text-[10px] font-black text-[#D4AF37] mb-1 ml-1 uppercase tracking-widest">ID Operador</label>
                            <input 
                                type="text" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onFocus={handleInteraction}
                                className="w-full px-4 py-3 bg-black border border-white/10 rounded-lg text-gray-100 placeholder-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                                placeholder="master"
                                required
                            />
                        </div>

                        <div className="group">
                            <label className="block text-[10px] font-black text-[#D4AF37] mb-1 ml-1 uppercase tracking-widest">Clave de Encriptación</label>
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onFocus={handleInteraction}
                                className="w-full px-4 py-3 bg-black border border-white/10 rounded-lg text-gray-100 placeholder-gray-700 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/20 rounded text-red-300 text-[10px] font-bold text-center animate-fade-in uppercase tracking-tight">
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading}
                            onMouseEnter={handleInteraction}
                            className={`relative w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest transition-all duration-300 ${
                                loading 
                                    ? 'bg-white/5 text-gray-500 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-[#997B19] to-[#D4AF37] text-black hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]'
                            }`}
                        >
                            {loading ? 'Sincronizando...' : 'Entrar al Núcleo'}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">
                           Acceso monitoreado vía Neural Guard v2.7.6
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
