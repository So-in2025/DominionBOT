
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel';
import ConnectionPanel from './components/ConnectionPanel';
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import AuthModal from './components/AuthModal';
import LegalModal from './components/LegalModal'; 

interface SimStep {
    id: number;
    type: 'user' | 'bot';
    text?: string;
    statusLabel?: string;
    delayBefore: number;
}

const SIMULATION_SCRIPT: SimStep[] = [
    { id: 1, type: 'user', text: "Hola, vi el anuncio. ¿Cómo funciona el bot?", delayBefore: 1000 },
    { id: 2, type: 'bot', text: "Hola. Dominion no es un bot común. Es una infraestructura que califica tus leads en tiempo real para que no pierdas tiempo con curiosos.\n\nContame, ¿cuántos mensajes recibís por día aproximadamente?", statusLabel: "Lead: COLD", delayBefore: 1800 },
    { id: 3, type: 'user', text: "Entre 30 y 50, pero muchos preguntan y después desaparecen.", delayBefore: 2000 },
    { id: 4, type: 'bot', text: "Clásico. Eso pasa porque la respuesta no es inmediata o el filtro es débil. Dominion atiende en < 5 segundos.\n\n¿Qué producto o servicio vendés?", statusLabel: "Lead: WARM", delayBefore: 2000 },
    { id: 5, type: 'user', text: "Vendemos cursos de trading de alto ticket.", delayBefore: 1500 },
    { id: 6, type: 'bot', text: "Bien, sector ideal. En High Ticket la confianza es todo. Dominion puede explicar el programa, filtrar por presupuesto y agendarte la llamada de cierre.\n\n¿Tu equipo de ventas hoy da abasto?", statusLabel: "Lead: WARM +", delayBefore: 2500 },
    { id: 7, type: 'user', text: "No, la verdad que se nos pasan muchos leads por responder tarde.", delayBefore: 2000 },
    { id: 8, type: 'bot', text: "Entiendo. Si logramos automatizar el 80% de las consultas y que solo te lleguen los que están listos para pagar, ¿te serviría?", statusLabel: "Lead: HOT 🔥", delayBefore: 2000 },
    { id: 9, type: 'user', text: "Olvidate, sería un golazo. ¿Cómo sigo?", delayBefore: 1800 },
    { id: 10, type: 'bot', text: "Excelente. Te dejo el link para que actives tu nodo de infraestructura ahora mismo y empecemos a filtrar. \n\n👉 dominion.soin.app/acceso", statusLabel: "CONVERSIÓN EXITOSA ✅", delayBefore: 2200 },
];

