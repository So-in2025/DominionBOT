
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype } from './types.js';
import Header from './components/Header.js';
import ConversationList from './components/ConversationList.js';
import ChatWindow from './components/ChatWindow.js';
import SettingsPanel from './components/SettingsPanel.js';
import ConnectionPanel from './components/ConnectionPanel.js';
import AdminDashboard from './components/Admin/AdminDashboard.js';
import AuditView from './components/Admin/AuditView.js';
import AuthModal from './components/AuthModal.js';
import LegalModal from './components/LegalModal.js'; 
import AgencyDashboard from './components/AgencyDashboard.js';
// IMPORTACIÓN CENTRALIZADA
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from './config.js';

const SIMULATION_SCRIPT = [
    { id: 1, type: 'user', text: "Hola, vi el anuncio. ¿Cómo funciona el bot?", delayBefore: 1000 },
    { id: 2, type: 'bot', text: "Hola. Dominion no es un bot común. Es una infraestructura que califica tus leads en tiempo real para que no pierdas tiempo con curiosos.\n\nContame, ¿cuántos mensajes recibís por día aproximadamente?", statusLabel: "Lead: FRÍO", delayBefore: 1800 },
    { id: 3, type: 'user', text: "Entre 30 y 50, pero muchos preguntan y después desaparecen.", delayBefore: 2000 },
    { id: 4, type: 'bot', text: "Clásico. Eso pasa porque la respuesta no es inmediata o el filtro es débil. Dominion atiende en < 5 segundos.\n\n¿Qué producto o servicio vendés?", statusLabel: "Lead: TIBIO", delayBefore: 2000 },
    { id: 5, type: 'user', text: "Vendemos servicios y productos digitales.", delayBefore: 1500 },
    { id: 6, type: 'bot', text: "Bien, sector ideal. En ventas digitales la confianza es todo. Dominion puede explicar tu oferta, filtrar por interés y entregarte el lead listo para cerrar.\n\n¿Tu equipo de ventas hoy da abasto?", statusLabel: "Lead: INTERESADO", delayBefore: 2500 },
    { id: 7, type: 'user', text: "No, la verdad que se nos pasan muchos leads por responder tarde.", delayBefore: 2000 },
    { id: 8, type: 'bot', text: "Entiendo. Si logramos automatizar el 80% de las consultas y que solo te lleguen los que están listos para pagar, ¿te serviría?", statusLabel: "Lead: CALIENTE 🔥", delayBefore: 2000 },
    { id: 9, type: 'user', text: "Olvidate, sería un golazo. ¿Cómo sigo?", delayBefore: 1800 },
    { id: 10, type: 'bot', text: "Excelente. Te dejo el link para que actives tu nodo de infraestructura ahora mismo y empecemos a filtrar. \n\n👉 https://dominion-bot.vercel.app/\n(Toca en 'Solicitar Acceso')", statusLabel: "VENTA CERRADA ✅", delayBefore: 2200 },
];

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'register' }>({ isOpen: false, mode: 'login' });
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'manifesto' | null>(null); 
  const [currentView, setCurrentView] = useState<View>(View.CHATS);
  const [isBotGloballyActive, setIsBotGloballyActive] = useState(true);
  const [auditTarget, setAuditTarget] = useState<User | null>(null);
  
  // App States
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  
  // Estado de Salud del Servidor
  const [isServerReady, setIsServerReady] = useState(false);
  const [serverCheckAttempts, setServerCheckAttempts] = useState(0);

  // Simulación de Landing
  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);

  // WAKE UP CALL & HEALTH CHECK
  useEffect(() => {
      let isMounted = true;
      const checkServer = async () => {
          // VALIDACIÓN ESTRICTA: Si no hay URL configurada, no intentamos nada.
          if (!BACKEND_URL || BACKEND_URL.trim() === '') {
              console.error("⛔ ERROR: VITE_BACKEND_URL no configurada en Vercel. Deteniendo intentos.");
              return;
          }

          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000); 
              
              const res = await fetch(`${BACKEND_URL}/api/health`, { 
                  method: 'GET',
                  headers: API_HEADERS, 
                  signal: controller.signal
              });
              clearTimeout(timeoutId);

              // Validación extra: Asegurar que la respuesta es válida y no un index.html de Vercel
              const contentType = res.headers.get("content-type");
              if (res.ok && contentType && contentType.includes("application/json")) {
                  if (isMounted) {
                      setIsServerReady(true);
                      console.log("🦅 Dominion Core: Online & Ready");
                  }
              } else {
                  throw new Error("Respuesta inválida del servidor (posible error 404/SPA fallback)");
              }
          } catch (e) {
              console.log(`🦅 Dominion Core: Buscando túnel... Intento ${serverCheckAttempts + 1}`);
              if (isMounted) {
                  setServerCheckAttempts(prev => prev + 1);
                  setTimeout(checkServer, 4000); 
              }
          }
      };

      checkServer();
      return () => { isMounted = false; };
  }, [serverCheckAttempts]);

  useEffect(() => {
    if (!token || !isServerReady) return;

    const loadData = async () => {
        setIsLoadingSettings(true);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));
        try {
            const fetchData = Promise.all([
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) })
            ]);
            const [sRes, cRes]: any = await Promise.race([fetchData, timeoutPromise]);
            
            if (sRes.ok) setSettings(await sRes.json());
            if (cRes.ok) setConversations(await cRes.json());
            setBackendError(null);
        } catch (e) {
            console.warn("Backend lento o desconectado.");
            setBackendError("Reconectando con el servidor...");
        } finally {
            setIsLoadingSettings(false);
        }
    };
    loadData();

    // SSE connection logic...
    let eventSource: EventSource | null = null;
    try {
        eventSource = new EventSource(`${BACKEND_URL}/api/sse?token=${token}`);
        eventSource.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                
                if (data.type === 'status_update') {
                    setConnectionStatus(data.status);
                    if (data.qr) setQrCode(data.qr);
                    if (data.pairingCode) setPairingCode(data.pairingCode);
                }
                
                if (data.type === 'qr') setQrCode(data.qr);
                if (data.type === 'pairing_code') setPairingCode(data.code);
                
                if (data.type === 'new_message') {
                    fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) })
                        .then(r => r.json())
                        .then(setConversations)
                        .catch(() => {});
                }
            } catch (err) { console.error("SSE Parse Error", err); }
        };
        eventSource.onerror = () => {
            console.log("SSE Reconnecting...");
        };
    } catch(e) {
        console.error("SSE Setup Failed");
    }

    const intervalId = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/status`, { headers: getAuthHeaders(token) });
            if (res.ok) {
                const data = await res.json();
                setConnectionStatus(data.status);
                if (data.qr) setQrCode(data.qr);
                if (data.pairingCode) setPairingCode(data.pairingCode); 
                setBackendError(null);
            }
        } catch (e) { }
    }, 3000);

    return () => {
        if(eventSource) eventSource.close();
        clearInterval(intervalId);
    };
  }, [token, isServerReady]);

  // Animation Logic for Landing
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

  const handleLoginSuccess = (t: string, r: string) => {
      setToken(t);
      setUserRole(r);
      localStorage.setItem('saas_token', t);
      localStorage.setItem('saas_role', r);
      setAuthModal({ ...authModal, isOpen: false });
  };

  const handleConnect = async (phoneNumber?: string) => {
      if (!token) return;
      setQrCode(null);
      setPairingCode(null);
      setConnectionStatus(ConnectionStatus.GENERATING_QR);
      
      try {
          await fetch(`${BACKEND_URL}/api/connect`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ phoneNumber }) 
          });
      } catch (e) { 
          console.error("Error connecting:", e);
          setBackendError("Fallo al iniciar conexión. Intente nuevamente.");
      }
  };

  const handleSendMessage = async (text: string) => {
      if (!selectedConversationId || !token) return;
      try {
          await fetch(`${BACKEND_URL}/api/send`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ to: selectedConversationId, text })
          });
      } catch (e) { console.error(e); }
  };

  const handleUpdateSettings = async (newSettings: BotSettings) => {
      if (!token) return;
      try {
          const res = await fetch(`${BACKEND_URL}/api/settings`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify(newSettings)
          });
          if (res.ok) setSettings(newSettings);
      } catch (e) { console.error(e); }
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;

  if (!isServerReady) {
      return (
        <div className="flex flex-col h-screen bg-brand-black text-white font-sans items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-noise opacity-10 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col items-center animate-fade-in">
                <div className="w-24 h-24 border-4 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin mb-8 shadow-[0_0_50px_rgba(212,175,55,0.2)]"></div>
                <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-2 animate-pulse">Conectando Túnel Ngrok</h1>
                <p className="text-[10px] text-brand-gold font-bold uppercase tracking-[0.3em]">
                    Intento {serverCheckAttempts}
                </p>
                <div className="mt-8 max-w-md text-center p-4 bg-black/40 border border-white/5 rounded-xl">
                    <p className="text-[10px] text-gray-400 font-mono">
                        Target: <span className="text-brand-gold">{BACKEND_URL || "SIN CONFIGURAR"}</span>
                    </p>
                    {!BACKEND_URL && (
                        <p className="text-[10px] text-red-500 font-bold mt-2">
                            ERROR: Variable VITE_BACKEND_URL no detectada en Vercel.
                        </p>
                    )}
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-brand-black text-white font-sans overflow-hidden">
      <AuthModal isOpen={authModal.isOpen} initialMode={authModal.mode} onClose={() => setAuthModal({ ...authModal, isOpen: false })} onSuccess={handleLoginSuccess} onOpenLegal={setLegalModalType} />
      <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
      
      <Header 
        isLoggedIn={!!token} 
        userRole={userRole} 
        onLoginClick={() => setAuthModal({ isOpen: true, mode: 'login' })} 
        onRegisterClick={() => setAuthModal({ isOpen: true, mode: 'register' })} 
        onLogoutClick={() => { localStorage.clear(); window.location.reload(); }} 
        isBotGloballyActive={isBotGloballyActive} 
        onToggleBot={() => setIsBotGloballyActive(!isBotGloballyActive)} 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        connectionStatus={connectionStatus}
      />

      <main className="flex-1 overflow-hidden flex relative">
        {!token ? (
            <LandingPage 
                onAuth={() => setAuthModal({ isOpen: true, mode: 'login' })} 
                onRegister={() => setAuthModal({ isOpen: true, mode: 'register' })}
                visibleMessages={visibleMessages}
                isSimTyping={isSimTyping}
                simScrollRef={simScrollRef}
                onOpenLegal={setLegalModalType}
                isServerReady={isServerReady}
            />
        ) : (
            <>
              {currentView === View.ADMIN_GLOBAL ? (
                <AdminDashboard token={token} backendUrl={BACKEND_URL} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.AUDIT_MODE); }} />
              ) : currentView === View.AUDIT_MODE && auditTarget ? (
                <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} />
              ) : currentView === View.DASHBOARD ? (
                <AgencyDashboard token={token!} backendUrl={BACKEND_URL} settings={settings!} onUpdateSettings={handleUpdateSettings} />
              ) : currentView === View.SETTINGS ? (
                <SettingsPanel settings={settings} isLoading={isLoadingSettings} onUpdateSettings={handleUpdateSettings} onOpenLegal={setLegalModalType} />
              ) : currentView === View.CONNECTION ? (
                <ConnectionPanel 
                    status={connectionStatus} 
                    qrCode={qrCode} 
                    pairingCode={pairingCode}
                    onConnect={handleConnect}
                    onDisconnect={() => fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token) })}
                />
              ) : (
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                        <ConversationList 
                            conversations={conversations} 
                            selectedConversationId={selectedConversationId} 
                            onSelectConversation={setSelectedConversationId} 
                            backendError={backendError}
                        />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow 
                            conversation={selectedConversation} 
                            onSendMessage={handleSendMessage}
                            onToggleBot={(id) => fetch(`${BACKEND_URL}/api/conversation/update`, {
                                method: 'POST',
                                headers: getAuthHeaders(token),
                                body: JSON.stringify({ id, updates: { isBotActive: !selectedConversation?.isBotActive } })
                            })}
                            isTyping={isTyping}
                            isBotGloballyActive={isBotGloballyActive}
                            isMobile={true} 
                            onBack={() => setSelectedConversationId(null)}
                            onUpdateConversation={(id, updates) => {
                                setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
                                fetch(`${BACKEND_URL}/api/conversation/update`, {
                                    method: 'POST',
                                    headers: getAuthHeaders(token),
                                    body: JSON.stringify({ id, updates })
                                });
                            }}
                        />
                    </div>
                </div>
              )}
            </>
        )}
      </main>
    </div>
  );
}

function LandingPage({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady }: any) {
    return (
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden bg-brand-black flex flex-col font-sans">
            <div className="absolute inset-0 neural-grid opacity-40 z-0"></div>
            
            <section className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-12 pt-24 pb-32">
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="space-y-10 text-center lg:text-left">
                        {/* SYSTEM ONLINE BADGE */}
                        <div className={`inline-flex items-center gap-3 px-4 py-1.5 border rounded-full text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-xl transition-all ${isServerReady ? 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-brand-gold/30 bg-brand-gold/5 text-brand-gold'}`}>
                            <span className={`w-2 h-2 rounded-full ${isServerReady ? 'bg-green-500 animate-pulse' : 'bg-brand-gold animate-pulse'}`}></span>
                            {isServerReady ? 'SISTEMA ONLINE' : 'Conectando Nodo...'}
                        </div>
                        
                        <h1 className="text-6xl md:text-8xl lg:text-[90px] font-black text-white leading-tight tracking-normal py-2">
                            Vender en <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold-dark">Piloto Automático</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 leading-relaxed border-l-4 border-brand-gold/40 pl-8 mx-auto lg:mx-0 max-w-2xl font-medium">
                            La infraestructura neural diseñada para escalar negocios de todos los rubros. Dominion filtra curiosos y califica a tus leads en tiempo real, entregándote solo clientes listos para comprar. Vende 24/7 sin esfuerzo operativo.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-start pt-6">
                            <button onClick={onRegister} className="px-12 py-6 bg-brand-gold text-black rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_15px_50px_rgba(212,175,55,0.4)] hover:scale-105 active:scale-95 transition-all">Solicitar Acceso</button>
                            <button onClick={onAuth} className="px-12 py-6 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all">Iniciar Sesión</button>
                        </div>
                    </div>

                    <div className="relative w-full mt-12 lg:mt-0">
                         <div className="absolute inset-0 bg-brand-gold blur-[150px] opacity-10 rounded-full animate-pulse"></div>
                         <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[40px] shadow-[0_60px_120px_rgba(0,0,0,0.9)] overflow-hidden h-[550px] md:h-[650px] flex flex-col border-t-white/20">
                            <div className="px-8 py-5 border-b border-white/5 bg-black/80 flex items-center justify-between">
                                <div className="flex gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500/30"></div>
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/30"></div>
                                    <div className="w-3 h-3 rounded-full bg-green-500/30"></div>
                                </div>
                                <div className="px-4 py-1.5 bg-brand-gold/10 rounded-full text-[10px] text-brand-gold font-black uppercase tracking-[0.2em] border border-brand-gold/20">
                                    Signal Pipeline v2.7.6
                                </div>
                            </div>
                            <div ref={simScrollRef} className="flex-1 p-8 md:p-10 space-y-8 overflow-y-auto scroll-smooth custom-scrollbar bg-[#080808]">
                                {visibleMessages.map((msg: any, idx: number) => (
                                    <div key={idx} className={`flex flex-col max-w-[85%] ${msg.type === 'user' ? 'self-start items-start' : 'self-end items-end ml-auto'} animate-fade-in`}>
                                        <div className={`p-5 md:p-6 rounded-[28px] text-[13px] md:text-[14px] leading-relaxed shadow-2xl whitespace-pre-wrap ${msg.type === 'user' ? 'bg-white/10 text-gray-200 rounded-bl-none border border-white/5' : 'bg-gradient-to-br from-brand-gold to-brand-gold-dark text-black font-bold rounded-br-none shadow-[0_10px_30px_rgba(212,175,55,0.2)]'}`}>{msg.text}</div>
                                        {msg.statusLabel && (
                                            <span className={`mt-3 text-[10px] font-black uppercase px-4 py-1.5 rounded-full border tracking-widest ${
                                                msg.statusLabel.includes('CALIENTE') || msg.statusLabel.includes('CERRADA') 
                                                ? 'text-red-400 border-red-500/30 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                                                : (msg.statusLabel.includes('TIBIO') ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-blue-400 border-blue-500/30 bg-blue-500/10')
                                            }`}>{msg.statusLabel}</span>
                                        )}
                                    </div>
                                ))}
                                {isSimTyping && (
                                    <div className="self-end animate-fade-in ml-auto">
                                        <div className="bg-brand-gold/20 p-5 rounded-[28px] rounded-br-none w-24 flex items-center justify-center gap-2 border border-brand-gold/30 shadow-lg">
                                            <div className="w-2 h-2 bg-brand-gold rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-brand-gold rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                            <div className="w-2 h-2 bg-brand-gold rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                         </div>
                    </div>
                </div>
            </section>

            <footer className="relative z-10 w-full border-t border-white/5 bg-brand-black/95 backdrop-blur-2xl px-12 py-16 flex flex-col md:flex-row justify-between items-center gap-12">
                <div className="text-center md:text-left space-y-4">
                    <p className="text-white font-black text-lg tracking-tight flex items-center justify-center md:justify-start gap-2">
                        Dominion Bot by <a href="https://websoin.netlify.app" target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-gold-light transition-colors">SO-&gt;IN</a>
                    </p>
                    <div className="flex gap-6 justify-center md:justify-start items-center">
                        <a href="https://www.instagram.com/so.in_mendoza/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-brand-gold transition-colors">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.332 3.608 1.308.975.975 1.245 2.242 1.308 3.607.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.063 1.366-.333 2.633-1.308 3.608-.975.975-2.242 1.245-3.607 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.063-2.633-.333-3.608-1.308-.975-.975-1.245-2.242-1.308-3.607-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.332-2.633 1.308-3.608.975-.975 2.242-1.245 3.607-1.308 1.266-.058-1.646-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948s.014 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072s3.667-.014 4.947-.072c4.358-.2 6.78-2.618 6.98-6.98.058-1.281.072-1.689.072-4.948s-.014-3.667-.072-4.947c-.2-4.358-2.618-6.78-6.98-6.98-1.281-.058-1.689-.072-4.948-.072zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        </a>
                    </div>
                    <p className="text-gray-600 text-[10px] font-black uppercase tracking-[0.3em]">Neural Infrastructure Division • Mendoza, ARG</p>
                </div>

                <div className="flex flex-col items-center md:items-end gap-6">
                    <div className="flex gap-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        <button onClick={() => onOpenLegal('privacy')} className="hover:text-brand-gold transition-colors">Privacidad</button>
                        <button onClick={() => onOpenLegal('terms')} className="hover:text-brand-gold transition-colors">Términos</button>
                        <button onClick={() => onOpenLegal('manifesto')} className="hover:text-brand-gold transition-colors">Manifiesto</button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
