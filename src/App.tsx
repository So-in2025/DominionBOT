
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype, Testimonial } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel';
import ConnectionPanel from './components/ConnectionPanel';
import BlacklistPanel from './components/BlacklistPanel'; // IMPORTED
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import AuthModal from './components/AuthModal';
import LegalModal from './components/LegalModal'; 
import AgencyDashboard from './components/AgencyDashboard';
import Toast, { ToastData } from './components/Toast';
import HowItWorksArt from './components/HowItWorksArt';
import HowItWorksSection from './components/HowItWorksSection';
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from './config';
import { audioService } from './services/audioService';

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
    { name: "Marcos López", location: "Mendoza", text: "Bueno, parece que soy el primero en comentar. La verdad entré medio de curioso, pero luego de probar la demo me pareció muy útil, y práctica, los demás bots son muy caros y difíciles de configurar!. Excelente su trabajo." },
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
    { name: "Martina Flores", location: "Mendoza", "text": "Lo estoy usando hace unos días y la experiencia viene siendo buena." },
    { name: "Santino Rivas", location: "Mendoza", "text": "Simple, directo y sin vueltas. Eso suma." },
    { name: "Victoria Medina", location: "Mendoza", text: "Se agradece algo así para laburar más tranquilo." },
    { name: "Benjamín Castro", location: "Mendoza", text: "Después de varios días usándolo, lo seguiría usando sin dudas." },
    { name: "Emilia Ponce", location: "Mendoza", text: "Ojalá lo sigan mejorando, pero la base está muy bien." },
];

const TrialBanner: React.FC<{ user: User | null, supportNumber: string | null }> = ({ user, supportNumber }) => {
    if (!user || user.role === 'super_admin' || user.plan_status === 'active') return null;

    const endDate = new Date(user.billing_end_date);
    const now = new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const qualifiedLeads = user.trial_qualified_leads_count || 0;
    const maxLeads = 3; // Updated limit to 3

    // Case 1: Trial Active
    if (user.plan_status === 'trial' && daysRemaining > 0 && qualifiedLeads < maxLeads) {
        return (
            <div className="bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark text-black text-center py-2 px-4 text-xs font-bold shadow-lg">
                Estás en un período de prueba PRO. Finaliza en {daysRemaining} {daysRemaining > 1 ? 'días' : 'día'} o al calificar tus primeros {maxLeads - qualifiedLeads} leads.
            </div>
        );
    }

    // Case 2: Trial Ended or Expired
    if (user.plan_status === 'expired' || (user.plan_status === 'trial' && (daysRemaining <= 0 || qualifiedLeads >= maxLeads))) {
        if (!sessionStorage.getItem('trial_ended_alert_played')) {
            audioService.play('alert_warning_trial_ended');
            sessionStorage.setItem('trial_ended_alert_played', 'true');
        }
        
        // Use dynamic support number or fallback if not set yet.
        const targetNumber = supportNumber || '5492612345678';
        const message = encodeURIComponent(`Hola, mi prueba terminó (Usuario: ${user.username}). Quiero activar mi licencia PRO. Solcito datos de pago (CBU/Alias).`);
        const waLink = `https://wa.me/${targetNumber}?text=${message}`;

        const isSuccessLimit = qualifiedLeads >= maxLeads;
        const bannerText = isSuccessLimit 
            ? "¡Objetivo Cumplido! Has calificado tus primeros 3 leads. Tu prueba ha concluido por éxito. Activa tu licencia para escalar."
            : "Tu período de prueba ha finalizado por tiempo. Activa tu licencia para restaurar las funcionalidades.";

        return (
            <div className="bg-red-800 text-white text-center py-2 px-4 text-xs font-bold shadow-lg flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 animate-fade-in">
                <span>{bannerText}</span>
                <a 
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white text-red-800 px-4 py-1.5 rounded-full font-black text-[10px] uppercase hover:scale-105 transition-transform flex items-center gap-2 shadow-sm"
                >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    Solicitar Licencia
                </a>
            </div>
        );
    }

    return null;
};

