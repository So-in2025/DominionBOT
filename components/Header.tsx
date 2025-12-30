
import React, { useState } from 'react';
import { View, ConnectionStatus } from '../types';

interface HeaderProps {
  isLoggedIn: boolean;
  userRole: string | null;
  onLoginClick: () => void;
  onRegisterClick: () => void;
  onLogoutClick: () => void;
  isBotGloballyActive: boolean;
  onToggleBot: () => void;
  currentView: View;
  onNavigate: (view: View) => void;
  connectionStatus: ConnectionStatus;
}

const Header: React.FC<HeaderProps> = ({ 
    isLoggedIn, 
    userRole, 
    onLoginClick, 
    onRegisterClick, 
    onLogoutClick,
    isBotGloballyActive, 
    onToggleBot, 
    currentView, 
    onNavigate, 
    connectionStatus 
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSuperAdmin = userRole === 'super_admin';

  const handleNavClick = (view: View) => {
    onNavigate(view);
    setIsMenuOpen(false);
  };

  const navBtnClass = (view: View) => `
    px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200
    ${currentView === view 
        ? 'bg-brand-gold text-black shadow-lg' 
        : 'text-gray-400 hover:text-white hover:bg-white/5'}
  `;

  return (
    <>
    <header className="sticky top-0 z-[100] bg-black border-b border-white/10 h-[70px] w-full flex items-center">
      <div className="w-full max-w-[1400px] mx-auto px-4 flex justify-between items-center gap-2">
        
        {/* IZQUIERDA: LOGO + TÍTULO (SIN OVERFLOW, SIN COLLAPSE) */}
        <div 
          className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 cursor-pointer" 
          onClick={() => onNavigate(isLoggedIn && isSuperAdmin ? View.ADMIN_GLOBAL : View.CHATS)}
        >
            <div className="w-9 h-9 flex-shrink-0 rounded bg-brand-gold flex items-center justify-center text-black font-black text-xl shadow-lg">
                D
            </div>
            <h1 className="text-white font-black text-[13px] sm:text-lg tracking-tighter uppercase whitespace-nowrap flex-shrink-0">
                DOMINION <span className="text-brand-gold">BOT</span>
            </h1>
        </div>

        {/* NAVEGACIÓN DESKTOP (SOLO LG+) */}
        {isLoggedIn && (
            <nav className="hidden lg:flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/10 mx-4">
                {isSuperAdmin ? (
                    <>
                        <button className={navBtnClass(View.ADMIN_GLOBAL)} onClick={() => handleNavClick(View.ADMIN_GLOBAL)}>Control</button>
                        <button className={navBtnClass(View.SETTINGS)} onClick={() => handleNavClick(View.SETTINGS)}>Seguridad</button>
                    </>
                ) : (
                    <>
                        <button className={navBtnClass(View.CHATS)} onClick={() => handleNavClick(View.CHATS)}>Signals</button>
                        <button className={navBtnClass(View.SETTINGS)} onClick={() => handleNavClick(View.SETTINGS)}>IA Core</button>
                        <button className={navBtnClass(View.CONNECTION)} onClick={() => handleNavClick(View.CONNECTION)}>Nodos</button>
                        <button className={navBtnClass(View.DASHBOARD)} onClick={() => handleNavClick(View.DASHBOARD)}>Métricas</button>
                    </>
                )}
            </nav>
        )}

        {/* DERECHA: IA TOGGLE + (HAMBURGUESA MOBILE / LOGOUT DESKTOP) */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {isLoggedIn ? (
                <>
                    {/* IA TOGGLE SIEMPRE VISIBLE */}
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2 sm:px-3 py-1.5 rounded-full">
                        <div className={`w-2 h-2 rounded-full ${isBotGloballyActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <button 
                            onClick={onToggleBot}
                            className={`w-7 h-3.5 md:w-8 md:h-4 rounded-full relative transition-colors ${isBotGloballyActive ? 'bg-brand-gold' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-black rounded-full transition-all ${isBotGloballyActive ? 'left-[14px] md:left-[18px]' : 'left-0.5'}`}></div>
                        </button>
                    </div>

                    {/* BOTÓN SALIR - TOTALMENTE ELIMINADO EN MOBILE (solo lg:flex) */}
                    <button 
                        onClick={onLogoutClick}
                        className="hidden lg:flex items-center justify-center w-10 h-10 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        title="Cerrar Sesión"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>

                    {/* BOTÓN HAMBURGUESA - A LA DERECHA Y SOLO EN MOBILE/TABLET */}
                    <button 
                        className="lg:hidden flex items-center justify-center w-10 h-10 bg-brand-gold text-black rounded-lg shadow-lg active:scale-90 transition-transform"
                        onClick={() => setIsMenuOpen(true)}
                    >
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </>
            ) : (
                <div className="flex items-center gap-2">
                    <button onClick={onLoginClick} className="text-[10px] font-black text-gray-400 uppercase px-2">Entrar</button>
                    <button onClick={onRegisterClick} className="bg-brand-gold text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-lg">Acceso</button>
                </div>
            )}
        </div>
      </div>
    </header>

    {/* MENU DRAWER (MOBILE) */}
    {isLoggedIn && isMenuOpen && (
        <div className="fixed inset-0 z-[200] flex lg:hidden">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setIsMenuOpen(false)}></div>
            <div className="relative ml-auto w-[85%] max-w-[300px] bg-brand-surface border-l border-brand-gold/20 h-full flex flex-col shadow-2xl animate-slide-in-right">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
                    <h2 className="text-xs font-black text-white uppercase tracking-widest">DOMINION <span className="text-brand-gold">MENU</span></h2>
                    <button onClick={() => setIsMenuOpen(false)} className="text-gray-500 p-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {[
                        { view: View.CHATS, label: 'Signals & Ventas', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
                        { view: View.SETTINGS, label: 'Configurar IA', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
                        { view: View.CONNECTION, label: 'WhatsApp Nodo', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                        { view: View.DASHBOARD, label: 'Panel Métricas', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' }
                    ].map((item) => (
                        <button 
                            key={item.view}
                            onClick={() => handleNavClick(item.view)} 
                            className={`w-full text-left px-5 py-5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-4 transition-all ${currentView === item.view ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-400 hover:bg-white/5'}`}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* BOTÓN SALIR - ÚNICA UBICACIÓN EN MOBILE */}
                <div className="p-6 border-t border-white/10 mt-auto bg-black/20">
                    <button 
                        onClick={() => { onLogoutClick(); setIsMenuOpen(false); }} 
                        className="w-full py-5 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Desconectar Nodo
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default Header;
