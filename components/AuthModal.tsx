
import React, { useState, useEffect } from 'react';

const BACKEND_URL = ((import.meta as any).env && (import.meta as any).env.VITE_BACKEND_URL) || process.env.BACKEND_URL || 'http://localhost:3001';

interface AuthModalProps {
    isOpen: boolean;
    initialMode: 'login' | 'register';
    onClose: () => void;
    onSuccess: (token: string, role: string) => void;
    onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void; // New prop for linking documents
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialMode, onClose, onSuccess, onOpenLegal }) => {
    const [mode, setMode] = useState<'login' | 'register'>(initialMode);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    
    // Enforcement States
    const [agreedLegal, setAgreedLegal] = useState(false);
    const [agreedManifesto, setAgreedManifesto] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 480);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 480);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setError('');
            setUsername('');
            setPassword('');
            setAgreedLegal(false);
            setAgreedManifesto(false);
        }
    }, [isOpen, initialMode]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Client-side validation for Register mode
        if (mode === 'register') {
            if (!agreedLegal) {
                setError('Debes aceptar los Términos y Privacidad.');
                setLoading(false);
                return;
            }
            if (!agreedManifesto) {
                setError('Debes aceptar el Manifiesto operativo.');
                setLoading(false);
                return;
            }
        }

        const endpoint = mode === 'register' ? '/api/register' : '/api/login';

        try {
            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
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
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            {/* Backdrop */}
            <div 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)' }}
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div style={{
                position: 'relative', 
                width: '90%', 
                maxWidth: '400px', 
                backgroundColor: '#121212', borderRadius: '16px', 
                border: '1px solid rgba(212, 175, 55, 0.3)',
                boxShadow: '0 0 50px rgba(0,0,0,0.8)', overflow: 'hidden'
            }}>
                {/* Gold Accent Line */}
                <div style={{ width: '100%', height: '4px', background: 'linear-gradient(90deg, #997B19, #D4AF37, #997B19)' }}></div>

                {/* Close X */}
                <button 
                    onClick={onClose}
                    style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px', zIndex: 10 }}
                >
                    ✕
                </button>

                <div style={{ padding: isMobile ? '24px 20px' : '32px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                            {mode === 'login' ? 'Bienvenido' : 'Solicitud de Acceso'}
                        </h2>
                        <p style={{ color: '#D4AF37', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px' }}>Dominion Bot</p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px', fontWeight: '600' }}>IDENTIFICADOR (USUARIO)</label>
                            <input 
                                type="text" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{ width: '100%', padding: '12px', backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Tu ID corporativo o Email"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px', fontWeight: '600' }}>CLAVE DE ACCESO</label>
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px', backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="••••••••"
                            />
                        </div>

                        {/* ENFORCEMENT CHECKBOXES (Register Only) */}
                        {mode === 'register' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                
                                {/* Legal Check */}
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '12px', color: '#ccc' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={agreedLegal}
                                        onChange={(e) => setAgreedLegal(e.target.checked)}
                                        style={{ marginTop: '2px', cursor: 'pointer' }}
                                    />
                                    <span>
                                        Acepto los <span onClick={(e) => { e.preventDefault(); onOpenLegal('terms'); }} style={{ color: '#D4AF37', textDecoration: 'underline' }}>Términos</span> y la <span onClick={(e) => { e.preventDefault(); onOpenLegal('privacy'); }} style={{ color: '#D4AF37', textDecoration: 'underline' }}>Política de Privacidad</span>.
                                    </span>
                                </label>

                                {/* Manifesto Check */}
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '12px', color: '#ccc' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={agreedManifesto}
                                        onChange={(e) => setAgreedManifesto(e.target.checked)}
                                        style={{ marginTop: '2px', cursor: 'pointer' }}
                                    />
                                    <span>
                                        He leído el <span onClick={(e) => { e.preventDefault(); onOpenLegal('manifesto'); }} style={{ color: '#D4AF37', textDecoration: 'underline' }}>Manifiesto</span>. Me comprometo a no hacer Spam y a usar la IA de forma ética.
                                    </span>
                                </label>
                            </div>
                        )}

                        {error && (
                            <div style={{ padding: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}>
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={isSubmitDisabled}
                            style={{
                                width: '100%', padding: '14px', marginTop: '8px',
                                background: isSubmitDisabled ? '#333' : 'linear-gradient(90deg, #997B19, #D4AF37)',
                                border: 'none', borderRadius: '8px',
                                color: isSubmitDisabled ? '#666' : '#000', 
                                fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px',
                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer', 
                                opacity: isSubmitDisabled ? 0.7 : 1,
                                transition: 'all 0.3s'
                            }}
                        >
                            {loading ? 'Procesando...' : (mode === 'login' ? 'Ingresar' : 'Confirmar Acceso')}
                        </button>
                    </form>

                    <div style={{ marginTop: '20px', textAlign: 'center', paddingTop: '16px', borderTop: '1px solid #222' }}>
                        <p style={{ color: '#666', fontSize: '13px' }}>
                            {mode === 'login' ? '¿No tienes credenciales?' : '¿Ya tienes acceso?'}
                            <button 
                                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                                style={{ background: 'none', border: 'none', color: '#D4AF37', fontWeight: 'bold', marginLeft: '8px', cursor: 'pointer' }}
                            >
                                {mode === 'login' ? 'Solicitar Acceso' : 'Iniciar Sesión'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
