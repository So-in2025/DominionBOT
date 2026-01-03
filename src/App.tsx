
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype, Testimonial, SystemSettings } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel'; 
import ConnectionPanel from './components/ConnectionPanel';
import BlacklistPanel from './components/BlacklistPanel'; 
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import { AuthModal } from './components/AuthModal';
import LegalModal from './components/LegalModal'; 
import AgencyDashboard from './components/AgencyDashboard';
import CampaignsPanel from './components/CampaignsPanel'; 
import RadarPanel from './components/RadarPanel'; 
import NetworkPanel from './components/NetworkPanel'; 
import Toast, { ToastData } from './components/Toast';
import HowItWorksArt from './components/HowItWorksArt';
import HowItWorksSection from './components/HowItWorksSection';
import NeuralArchitectureSection from './components/NeuralArchitectureSection'; 
import SecurityCanvas from './components/SecurityCanvas'; // REEMPLAZO
import TestimonialsCarousel from './components/TestimonialsCarousel';
import NetworkConfigModal from './components/NetworkConfigModal';
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from './config';
import { audioService } from './services/audioService';
import { openSupportWhatsApp } from './utils/textUtils';

// --- DUAL LOOP SIMULATION SCRIPTS ---

// SCRIPT 1: The "Value Proposition" Chat
const SIMULATION_SCRIPT_1 = [
    { id: 1, type: 'user', text: "Hola, vi que ofrecen un bot para WhatsApp. ¿Es como los que responden con menú 1, 2, 3?", delayBefore: 1200 },
    { id: 2, type: 'bot', text: "Hola. Para nada. Dominion no usa menús rígidos. Es una IA que entiende, razona y califica la intención real de compra en cada mensaje.", statusLabel: "Análisis de Intención", delayBefore: 2000 },
    { id: 3, type: 'user', text: "Interesante. ¿Y cómo sabe cuándo un cliente está listo para comprar?", delayBefore: 1800 },
    { id: 4, type: 'bot', text: "Analiza el lenguaje, la urgencia y el historial. Cuando detecta una oportunidad real, entra en 'Shadow Mode' y te alerta para que tú, el humano, cierres la venta.", statusLabel: "Lead: TIBIO", delayBefore: 2500 },
    { id: 5, type: 'user', text: "Ok, me gusta eso de no perder el control. ¿Puedo probarlo?", delayBefore: 1500 },
    { id: 6, type: 'bot', text: "Claro. Puedes solicitar acceso ahora mismo y activar un nodo de prueba PRO sin costo. Te dejo el link para que empieces.", statusLabel: "Lead: CALIENTE 🔥", delayBefore: 2200 },
];

// SCRIPT 2: The "Anti-Ban Security" Chat
const SIMULATION_SCRIPT_2 = [
    { id: 1, type: 'user', text: "Hola. Me interesa, pero me preocupa que WhatsApp me banee el número por usar un bot.", delayBefore: 1200 },
    { id: 2, type: 'bot', text: "Es una preocupación válida y la razón por la que Dominion fue diseñado con un protocolo de 'Firma Humana'. No somos un bot de spam, somos una infraestructura de venta.", statusLabel: "Protocolo de Seguridad", delayBefore: 2500 },
    { id: 3, type: 'user', text: "¿'Firma Humana'? ¿Qué es eso?", delayBefore: 1800 },
    { id: 4, type: 'bot', text: "Significa que cada acción está calibrada para ser indistinguible de un operador real. Usamos 'jitter' (retrasos variables) y un 'Watchdog' que monitorea la conexión para evitar patrones robóticos.", statusLabel: "Gobernanza Activa", delayBefore: 2800 },
    { id: 5, type: 'user', text: "Suena mucho más seguro que otros. ¿Entonces el riesgo es cero?", delayBefore: 2000 },
    { id: 6, type: 'bot', text: "El riesgo nunca es cero, pero nuestra arquitectura está obsesionada con minimizarlo. Priorizamos la seguridad de tu número por sobre la velocidad. Es nuestra regla de oro.", statusLabel: "Seguridad > Velocidad", delayBefore: 2500 },
    { id: 7, type: 'user', text: "Entendido. Me da más confianza para probarlo. ¿Cómo sigo?", delayBefore: 1500 },
    { id: 8, type: 'bot', text: "Perfecto. Te comparto el enlace para que solicites acceso y actives tu nodo. El proceso es rápido y seguro.", statusLabel: "Acceso Seguro", delayBefore: 2200 },
];

