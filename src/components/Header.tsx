
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
        ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' 
        : 'text-gray-400 hover:text-white hover:bg-white/5'}
  `;

  return (
    <>
    <header className="sticky top-0 z-[100] bg-brand-black/95 backdrop-blur-md border-b border-white/10 h-[70px] md:h-[80px] w-full">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-full flex justify-between items-center">
        
        {/* IZQUIERDA: LOGO Y TÍTULO */}
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => onNavigate(isLoggedIn && isSuperAdmin ? View.ADMIN_GLOBAL : View.CHATS)}>
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center text-black font-black text-xl shadow-lg">
                    D
                </div>
                <div className="flex flex-col">
                    <h1 className="text-white font-black text-sm md:text-xl leading-none tracking-tighter uppercase">
                        DOMINION <span className="text-brand-gold">BOT</span>
                    </h1>
                    <p className="text-[7px] text-gray-500 uppercase tracking-[0.1em] font-bold hidden sm:block">Infrastructure Elite</p>
                </div>
            </div>
        </div>

        {/* CENTRO: NAVEGACIÓN DESKTOP (OCULTA EN MÓVIL) */}
        {isLoggedIn && (
            <nav className="hidden lg:flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5 mx-4">
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

        {/* DERECHA: IA STATUS + HAMBURGUESA (MÓVIL) / LOGOUT (DESKTOP) */}
        <div className="flex items-center gap-2 sm:gap-4">
            {isLoggedIn ? (
                <div className="flex items-center gap-2 sm:gap-4">
                    {/* IA TOGGLE SIEMPRE VISIBLE */}
                    <div className="flex items-center gap-2 bg-black/50 border border-white/10 px-2 sm:px-4 py-1.5 rounded-full">
                        <div className={`w-1.5 h-1.5 rounded-full ${isBotGloballyActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-[8px] md:text-[9px] font-black text-gray-300 uppercase tracking-widest hidden xs:block">
                            {isBotGloballyActive ? 'IA ON' : 'IA OFF'}
                        </span>
                        <button 
                            onClick={onToggleBot}
                            className={`w-7 h-3.5 md:w-8 md:h-4 rounded-full relative transition-colors duration-300 ${isBotGloballyActive ? 'bg-brand-gold' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-black rounded-full transition-all duration-300 ${isBotGloballyActive ? 'left-[14px] md:left-[18px]' : 'left-0.5'}`}></div>
                        </button>
                    </div>

                    {/* BOTÓN SALIR - SOLO EN ESCRITORIO */}
                    <button 
                        onClick={onLogoutClick}
                        className="hidden md:flex items-center justify-center w-9 h-9 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>

                    {/* BOTÓN HAMBURGUESA - A LA DERECHA Y SOLO EN MÓVIL */}
                    <button 
                        className="md:hidden flex items-center justify-center w-10 h-10 text-brand-gold bg-white/5 rounded-lg active:scale-90 transition-transform flex-shrink-0 border border-brand-gold/20"
                        onClick={() => setIsMenuOpen(true)}
                        aria-label="Abrir menú"
                    >
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <button onClick={onLoginClick} className="text-[9px] font-black text-gray-400 hover:text-white uppercase px-2">Entrar</button>
                    <button onClick={onRegisterClick} className="bg-brand-gold text-black px-3 py-2 rounded-lg text-[9px] font-black uppercase shadow-lg shadow-brand-gold/20 active:scale-95 transition-transform">Acceso</button>
                </div>
            )}
        </div>
      </div>
    </header>

    {/* MENU LATERAL MÓVIL (DRAWER) */}
    {isLoggedIn && isMenuOpen && (
        <div className="fixed inset-0 z-[200] flex md:hidden">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setIsMenuOpen(false)}></div>
            <div className="relative ml-auto w-[280px] bg-brand-surface border-l border-brand-gold/20 h-full flex flex-col shadow-2xl animate-slide-in-right">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-brand-gold text-black flex items-center justify-center font-black">D</div>
                        <h2 className="text-sm font-black text-white uppercase">DOMINION <span className="text-brand-gold">BOT</span></h2>
                    </div>
                    <button onClick={() => setIsMenuOpen(false)} className="text-gray-500 hover:text-white p-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <button onClick={() => handleNavClick(View.CHATS)} className={`w-full text-left px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${currentView === View.CHATS ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-400 hover:bg-white/5'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        Signals & Ventas
                    </button>
                    <button onClick={() => handleNavClick(View.SETTINGS)} className={`w-full text-left px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${currentView === View.SETTINGS ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-400 hover:bg-white/5'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
                        Configurar IA
                    </button>
                    <button onClick={() => handleNavClick(View.CONNECTION)} className={`w-full text-left px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${currentView === View.CONNECTION ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-400 hover:bg-white/5'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Nodos WhatsApp
                    </button>
                    <button onClick={() => handleNavClick(View.DASHBOARD)} className={`w-full text-left px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${currentView === View.DASHBOARD ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-400 hover:bg-white/5'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Panel Métricas
                    </button>
                </div>

                {/* AQUÍ ESTÁ EL BOTÓN DE SALIR, SOLO DENTRO DEL MENÚ PARA MÓVILES */}
                <div className="p-6 border-t border-white/10 mt-auto bg-black/20">
                    <button onClick={() => { onLogoutClick(); setIsMenuOpen(false); }} className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
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
