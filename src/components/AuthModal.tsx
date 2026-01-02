
import React, { useState, useEffect } from 'react';
import { IntendedUse } from '../types';
import { BACKEND_URL, API_HEADERS } from '../config';
import { audioService } from '../services/audioService';

interface AuthModalProps {
    isOpen: boolean;
    initialMode: 'login' | 'register' | 'recovery';
    onClose: () => void;
    onSuccess: (token: string, role: string, rememberMe: boolean) => void;
    onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialMode, onClose, onSuccess, onOpenLegal }) => {
    const [mode, setMode] = useState<'login' | 'register' | 'recovery' | 'registered_success'>(initialMode as any);
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [password, setPassword] = useState('');
    const [intendedUse, setIntendedUse] = useState<IntendedUse>('HIGH_TICKET_AGENCY');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [generatedKey, setGeneratedKey] = useState('');
    
    // Estados Legales (Consolidado a un solo checkbox)
    const [agreedLegal, setAgreedLegal] = useState(false);
    // NEW: Remember Me state, default to true for convenience
    const [rememberMe, setRememberMe] = useState(true);

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
            setAgreedLegal(false); // Reset single legal agreement
            setRememberMe(true); // Reset rememberMe to default true
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
            if (!agreedLegal) { // Check single legal agreement
                setError('Debes aceptar los términos y políticas para continuar.');
                setLoading(false);
                return;
            }
        }

        let endpoint = '';
        // AUTOMÁTICAMENTE AGREGAR EL PREFIJO 549 AL ENVIAR
        // Si el usuario escribe "261...", se envía "549261..."
        let payload: any = { username: `549${whatsappNumber}` };

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
            // Para recuperación, si el usuario ingresa su ID, también necesita prefijo si es celular
            payload.username = `549${whatsappNumber}`; // Recovery needs username usually
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
                    onSuccess(data.token, data.role, true); // Iniciar sesión inmediatamente, siempre recordar en registro
                    setGeneratedKey(data.recoveryKey);
                    setMode('registered_success');
                } else if (mode === 'recovery') {
                    setSuccessMsg('Contraseña reseteada. Ya puedes ingresar.');
                    setMode('login');
                } else {
                    onSuccess(data.token, data.role, rememberMe);
                    onClose();
                }
            } else {
                setError(data.message || 'Error en la operación. Verifique sus datos.');
                audioService.play('alert_error_credentials');
            }
        } catch (err: any) {
            console.error("Auth Fail", err);
            if (err.name === 'AbortError') {
                setError('La operación de autenticación ha tardado demasiado. Intente nuevamente.');
            } else if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
                setError(`Error de red: No se pudo conectar con el backend en ${BACKEND_URL}. Verifique su conexión.`);
            } else {
                setError('Fallo de conexión. Verifique que el Backend esté activo.');
            }
            audioService.play('alert_error_connection');
        } finally {
            setLoading(false);
        }
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        
        // SMART PASTE: Si el usuario pega un número completo que empieza con 549, lo removemos para no duplicar
        if (val.startsWith('549') && val.length > 7) {
            val = val.substring(3);
        }
        
        setWhatsappNumber(val);
    };

    const isSubmitDisabled = loading || (mode === 'register' && !agreedLegal); // Use single legal agreement

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-32"> {/* Adjusted to items-start and pt-32 (128px) */}
            <div className={`absolute inset-0 bg-brand-black/90 backdrop-blur-md transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
            <div className={`relative w-full max-w-md max-h-[calc(100vh-180px)] bg-brand-surface border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 transform custom-scrollbar ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}>
                <div className="h-1.5 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark flex-shrink-0"></div>
                
                {mode !== 'registered_success' && (
                    <button onClick={onClose} className="absolute top-5 right-5 text-gray-500 hover:text-white transition-colors z-10 p-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}

                {/* Main Content Area - Now uses flex-col, reduced padding */}
                <div className="p-4 md:p-6 flex flex-col flex-1 min-h-0"> 
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
                        <> {/* FIX: Wrapped multiple elements in a fragment */}
                            <div className="text-center mb-6 md:mb-8 flex-shrink-0"> {/* Reduced mb */}
                                <h2 className="text-xl md:text-2xl font-black text-white tracking-tighter mb-1"> {/* Adjusted font size */}
                                    {mode === 'login' ? 'Bienvenido' : (mode === 'register' ? 'Nuevo Nodo' : 'Recuperación')}
                                </h2>
                                <p className="text-[9px] text-brand-gold uppercase tracking-[0.4em] font-black opacity-80">Infrastructure v3.0.0 Elite</p> {/* Adjusted font size */}
                            </div>

                            {/* Scrollable Form Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar -mx-4 px-4 min-h-0">
                                {successMsg && (
                                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs text-center font-bold animate-fade-in">{successMsg}</div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5 pt-1"> {/* Reduced space-y */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">{mode === 'login' ? 'Número de WhatsApp' : 'Tu Número de WhatsApp'}</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none z-10">
                                                <span className="text-brand-gold font-mono font-bold text-sm tracking-tight border-r border-white/10 pr-3 mr-1 select-none">54 9</span>
                                            </div>
                                            <input 
                                                type="tel" 
                                                value={whatsappNumber} 
                                                onChange={handlePhoneChange}
                                                className="w-full pl-[4.5rem] pr-5 py-3 md:py-3.5 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none transition-all placeholder-gray-700 font-mono text-sm group-hover:border-white/10" 
                                                placeholder="261..." 
                                                required 
                                            />
                                        </div>
                                    </div>

                                    {mode === 'register' && (
                                         <div className="space-y-1.5 animate-fade-in">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Tu Nombre o Nombre del Negocio</label>
                                            <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full px-5 py-3 md:py-3.5 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800" placeholder="Ej: Agencia Dominion" required />
                                        </div>
                                    )}
                                    {mode !== 'recovery' && (
                                        <div className="space-y-1.5">
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Clave de Acceso</label>
                                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-3 md:py-3.5 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800" placeholder="••••••••" required />
                                        </div>
                                    )}

                                    {mode === 'register' && (
                                        <div className="space-y-1.5 animate-fade-in">
                                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">¿Para qué lo usarás?</label>
                                            <select value={intendedUse} onChange={(e) => setIntendedUse(e.target.value as IntendedUse)} className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none">
                                                <option value="HIGH_TICKET_AGENCY">Agencia (High-Ticket)</option>
                                                <option value="REAL_ESTATE">Inmobiliaria</option>
                                                <option value="ECOMMERCE_SUPPORT">E-commerce / Soporte</option>
                                                <option value="PROFESSIONAL_SERVICES">Servicios Profesionales</option>
                                                <option value="OTHER">Otro</option>
                                            </select>
                                        </div>
                                    )}

                                    {mode === 'recovery' && (
                                        <div className="space-y-4 animate-fade-in">
                                            <div className="space-y-1.5">
                                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Master Recovery Key</label>
                                                <input type="text" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} className="w-full px-5 py-3 md:py-3.5 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800 font-mono" placeholder="ABCD-EFGH-IJKL..." required />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nueva Clave</label>
                                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-5 py-3 md:py-3.5 bg-black/40 border border-white/5 rounded-xl text-white focus:border-brand-gold outline-none placeholder-gray-800" placeholder="••••••••" required />
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center font-bold animate-fade-in">{error}</div>
                                    )}

                                    {mode === 'login' && (
                                        <div className="flex items-center justify-between animate-fade-in pt-2">
                                            <div className="flex items-center">
                                                <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3 w-3 text-brand-gold border-gray-600 rounded focus:ring-brand-gold bg-black/40" />
                                                <label htmlFor="remember-me" className="ml-2 block text-[10px] text-gray-500 uppercase font-black tracking-widest">Recordarme</label>
                                            </div>
                                            <button type="button" onClick={() => setMode('recovery')} className="text-[10px] text-gray-500 hover:text-brand-gold uppercase font-black tracking-widest">¿Olvidaste tu clave?</button>
                                        </div>
                                    )}
                                    {mode === 'register' && (
                                        <div className="flex items-start mt-4 animate-fade-in">
                                            <input id="legal-agree" name="legal-agree" type="checkbox" checked={agreedLegal} onChange={(e) => setAgreedLegal(e.target.checked)} className="h-3 w-3 text-brand-gold border-gray-600 rounded focus:ring-brand-gold bg-black/40 mt-1" />
                                            <label htmlFor="legal-agree" className="ml-2 block text-[10px] text-gray-500 uppercase font-black tracking-widest leading-relaxed">
                                                Acepto la <button type="button" onClick={() => onOpenLegal('privacy')} className="text-brand-gold hover:underline">Política de Privacidad</button> y los <button type="button" onClick={() => onOpenLegal('terms')} className="text-brand-gold hover:underline">Términos y Condiciones</button>.
                                            </label>
                                        </div>
                                    )}
                                    {mode === 'recovery' && (
                                        <div className="text-center pt-2">
                                            <button type="button" onClick={() => setMode('login')} className="text-[10px] text-gray-500 hover:text-brand-gold uppercase font-black tracking-widest">&larr; Volver a Ingresar</button>
                                        </div>
                                    )}
                                </form>
                            </div>
                            
                            <div className="flex-shrink-0 pt-6 border-t border-white/5 mt-auto">
                                <button
                                    type="submit"
                                    disabled={isSubmitDisabled}
                                    className={`w-full py-5 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-lg ${
                                        isSubmitDisabled
                                            ? 'bg-white/5 text-gray-700 cursor-not-allowed'
                                            : 'bg-brand-gold text-black hover:scale-105 active:scale-95 shadow-brand-gold/20'
                                    }`}
                                >
                                    {loading ? 'Procesando Solicitud...' : (mode === 'login' ? 'Acceder' : (mode === 'register' ? 'Crear Nuevo Nodo' : 'Resetear Clave'))}
                                </button>
                                {mode === 'login' && (
                                    <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                        ¿Sin acceso? <button type="button" onClick={() => setMode('register')} className="text-brand-gold hover:underline">Solicitar Acceso</button>
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
