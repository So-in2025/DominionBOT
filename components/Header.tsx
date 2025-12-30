
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
    <header className="sticky top-0 z-50 bg-brand-black/95 backdrop-blur-md border-b border-white/10 h-[80px]">
      <div className="max-w-[1400px] mx-auto px-6 h-full flex justify-between items-center">
        
        {/* Brand */}
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => onNavigate(isLoggedIn && isSuperAdmin ? View.ADMIN_GLOBAL : View.CHATS)}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center text-black font-black text-xl shadow-lg transition-transform group-hover:scale-105">
                D
            </div>
            <div className="hidden md:block">
                <h1 className="text-white font-black text-lg leading-none tracking-tighter">
                    DOMINION <span className="text-brand-gold">OS</span>
                </h1>
                <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-bold mt-1">Infrastructure v2.7.5</p>
            </div>
        </div>

        {/* Desktop Navigation */}
        {isLoggedIn && (
            <nav className="hidden md:flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
                {isSuperAdmin ? (
                    <>
                        <button className={navBtnClass(View.ADMIN_GLOBAL)} onClick={() => handleNavClick(View.ADMIN_GLOBAL)}>Control</button>
                        <button className={navBtnClass(View.SETTINGS)} onClick={() => handleNavClick(View.SETTINGS)}>Seguridad</button>
                    </>
                ) : (
                    <>
                        <button className={navBtnClass(View.CHATS)} onClick={() => handleNavClick(View.CHATS)}>Ventas</button>
                        <button className={navBtnClass(View.SETTINGS)} onClick={() => handleNavClick(View.SETTINGS)}>IA Cerebro</button>
                        <button className={navBtnClass(View.CONNECTION)} onClick={() => handleNavClick(View.CONNECTION)}>WhatsApp</button>
                        <button className={navBtnClass(View.DASHBOARD)} onClick={() => handleNavClick(View.DASHBOARD)}>Métricas</button>
                    </>
                )}
            </nav>
        )}

        {/* Actions Area */}
        <div className="flex items-center gap-4">
            {isLoggedIn ? (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 bg-black/50 border border-white/10 px-4 py-1.5 rounded-full">
                        <div className={`w-1.5 h-1.5 rounded-full ${isBotGloballyActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.15em] hidden sm:block">
                            {isBotGloballyActive ? 'IA On' : 'IA Off'}
                        </span>
                        <button 
                            onClick={onToggleBot}
                            className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isBotGloballyActive ? 'bg-brand-gold' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 bg-black rounded-full transition-all duration-300 ${isBotGloballyActive ? 'left-[18px]' : 'left-0.5'}`}></div>
                        </button>
                    </div>

                    <button 
                        onClick={onLogoutClick}
                        className="flex items-center justify-center w-9 h-9 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-3 md:gap-5">
                    <button onClick={onLoginClick} className="text-[10px] font-black text-gray-400 hover:text-white uppercase tracking-widest px-2">Entrar</button>
                    <button onClick={onRegisterClick} className="bg-brand-gold text-black px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-gold/20 hover:scale-105 transition-transform">Solicitar</button>
                </div>
            )}

            {isLoggedIn && (
                <button className="md:hidden text-white p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                    </svg>
                </button>
            )}
        </div>
      </div>
    </header>

    {isLoggedIn && isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-brand-black/95 backdrop-blur-xl pt-[80px] md:hidden animate-fade-in">
            <div className="p-6 space-y-4">
                <button onClick={() => handleNavClick(View.CHATS)} className="w-full text-left p-4 text-white text-lg font-black uppercase border-b border-white/10">Ventas</button>
                <button onClick={() => handleNavClick(View.SETTINGS)} className="w-full text-left p-4 text-white text-lg font-black uppercase border-b border-white/10">IA Cerebro</button>
                <button onClick={() => handleNavClick(View.CONNECTION)} className="w-full text-left p-4 text-white text-lg font-black uppercase border-b border-white/10">WhatsApp</button>
                <button onClick={() => handleNavClick(View.DASHBOARD)} className="w-full text-left p-4 text-white text-lg font-black uppercase border-b border-white/10">Métricas</button>
                <button onClick={onLogoutClick} className="w-full py-4 mt-8 border border-red-500/30 text-red-400 rounded-xl font-black uppercase tracking-widest">Salir</button>
            </div>
        </div>
    )}
    </>
  );
};

export default Header;
