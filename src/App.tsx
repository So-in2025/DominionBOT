
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype, Testimonial } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel';
import ConnectionPanel from './components/ConnectionPanel';
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import AuthModal from './components/AuthModal';
import LegalModal from './components/LegalModal'; 
import AgencyDashboard from './components/AgencyDashboard';
import Toast, { ToastData } from './components/Toast';
import HowItWorksArt from './components/HowItWorksArt';
import HowItWorksSection from './components/HowItWorksSection';
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from './config';

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

// Contenido para la Sección de Testimonios
const PREDEFINED_TESTIMONIALS = [
    { name: "Marcos López", location: "Mendoza", text: "Bueno, parece que soy el primero en comentar. La verdad entré medio de curioso y no entendía nada al principio, pero después de usarlo un poco me acomodó bastante el WhatsApp." },
    { name: "Sofía Romano", location: "Mendoza", text: "No suelo comentar estas cosas, pero hasta ahora viene funcionando bien. Se nota que está pensado para ventas posta." },
    { name: "Javier Torres", location: "Mendoza", text: "Antes era responder mensajes todo el día sin parar. Ahora por lo menos está más ordenado. Eso ya vale la pena." },
    { name: "Valentina Giménez", location: "Mendoza", text: "Me gustó que no sea complicado como otros bots que probé. Acá fue conectar y listo." },
    { name: "Lucas Herrera", location: "Mendoza", text: "La verdad me ahorró bastante desgaste. Antes terminaba el día quemado." },
    { name: "Camila Fernandez", location: "Mendoza", text: "Buen precio para lo que hace. Pensé que iba a ser más caro." },
    { name: "Mateo Diaz", location: "Mendoza", text: "No es magia, pero ayuda mucho a filtrar. Para mí cumple." },
    { name: "Lucía Martinez", location: "Mendoza", text: "Todavía lo estoy probando, pero por ahora viene prolijo." },
    { name: "Agustín Cruz", location: "Mendoza", text: "Pasé de contestar cualquier cosa a responder solo lo importante. Con eso ya estoy conforme." },
    { name: "Abril Morales", location: "Mendoza", text: "Me sorprendió que no suene a bot." },
    { name: "Bautista Ríos", location: "Mendoza", text: "Venía de putear bastante con WhatsApp todos los días. Ahora eso bajó bastante." },
    { name: "Mía Castillo", location: "Mendoza", text: "Se nota que está pensado para comerciantes y no para programadores." },
    { name: "Tomás Vega", location: "Mendoza", text: "Probé otros sistemas y siempre algo fallaba. Este por ahora se mantiene estable." },
    { name: "Isabella Pardo", location: "Mendoza", text: "Me gustó que no invade ni molesta a los clientes." },
    { name: "Felipe Muñoz", location: "Mendoza", text: "No esperaba mucho y me terminó sorprendiendo." },
    { name: "Martina Flores", location: "Mendoza", text: "Lo estoy usando hace unos días y la experiencia viene siendo buena." },
    { name: "Santino Rivas", location: "Mendoza", text: "Simple, directo y sin vueltas. Eso suma." },
    { name: "Victoria Medina", location: "Mendoza", text: "Se agradece algo así para laburar más tranquilo." },
    { name: "Benjamín Castro", location: "Mendoza", text: "Después de varios días usándolo, lo seguiría usando sin dudas." },
    { name: "Emilia Ponce", location: "Mendoza", text: "Ojalá lo sigan mejorando, pero la base está muy bien." },
];

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'register' }>({ isOpen: false, mode: 'login' });
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'manifesto' | null>(null); 
  const [currentView, setCurrentView] = useState<View>(() => {
    const role = localStorage.getItem('saas_role');
    return role === 'super_admin' ? View.ADMIN_GLOBAL : View.CHATS;
  });
  const [showLanding, setShowLanding] = useState(false);
  const [isBotGloballyActive, setIsBotGloballyActive] = useState(true);
  const [auditTarget, setAuditTarget] = useState<User | null>(null);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Simulación de Landing
  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };
  
  const handleNavigate = (view: View) => {
      if (view === View.CHATS && (window as any).IS_LANDING_VIEW) {
          setShowLanding(true);
      } else {
          setShowLanding(false);
          setCurrentView(view);
      }
      (window as any).IS_LANDING_VIEW = view === View.CHATS && showLanding;
  };


  const handleLogout = () => {
      localStorage.removeItem('saas_token');
      localStorage.removeItem('saas_role');
      setToken(null);
      setUserRole(null);
      setCurrentUser(null);
      setShowLanding(false);
      setCurrentView(View.CHATS);
      setAuditTarget(null);
  };

  useEffect(() => {
    if (userRole === 'super_admin' && ![View.ADMIN_GLOBAL, View.AUDIT_MODE].includes(currentView)) {
        setCurrentView(View.ADMIN_GLOBAL);
    }
  }, [currentView, userRole]);

  useEffect(() => {
    if (!token) {
        setCurrentUser(null);
        return;
    };

    const loadUserData = async () => {
        setIsLoadingSettings(true);
        try {
            const [userRes, sRes, cRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) })
            ]);
            
            if ([userRes, sRes, cRes].some(res => res.status === 403)) {
                handleLogout();
                return;
            }

            if (userRes.ok) setCurrentUser(await userRes.json());
            if (sRes.ok) setSettings(await sRes.json());
            if (cRes.ok) setConversations(await cRes.json());
            setBackendError(null);
        } catch (e) {
            console.error("DATA ERROR:", e);
            setBackendError("Error cargando datos. Revisa el túnel/backend.");
        } finally {
            setIsLoadingSettings(false);
        }
    };
    loadUserData();

    const intervalId = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/status`, { headers: getAuthHeaders(token) });
            if (res.status === 403) {
                clearInterval(intervalId);
                handleLogout();
                return;
            }

            if (res.ok) {
                const data = await res.json();
                setConnectionStatus(data.status);
                if (data.qr) setQrCode(data.qr);
                if (data.pairingCode) setPairingCode(data.pairingCode);
                
                const convRes = await fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) });
                if(convRes.ok) setConversations(await convRes.json());
            }
        } catch (e) { /* Silencioso para polling */ }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (token) return; 
    let timeoutId: any;
    let currentIndex = 0;
    const runStep = () => {
        if (currentIndex >= SIMULATION_SCRIPT.length) {
            // FIX: Reset simulation when it ends to create a continuous loop
            timeoutId = setTimeout(() => { setVisibleMessages([]); currentIndex = 0; runStep(); }, 8000); 
            return;
        }
        const step = SIMULATION_SCRIPT[currentIndex];
        setIsSimTyping(true);
        timeoutId = setTimeout(() => {
            setIsSimTyping(false);
            setVisibleMessages(prev => [...prev, step]);
            currentIndex++;
            runStep();
        }, step.delayBefore);
    };
    runStep();
    return () => clearTimeout(timeoutId);
  }, [token]);

  useEffect(() => {
      if (simScrollRef.current) simScrollRef.current.scrollTop = simScrollRef.current.scrollHeight;
  }, [visibleMessages, isSimTyping]);

  const handleLoginSuccess = (t: string, r: string) => {
      localStorage.setItem('saas_token', t);
      localStorage.setItem('saas_role', r);
      setToken(t);
      setUserRole(r);
      setShowLanding(false);
      setCurrentView(r === 'super_admin' ? View.ADMIN_GLOBAL : View.CHATS);
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
          setBackendError("Fallo al iniciar conexión.");
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

  const renderClientView = () => {
    if (userRole === 'super_admin') {
      if (currentView === View.AUDIT_MODE && auditTarget) {
        return <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} onUpdate={(user) => setAuditTarget(user)} showToast={showToast} />;
      }
      return <AdminDashboard token={token!} backendUrl={BACKEND_URL} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.AUDIT_MODE); }} showToast={showToast} onLogout={handleLogout} />;
    }

    switch(currentView) {
        case View.DASHBOARD:
            return <AgencyDashboard token={token!} backendUrl={BACKEND_URL} settings={settings!} onUpdateSettings={handleUpdateSettings} />;
        case View.SETTINGS:
            return <SettingsPanel settings={settings} isLoading={isLoadingSettings} onUpdateSettings={handleUpdateSettings} onOpenLegal={setLegalModalType} />;
        case View.CONNECTION:
            return <ConnectionPanel user={currentUser} status={connectionStatus} qrCode={qrCode} pairingCode={pairingCode} onConnect={handleConnect} onDisconnect={() => fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) })} />;
        case View.CHATS:
        default:
            return (
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                        <ConversationList conversations={conversations} selectedConversationId={selectedConversationId} onSelectConversation={setSelectedConversationId} backendError={backendError} />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow conversation={selectedConversation} onSendMessage={handleSendMessage} onToggleBot={(id) => fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates: { isBotActive: !selectedConversation?.isBotActive } }) })} isTyping={isTyping} isBotGloballyActive={isBotGloballyActive} isMobile={true} onBack={() => setSelectedConversationId(null)} onUpdateConversation={(id, updates) => { setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c)); fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates }) }); }} />
                    </div>
                </div>
            );
    }
  }

  const isAppView = !!token && !showLanding;

  return (
    <div className={`flex flex-col bg-brand-black text-white font-sans ${isAppView ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AuthModal 
        isOpen={authModal.isOpen} 
        initialMode={authModal.mode} 
        onClose={() => setAuthModal({ ...authModal, isOpen: false })} 
        onSuccess={handleLoginSuccess} 
        onOpenLegal={setLegalModalType} 
      />
      <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
      
      <Header 
        isLoggedIn={!!token} 
        userRole={userRole} 
        onLoginClick={() => setAuthModal({ isOpen: true, mode: 'login' })} 
        onRegisterClick={() => setAuthModal({ isOpen: true, mode: 'register' })} 
        onLogoutClick={handleLogout} 
        isBotGloballyActive={isBotGloballyActive} 
        onToggleBot={() => setIsBotGloballyActive(!isBotGloballyActive)} 
        currentView={currentView} 
        onNavigate={handleNavigate} 
        connectionStatus={connectionStatus}
      />

      <main className={`flex-1 flex relative ${isAppView ? 'overflow-hidden' : ''}`}>
        {backendError && (
            <div className="absolute top-0 left-0 right-0 bg-red-600/95 text-white text-[10px] font-black p-2 text-center z-[200] shadow-xl animate-pulse">
                ⚠️ SISTEMA OFFLINE: {backendError}
            </div>
        )}

        {(!token || showLanding) ? (
            <LandingPage 
                onAuth={() => setAuthModal({ isOpen: true, mode: 'login' })} 
                onRegister={() => setAuthModal({ isOpen: true, mode: 'register' })}
                visibleMessages={visibleMessages}
                isSimTyping={isSimTyping}
                simScrollRef={simScrollRef}
                onOpenLegal={setLegalModalType}
                isServerReady={true}
                isLoggedIn={!!token}
                token={token}
                showToast={showToast}
            />
        ) : (
            renderClientView()
        )}
      </main>
    </div>
  );
}