const TestimonialsSection = ({ isLoggedIn, token, showToast }: { isLoggedIn: boolean, token: string | null, showToast: (message: string, type: 'success' | 'error' | 'info') => void }) => {
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTestimonial, setNewTestimonial] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchTestimonials = async () => {
            if (!BACKEND_URL) {
                 // Fallback if no backend
                 setTestimonials(PREDEFINED_TESTIMONIALS as any);
                 setLoading(false);
                 return;
            }
            try {
                const res = await fetch(`${BACKEND_URL}/api/testimonials`);
                if (res.ok) {
                    const data = await res.json();
                    setTestimonials(data.length > 0 ? data : PREDEFINED_TESTIMONIALS);
                } else {
                     setTestimonials(PREDEFINED_TESTIMONIALS as any);
                }
            } catch (error) {
                setTestimonials(PREDEFINED_TESTIMONIALS as any);
            } finally {
                setLoading(false);
            }
        };
        fetchTestimonials();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTestimonial.trim() || !token) return;
        setSubmitting(true);
        try {
             const res = await fetch(`${BACKEND_URL}/api/testimonials`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ text: newTestimonial })
            });
            if (res.ok) {
                const added = await res.json();
                setTestimonials(prev => [added, ...prev]);
                setNewTestimonial("");
                showToast("Testimonio publicado. ¡Gracias!", 'success');
            } else {
                showToast("Error al publicar testimonio.", 'error');
            }
        } catch (e) {
             showToast("Error de conexión.", 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="py-20 bg-black relative border-t border-white/5">
             <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                     <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">La Voz de la Red</h2>
                     <p className="text-gray-400 text-sm max-w-2xl mx-auto">Lo que dicen quienes ya operan con Dominion.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {testimonials.map((t, i) => (
                        <div key={i} className="bg-white/5 border border-white/5 p-6 rounded-2xl relative">
                             <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold font-bold text-lg">
                                    {t.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-sm">{t.name}</h4>
                                    <p className="text-gray-500 text-xs">{t.location}</p>
                                </div>
                             </div>
                             <p className="text-gray-300 text-sm italic">"{t.text}"</p>
                        </div>
                    ))}
                </div>

                {isLoggedIn && (
                    <div className="mt-16 max-w-xl mx-auto bg-brand-surface border border-brand-gold/20 p-8 rounded-3xl shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-4 text-center uppercase tracking-widest">Deja tu huella en el sistema</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <textarea 
                                value={newTestimonial} 
                                onChange={e => setNewTestimonial(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none resize-none h-32"
                                placeholder="Comparte tu experiencia..."
                                maxLength={250}
                            />
                            <button disabled={submitting || !newTestimonial.trim()} className="w-full py-3 bg-brand-gold text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50">
                                {submitting ? 'Publicando...' : 'Publicar Testimonio'}
                            </button>
                        </form>
                    </div>
                )}
             </div>
        </section>
    );
};

const FaqSection = () => {
    const faqs = [
        { q: "¿Necesito saber programar?", a: "No. Dominion está diseñado para dueños de negocio. Se configura en 3 pasos simples." },
        { q: "¿Es seguro conectar mi WhatsApp?", a: "Utilizamos un sistema de aislamiento de sesiones. Tu conexión es privada y encriptada." },
        { q: "¿Qué pasa si supero la capa gratuita de Gemini?", a: "Dominion sigue funcionando, pero Google podría facturarte el excedente. La capa gratuita es muy generosa para uso normal." },
        { q: "¿Puedo cancelar cuando quiera?", a: "Sí. No hay contratos forzosos. Eres dueño de tu nodo." }
    ];

    return (
        <section className="py-20 bg-brand-black border-t border-white/5">
             <div className="max-w-4xl mx-auto px-6">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-12 text-center">Preguntas Frecuentes</h2>
                <div className="space-y-4">
                    {faqs.map((faq, i) => (
                        <div key={i} className="bg-white/5 rounded-xl p-6 border border-white/5 hover:border-brand-gold/30 transition-colors">
                            <h3 className="text-white font-bold text-sm uppercase tracking-widest mb-2">{faq.q}</h3>
                            <p className="text-gray-400 text-sm">{faq.a}</p>
                        </div>
                    ))}
                </div>
             </div>
        </section>
    );
};

const LandingPage = ({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast }: any) => {
    return (
        <div className="flex-1 flex flex-col font-sans">
             {/* HERO SECTION */}
             <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-40 overflow-hidden">
                <div className="absolute inset-0 bg-brand-black">
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-gold opacity-10 blur-[120px] rounded-full pointer-events-none"></div>
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
                    <div className="space-y-8 text-center lg:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-[10px] font-black uppercase tracking-widest animate-fade-in">
                            <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></span>
                            Sistema Online v2.7
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tighter leading-[0.9]">
                            Automatiza <br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold">Tu Cierre</span>
                        </h1>
                        <p className="text-gray-400 text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed">
                            Infraestructura de inteligencia artificial para WhatsApp. 
                            Filtra curiosos, califica leads y agenda citas en piloto automático.
                            Sin flujos complejos. Sin código.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                             <button onClick={onRegister} className="px-8 py-4 bg-brand-gold text-black rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                                Iniciar Ahora
                             </button>
                             <button onClick={onAuth} className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-colors">
                                Acceso Clientes
                             </button>
                        </div>
                    </div>

                    {/* SIMULATOR PREVIEW */}
                    <div className="relative mx-auto w-full max-w-[400px]">
                        <div className="absolute -inset-1 bg-gradient-to-br from-brand-gold/50 to-transparent rounded-[34px] blur opacity-30"></div>
                        <div className="relative bg-brand-surface border border-white/10 rounded-[32px] overflow-hidden shadow-2xl h-[500px] flex flex-col">
                            <div className="p-4 border-b border-white/10 bg-black/40 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center font-bold text-black text-xs">D</div>
                                <div>
                                    <h3 className="text-xs font-bold text-white">Dominion Bot</h3>
                                    <p className="text-[9px] text-green-400 font-mono">En línea</p>
                                </div>
                            </div>
                            <div ref={simScrollRef} className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar bg-black/20">
                                {visibleMessages.map((m: any) => (
                                    <div key={m.id} className={`flex flex-col max-w-[85%] ${m.type === 'user' ? 'self-start' : 'self-end items-end'}`}>
                                         <div className={`p-3 rounded-2xl text-xs leading-relaxed ${m.type === 'user' ? 'bg-white/10 text-gray-200 rounded-bl-none' : 'bg-brand-gold text-black font-bold rounded-br-none'}`}>
                                            {m.text}
                                         </div>
                                         {m.type === 'bot' && (
                                            <span className={`text-[8px] font-black uppercase mt-1 px-1.5 py-0.5 rounded ${m.statusLabel.includes('CALIENTE') ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                                {m.statusLabel}
                                            </span>
                                         )}
                                    </div>
                                ))}
                                {isSimTyping && (
                                    <div className="self-end bg-brand-gold/20 p-2 rounded-xl rounded-br-none">
                                        <div className="flex gap-1">
                                            <div className="w-1 h-1 bg-brand-gold rounded-full animate-bounce"></div>
                                            <div className="w-1 h-1 bg-brand-gold rounded-full animate-bounce delay-75"></div>
                                            <div className="w-1 h-1 bg-brand-gold rounded-full animate-bounce delay-150"></div>
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

             {/* FOOTER */}
             <footer className="py-12 bg-black border-t border-white/5 text-center">
                <div className="flex justify-center gap-6 mb-8">
                    <button onClick={() => onOpenLegal('terms')} className="text-xs text-gray-500 hover:text-brand-gold uppercase tracking-widest font-bold">Términos</button>
                    <button onClick={() => onOpenLegal('privacy')} className="text-xs text-gray-500 hover:text-brand-gold uppercase tracking-widest font-bold">Privacidad</button>
                    <button onClick={() => onOpenLegal('manifesto')} className="text-xs text-gray-500 hover:text-brand-gold uppercase tracking-widest font-bold">Manifiesto</button>
                </div>
                <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-black">
                    Dominion Infrastructure © 2024
                </p>
             </footer>
        </div>
    );
};

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
  const [supportNumber, setSupportNumber] = useState<string | null>(null);
  
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
  const [isRequestingHistory, setIsRequestingHistory] = useState(false); 

  // Polling interval refs
  const statusPollingIntervalRef = useRef<number | null>(null);
  const convoPollingIntervalRef = useRef<number | null>(null);
  const lastErrorSoundTime = useRef<number>(0);

  // Simulación de Landing
  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);
  
  // Efecto para inicializar el AudioContext y reproducir el sonido de intro en la primera interacción.
  useEffect(() => {
      console.log(`%c [APP.TSX] BACKEND_URL al montar App: ${BACKEND_URL}`, 'background: #3498db; color: white; font-weight: bold;');

      const initAudioAndPlayIntro = () => {
          console.log("[AudioService] User interaction detected, initializing AudioContext.");
          audioService.initContext();
          
          const isLanding = !localStorage.getItem('saas_token');
          if (isLanding && !sessionStorage.getItem('landing_intro_played')) {
              audioService.play('landing_intro');
              sessionStorage.setItem('landing_intro_played', 'true');
          }
      };
      
      document.addEventListener('click', initAudioAndPlayIntro, { once: true, capture: true });
      document.addEventListener('keydown', initAudioAndPlayIntro, { once: true, capture: true });
      document.addEventListener('touchstart', initAudioAndPlayIntro, { once: true, capture: true });

      return () => {
          document.removeEventListener('click', initAudioAndPlayIntro, true);
          document.removeEventListener('keydown', initAudioAndPlayIntro, true);
          document.removeEventListener('touchstart', initAudioAndPlayIntro, true);
      };
  }, []); 

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    if (type === 'error') audioService.play('alert_error_generic');
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
      sessionStorage.removeItem('trial_ended_alert_played');
      setToken(null);
      setUserRole(null);
      setCurrentUser(null);
      setShowLanding(false);
      setCurrentView(View.CHATS);
      setAuditTarget(null);
      
      if (statusPollingIntervalRef.current) {
          clearInterval(statusPollingIntervalRef.current);
          statusPollingIntervalRef.current = null;
      }
      if (convoPollingIntervalRef.current) {
          clearInterval(convoPollingIntervalRef.current);
          convoPollingIntervalRef.current = null;
      }
      setBackendError(null); 
  };

  useEffect(() => {
    if (userRole === 'super_admin' && ![View.ADMIN_GLOBAL, View.AUDIT_MODE].includes(currentView)) {
        setCurrentView(View.ADMIN_GLOBAL);
    }
  }, [currentView, userRole]);

  const triggerErrorAlert = useCallback((message: string, details?: string) => {
      const now = Date.now();
      if (now - lastErrorSoundTime.current > 45000) {
          audioService.play('alert_error_connection');
          lastErrorSoundTime.current = now;
      }
      setBackendError(`${message} ${details ? `(${details})` : ''}`);
  }, []);

  const fetchStatus = useCallback(async () => {
      if (!BACKEND_URL) {
          setBackendError("ERROR CRÍTICO: La URL del backend no está configurada.");
          return;
      }
      if (!token || userRole === 'super_admin') {
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
          setQrCode(null);
          setPairingCode(null);
          setBackendError(null);
          return;
      }
      try {
          const res = await fetch(`${BACKEND_URL}/api/status`, { headers: getAuthHeaders(token) });
          if (res.ok) {
              const statusData = await res.json();
              setConnectionStatus(statusData.status);
              setQrCode(statusData.qr || null);
              setPairingCode(statusData.pairingCode || null);
              if (backendError) setBackendError(null);
          } else {
              const errorText = await res.text();
              triggerErrorAlert(`Fallo al obtener estado del nodo (${res.status}).`, errorText.substring(0, 50));
          }
      } catch (e: any) {
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              triggerErrorAlert("Error de red. Verifique conexión y backend.");
          } else {
              triggerErrorAlert("Fallo de conexión con el nodo central.");
          }
      }
  }, [token, userRole, backendError, triggerErrorAlert]); 

  const fetchConversations = useCallback(async () => {
      if (!BACKEND_URL) return;
      if (!token || userRole === 'super_admin') {
          setConversations([]);
          return;
      }
      try {
          const res = await fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) });
          if (res.ok) {
              const latestConversations = await res.json();
              setConversations(latestConversations.sort((a: Conversation, b: Conversation) => {
                  const dateA = new Date(a.lastActivity || a.firstMessageAt || 0);
                  const dateB = new Date(b.lastActivity || b.firstMessageAt || 0);
                  return dateB.getTime() - dateA.getTime();
              }));
              if (backendError) setBackendError(null);
          } else {
              const errorText = await res.text();
              triggerErrorAlert(`Fallo al obtener conversaciones (${res.status}).`, errorText.substring(0, 50));
          }
      } catch (e: any) {
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              triggerErrorAlert("Error de red al obtener conversaciones.");
          } else {
              triggerErrorAlert("Fallo de conexión al obtener conversaciones.");
          }
      }
  }, [token, userRole, backendError, triggerErrorAlert]); 

  useEffect(() => {
    if (!BACKEND_URL) return;
    if (!token || userRole === 'super_admin') {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
        return;
    }

    fetchStatus();
    fetchConversations();

    statusPollingIntervalRef.current = window.setInterval(fetchStatus, 5000); 
    convoPollingIntervalRef.current = window.setInterval(fetchConversations, 3000); 

    return () => {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
    };
  }, [token, userRole, fetchStatus, fetchConversations]);

  useEffect(() => {
    if (!BACKEND_URL) return;
    if (!token) {
        setCurrentUser(null);
        return;
    };

    const loadInitialUserData = async () => {
        setIsLoadingSettings(true);
        try {
            const [userRes, sRes, settingsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/system/settings`, { headers: getAuthHeaders(token) }) 
            ]);
            
            if ([userRes, sRes].some(res => res.status === 403)) {
                handleLogout();
                return;
            }

            if (userRes.ok) setCurrentUser(await userRes.json());
            if (sRes.ok) setSettings(await sRes.json());
            if (settingsRes.ok) {
                const sysSettings = await settingsRes.json();
                setSupportNumber(sysSettings.supportWhatsappNumber);
            }

            if (backendError) setBackendError(null);
        } catch (e: any) {
            console.error("DATA ERROR:", e);
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                triggerErrorAlert("Error de red al cargar datos iniciales.");
            } else {
                triggerErrorAlert("Fallo de conexión al cargar datos.");
            }
        } finally {
            setIsLoadingSettings(false);
        }
    };
    loadInitialUserData();
    
  }, [token, triggerErrorAlert]); 
  
  useEffect(() => {
    if (token) return; 
    let timeoutId: any;
    let currentIndex = 0;
    const runStep = () => {
        if (currentIndex >= SIMULATION_SCRIPT.length) {
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
      audioService.play('login_welcome');
  };

  const handleConnect = async (phoneNumber?: string) => {
      if (!BACKEND_URL) {
          setBackendError("ERROR CRÍTICO: Backend no configurado.");
          return { ok: false, error: "Backend URL not configured." };
      }
      if (!token) return { ok: false, error: "No authentication token." };
      setQrCode(null);
      setPairingCode(null);
      setConnectionStatus(ConnectionStatus.GENERATING_QR); 
      
      try {
          const res = await fetch(`${BACKEND_URL}/api/connect`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ phoneNumber }) 
          });
          if (res.ok) {
              await fetchStatus(); 
              return { ok: true };
          } else {
              setConnectionStatus(ConnectionStatus.DISCONNECTED); 
              audioService.play('alert_error_connection');
              const errorText = await res.text();
              setBackendError(`Fallo al iniciar conexión (${res.status}). ${errorText.substring(0, 50)}`);
              return { ok: false, error: `Failed to initiate connection: ${res.status}` };
          }
      } catch (e: any) { 
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              setBackendError("Alerta: Error de red al iniciar conexión.");
          } else {
              setBackendError("Fallo al iniciar conexión.");
          }
          audioService.play('alert_error_connection');
          setConnectionStatus(ConnectionStatus.DISCONNECTED); 
          return { ok: false, error: e.message };
      }
  };

  const handleSendMessage = async (text: string) => {
      if (!BACKEND_URL || !selectedConversationId || !token) return;
      try {
          await fetch(`${BACKEND_URL}/api/send`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ to: selectedConversationId, text })
          });
      } catch (e) { console.error(e); }
  };

  const handleUpdateSettings = async (newSettings: BotSettings) => {
      if (!BACKEND_URL || !token) return;
      try {
          const res = await fetch(`${BACKEND_URL}/api/settings`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify(newSettings)
          });
          if (res.ok) {
              setSettings(newSettings);
              audioService.play('action_success');
          } else {
              setBackendError(`Fallo al actualizar configuración (${res.status}).`);
              audioService.play('alert_error_generic');
          }
      } catch (e: any) { 
          console.error(e); 
          audioService.play('alert_error_connection');
      }
  };
  
  // NEW: Toggle Bot Handler with Optimistic Update
  const handleToggleBot = async (id: string) => {
      if (!token) return;
      
      // 1. Optimistic Update (Immediate Feedback)
      setConversations(prev => prev.map(c => 
          c.id === id ? { ...c, isBotActive: !c.isBotActive } : c
      ));

      // 2. Network Request
      try {
          // Calculate the target state based on the updated state
          const targetConversation = conversations.find(c => c.id === id);
          const newBotState = !targetConversation?.isBotActive; // Toggle it

          await fetch(`${BACKEND_URL}/api/conversation/update`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ id, updates: { isBotActive: newBotState } })
          });
      } catch (error) {
          console.error("Error toggling bot:", error);
          showToast('Error al cambiar el estado del bot. Reintentando...', 'error');
          // State will eventually be consistent via polling
      }
  };

  const handleRequestHistory = async () => {
    if (!BACKEND_URL) return;
    if (!token || isRequestingHistory) return;

    setIsRequestingHistory(true);
    showToast('Solicitando historial de mensajes. Esto reiniciará su conexión temporalmente.', 'info'); 
    audioService.play('connection_establishing'); 

    try {
        console.log("[handleRequestHistory] Disconnecting existing session...");
        await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
        setConnectionStatus(ConnectionStatus.RESETTING);
        setQrCode(null);
        setPairingCode(null);
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        console.log("[handleRequestHistory] Reconnecting to trigger full history sync...");
        const connectResult = await handleConnect(); 

        if (connectResult.ok) {
            showToast('Conexión restablecida. Sincronizando historial...', 'info');
            await new Promise(resolve => setTimeout(resolve, 8000)); 
            await fetchConversations();
            showToast('Historial solicitado y conexión restablecida.', 'success');
            audioService.play('action_success');
        } else {
            showToast('Error al restablecer la conexión. Intente de nuevo.', 'error');
            audioService.play('alert_error_generic');
        }

    } catch (e: any) {
        showToast('Error al solicitar historial. Intente nuevamente.', 'error');
        audioService.play('alert_error_generic');
    } finally {
        setIsRequestingHistory(false);
    }
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;
  const isFunctionalityDisabled = currentUser?.plan_status === 'expired' || (currentUser?.plan_status === 'trial' && new Date() > new Date(currentUser.billing_end_date));

  const renderClientView = () => {
    if (userRole === 'super_admin') {
      if (currentView === View.AUDIT_MODE && auditTarget) {
        return <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} onUpdate={(user) => setAuditTarget(user)} showToast={showToast} />;
      }
      return <AdminDashboard token={token!} backendUrl={BACKEND_URL!} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.ADMIN_GLOBAL); }} showToast={showToast} onLogout={handleLogout} />;
    }

    const handleDisconnect = async () => {
        if (!token) return;
        try {
            await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
            setConnectionStatus(ConnectionStatus.DISCONNECTED); 
            setQrCode(null);
            setPairingCode(null);
        } catch(e: any) {
            showToast('Error al intentar desconectar.', 'error');
        }
    };

    const handleWipeConnection = async () => {
        if (!token) return;
        setConnectionStatus(ConnectionStatus.RESETTING); 
        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
            setQrCode(null);
            setPairingCode(null);
            setConnectionStatus(ConnectionStatus.DISCONNECTED); 
            showToast('La sesión anterior fue purgada.', 'success');
        } catch(e: any) {
            showToast('Error al purgar la sesión.', 'error');
            setConnectionStatus(ConnectionStatus.DISCONNECTED); 
        }
    };

    switch(currentView) {
        case View.DASHBOARD:
            return <AgencyDashboard token={token!} backendUrl={BACKEND_URL!} settings={settings!} onUpdateSettings={handleUpdateSettings} currentUser={currentUser} showToast={showToast} />;
        case View.SETTINGS:
            return <SettingsPanel settings={settings} isLoading={isLoadingSettings} onUpdateSettings={isFunctionalityDisabled ? ()=>{} : handleUpdateSettings} onOpenLegal={setLegalModalType} />;
        case View.CONNECTION:
            return <ConnectionPanel user={currentUser} status={connectionStatus} qrCode={qrCode} pairingCode={pairingCode} onConnect={isFunctionalityDisabled ? async ()=>{} : handleConnect} onDisconnect={handleDisconnect} onWipe={handleWipeConnection} />;
        case View.BLACKLIST:
            return <BlacklistPanel settings={settings} conversations={conversations} onUpdateSettings={handleUpdateSettings} />;
        case View.CHATS:
        default:
            return (
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                        <ConversationList 
                            conversations={conversations} 
                            selectedConversationId={selectedConversationId} 
                            onSelectConversation={setSelectedConversationId} 
                            backendError={backendError} 
                            onRequestHistory={handleRequestHistory} 
                            isRequestingHistory={isRequestingHistory} 
                            connectionStatus={connectionStatus} 
                        />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow 
                            conversation={selectedConversation} 
                            onSendMessage={isFunctionalityDisabled ? ()=>{} : handleSendMessage} 
                            onToggleBot={handleToggleBot} // Pass the new optimized handler
                            isTyping={isTyping} 
                            isBotGloballyActive={isBotGloballyActive} 
                            isMobile={true} 
                            onBack={() => setSelectedConversationId(null)} 
                            onUpdateConversation={(id, updates) => { 
                                setConversations(prev => { 
                                    const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c); 
                                    return updated.sort((a, b) => { 
                                        const dateA = new Date(a.lastActivity || a.firstMessageAt || 0); 
                                        const dateB = new Date(b.lastActivity || b.firstMessageAt || 0); 
                                        return dateB.getTime() - dateA.getTime(); 
                                    }); 
                                }); 
                                fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates }) }); 
                            }} 
                            isPlanExpired={isFunctionalityDisabled}
                            settings={settings} // NEW
                            onUpdateSettings={handleUpdateSettings} // NEW
                        />
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
      {isAppView && <TrialBanner user={currentUser} supportNumber={supportNumber} />}

      <main className={`flex-1 flex relative ${isAppView ? 'overflow-hidden' : ''}`}>
        {!BACKEND_URL && (
             <div className="absolute top-0 left-0 right-0 z-[200] flex flex-col items-center justify-center p-3 text-[10px] font-black shadow-xl animate-pulse bg-red-800 text-white">
                <span>⚠️ ERROR CRÍTICO: La URL del backend NO está configurada.</span>
            </div>
        )}

        {backendError && BACKEND_URL && ( 
            <div className={`absolute top-0 left-0 right-0 z-[200] flex items-center justify-center p-2 text-[10px] font-black shadow-xl animate-pulse
                bg-red-600/95 text-white`}>
                <span>⚠️ {backendError}</span>
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
                isServerReady={!!BACKEND_URL}
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
