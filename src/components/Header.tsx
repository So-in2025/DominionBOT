

import React from 'react';
import { View, ConnectionStatus } from '../types';

interface HeaderProps {
  isLoggedIn: boolean;
  userRole: string | null;
  onLoginClick: () => void;
  onRegisterClick: () => void;
  onLogoutClick: () => void;
  isBotGloballyActive: boolean;
  onToggleBot: () => void;
  isAutonomousClosing: boolean; 
  onToggleAutonomous: () => void; 
  isNetworkGlobalEnabled?: boolean; 
  currentView: View;
  onNavigate: (view: View) => void;
  connectionStatus: ConnectionStatus;
  isMobile: boolean; 
  tunnelLatency: number | null; 
}

const Header: React.FC<HeaderProps> = ({ 
    isLoggedIn, 
    userRole, 
    onLoginClick, 
    onRegisterClick, 
    onLogoutClick,
    isBotGloballyActive, 
    onToggleBot, 
    isAutonomousClosing,
    onToggleAutonomous,
    isNetworkGlobalEnabled,
    currentView, 
    onNavigate, 
    connectionStatus,
    isMobile,
    tunnelLatency
}) => {
  const isSuperAdmin = userRole === 'super_admin';

  const handleNavClick = (view: View) => {
    onNavigate(view);
  };

  const handleLogoClick = () => {
      if (!isLoggedIn) return; 
      if ((window as any).IS_LANDING_VIEW) {
           onNavigate(isSuperAdmin ? View.ADMIN_GLOBAL : View.CHATS);
      } else {
           onNavigate(View.CHATS); 
            (window as any).IS_LANDING_VIEW = true; 
      }
  };

  let tunnelColor = 'bg-gray-500';
  let tunnelText = 'OFFLINE';
  
  if (tunnelLatency !== null) {
      if (tunnelLatency < 300) {
          tunnelColor = 'bg-green-500';
          tunnelText = `${tunnelLatency}ms`;
      } else if (tunnelLatency < 1000) {
          tunnelColor = 'bg-yellow-500';
          tunnelText = `${tunnelLatency}ms (LAG)`;
      } else {
          tunnelColor = 'bg-red-500';
          tunnelText = `${tunnelLatency}ms (SLOW)`;
      }
  }

  const navBtnClass = (view: View) => `
    px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200
    ${currentView === view 
        ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' 
        : 'text-gray-400 hover:text-white hover:bg-white/5'}
  `;

  // --- NATIVE-STYLE BOTTOM NAVIGATION ITEMS ---
  const navItems = isSuperAdmin ? [
      { view: View.ADMIN_GLOBAL, label: 'Global', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 009-9m-9 9a9 9 0 00-9-9" /></svg> },
  ] : [
      { view: View.CHATS, label: 'Mensajes', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
      { view: View.RADAR, label: 'Radar', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg> },
      { view: View.CAMPAIGNS, label: 'Campañas', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg> },
      { view: View.DASHBOARD, label: 'Métricas', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { view: View.SETTINGS, label: 'Ajustes', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg> },
  ];

  return (
    <>
    <header className="sticky top-0 z-[100] bg-brand-black/95 backdrop-blur-md border-b border-white/10 h-[90px] md:h-[100px] w-full">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-full flex justify-between items-center">
        
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={handleLogoClick}>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center text-black font-black text-2xl shadow-lg">
                    D
                </div>
                <div className="flex flex-col">
                    <h1 className="text-white font-black text-lg md:text-2xl leading-none tracking-tighter uppercase">
                        DOMINION <span className="text-brand-gold">BOT</span>
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest font-bold hidden sm:block">Infraestructura Comercial</p>
                        {isLoggedIn && (
                            <div className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/5" title="Latencia del Túnel (Ngrok)">
                                <div className={`w-1.5 h-1.5 rounded-full ${tunnelColor} ${tunnelLatency === null ? 'animate-pulse' : ''}`}></div>
                                <span className="text-[8px] font-mono text-gray-400">{tunnelText}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {isLoggedIn && (
            <nav className="hidden lg:flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5 mx-4">
                {isSuperAdmin ? (
                    <>
                        <button className={navBtnClass(View.ADMIN_GLOBAL)} onClick={() => handleNavClick(View.ADMIN_GLOBAL)}>Panel Global</button>
                    </>
                ) : (
                    <>
                        <button className={navBtnClass(View.CHATS)} onClick={() => handleNavClick(View.CHATS)}>Mensajes</button>
                        <button className={navBtnClass(View.RADAR)} onClick={() => handleNavClick(View.RADAR)}>Radar</button>
                        <button className={navBtnClass(View.CAMPAIGNS)} onClick={() => handleNavClick(View.CAMPAIGNS)}>Campañas</button>
                        {isNetworkGlobalEnabled && <button className={navBtnClass(View.NETWORK)} onClick={() => handleNavClick(View.NETWORK)}>Red Dominion</button>}
                        <button className={navBtnClass(View.DASHBOARD)} onClick={() => handleNavClick(View.DASHBOARD)}>Métricas</button>
                        <button className={navBtnClass(View.BLACKLIST)} onClick={() => handleNavClick(View.BLACKLIST)}>Lista Negra</button>
                        <button className={navBtnClass(View.SETTINGS)} onClick={() => handleNavClick(View.SETTINGS)}>Ajustes</button>
                        <button className={navBtnClass(View.CONNECTION)} onClick={() => handleNavClick(View.CONNECTION)}>Conexión</button>
                    </>
                )}
            </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-4">
            {isLoggedIn ? (
                <div className="flex items-center gap-2 sm:gap-4">
                    {!isSuperAdmin && (
                        <div className="flex items-center gap-4">
                            {/* GUARDIA AUTÓNOMA TOGGLE */}
                            <div className={`relative group/guardia flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-help ${isAutonomousClosing ? 'bg-indigo-900/40 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-black/50 border-white/10'}`}>
                                <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest hidden sm:inline ${isAutonomousClosing ? 'text-indigo-400' : 'text-gray-500'}`}>
                                    Guardia
                                </span>
                                {isAutonomousClosing ? <span className="animate-pulse">🌙</span> : <span className="opacity-50">🌙</span>}
                                <button 
                                    onClick={onToggleAutonomous}
                                    className={`w-7 h-3.5 md:w-8 md:h-4 rounded-full relative transition-colors duration-300 ${isAutonomousClosing ? 'bg-indigo-500' : 'bg-gray-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-white rounded-full transition-all duration-300 ${isAutonomousClosing ? 'left-[14px] md:left-[18px]' : 'left-0.5'}`}></div>
                                </button>
                                
                                <div className="absolute top-full right-0 mt-3 w-64 p-4 bg-[#0a0a0a] border border-indigo-500/30 rounded-xl shadow-2xl opacity-0 invisible group-hover/guardia:opacity-100 group-hover/guardia:visible transition-all duration-200 z-[200] pointer-events-none backdrop-blur-xl">
                                    <div className="absolute -top-1 right-6 w-2 h-2 bg-[#0a0a0a] border-t border-l border-indigo-500/30 rotate-45"></div>
                                    <p className="text-[10px] text-gray-300 leading-relaxed font-medium">
                                        <strong className="text-indigo-400 block mb-1 uppercase tracking-widest text-xs">Modo Nocturno / Autónomo</strong>
                                        Si activas esto, la IA <strong>NO te despertará</strong> cuando consiga un cliente. Cerrará la venta sola enviando el link de pago directamente.
                                    </p>
                                </div>
                            </div>

                            {/* SISTEMA IA TOGGLE */}
                            <div className="flex items-center gap-2 bg-black/50 border border-white/10 px-2 sm:px-4 py-1.5 rounded-full">
                                <div className={`w-1.5 h-1.5 rounded-full hidden sm:block ${isBotGloballyActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                                <span className="text-[8px] md:text-[9px] font-black text-gray-300 uppercase tracking-widest hidden sm:block">
                                    {isBotGloballyActive ? 'IA ACTIVA' : 'IA PAUSADA'}
                                </span>
                                <span className={`text-xs font-black uppercase tracking-wider block sm:hidden ${isBotGloballyActive ? 'text-green-400' : 'text-red-400'}`}>
                                    IA
                                </span>
                                <button 
                                    onClick={onToggleBot}
                                    className={`w-7 h-3.5 md:w-8 md:h-4 rounded-full relative transition-colors duration-300 ${isBotGloballyActive ? 'bg-brand-gold' : 'bg-gray-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-black rounded-full transition-all duration-300 ${isBotGloballyActive ? 'left-[14px] md:left-[18px]' : 'left-0.5'}`}></div>
                                </button>
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={onLogoutClick}
                        className="hidden md:flex items-center justify-center w-9 h-9 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 sm:gap-4">
                    <button onClick={onLoginClick} className="px-3 py-2 md:px-4 md:py-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/5 md:border-transparent">Acceder</button>
                    <button onClick={onRegisterClick} className="bg-brand-gold text-black px-3 py-2 md:px-5 md:py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-gold/20 active:scale-95 transition-transform hover:scale-105 whitespace-nowrap">
                        {isMobile ? 'Registrar' : 'Solicitar Acceso'}
                    </button>
                </div>
            )}
        </div>
      </div>
    </header>

    {/* --- BOTTOM NAVIGATION FOR MOBILE --- */}
    {isLoggedIn && !isSuperAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-[150] bg-brand-surface/95 backdrop-blur-md border-t border-white/10 lg:hidden">
            <div className="flex justify-around items-center h-20">
                {navItems.map(item => (
                    <button
                        key={item.view}
                        onClick={() => handleNavClick(item.view)}
                        className={`flex flex-col items-center justify-center gap-1 w-16 transition-colors ${currentView === item.view ? 'text-brand-gold' : 'text-gray-500 hover:text-white'}`}
                    >
                        {item.icon}
                        <span className="text-[9px] font-bold tracking-tighter">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    )}
    </>
  );
};

export default Header;