const SOCIAL_LINKS = {
    web: "https://websoin.netlify.app",
    instagram: "https://www.instagram.com/so.in_mendoza",
    whatsapp: "https://wa.me/5492617145654",
    facebook: "https://www.facebook.com/soin.mendoza"
};

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'register' }>({ isOpen: false, mode: 'login' });
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'manifesto' | null>(null); 
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isBotGloballyActive, setIsBotGloballyActive] = useState(true);
  const [currentView, setCurrentView] = useState<View>(View.CHATS);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [auditTarget, setAuditTarget] = useState<User | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [visibleMessages, setVisibleMessages] = useState<SimStep[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);
  const prevHotLeadsCount = useRef(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Simulación de Alertas v2.7
  const playAlertAudio = () => {
    if (!settings?.audioEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  useEffect(() => {
    if (token) return; 
    let timeoutId: any;
    let currentIndex = 0;

    const runStep = () => {
        if (currentIndex >= SIMULATION_SCRIPT.length) {
            timeoutId = setTimeout(() => {
                setVisibleMessages([]);
                currentIndex = 0;
                runStep();
            }, 8000); 
            return;
        }

        const step = SIMULATION_SCRIPT[currentIndex];
        if (step.type === 'bot') {
            setIsSimTyping(true);
            timeoutId = setTimeout(() => {
                setIsSimTyping(false);
                setVisibleMessages(prev => [...prev, step]);
                currentIndex++;
                runStep();
            }, step.delayBefore);
        } else {
            timeoutId = setTimeout(() => {
                setVisibleMessages(prev => [...prev, step]);
                currentIndex++;
                runStep();
            }, step.delayBefore);
        }
    };
    runStep();
    return () => clearTimeout(timeoutId);
  }, [token]);

  useEffect(() => {
      if (simScrollRef.current) {
          simScrollRef.current.scrollTop = simScrollRef.current.scrollHeight;
      }
  }, [visibleMessages, isSimTyping]);

  const handleLogout = () => {
      localStorage.clear();
      window.location.reload();
  };

  const handleLoginSuccess = (t: string, r: string) => {
      setToken(t);
      setUserRole(r);
      localStorage.setItem('saas_token', t);
      localStorage.setItem('saas_role', r);
      setAuthModal({ ...authModal, isOpen: false });
  };

  const handleAudit = (user: User) => {
      setAuditTarget(user);
      setCurrentView(View.AUDIT_MODE);
  };

  const renderContent = () => {
      if (!token) {
          return (
              <div className="relative flex-1 overflow-y-auto overflow-x-hidden bg-brand-black flex flex-col font-sans custom-scrollbar">
                  <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none z-0"></div>
                  <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-brand-gold rounded-full blur-[120px] opacity-10 animate-blob pointer-events-none"></div>
                  
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-12 pt-16 pb-24">
                      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                          <div className="space-y-8 text-center lg:text-left">
                              <div className="inline-flex items-center gap-2 px-3 py-1 border border-brand-gold/30 rounded-full text-brand-gold text-[10px] font-black uppercase tracking-[0.2em] bg-brand-gold/5 backdrop-blur-md">
                                  <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-pulse"></span>
                                  Dominion OS v2.7 Platinum
                              </div>
                              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[0.95] tracking-tighter">
                                  Tus ventas <br />
                                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold-dark">En Piloto Automático</span>
                              </h1>
                              <p className="text-lg md:text-xl text-gray-400 leading-relaxed border-l-4 border-brand-gold/50 pl-6 mx-auto lg:mx-0 max-w-xl">
                                  La infraestructura que conversa, califica y cierra por vos.
                                  <strong> No es un bot, es tu mejor vendedor disponible 24/7.</strong>
                              </p>
                              
                              <div className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start pt-4">
                                  <button onClick={() => setAuthModal({ isOpen: true, mode: 'register' })} className="px-10 py-5 bg-brand-gold text-black rounded-xl font-black text-sm uppercase tracking-widest shadow-[0_10px_40px_rgba(212,175,55,0.3)] hover:scale-105 transition-all">Solicitar Acceso</button>
                                  <button onClick={() => setAuthModal({ isOpen: true, mode: 'login' })} className="px-10 py-5 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all">Iniciar Sesión</button>
                              </div>
                          </div>

                          <div className="relative perspective-1000 w-full mt-12 lg:mt-0">
                               <div className="absolute inset-0 bg-brand-gold blur-[120px] opacity-10 rounded-full animate-pulse"></div>
                               <div className="relative bg-brand-surface border border-white/10 rounded-3xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden h-[500px] md:h-[600px] flex flex-col transform lg:rotate-y-[-10deg] hover:rotate-y-0 transition-transform duration-700 ease-out border-t-white/20">
                                  <div className="px-5 py-4 border-b border-white/5 bg-black/60 flex items-center justify-between">
                                      <div className="flex gap-1.5">
                                          <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                                          <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                                          <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                                      </div>
                                      <div className="px-3 py-1 bg-brand-gold/10 rounded text-[10px] text-brand-gold font-black uppercase tracking-widest">Signal Intelligence v2.7</div>
                                  </div>
                                  <div ref={simScrollRef} className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto scroll-smooth custom-scrollbar bg-[#080808]">
                                      {visibleMessages.length === 0 && (
                                          <div className="h-full flex items-center justify-center text-gray-700 uppercase font-black text-[10px] tracking-[0.3em] animate-pulse">Iniciando Simulación...</div>
                                      )}
                                      {visibleMessages.map((msg) => (
                                          <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.type === 'user' ? 'self-start items-start' : 'self-end items-end ml-auto'} animate-fade-in`}>
                                              <div className={`p-4 md:p-5 rounded-2xl text-xs md:text-sm leading-relaxed shadow-xl whitespace-pre-wrap ${msg.type === 'user' ? 'bg-white/10 text-gray-200 rounded-bl-none' : 'bg-gradient-to-br from-brand-gold to-brand-gold-dark text-black font-semibold rounded-br-none'}`}>{msg.text}</div>
                                              {msg.statusLabel && (<span className={`mt-2 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${msg.statusLabel.includes('HOT') || msg.statusLabel.includes('EXITOSA') ? 'text-red-400 border-red-500/30 bg-red-500/10' : (msg.statusLabel.includes('WARM') ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-blue-400 border-blue-500/30 bg-blue-500/10')}`}>{msg.statusLabel}</span>)}
                                          </div>
                                      ))}
                                      {isSimTyping && (<div className="self-end animate-fade-in ml-auto"><div className="bg-brand-gold/20 p-4 rounded-2xl rounded-br-none w-20 flex items-center justify-center gap-1.5 border border-brand-gold/30"><div className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:0.4s]"></div></div></div>)}
                                  </div>
                               </div>
                          </div>
                      </div>
                  </div>

                  <footer className="relative z-10 w-full border-t border-white/5 bg-brand-black/90 backdrop-blur-xl px-8 py-10 flex flex-col md:flex-row justify-between items-center gap-8">
                      <div className="text-center md:text-left">
                          <p className="text-white font-black text-sm tracking-tight flex items-center justify-center md:justify-start gap-1.5">Dominion OS by <a href={SOCIAL_LINKS.web} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-gold-light transition-colors">SO-&gt;IN</a></p>
                          <p className="text-gray-500 text-[10px] mt-1 font-bold uppercase tracking-widest">Soluciones informáticas integrales • Mendoza, ARG</p>
                      </div>
                      <div className="flex gap-6 md:gap-10 text-gray-400">
                           <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-brand-gold transition-all hover:scale-125" title="Facebook"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg></a>
                           <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-brand-gold transition-all hover:scale-125" title="Instagram"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>
                           <a href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-brand-gold transition-all hover:scale-125" title="WhatsApp"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></a>
                      </div>
                  </footer>
              </div>
          );
      }

      switch (currentView) {
        case View.ADMIN_GLOBAL:
          return userRole === 'super_admin' ? <AdminDashboard token={token} onAudit={handleAudit} /> : <AccessDenied />;
        case View.AUDIT_MODE:
          return userRole === 'super_admin' && auditTarget ? <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} /> : <AccessDenied />;
        case View.CHATS:
          return (
            <>
              <ConversationList conversations={conversations} selectedConversationId={selectedConversationId} onSelectConversation={setSelectedConversationId} backendError={null} />
              <ChatWindow 
                conversation={conversations.find(c => c.id === selectedConversationId) || null} 
                onSendMessage={(text) => {}} 
                onToggleBot={(id) => {}}
                isTyping={false}
                isBotGloballyActive={isBotGloballyActive}
                isMobile={isMobile}
                onBack={() => setSelectedConversationId(null)}
              />
            </>
          );
        case View.SETTINGS:
          return <SettingsPanel settings={settings || { isActive: true, archetype: PromptArchetype.CONSULTATIVE, toneValue: 3, rhythmValue: 3, intensityValue: 3, pwaEnabled: true, pushEnabled: true, audioEnabled: true, ttsEnabled: false } as any} onUpdateSettings={setSettings as any} onOpenLegal={setLegalModalType} />;
        case View.CONNECTION:
          return <ConnectionPanel status={connectionStatus} qrCode={null} onConnect={() => {}} onDisconnect={() => {}} />;
        default:
          return <div className="p-10 text-gray-500 uppercase font-black text-center">Módulo en construcción</div>;
      }
  };

  return (
    <div className="flex flex-col h-screen bg-brand-black text-white font-sans overflow-hidden">
      <AuthModal isOpen={authModal.isOpen} initialMode={authModal.mode} onClose={() => setAuthModal({ ...authModal, isOpen: false })} onSuccess={handleLoginSuccess} onOpenLegal={setLegalModalType} />
      <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
      <Header 
        isLoggedIn={!!token} userRole={userRole} onLoginClick={() => setAuthModal({ isOpen: true, mode: 'login' })} onRegisterClick={() => setAuthModal({ isOpen: true, mode: 'register' })} onLogoutClick={handleLogout} 
        isBotGloballyActive={isBotGloballyActive} onToggleBot={() => setIsBotGloballyActive(!isBotGloballyActive)} currentView={currentView} onNavigate={setCurrentView} connectionStatus={connectionStatus}
      />
      <main className="flex-1 overflow-hidden flex relative">
        {renderContent()}
      </main>
    </div>
  );
}

function AccessDenied() {
    return <div className="flex-1 flex items-center justify-center font-black text-red-500 uppercase tracking-widest">Acceso Denegado</div>;
}
