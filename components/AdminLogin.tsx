
import React, { useState, useEffect } from 'react';

// Support both standard process.env (local) and Vite's import.meta.env (production)
const BACKEND_URL = ((import.meta as any).env && (import.meta as any).env.VITE_BACKEND_URL) || process.env.BACKEND_URL || 'http://localhost:3001';

interface AdminLoginProps {
    onLogin: (token: string, role: string) => void;
}

// --- SOUND UTILS (No External Assets) ---
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
    } catch (e) {
        // Ignore audio errors
    }
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

        // ALWAYS LOGIN, NEVER REGISTER
        const endpoint = '/api/login';

        try {
            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.token) {
                if (data.role !== 'admin') {
                    setError('Acceso denegado: Esta cuenta no es administrativa.');
                    return;
                }
                playSound('success');
                onLogin(data.token, data.role);
            } else {
                playSound('hover'); 
                setError(data.message || 'Credenciales no válidas');
            }
        } catch (err) {
            setError('Error de conexión con el servidor seguro.');
        } finally {
            setLoading(false);
        }
    };

    const handleInteraction = () => playSound('hover');

    return (
        // FIXED POSITION + EXPLICIT BLACK BACKGROUND
        <div className="fixed inset-0 w-screen h-screen bg-[#050505] flex items-center justify-center p-4 overflow-hidden font-sans z-50">
            
            {/* --- LUXURY DYNAMIC BACKGROUND --- */}
            {/* Base Noise Texture with explicit opacity */}
            <div className="absolute inset-0 bg-noise z-0 opacity-10 pointer-events-none"></div>
            
            {/* Animated Gold/Dark Orbs - Using explicit colors */}
            <div className="absolute top-0 -left-20 w-96 h-96 bg-[#D4AF37] opacity-10 rounded-full blur-[100px] animate-blob mix-blend-screen pointer-events-none"></div>
            <div className="absolute bottom-0 -right-20 w-96 h-96 bg-[#1a1a1a] opacity-40 rounded-full blur-[100px] animate-blob animation-delay-2000 mix-blend-screen pointer-events-none"></div>
            
            {/* --- MAIN CARD --- */}
            {/* Explicit background color to prevent transparency issues */}
            <div className={`relative z-10 w-full max-w-[420px] backdrop-blur-xl bg-[#121212]/95 border border-white/10 rounded-2xl shadow-2xl transition-all duration-1000 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                
                {/* Gold Top Border Accent */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-70"></div>
                
                {/* Decorative Glyphs */}
                <div className="absolute top-4 right-4 opacity-20">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width: '40px', height: '40px'}}>
                        <path d="M20 0L24.49 15.51L40 20L24.49 24.49L20 40L15.51 24.49L0 20L15.51 15.51L20 0Z" fill="#D4AF37"/>
                    </svg>
                </div>

                <div className="p-10">
                    {/* LOGO & HEADER */}
                    <div className="text-center mb-10">
                        <div className="inline-block p-3 rounded-full bg-gradient-to-br from-gray-900 to-black border border-[#D4AF37]/30 shadow-lg shadow-[#D4AF37]/10 mb-4 animate-float">
                            <svg className="w-8 h-8 text-[#D4AF37]" style={{width: '32px', height: '32px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            Acceso <span className="text-[#D4AF37]">Administrativo</span>
                        </h1>
                        <p className="text-gray-400 text-xs mt-2 uppercase tracking-[0.2em]">Restricted Area</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* INPUT GROUP 1 */}
                        <div className="group">
                            <label className="block text-xs font-medium text-[#D4AF37] mb-1 ml-1 opacity-100 transition-opacity">ID ADMIN</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onFocus={handleInteraction}
                                    className="w-full px-4 py-3 bg-[#000000]/60 border border-white/10 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all duration-300"
                                    placeholder="Usuario"
                                    required
                                />
                            </div>
                        </div>

                        {/* INPUT GROUP 2 */}
                        <div className="group">
                            <label className="block text-xs font-medium text-[#D4AF37] mb-1 ml-1 opacity-100 transition-opacity">CONTRASEÑA</label>
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onFocus={handleInteraction}
                                className="w-full px-4 py-3 bg-[#000000]/60 border border-white/10 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all duration-300"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/20 rounded text-red-300 text-xs text-center backdrop-blur-sm animate-fade-in">
                                {error}
                            </div>
                        )}

                        {/* CTA BUTTON */}
                        <button 
                            type="submit" 
                            disabled={loading}
                            onMouseEnter={handleInteraction}
                            className={`relative w-full py-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-all duration-300 overflow-hidden group ${
                                loading 
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-[#997B19] to-[#D4AF37] text-black hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:scale-[1.01]'
                            }`}
                        >
                            <span className="relative z-10 flex items-center justify-center space-x-2">
                                {loading && (
                                    <svg className="animate-spin h-4 w-4 text-black" style={{width: '16px', height: '16px'}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                <span>{loading ? 'Verificando...' : 'Entrar al Sistema'}</span>
                            </span>
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-[10px] text-gray-600">
                           Acceso monitoreado. IP registrada.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