const SIMULATION_SCRIPTS = [SIMULATION_SCRIPT_1, SIMULATION_SCRIPT_2];


const PlanStatusBanner: React.FC<{ user: User | null }> = ({ user }) => {
    if (!user || user.role === 'super_admin') return null;

    // Critical States (Trial Ended / Expired) take priority
    const endDate = new Date(user.billing_end_date);
    const now = new Date(Date.now());
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const qualifiedLeads = user.trial_qualified_leads_count || 0;

    if (user.plan_status === 'expired' || (user.plan_status === 'trial' && (daysRemaining <= 0 || qualifiedLeads >= 10))) {
        if (!sessionStorage.getItem('trial_ended_alert_played')) {
            audioService.play('alert_warning_trial_ended');
            sessionStorage.setItem('trial_ended_alert_played', 'true');
        }
        return (
            <div className="bg-red-800 text-white text-center py-2 px-4 text-xs font-bold shadow-lg flex items-center justify-center gap-4">
                <span>Tu período de prueba ha finalizado. Activa tu licencia para restaurar las funcionalidades.</span>
                <button onClick={() => openSupportWhatsApp(`Hola, mi período de prueba ha finalizado y quiero activar mi licencia.`)} className="bg-white text-red-800 px-3 py-1 rounded font-bold text-[10px] uppercase">Contactar Soporte</button>
            </div>
        );
    }

    // Trial In Progress
    if (user.plan_status === 'trial' && daysRemaining > 0 && qualifiedLeads < 10) {
        return (
            <div className="bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark text-black text-center py-2 px-4 text-xs font-bold shadow-lg">
                Estás en un período de prueba PRO. Finaliza en {daysRemaining} {daysRemaining > 1 ? 'días' : 'día'} o al calificar {10 - qualifiedLeads} leads más.
            </div>
        );
    }
    
    // Founder Status (if active and founder)
    if (user.is_founder && user.plan_status === 'active') {
        return (
            <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 text-brand-gold text-center py-2 px-4 text-xs font-bold shadow-lg flex items-center justify-center gap-2">
                <span>🏷️</span> PRECIO FUNDADORES ACTIVO. Tu plan mantiene el valor de lanzamiento.
            </div>
        );
    }


    return null;
};

