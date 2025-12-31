import React, { useState, useEffect } from 'react';
import { IntendedUse } from '../types';
import { BACKEND_URL, API_HEADERS } from '../config';

interface AuthModalProps {
    isOpen: boolean;
    initialMode: 'login' | 'register' | 'recovery';
    onClose: () => void;
    onSuccess: (token: string, role: string) => void;
    onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialMode, onClose, onSuccess, onOpenLegal }) => {
    const [mode, setMode] = useState<'login' | 'register' | 'recovery' | 'registered_success'>(initialMode as any);
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [password, setPassword] = useState('');
    const [intendedUse, setIntendedUse] = useState<IntendedUse>('HIGH_TICKET_AGENCY');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [generatedKey, setGeneratedKey] = useState('');
    
    // Estados Legales
    const [agreedPrivacy, setAgreedPrivacy] = useState(false);
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [agreedManifesto, setAgreedManifesto] = useState(false);

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode as any);
            setError('');
            setSuccessMsg('');
            setWhatsappNumber('');
            setBusinessName('');
            setPassword('');
            setRecoveryKey('');
            setNewPassword('');
            setGeneratedKey('');
            setAgreedPrivacy(false);
            setAgreedTerms(false);
            setAgreedManifesto(false);
            setTimeout(() => setAnimateIn(true), 10);
            
            // CRÍTICO: Log del valor real de BACKEND_URL cuando el modal se abre.
            console.log(`%c [AUTH_MODAL] Usando BACKEND_URL: ${BACKEND_URL}`, 'background: #3498db; color: white; font-weight: bold;');
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
            if (!agreedPrivacy || !agreedTerms || !agreedManifesto) {
                setError('Debes aceptar todos los términos y políticas para continuar.');
                setLoading(false);
                return;
            }
        }

        let endpoint = '';
        let payload: any = { username: whatsappNumber };

        if (mode === 'login') {
            endpoint = '/api/login';
            payload.password = password;
        } else if (mode === 'register') {
            endpoint = '/api/register';
            payload.password = password;
            payload.businessName = businessName;
            payload.intendedUse = intendedUse;
        } else if (mode === 'recovery') {
            endpoint = '/api/auth/reset';
            payload.recoveryKey = recoveryKey;
            payload.newPassword = newPassword;
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { ...API_HEADERS }, 
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await res.json();

            if (res.ok) {
                if (mode === 'register') {
                    onSuccess(data.token, data.role); // Iniciar sesión inmediatamente
                    setGeneratedKey(data.recoveryKey);
                    setMode('registered_success');
                } else if (mode === 'recovery') {
                    setSuccessMsg('Contraseña reseteada. Ya puedes ingresar.');
                    setMode('login');
                } else {
                    onSuccess(data.token, data.role);
                    onClose();
                }
            } else {
                setError(data.message || 'Error en la operación. Verifique sus datos.');
            }
        } catch (err: any) {
            console.error("Auth Fail", err);
            if (BACKEND_URL.includes('localhost:3001')) {
                setError(`Fallo de conexión con localhost:3001. Si estás en Vercel, la variable VITE_BACKEND_URL no está configurada.`);
            } else {
                setError(`Fallo de conexión con ${BACKEND_URL}. ¿Backend Activo y Ngrok funcionando?`);
            }
        } finally {
            setLoading(false);
        }
    };

    const isSubmitDisabled = loading || (mode === 'register' && (!agreedPrivacy || !agreedTerms || !agreedManifesto));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className={`absolute inset-0 bg-brand-black/90 backdrop-blur-md transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
            <div className={`relative w-full max-w-md bg-brand-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}>
                <div className="h-1.5 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark"></div>
                
                {mode !== 'registered_success' && (
                    <button onClick={onClose} className="absolute top-5 right-5 text-gray-500 hover:text-white transition-colors z-10 p-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}

                <div className="p-10">
                    {mode === 'registered_success' ? (
                        <div className="text-center space-y-8 animate-fade-in">
                            <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest">Nodo Operativo</h2>
                                <p className="text-xs text-gray-500 mt-2">Guarda tu <strong className="text-brand-gold">Master Recovery Key</strong>. Es el único método de recuperación si olvidas tu clave.</p>
                            </div>
                            
                            <div className="bg-black/80 p-6 rounded-2xl border border-brand-gold/30 font-mono text-brand-gold text-lg font-black tracking-[0.25em] break-all select-all shadow-inner">
                                {generatedKey}
                            </div>

                            <button onClick={onClose} className="w-full py-5 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_10px_40px_rgba(212,175,55,0.3)] hover:scale-105 transition-all">He asegurado mi llave</button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-10">
                                <h2 className="text-3xl font-black text-white tracking-tighter mb-2">
                                    {mode === 'login' ? 'Bienvenido' : (mode === 'register' ? 'Nuevo Nodo' : 'Recuperación')}
                                </h2>
                                <p className="text-[10px] text-brand-gold uppercase tracking-[0.4em] font-black opacity-80">Infrastructure v2.7.6 Elite</p>
                            </div>

                            {successMsg && (
                                <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs text-center font-bold animate-fade-in">{successMsg}</div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">{mode === 'login' ? 'Número de WhatsApp' : 'Tu Número de WhatsApp'}</label>
                                    <input type="text" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none transition-all placeholder-gray-800 font-mono" placeholder="549261..." required />
                                </div>

                                {mode === 'register' && (
                                     <div className="space-y-1.5 animate-fade-in">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Tu Nombre o Nombre del Negocio</label>
                                        <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none transition-all placeholder-gray-800" placeholder="Ej: Agencia Dominion" required />
                                    </div>
                                )}

                                {mode === 'recovery' ? (
                                    <>
                                        <div className="space-y-1.5 animate-fade-in">
                                            <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest ml-1">Master Recovery Key</label>
                                            <input type="text" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} className="w-full px-5 py-4 bg-black/40 border border-brand-gold/30 rounded-xl text-white focus:border-brand-gold outline-none font-mono placeholder-gray-800" placeholder="X8Y2-Z9Q1-..." required />
                                        </div>
                                        <div className="space-y-1.5 animate-fade-in">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nueva Contraseña</label>
                                            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800" placeholder="••••••••" required />
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Contraseña</label>
                                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800" placeholder="••••••••" required />
                                    </div>
                                )}

                                {mode === 'register' && (
                                    <div className="bg-black/20 rounded-2xl p-5 space-y-4 border border-white/5 animate-fade-in">
                                        <label className="flex items-start gap-4 cursor-pointer group">
                                            <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded border-white/10 bg-black checked:bg-brand-gold" />
                                            <span className="text-[10px] text-gray-400 group-hover:text-gray-300">Acepto los <button type="button" onClick={() => onOpenLegal('terms')} className="text-brand-gold font-bold">Términos de Servicio</button>.</span>
                                        </label>
                                        <label className="flex items-start gap-4 cursor-pointer group">
                                            <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="mt-1 w-4 h-4 rounded border-white/10 bg-black checked:bg-brand-gold" />
                                            <span className="text-[10px] text-gray-400 group-hover:text-gray-300">Entiendo la <button type="button" onClick={() => onOpenLegal('privacy')} className="text-brand-gold font-bold">Privacidad BYOK</button>.</span>
                                        </label>
                                        <label className="flex items-start gap-4 cursor-pointer group">
                                            <input type="checkbox" checked={agreedManifesto} onChange={(e) => setAgreedManifesto(e.target.checked)} className="mt-1 w-4 h-4 rounded border-white/10 bg-black checked:bg-brand-gold" />
                                            <span className="text-[10px] text-gray-400 group-hover:text-gray-300">He leído el <button type="button" onClick={() => onOpenLegal('manifesto')} className="text-brand-gold font-bold">Manifiesto Dominion</button>.</span>
                                        </label>
                                    </div>
                                )}

                                {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] text-center font-black uppercase tracking-widest animate-shake">{error}</div>}
                                
                                <button 
                                    type="submit" 
                                    disabled={isSubmitDisabled} 
                                    className={`w-full py-5 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-500 ${isSubmitDisabled ? 'bg-white/5 text-gray-700 cursor-not-allowed opacity-50' : 'bg-brand-gold text-black shadow-[0_10px_30px_rgba(212,175,55,0.2)] hover:scale-[1.02] hover:shadow-[0_10px_40px_rgba(212,175,55,0.4)]'}`}
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                            Procesando...
                                        </div>
                                    ) : (
                                        mode === 'login' ? 'Entrar al Núcleo' : (mode === 'register' ? 'Inicializar Nodo' : 'Confirmar Cambio')
                                    )}
                                </button>
                            </form>

                            <div className="mt-8 flex flex-col items-center gap-5">
                                {mode === 'login' && (
                                    <button onClick={() => setMode('recovery')} className="text-[10px] text-gray-600 hover:text-brand-gold uppercase font-black tracking-widest transition-colors">¿Olvidaste tu contraseña?</button>
                                )}
                                <div className="text-[10px] text-gray-700 font-black uppercase tracking-[0.2em]">
                                    {mode === 'login' ? '¿Sin acceso?' : '¿Ya tienes un nodo?'}
                                    <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="ml-3 text-brand-gold hover:underline decoration-brand-gold/30 underline-offset-4">
                                        {mode === 'login' ? 'Solicitar Nodo' : 'Ingresar'}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthModal;