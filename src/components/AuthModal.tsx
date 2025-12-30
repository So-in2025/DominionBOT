
import React, { useState, useEffect } from 'react';
import { IntendedUse } from '../types';

const BACKEND_URL = ((import.meta as any).env && (import.meta as any).env.VITE_BACKEND_URL) || process.env.BACKEND_URL || 'http://localhost:3001';

interface AuthModalProps {
    isOpen: boolean;
    initialMode: 'login' | 'register';
    onClose: () => void;
    onSuccess: (token: string, role: string) => void;
    onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialMode, onClose, onSuccess, onOpenLegal }) => {
    const [mode, setMode] = useState<'login' | 'register'>(initialMode);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [intendedUse, setIntendedUse] = useState<IntendedUse>('VENTAS_CONSULTIVAS');
    
    const [agreedLegal, setAgreedLegal] = useState(false);
    const [agreedManifesto, setAgreedManifesto] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setError('');
            setUsername('');
            setPassword('');
            setGeminiApiKey('');
            setAgreedLegal(false);
            setAgreedManifesto(false);
            setTimeout(() => setAnimateIn(true), 10);
        } else {
            setAnimateIn(false);
        }
    }, [isOpen, initialMode]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (mode === 'register') {
            if (!agreedLegal || !agreedManifesto) {
                setError('Debes aceptar todos los términos legales.');
                setLoading(false);
                return;
            }
        }

        const endpoint = mode === 'register' ? '/api/register' : '/api/login';
        const payload = mode === 'register' 
            ? { 
                username, 
                password, 
                geminiApiKey, 
                intendedUse,
                legalAcceptance: { 
                    privacy: true, 
                    terms: true, 
                    manifesto: true, 
                    acceptedAt: new Date().toISOString() 
                } 
              } 
            : { username, password };

        try {
            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.token) {
                onSuccess(data.token, data.role);
                onClose();
            } else {
                setError(data.message || 'Error en autenticación');
            }
        } catch (err) {
            setError('Error de conexión con el servidor.');
        } finally {
            setLoading(false);
        }
    };

    const isSubmitDisabled = loading || (mode === 'register' && (!agreedLegal || !agreedManifesto));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className={`absolute inset-0 bg-brand-black/90 backdrop-blur-sm transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
            <div className={`relative w-full max-w-md bg-brand-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}>
                <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark"></div>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-white mb-2">{mode === 'login' ? 'Bienvenido' : 'Infraestructura Dominion'}</h2>
                        <p className="text-xs text-brand-gold uppercase tracking-widest font-semibold">Governance & Signal Engine</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Identificador</label>
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-white focus:border-brand-gold focus:ring-1 focus:ring-brand-gold outline-none transition-all placeholder-gray-700" placeholder="ID Corporativo" required />
                        </div>
                        <div className="space-y-1">
                             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Contraseña</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-white focus:border-brand-gold focus:ring-1 focus:ring-brand-gold outline-none transition-all placeholder-gray-700" placeholder="••••••••" required />
                        </div>

                        {mode === 'register' && (
                             <>
                             <div className="space-y-1 animate-fade-in">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Uso Intencionado</label>
                                <select 
                                    value={intendedUse} 
                                    onChange={(e) => setIntendedUse(e.target.value as IntendedUse)}
                                    className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-white focus:border-brand-gold outline-none transition-all text-xs font-bold"
                                >
                                    <option value="VENTAS_CONSULTIVAS">Ventas Consultivas (Inbound)</option>
                                    <option value="SOPORTE">Soporte Inteligente</option>
                                    <option value="OTRO">Otro (Evaluación requerida)</option>
                                </select>
                            </div>
                             <div className="space-y-1 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-wide">Google Gemini API Key (BYOK)</label>
                                </div>
                                <input type="text" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} className="w-full px-4 py-3 bg-black/50 border border-brand-gold/30 rounded-lg text-white focus:border-brand-gold focus:ring-1 focus:ring-brand-gold outline-none transition-all" placeholder="AIzaSy..." />
                            </div>
                            <div className="bg-white/5 rounded-lg p-4 space-y-3 border border-white/5">
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <input type="checkbox" checked={agreedLegal} onChange={(e) => setAgreedLegal(e.target.checked)} className="mt-1 w-4 h-4 rounded border-gray-600 bg-black/50 text-brand-gold focus:ring-brand-gold/50 cursor-pointer" />
                                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">Acepto los <button type="button" onClick={() => onOpenLegal('terms')} className="text-brand-gold hover:underline">Términos</button> y la <button type="button" onClick={() => onOpenLegal('privacy')} className="text-brand-gold hover:underline">Política de Privacidad</button>.</span>
                                </label>
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <input type="checkbox" checked={agreedManifesto} onChange={(e) => setAgreedManifesto(e.target.checked)} className="mt-1 w-4 h-4 rounded border-gray-600 bg-black/50 text-brand-gold focus:ring-brand-gold/50 cursor-pointer" />
                                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">He leído y acepto el <button type="button" onClick={() => onOpenLegal('manifesto')} className="text-brand-gold hover:underline">Manifiesto Dominion</button> (Anti-Spam).</span>
                                </label>
                            </div>
                            </>
                        )}

                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center">{error}</div>}
                        <button type="submit" disabled={isSubmitDisabled} className={`w-full py-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-all duration-300 ${isSubmitDisabled ? 'bg-white/5 text-gray-500' : 'bg-brand-gold text-black hover:shadow-lg'}`}>{loading ? 'Procesando...' : (mode === 'login' ? 'Entrar' : 'Inicializar Infraestructura')}</button>
                    </form>
                    <div className="mt-8 pt-6 border-t border-white/5 text-center">
                        <p className="text-xs text-gray-500">{mode === 'login' ? '¿Sin acceso?' : '¿Ya eres parte?'}<button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="ml-2 text-brand-gold font-bold hover:underline focus:outline-none">{mode === 'login' ? 'Solicitar' : 'Ingresar'}</button></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