const LandingPage: React.FC<{
  onAuth: () => void;
  onRegister: () => void;
  visibleMessages: any[];
  isSimTyping: boolean;
  simScrollRef: React.RefObject<HTMLDivElement>;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto' | 'network') => void;
  isServerReady: boolean;
  isLoggedIn: boolean;
  token: string | null;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isMobile: boolean;
  settings: SystemSettings | null;
}> = ({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast, isMobile, settings }) => {
    return (
        <div className="w-full min-h-screen bg-brand-black font-sans relative overflow-x-hidden">
            <div className="absolute inset-0 neural-grid opacity-40 z-0 pointer-events-none"></div>
            
            <div className="relative z-20 flex flex-col items-center justify-center p-6 md:p-12 pt-24 pb-32">
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="space-y-10 text-center lg:text-left">
                        <div className={`inline-flex items-center gap-3 px-4 py-1.5 border rounded-full text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-xl transition-all ${isServerReady ? 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${isServerReady ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'}`}></span>
                            {isServerReady ? 'SISTEMA ONLINE' : 'CONECTANDO NODO...'}
                        </div>
                        
                        <h1 className="text-5xl md:text-8xl lg:text-[90px] font-black text-white leading-tight tracking-normal py-2">
                            Ventas en <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold-dark">Piloto Automático</span>
                        </h1>
                        <p className="text-lg md:text-2xl text-gray-400 leading-relaxed border-l-4 border-brand-gold/40 pl-8 mx-auto lg:mx-0 max-w-2xl font-medium">
                           Deja de perder dinero por responder tarde. Dominion es la infraestructura que filtra a los curiosos, califica a los compradores y te avisa solo cuando hay dinero sobre la mesa.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-start pt-6">
                            <button onClick={onRegister} className="px-12 py-6 bg-brand-gold text-black rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_15px_50px_rgba(212,175,55,0.4)] hover:scale-105 active:scale-95 transition-all">
                                {isMobile ? 'Registrar' : 'Solicitar Acceso'}
                            </button>
                            <button onClick={onAuth} className="px-12 py-6 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all">Acceder</button>
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
                                    Signal Pipeline v3.0
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
                                                : (msg.statusLabel.includes('TIBIO') ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-blue-400 border-blue-500/10 bg-blue-500/10')
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
            </div>
            
            <HowItWorksArt />
            <HowItWorksSection />
            <SecurityCanvas />
            <NeuralArchitectureSection settings={settings} />
            <TestimonialsCarousel isLoggedIn={isLoggedIn} token={token} showToast={showToast} />
            
            <footer className="relative z-10 w-full border-t border-white/5 bg-brand-black/95 backdrop-blur-2xl px-12 py-10 flex flex-col md:flex-row justify-between items-center gap-12">
                <div className="text-center md:text-left space-y-4">
                    <p className="text-white font-black text-xl tracking-tight flex items-center justify-center md:justify-start gap-2">
                        Dominion <span className="text-brand-gold">BOT</span>
                    </p>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                        Powered By <a href="https://websoin.netlify.app/" target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:underline">{'SO->IN'}</a> Agency
                    </p>
                    <p className="text-gray-600 text-[10px] uppercase tracking-widest font-medium">Mendoza, Argentina</p>
                </div>
                
                <div className="flex flex-col items-center md:items-end gap-8">
                    {/* Social Media Links */}
                    <div className="flex gap-6">
                        <a href="https://www.facebook.com/SolucionesSOIN" target="_blank" rel="noopener noreferrer" className="transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 320 512" fill="#1877F2" className="w-5 h-5">
                              <path d="M279.14 288l14.22-92.66h-88.91V117.15c0-25.35 12.42-50.06 52.24-50.06H295V6.26S273.23 0 252.64 0c-73.22 0-121 44.38-121 124.72v70.62H83.89V288h47.75v224h95.66V288z"/>
                            </svg>
                        </a>
                        <a href="https://www.instagram.com/so.in_mendoza" target="_blank" rel="noopener noreferrer" className="transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 448 512" className="w-5 h-5">
                              <defs>
                                <radialGradient id="grad1" cx="223.5" cy="223.5" r="223.5" gradientUnits="userSpaceOnUse">
                                  <stop offset="0%" stopColor="#fdf497"/>
                                  <stop offset="30%" stopColor="#fdf497"/>
                                  <stop offset="60%" stopColor="#fd5949"/>
                                  <stop offset="90%" stopColor="#d6249f"/>
                                  <stop offset="100%" stopColor="#285AEB"/>
                                </radialGradient>
                              </defs>
                              <path fill="url(#grad1)" d="M224.1 141c-63.6 0-115 51.4-115 115s51.4 115 115 115 115-51.4 115-115-51.4 115-115-115zm0 190c-41.5 0-75-33.5-75-75s33.5-75 75-75 75 33.5 75 75-33.5 75-75 75zm146.4-194.7c0 14.9-12.1 27-27 27h-30c-14.9 0-27-12.1-27-27v-30c0-14.9 12.1-27 27-27h30c14.9 0 27 12.1 27 27v30zm76.1 27.2c-1.7-35.7-9.9-67.3-36.3-93.7-26.4-26.4-58-34.6-93.7-36.3-37-2.1-147.9-2.1-184.9 0-35.7 1.7-67.3 9.9-93.7 36.3s-34.6 58-36.3 93.7c-2.1 37-2.1 147.9 0 184.9 1.7 35.7 9.9 67.3 36.3 93.7s58 34.6 93.7 36.3c37 2.1 147.9 2.1 184.9 0 35.7-1.7 67.3-9.9 93.7-36.3s34.6-58 36.3-93.7c2.1-37 2.1-147.9 0-184.9zm-48.5 224c-7.8 19.6-22.9 34.7-42.5 42.5-29.5 11.7-99.5 9-132.4 9s-102.9 2.6-132.4-9c-19.6-7.8-34.7-22.9-42.5-42.5-11.7-29.5-9-99.5-9-132.4s-2.6-102.9 9-132.4c7.8-19.6 22.9-34.7 42.5-42.5 29.5-11.7 99.5-9 132.4-9s102.9-2.6 132.4 9c19.6 7.8 34.7 22.9 42.5 42.5 11.7 29.5 9 99.5 9 132.4s2.7 102.9-9 132.4z"/>
                            </svg>
                        </a>
                        <a href="https://wa.me/5492617145654" target="_blank" rel="noopener noreferrer" className="transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="20" height="20" fill="#25D366" className="w-5 h-5">
                              <path d="M224 0C100.3 0 0 100.3 0 224c0 39.7 10.4 78.5 30.1 112.8L0 448l114.9-29.9C148.1 436.4 185.7 448 224 448c123.7 0 224-100.3 224-224S347.7 0 224 0zm0 400c-34.9 0-68.9-9.4-98.3-27.2l-7-4.2-68.1 17.7 18.2-66.3-4.6-7.3C46.8 283.5 38 254 38 224 38 122.8 122.8 38 224 38s186 84.8 186 186-84.8 186-186 186zm101.7-138.1c-5.5-2.8-32.5-16-37.5-17.8-5-1.9-8.7-2.8-12.4 2.8-3.7 5.6-14.3 17.8-17.5 21.5-3.2 3.7-6.5 4.2-12 1.4-32.7-16.3-54.1-29.2-75.6-66.2-5.7-9.8 5.7-9.1 16.3-30.3 1.9-3.7.9-7-0.5-9.8-1.4-2.8-12.4-29.8-17-40.8-4.5-10.8-9.1-9.3-12.4-9.5-3.2-.2-7-.2-10.8-.2s-9.8 1.4-14.9 7c-5.1 5.6-19.5 19-19.5 46.3s20 53.7 22.8 57.5c2.8 3.7 39.4 60.3 95.5 84.6 13.3 5.7 23.7 9.1 31.8 11.6 13.4 4.3 25.6 3.7 35.2 2.3 10.7-1.6 32.5-13.3 37.1-26.1 4.6-12.8 4.6-23.7 3.2-26.1-1.4-2.3-5.1-3.7-10.7-6.5z"/>
                            </svg>
                        </a>
                    </div>
                    
                    <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest">
                        <button onClick={() => onOpenLegal('privacy')} className="text-brand-gold hover:underline hover:text-white transition-colors">Privacidad</button>
                        <button onClick={() => onOpenLegal('terms')} className="text-brand-gold hover:underline hover:text-white transition-colors">Términos</button>
                        <button onClick={() => onOpenLegal('manifesto')} className="text-brand-gold hover:underline hover:text-white transition-colors">Propuesta</button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Custom hook to get the previous value of a state or prop
function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

export function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'register' }>({ isOpen: false, mode: 'login' });
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'manifesto' | 'network' | null>(null); 
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
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null); 
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  
  // Tunnel Heartbeat State
  const [tunnelLatency, setTunnelLatency] = useState<number | null>(null);
  const [failureCount, setFailureCount] = useState(0); // Track failed heartbeats
  const [showNetworkConfig, setShowNetworkConfig] = useState(false); // Modal state

  const statusPollingIntervalRef = useRef<number | null>(null);
  const convoPollingIntervalRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const [simulationLoopIndex, setSimulationLoopIndex] = useState(0); // For dual loop
  const simScrollRef = useRef<HTMLDivElement>(null);

  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768); // Detect mobile view

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    if (type === 'error') audioService.play('alert_error_generic');
    if (type === 'success') audioService.play('action_success');
    setToast({ message, type });
  }, []);
  
  useEffect(() => {
    const fetchSystemSettings = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/system/settings`);
            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    setSystemSettings(await res.json());
                } else {
                    console.error("No se pudo obtener la configuración: la respuesta no es JSON.", await res.text());
                }
            } else {
                console.error(`Fallo al obtener la configuración del sistema: Status ${res.status}`);
            }
        } catch (e) {
            console.error("No se pudo obtener la configuración del sistema para la página de destino", e);
        }
    };
    fetchSystemSettings();
  }, []);

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
      sessionStorage.removeItem('saas_token'); // Clear session storage token too
      sessionStorage.removeItem('trial_ended_alert_played');
      setToken(null);
      setUserRole(null);
      setCurrentUser(null);
      setShowLanding(false);
      setCurrentView(View.CHATS);
      setAuditTarget(null);
      if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
      if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      setBackendError(null); 
  };

  useEffect(() => {
      const initAudioAndPlayIntro = () => {
          audioService.initContext();
          // Check localStorage first for persistent login, then sessionStorage for session-only login
          const isLoggedIn = localStorage.getItem('saas_token') || sessionStorage.getItem('saas_token');
          const isLanding = !isLoggedIn;
          if (isLanding && !sessionStorage.getItem('landing_intro_played')) {
              audioService.play('landing_intro');
              sessionStorage.setItem('landing_intro_played', 'true');
          }
      };
      document.addEventListener('click', initAudioAndPlayIntro, { once: true, capture: true });
      return () => document.removeEventListener('click', initAudioAndPlayIntro, true);
  }, []);

  // Pollings
  useEffect(() => {
    if (!token || userRole === 'super_admin') return;
    const fetchStatus = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/status`, { headers: getAuthHeaders(token) });
            if (res.ok) {
                const statusData = await res.json();
                setConnectionStatus(statusData.status);
                setQrCode(statusData.qr || null);
                setPairingCode(statusData.pairingCode || null);
            }
        } catch (e) {}
    };
    const fetchConversations = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) });
            if (res.ok) {
                const latestConversations = await res.json();
                setConversations(latestConversations.sort((a: Conversation, b: Conversation) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()));
            }
        } catch (e) {}
    };
    fetchStatus();
    fetchConversations();
    statusPollingIntervalRef.current = window.setInterval(fetchStatus, 15000);
    convoPollingIntervalRef.current = window.setInterval(fetchConversations, 3000);
    return () => {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
    };
  }, [token, userRole]);

  // TUNNEL HEARTBEAT & AUTO-RECOVERY TRIGGER
  useEffect(() => {
      // Polling for tunnel health (Smart Link)
      // We start this even if not logged in, to detect general connectivity, 
      // but usually only care if we expect the backend to be there.
      const checkHeartbeat = async () => {
          const start = Date.now();
          try {
              // We use a simple fetch to health. If it fails, network error.
              const res = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET' });
              const end = Date.now();
              if (res.ok) {
                  setTunnelLatency(end - start);
                  setFailureCount(0); // Reset failures on success
              } else {
                  setTunnelLatency(null);
                  setFailureCount(prev => prev + 1);
              }
          } catch (e) {
              setTunnelLatency(null);
              setFailureCount(prev => prev + 1);
          }
      };
      
      checkHeartbeat();
      heartbeatIntervalRef.current = window.setInterval(checkHeartbeat, 5000); // Check every 5s
      
      return () => {
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      }
  }, []);

  // Show Modal if failures accumulate
  useEffect(() => {
      // Only show modal if we have token (user was logged in) and failures > threshold
      // Or if explicitly in a mode where we expect connection.
      if (token && failureCount >= 3) {
          setShowNetworkConfig(true);
      } else {
          setShowNetworkConfig(false);
      }
  }, [failureCount, token]);

  // TTS for Connection Status
  const prevConnectionStatus = usePrevious(connectionStatus);
  useEffect(() => {
      if (prevConnectionStatus !== undefined && prevConnectionStatus !== connectionStatus) {
          switch (connectionStatus) {
              case ConnectionStatus.GENERATING_QR:
                  audioService.play('connection_establishing');
                  break;
              case ConnectionStatus.AWAITING_SCAN:
                  audioService.play('connection_pending');
                  break;
              case ConnectionStatus.CONNECTED:
                  audioService.play('connection_success');
                  break;
              case ConnectionStatus.DISCONNECTED:
                  if (prevConnectionStatus === ConnectionStatus.CONNECTED) {
                      audioService.play('connection_disconnected');
                  }
                  break;
          }
      }
  }, [connectionStatus, prevConnectionStatus]);


  useEffect(() => {
    if (!token) return;
    const loadInitialUserData = async () => {
        setIsLoadingSettings(true);
        try {
            // FIX: Ensure networkProfile and isNetworkEnabled are fetched with user settings
            const [userRes, sRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) })
            ]);
            if (userRes.ok) setCurrentUser(await userRes.json());
            if (sRes.ok) setSettings(await sRes.json());
        } catch (e) {
        } finally {
            setIsLoadingSettings(false);
        }
    };
    loadInitialUserData();
  }, [token]);

  // DUAL LOOP SIMULATION LOGIC
  useEffect(() => {
    if (token) return; 
    
    const currentScript = SIMULATION_SCRIPTS[simulationLoopIndex];
    let timeoutId: any;
    let currentIndex = 0;

    const runStep = () => {
        if (currentIndex >= currentScript.length) {
            // End of current script, switch to the next one after a delay
            timeoutId = setTimeout(() => { 
                setVisibleMessages([]); 
                setSimulationLoopIndex(prev => (prev + 1) % SIMULATION_SCRIPTS.length);
            }, 8000); 
            return;
        }
        
        const step = currentScript[currentIndex];
        setIsSimTyping(true);
        
        timeoutId = setTimeout(() => {
            setIsSimTyping(false);
            setVisibleMessages(prev => [...prev, step]);
            currentIndex++;
            runStep();
        }, step.delayBefore);
    };

    // Start the simulation for the current script
    runStep();

    return () => clearTimeout(timeoutId);
  }, [token, simulationLoopIndex]); // Re-run when loop index changes

  useEffect(() => {
      if (simScrollRef.current) simScrollRef.current.scrollTop = simScrollRef.current.scrollHeight;
  }, [visibleMessages, isSimTyping]);

  const handleLoginSuccess = (t: string, r: string, rememberMe: boolean) => {
      if (rememberMe) {
          localStorage.setItem('saas_token', t);
          sessionStorage.removeItem('saas_token'); // Clear session storage if remember me is active
      } else {
          sessionStorage.setItem('saas_token', t);
          localStorage.removeItem('saas_token'); // Clear local storage if remember me is not active
      }
      localStorage.setItem('saas_role', r); // Role is always persistent
      setToken(t);
      setUserRole(r);
      setShowLanding(false);
      setCurrentView(r === 'super_admin' ? View.ADMIN_GLOBAL : View.CHATS);
      setAuthModal({ ...authModal, isOpen: false });
      audioService.play('login_welcome');
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;
  const isFunctionalityDisabled = currentUser?.plan_status === 'expired' || (currentUser?.plan_status === 'trial' && new Date(Date.now()) > new Date(currentUser.billing_end_date));

  // --- RENDER ---
  const isAppView = !!token && !showLanding;
  
  const handleSendMessageOptimistic = (text: string) => {
      if (!selectedConversationId || !token) return;

      const ownerMessage: Message = {
          id: `owner-${Date.now()}`,
          sender: 'owner',
          text,
          timestamp: new Date(Date.now())
      };

      setConversations(prev => prev.map(c => 
          c.id === selectedConversationId 
          ? { ...c, messages: [...c.messages, ownerMessage], lastActivity: new Date(Date.now()) } 
          : c
      ).sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()));

      // Send to backend without waiting
      fetch(`${BACKEND_URL}/api/send`, { 
          method: 'POST', 
          headers: getAuthHeaders(token), 
          body: JSON.stringify({ to: selectedConversationId, text }) 
      });
  };

  const renderClientView = () => {
      if (userRole === 'super_admin') return <AdminDashboard token={token!} backendUrl={BACKEND_URL} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.AUDIT_MODE); }} showToast={showToast} onLogout={handleLogout} />;
      if (currentView === View.AUDIT_MODE && auditTarget) return <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} onUpdate={(user) => setAuditTarget(user)} showToast={showToast} />;
      
      const handleUpdateSettings = async (newSettings: BotSettings) => {
          try {
              const res = await fetch(`${BACKEND_URL}/api/settings`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify(newSettings) });
              if (res.ok) setSettings(newSettings);
          } catch(e) {}
      };

      // Map View
      switch(currentView) {
        case View.DASHBOARD: return <AgencyDashboard token={token!} backendUrl={BACKEND_URL} settings={settings!} onUpdateSettings={handleUpdateSettings} currentUser={currentUser} showToast={showToast} />;
        case View.CAMPAIGNS: return <CampaignsPanel token={token!} backendUrl={BACKEND_URL} showToast={showToast} settings={settings} />;
        case View.RADAR: return <RadarPanel token={token!} backendUrl={BACKEND_URL} showToast={showToast} />;
        case View.NETWORK: return <NetworkPanel token={token!} backendUrl={BACKEND_URL} currentUser={currentUser} settings={settings} onUpdateSettings={handleUpdateSettings} showToast={showToast} />; {/* NEW: Render NetworkPanel */}
        case View.SETTINGS: return <SettingsPanel settings={settings} isLoading={isLoadingSettings} onUpdateSettings={isFunctionalityDisabled ? ()=>{} : handleUpdateSettings} onOpenLegal={setLegalModalType} showToast={showToast} />;
        case View.CONNECTION: return <ConnectionPanel user={currentUser} status={connectionStatus} qrCode={qrCode} pairingCode={pairingCode} onConnect={async (ph) => { await fetch(`${BACKEND_URL}/api/connect`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ phoneNumber: ph }) }); }} onDisconnect={async () => { await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) }); setConnectionStatus(ConnectionStatus.DISCONNECTED); }} onWipe={async () => { setConnectionStatus(ConnectionStatus.RESETTING); await new Promise(r => setTimeout(r, 1500)); await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) }); setConnectionStatus(ConnectionStatus.DISCONNECTED); }} />;
        case View.BLACKLIST: return <BlacklistPanel settings={settings} conversations={conversations} onUpdateSettings={handleUpdateSettings} />;
        case View.CHATS: default:
            return (
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                        <ConversationList conversations={conversations} selectedConversationId={selectedConversationId} onSelectConversation={setSelectedConversationId} backendError={backendError} onRequestHistory={() => Promise.resolve()} isRequestingHistory={false} connectionStatus={connectionStatus} />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow conversation={selectedConversation} onSendMessage={handleSendMessageOptimistic} onToggleBot={(id) => fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates: { isBotActive: !selectedConversation?.isBotActive } }) }).then(()=>{})} isTyping={isTyping} isBotGloballyActive={isBotGloballyActive} isMobile={isMobileView} onBack={() => setSelectedConversationId(null)} onUpdateConversation={(id, updates) => { setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c)); }} settings={settings} onUpdateSettings={handleUpdateSettings} isPlanExpired={isFunctionalityDisabled} />
                    </div>
                </div>
            );
      }
  };

  return (
    <div className={`flex flex-col bg-brand-black text-white font-sans ${isAppView ? 'h-screen overflow-hidden' : 'min-h-screen'} max-w-[100vw]`}>
      {/* SCANNING BAR ANIMATION FOR ALIVE FEEL */}
      {isAppView && (
          <div className="h-0.5 w-full bg-brand-gold/20 overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full w-1/3 bg-brand-gold/50 blur-[4px] animate-slide-in-right"></div>
          </div>
      )}

      {/* Network Configuration Modal - Triggered on connection loss */}
      <NetworkConfigModal isOpen={showNetworkConfig} onClose={() => setShowNetworkConfig(false)} />

      <Toast toast={toast} onClose={() => setToast(null)} />
      <AuthModal isOpen={authModal.isOpen} initialMode={authModal.mode} onClose={() => setAuthModal({ ...authModal, isOpen: false })} onSuccess={handleLoginSuccess} onOpenLegal={setLegalModalType} />
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
          isMobile={isMobileView} // Pass isMobileView prop
          tunnelLatency={tunnelLatency} // NEW: Pass tunnel health metric
      />
      {isAppView && <PlanStatusBanner user={currentUser} />}

      <main className={`flex-1 relative ${isAppView ? 'flex overflow-hidden' : 'block'}`}>
        {backendError && <div className="absolute top-0 left-0 right-0 z-[200] flex items-center justify-center p-2 text-[10px] font-black shadow-xl animate-pulse bg-red-600/95 text-white"><span>⚠️ {backendError}</span></div>}
        {(!token || showLanding) ? <LandingPage onAuth={() => setAuthModal({ isOpen: true, mode: 'login' })} onRegister={() => setAuthModal({ isOpen: true, mode: 'register' })} visibleMessages={visibleMessages} isSimTyping={isSimTyping} simScrollRef={simScrollRef} onOpenLegal={setLegalModalType} isServerReady={true} isLoggedIn={!!token} token={token} showToast={showToast} isMobile={isMobileView} settings={systemSettings} /> : renderClientView()}
      </main>
    </div>
  );
}