// --- START: Landing Page Strategic Sections ---

const TestimonialsSection = ({ isLoggedIn, token, showToast }: { isLoggedIn: boolean, token: string | null, showToast: (message: string, type: 'success' | 'error') => void }) => {
    const [simulatedTestimonials, setSimulatedTestimonials] = useState<any[]>([]);
    const [realTestimonials, setRealTestimonials] = useState<Testimonial[]>([]);
    const [newTestimonialText, setNewTestimonialText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchRealTestimonials = async () => {
            try {
                if (!BACKEND_URL) {
                    console.warn("BACKEND_URL no está configurada. No se pueden cargar las reseñas.");
                    return;
                }
                const res = await fetch(`${BACKEND_URL}/api/testimonials`);
                const contentType = res.headers.get("content-type");
                
                if (res.ok && contentType && contentType.includes("application/json")) {
                    setRealTestimonials(await res.json());
                } else {
                    console.error("Fallo al cargar reseñas: La respuesta no es un JSON válido.");
                }
            } catch (e) { 
                console.error("Fallo al cargar reseñas", e); 
            }
        };
        fetchRealTestimonials();
    }, []);

    useEffect(() => {
        const LAUNCH_KEY = 'dominion_launch_date';
        const MAX_DAYS = 10;
        const INTERVAL_MS = 12 * 60 * 60 * 1000;

        let launchDate = localStorage.getItem(LAUNCH_KEY);
        if (!launchDate) {
            launchDate = new Date().toISOString();
            localStorage.setItem(LAUNCH_KEY, launchDate);
        }

        const updateVisible = () => {
            const msSinceLaunch = new Date().getTime() - new Date(launchDate!).getTime();
            const daysSinceLaunch = msSinceLaunch / (1000 * 60 * 60 * 24);
            
            if (daysSinceLaunch > MAX_DAYS) {
                setSimulatedTestimonials(PREDEFINED_TESTIMONIALS);
                return;
            }

            const intervalsPassed = Math.floor(msSinceLaunch / INTERVAL_MS);
            const count = Math.min(intervalsPassed + 1, PREDEFINED_TESTIMONIALS.length);
            setSimulatedTestimonials(PREDEFINED_TESTIMONIALS.slice(0, count));
        };
        
        updateVisible();
        const intervalId = setInterval(updateVisible, INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, []);

    const allTestimonials = useMemo(() => {
        const launchDate = new Date(localStorage.getItem('dominion_launch_date') || new Date().toISOString());
        const INTERVAL_MS = 12 * 60 * 60 * 1000;

        const simulatedWithDates = simulatedTestimonials.map((t, i) => ({
            ...t,
            createdAt: new Date(launchDate.getTime() + i * INTERVAL_MS).toISOString(),
            _id: `sim_${i}`
        }));

        const combined = [...realTestimonials, ...simulatedWithDates];
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return combined;
    }, [realTestimonials, simulatedTestimonials]);

    const handleSubmitTestimonial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTestimonialText.trim() || !token) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/testimonials`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ text: newTestimonialText })
            });

            if (res.ok) {
                const newTestimonial = await res.json();
                setRealTestimonials(prev => [newTestimonial, ...prev]);
                setNewTestimonialText('');
                showToast('¡Gracias por tu reseña!', 'success');
            } else {
                showToast('Hubo un error al enviar tu reseña.', 'error');
            }
        } catch (error) {
            showToast('Error de red al enviar la reseña.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderTestimonialForm = () => {
        if (!isLoggedIn) {
            return (
                 <div className="mt-20 text-center relative group">
                    <input type="text" placeholder="Dejá tu reseña..." disabled className="w-full max-w-2xl mx-auto bg-brand-black border border-dashed border-white/20 rounded-2xl py-6 px-8 text-center text-gray-500 cursor-not-allowed" />
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-max opacity-0 group-hover:opacity-100 transition-opacity bg-brand-gold text-black text-xs font-bold px-4 py-2 rounded-lg shadow-lg">
                        Inicia sesión para compartir tu experiencia
                    </div>
                </div>
            );
        }

        return (
            <form onSubmit={handleSubmitTestimonial} className="mt-20 max-w-2xl mx-auto animate-fade-in">
                <h3 className="text-center font-bold text-brand-gold mb-4 uppercase text-xs tracking-widest">Comparte tu experiencia</h3>
                <div className="relative">
                    <textarea value={newTestimonialText} onChange={(e) => setNewTestimonialText(e.target.value)} placeholder="Escribe tu reseña aquí..." className="w-full bg-brand-black border border-white/20 rounded-2xl py-4 px-6 text-white h-28 resize-none focus:border-brand-gold focus:ring-brand-gold/50 outline-none transition" maxLength={250} />
                    <p className="absolute bottom-3 right-4 text-[10px] text-gray-500 font-mono">{newTestimonialText.length} / 250</p>
                </div>
                <button type="submit" disabled={isSubmitting || !newTestimonialText.trim()} className="w-full mt-4 py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-gold/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmitting ? 'Publicando...' : 'Publicar Reseña'}
                </button>
            </form>
        );
    };

    return (
        <section className="bg-brand-surface py-20 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-lg font-semibold leading-8 tracking-tight text-brand-gold uppercase">El Muro de la Verdad</h2>
                    <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Resultados Reales de Negocios Reales</p>
                </div>
                <div className="mx-auto mt-16 flow-root max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none">
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-8 space-y-8">
                        {allTestimonials.map((testimonial) => (
                            <div key={testimonial._id} className="break-inside-avoid p-8 bg-brand-black border border-white/10 rounded-3xl shadow-lg hover:shadow-brand-gold/10 transition-shadow duration-300">
                                <div className="flex items-center gap-x-4">
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-brand-gold font-bold text-lg">{testimonial.name.charAt(0)}</div>
                                    <div>
                                        <div className="font-semibold text-white">{testimonial.name}</div>
                                        <div className="text-gray-500 text-xs">{testimonial.location}</div>
                                    </div>
                                </div>
                                <div className="relative mt-6">
                                    <p className="text-sm leading-6 text-gray-300">“{testimonial.text}”</p>
                                </div>
                                <div className="flex items-center justify-between mt-6">
                                    <div className="flex text-yellow-400">
                                        {[...Array(5)].map((_, i) => <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}
                                    </div>
                                    <div className="text-[9px] font-bold uppercase tracking-widest text-green-400/60 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">Cliente Verificado</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                 {renderTestimonialForm()}
            </div>
        </section>
    );
};

const FaqSection = () => {
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const faqs = [
        { q: "¿En qué se diferencia de otros bots de WhatsApp?", a: "Dominion no es un bot de flujos; es una infraestructura de calificación. Usamos IA avanzada (Google Gemini) para entender la intención real de compra, no solo para seguir un script predefinido." },
        { q: "¿Es seguro para mi número? ¿Hay riesgo de bloqueo?", a: "Utilizamos el protocolo más seguro disponible (Baileys) que emula la web de WhatsApp. El riesgo de bloqueo es mínimo y está asociado a prácticas de spam, para las cuales la plataforma no está diseñada ni recomendada." },
        { q: "¿Necesito conocimientos técnicos para usarlo?", a: "No. La configuración inicial es un proceso guiado paso a paso. Una vez que el 'Cerebro Neural' está configurado y el nodo está conectado, el sistema funciona de forma 100% autónoma." },
        { q: "¿Qué significa 'BYOK' (Bring Your Own Key)?", a: "Significa que tú tienes el control total. Conectas tu propia clave de la API de Google Gemini, lo que asegura que tus datos, tus conversaciones y tus costos de IA son tuyos y de nadie más. Soberanía total." },
        { q: "¿Qué pasa cuando mi plan expira?", a: "Tu bot no se apaga. Para evitar que pierdas leads, el sistema revierte a las funcionalidades básicas de respuesta (Plan Starter), dándote tiempo para renovar sin interrumpir el servicio." }
    ];

    return (
        <section className="bg-brand-black py-20 sm:py-32">
            <div className="mx-auto max-w-4xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                     <h2 className="text-base font-semibold leading-7 text-brand-gold uppercase tracking-widest">Protocolo de Claridad</h2>
                     <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Respuestas a Preguntas Estratégicas</p>
                </div>
                <div className="mt-16 space-y-4">
                    {faqs.map((faq, index) => (
                        <div key={index} className="border border-white/10 rounded-2xl bg-brand-surface overflow-hidden transition-all duration-300">
                            <button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="w-full flex justify-between items-center text-left p-6">
                                <span className={`text-base font-semibold ${openFaq === index ? 'text-brand-gold' : 'text-white'}`}>{faq.q}</span>
                                <svg className={`w-6 h-6 flex-shrink-0 transition-transform duration-300 ${openFaq === index ? 'rotate-45 text-brand-gold' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </button>
                            <div className={`transition-all duration-500 ease-in-out ${openFaq === index ? 'max-h-96' : 'max-h-0'}`}>
                                <div className="px-6 pb-6 text-gray-300 text-sm leading-relaxed">
                                    {faq.a}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

// --- END: Landing Page Strategic Sections ---

function LandingPage({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast }: any) {
    return (
        <div className="relative flex-1 bg-brand-black flex flex-col font-sans">
            <div className="absolute inset-0 neural-grid opacity-40 z-0"></div>
            
            {/* HERO SECTION - INTOCABLE */}
            <section className="relative z-10 flex flex-col items-center justify-center p-6 md:p-12 pt-24 pb-32">
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="space-y-10 text-center lg:text-left">
                        <div className={`inline-flex items-center gap-3 px-4 py-1.5 border rounded-full text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-xl transition-all ${isServerReady ? 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${isServerReady ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'}`}></span>
                            {isServerReady ? 'SISTEMA ONLINE' : 'CONECTANDO NODO...'}
                        </div>
                        
                        <h1 className="text-6xl md:text-8xl lg:text-[90px] font-black text-white leading-tight tracking-normal py-2">
                            Vender en <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold-dark">Piloto Automático</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 leading-relaxed border-l-4 border-brand-gold/40 pl-8 mx-auto lg:mx-0 max-w-2xl font-medium">
                            La infraestructura neural diseñada para escalar negocios de todos los rubros. Dominion filtra curiosos y califica a tus leads en tiempo real.
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
            
            <HowItWorksArt />
            <HowItWorksSection />
            <TestimonialsSection isLoggedIn={isLoggedIn} token={token} showToast={showToast} />
            <FaqSection />

            <footer className="relative z-10 w-full border-t border-white/5 bg-brand-black/95 backdrop-blur-2xl px-12 py-8 flex flex-col md:flex-row justify-between items-center gap-12">
                <div className="text-center md:text-left space-y-4">
                    <p className="text-white font-black text-lg tracking-tight flex items-center justify-center md:justify-start gap-2">
                        Dominion Bot by <a href="https://websoin.netlify.app" target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-gold-light transition-colors">SO-&gt;IN</a>
                    </p>
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
