
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype, Testimonial, SystemSettings, SocketEvents } from './types';
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
import { CampaignsPanel } from './components/CampaignsPanel'; 
import RadarPanel from './components/RadarPanel'; 
import NetworkPanel from './components/NetworkPanel'; 
// NetworkConfigModal ELIMINADO
import Toast, { ToastData } from './components/Toast';
import HowItWorksArt from './components/HowItWorksArt';
import HowItWorksSection from './components/HowItWorksSection';
import NeuralArchitectureSection from './components/NeuralArchitectureSection'; 
import SecurityCanvas from './components/SecurityCanvas'; 
import TestimonialsCarousel from './components/TestimonialsCarousel';
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from './config';
import { audioService } from './services/audioService';
import { openSupportWhatsApp } from './utils/textUtils';
import { socketClient } from './services/socketClient';

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
            <div className="bg-red-800 text-white text-center py-3 px-4 text-xs font-bold shadow-lg flex flex-col md:flex-row items-center justify-center gap-4 z-[90] relative w-full">
                <span>Tu período de prueba ha finalizado. Activa tu licencia para restaurar las funcionalidades.</span>
                <button onClick={() => openSupportWhatsApp(`Hola, mi período de prueba ha finalizado y quiero activar mi licencia.`)} className="bg-white text-red-800 px-3 py-1 rounded font-bold text-[10px] uppercase whitespace-nowrap">Contactar Soporte</button>
            </div>
        );
    }

    // Trial In Progress
    if (user.plan_status === 'trial' && daysRemaining > 0 && qualifiedLeads < 10) {
        return (
            <div className="bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark text-black text-center py-2 px-4 text-xs font-bold shadow-lg z-[90] relative w-full">
                Estás en un período de prueba PRO. Finaliza en {daysRemaining} {daysRemaining > 1 ? 'días' : 'día'} o al calificar {10 - qualifiedLeads} leads más.
            </div>
        );
    }
    
    // Founder Status (if active and founder)
    if (user.is_founder && user.plan_status === 'active') {
        return (
            <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 text-brand-gold text-center py-2 px-4 text-xs font-bold shadow-lg flex items-center justify-center gap-2 z-[90] relative w-full">
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
  onOpenNetworkConfig: () => void; // NEW PROP
}> = ({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast, isMobile, settings, onOpenNetworkConfig }) => {
    return (
        <div className="w-full min-h-screen bg-brand-black font-sans relative overflow-x-hidden">
            <div className="absolute inset-0 neural-grid opacity-40 z-0 pointer-events-none"></div>
            
            <div className="relative z-20 flex flex-col items-center justify-center p-6 md:p-12 pt-24 pb-32">
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="space-y-10 text-center lg:text-left">
                        <div onClick={onOpenNetworkConfig} className={`inline-flex items-center gap-3 px-4 py-1.5 border rounded-full text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-xl transition-all cursor-pointer hover:bg-white/5 ${isServerReady ? 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${isServerReady ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'}`}></span>
                            {isServerReady ? 'SISTEMA ONLINE' : 'OFFLINE (CLICK PARA RECARGAR)'}
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
                            <div className="px-8 py-5 border-b border-white/5 bg-black/80 flex items-center justify-center lg:justify-between">
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
            <TestimonialsCarousel isLoggedIn={!!token} token={token} showToast={showToast} />
            
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
                              <path d="M279.14 288l14.22-92.66h-88.91V117.15c0-25.35 12.42-50.06 52.24-50.06H295V6.26S273.23 0 252.64 0c-73.22 0-121 44.38-121 124.72v70.62H22.89V288h84.72v224h100.65V288z"/>
                            </svg>
                        </a>
                        <a href="https://instagram.com/so_in_agencia" target="_blank" rel="noopener noreferrer" className="transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 448 512" fill="#E1306C" className="w-5 h-5">
                              <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                            </svg>
                        </a>
                        <a href="https://linkedin.com/company/so-in" target="_blank" rel="noopener noreferrer" className="transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 448 512" fill="#0A66C2" className="w-5 h-5">
                              <path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.28c12.4-23.5 42.69-48.3 87.91-48.3 94.03 0 111.28 61.9 111.28 142.3V448z"/>
                            </svg>
                        </a>
                    </div>
                    <p className="text-[9px] text-gray-700 font-bold uppercase tracking-widest">
                        Infraestructura v3.5.0 Elite
                    </p>
                </div>
            </footer>
        </div>
    );
};

export const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'manifesto' | 'network' | null>(null);
  
  const [currentView, setCurrentView] = useState<View>(View.CHATS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [isServerReady, setIsServerReady] = useState(false);
  const [tunnelLatency, setTunnelLatency] = useState<number | null>(null);
  // ELIMINADO: const [isNetworkConfigOpen, setIsNetworkConfigOpen] = useState(false);

  // SIMULATOR STATE (Landing Page)
  const [simStep, setSimStep] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const [currentScriptIndex, setCurrentScriptIndex] = useState(0);
  const simScrollRef = useRef<HTMLDivElement>(null);
  const isSimulationRunning = useRef(false);

  // New Ref for heartbeat tolerance
  const connectionFailures = useRef(0);

  const [toast, setToast] = useState<ToastData | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info') => setToast({ message, type });

  const isMobile = window.innerWidth < 768;

  const checkServer = async () => {
    try {
      const controller = new AbortController();
      // Short timeout for check
      const timeoutId = setTimeout(() => controller.abort(), 5000); 
      
      const start = Date.now();
      const res = await fetch(`${BACKEND_URL}/api/health`, { 
          headers: { 'ngrok-skip-browser-warning': 'true' },
          signal: controller.signal 
      });
      clearTimeout(timeoutId);

      if (res.ok) {
          setIsServerReady(true);
          setTunnelLatency(Date.now() - start);
          connectionFailures.current = 0; // Reset on success
      } else {
          throw new Error("Health check failed");
      }
    } catch (e) {
      connectionFailures.current++;
      console.warn(`[HEARTBEAT] Connection check failed (${connectionFailures.current}/3)`);
      
      // Only mark as offline if we fail 3 times in a row (approx 15 seconds)
      if (connectionFailures.current >= 3) {
          setIsServerReady(false);
          setTunnelLatency(null);
      } else {
          // Keep "Online" but indicate degradation via latency meter if desired
          // Let's set latency to high to show Yellow/Red dot without full offline
          setTunnelLatency(prev => (prev ? prev + 500 : 500));
      }
    }
  };

  useEffect(() => {
    // Initial check
    checkServer();
    
    // Play intro audio on first visit if not logged in
    if (!token && !sessionStorage.getItem('intro_played')) {
        setTimeout(() => audioService.play('landing_intro'), 2000);
        sessionStorage.setItem('intro_played', 'true');
    }

    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Socket Client
  useEffect(() => {
      if (token) {
          socketClient.connect(token);
          
          // GLOBAL SOCKET LISTENERS
          const handleSessionStatus = (data: { status: ConnectionStatus, qr?: string, pairingCode?: string }) => {
              console.log('[SOCKET] Session Status Update:', data);
              setConnectionStatus(data.status);
              if (data.qr) setQrCode(data.qr);
              if (data.pairingCode) setPairingCode(data.pairingCode);
              
              if (data.status === ConnectionStatus.CONNECTED) {
                  audioService.play('connection_success');
                  fetchConversations(); // Refresh list on connect
              } else if (data.status === ConnectionStatus.DISCONNECTED) {
                  audioService.play('connection_disconnected');
              }
          };

          const handleConversationUpdate = (updatedConv: Conversation) => {
              setConversations(prev => {
                  const exists = prev.find(c => c.id === updatedConv.id);
                  if (exists) {
                      return prev.map(c => c.id === updatedConv.id ? updatedConv : c)
                          .sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime());
                  } else {
                      return [updatedConv, ...prev];
                  }
              });
              
              // Audio feedback for new messages
              const lastMsg = updatedConv.messages[updatedConv.messages.length - 1];
              if (lastMsg && lastMsg.sender === 'user') {
                  audioService.play('radar_ping'); 
              }
          };

          socketClient.on(SocketEvents.SESSION_STATUS_UPDATE, handleSessionStatus);
          socketClient.on(SocketEvents.CONVERSATION_UPDATE, handleConversationUpdate);

          return () => {
              socketClient.off(SocketEvents.SESSION_STATUS_UPDATE, handleSessionStatus);
              socketClient.off(SocketEvents.CONVERSATION_UPDATE, handleConversationUpdate);
              socketClient.disconnect();
          };
      }
  }, [token]);

  // Landing Page Simulation Effect
  useEffect(() => {
      if (token || isSimulationRunning.current) return;
      isSimulationRunning.current = true;

      let timer: any;
      const runStep = () => {
          const currentScript = SIMULATION_SCRIPTS[currentScriptIndex];
          
          if (simStep >= currentScript.length) {
              // End of script, wait and restart with next script
              timer = setTimeout(() => {
                  setSimStep(0);
                  setVisibleMessages([]);
                  setCurrentScriptIndex((prev) => (prev + 1) % SIMULATION_SCRIPTS.length);
                  runStep(); 
              }, 5000);
              return;
          }

          const msg = currentScript[simStep];
          setIsSimTyping(true);

          timer = setTimeout(() => {
              setIsSimTyping(false);
              setVisibleMessages(prev => [...prev, msg]);
              if (simScrollRef.current) {
                  simScrollRef.current.scrollTop = simScrollRef.current.scrollHeight;
              }
              setSimStep(prev => prev + 1);
          }, msg.delayBefore);
      };

      runStep();

      return () => {
          clearTimeout(timer);
          isSimulationRunning.current = false;
      };
  }, [simStep, token, currentScriptIndex]);

  // Data Fetching
  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/conversations`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.sort((a: Conversation, b: Conversation) => 
            new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
        ));
      }
    } catch (e) { console.error("Error fetching conversations", e); }
  }, [token]);

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    setIsLoadingSettings(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) });
      if (res.ok) setSettings(await res.json());
    } catch (e) { console.error(e); } 
    finally { setIsLoadingSettings(false); }
  }, [token]);

  const fetchUser = useCallback(async () => {
      if (!token) return;
      try {
          const res = await fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) });
          if (res.ok) setCurrentUser(await res.json());
      } catch (e) { console.error(e); }
  }, [token]);

  const fetchConnectionStatus = useCallback(async () => {
      if (!token) return;
      try {
          const res = await fetch(`${BACKEND_URL}/api/status`, { headers: getAuthHeaders(token) });
          if (res.ok) {
              const data = await res.json();
              setConnectionStatus(data.status);
              if(data.qr) setQrCode(data.qr);
              if(data.pairingCode) setPairingCode(data.pairingCode);
          }
      } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (token) {
        fetchConversations();
        fetchSettings();
        fetchUser();
        fetchConnectionStatus();
    }
  }, [token, fetchConversations, fetchSettings, fetchUser, fetchConnectionStatus]);

  // Actions
  const handleLoginSuccess = (newToken: string, role: string, rememberMe: boolean) => {
      if (rememberMe) {
          localStorage.setItem('saas_token', newToken);
          localStorage.setItem('saas_role', role);
      } else {
          sessionStorage.setItem('saas_token', newToken);
          sessionStorage.setItem('saas_role', role);
      }
      setToken(newToken);
      setUserRole(role);
      
      // Stop landing page simulation
      isSimulationRunning.current = false; 
      setVisibleMessages([]);
      
      // Play login sound
      audioService.play('login_welcome');

      if (role === 'super_admin') {
          setCurrentView(View.ADMIN_GLOBAL);
      } else {
          setCurrentView(View.CHATS);
          // Pre-fetch data immediately
          setTimeout(() => {
              fetchConversations();
              fetchSettings();
              fetchUser();
          }, 100);
      }
  };

  const handleLogout = () => {
      localStorage.removeItem('saas_token');
      localStorage.removeItem('saas_role');
      sessionStorage.removeItem('saas_token');
      sessionStorage.removeItem('saas_role');
      setToken(null);
      setUserRole(null);
      setConversations([]);
      setSelectedConversationId(null);
      setCurrentView(View.CHATS);
      setIsAuthModalOpen(false);
      // Clean reload to restart simulation
      window.location.reload();
  };

  const handleConnect = async (phoneNumber?: string) => {
      try {
          setConnectionStatus(ConnectionStatus.GENERATING_QR);
          audioService.play('connection_establishing');
          const body = phoneNumber ? JSON.stringify({ phoneNumber }) : undefined;
          
          const res = await fetch(`${BACKEND_URL}/api/connect`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body
          });
          
          if (!res.ok) throw new Error('Falló inicio de conexión');
          
          // Poll for status updates (handled by socket/polling)
          fetchConnectionStatus();
      } catch (e) {
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
          showToast('Error al conectar con WhatsApp.', 'error');
          audioService.play('alert_error_generic');
      }
  };

  const handleDisconnect = async () => {
      try {
          await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token) });
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
          setQrCode(null);
          audioService.play('connection_disconnected');
      } catch (e) {
          showToast('Error al desconectar.', 'error');
      }
  };

  const handleWipe = async () => {
      if(!confirm('¿Resetear conexión? Se borrará la sesión actual.')) return;
      try {
          setConnectionStatus(ConnectionStatus.RESETTING);
          await fetch(`${BACKEND_URL}/api/connection/purge`, { method: 'POST', headers: getAuthHeaders(token) });
          setTimeout(() => {
              setConnectionStatus(ConnectionStatus.DISCONNECTED);
              setQrCode(null);
              showToast('Conexión reseteada.', 'success');
          }, 2000);
      } catch(e) {
          showToast('Error al resetear.', 'error');
      }
  };

  const handleSendMessage = async (text: string) => {
      if (!selectedConversationId) return;
      
      // Optimistic Update
      const optimisticMsg: Message = {
          id: Date.now().toString(),
          text,
          sender: 'owner',
          timestamp: new Date().toISOString()
      };
      
      setConversations(prev => prev.map(c => {
          if (c.id === selectedConversationId) {
              return { ...c, messages: [...c.messages, optimisticMsg], lastActivity: new Date().toISOString() };
          }
          return c;
      }));

      try {
          await fetch(`${BACKEND_URL}/api/send`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ to: selectedConversationId, text })
          });
      } catch (e) {
          showToast('Error al enviar mensaje.', 'error');
      }
  };

  const handleToggleBot = async (id?: string) => {
      if (id) {
          // Toggle specific conversation
          const conv = conversations.find(c => c.id === id);
          if (conv) {
              const newStatus = !conv.isBotActive;
              // Local update
              setConversations(prev => prev.map(c => c.id === id ? { ...c, isBotActive: newStatus } : c));
              // Server update
              await fetch(`${BACKEND_URL}/api/conversation/update`, {
                  method: 'POST',
                  headers: getAuthHeaders(token),
                  body: JSON.stringify({ id, updates: { isBotActive: newStatus } })
              });
          }
      } else {
          // Global Toggle
          if (!settings) return;
          const newStatus = !settings.isActive;
          const newSettings = { ...settings, isActive: newStatus };
          setSettings(newSettings);
          await fetch(`${BACKEND_URL}/api/settings`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify(newSettings)
          });
          showToast(newStatus ? 'IA Activada Globalmente' : 'IA Pausada Globalmente', 'info');
      }
  };

  const handleToggleAutonomous = async () => {
      if (!settings) return;
      const newStatus = !settings.isAutonomousClosing;
      const newSettings = { ...settings, isAutonomousClosing: newStatus };
      setSettings(newSettings);
      
      try {
          await fetch(`${BACKEND_URL}/api/settings`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify(newSettings)
          });
          showToast(newStatus ? 'Guardia Autónoma ACTIVADA (Cierre Automático)' : 'Guardia Autónoma DESACTIVADA (Requiere Aprobación)', 'info');
      } catch (e) {
          showToast('Error al guardar configuración.', 'error');
          setSettings(settings); // Revert
      }
  };

  // --- RENDER ---

  if (!token) {
      return (
          <>
            <LandingPage 
                onAuth={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                onRegister={() => { setAuthMode('register'); setIsAuthModalOpen(true); }}
                visibleMessages={visibleMessages}
                isSimTyping={isSimTyping}
                simScrollRef={simScrollRef}
                onOpenLegal={(type) => setLegalModalType(type)}
                isServerReady={isServerReady}
                isLoggedIn={false}
                token={null}
                showToast={showToast}
                isMobile={isMobile}
                settings={null} 
                onOpenNetworkConfig={() => window.location.reload()}
            />
            <AuthModal 
                isOpen={isAuthModalOpen} 
                initialMode={authMode}
                onClose={() => setIsAuthModalOpen(false)}
                onSuccess={handleLoginSuccess}
                onOpenLegal={(type) => setLegalModalType(type)}
            />
            <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
            <Toast toast={toast} onClose={() => setToast(null)} />
          </>
      );
  }

  if (userRole === 'super_admin') {
      return (
          <div className="flex flex-col h-screen overflow-hidden bg-brand-black text-gray-200 font-sans">
              <Header 
                  isLoggedIn={true}
                  userRole={userRole}
                  onLoginClick={() => {}}
                  onRegisterClick={() => {}}
                  onLogoutClick={handleLogout}
                  isBotGloballyActive={true}
                  onToggleBot={() => {}}
                  isAutonomousClosing={false}
                  onToggleAutonomous={() => {}}
                  currentView={currentView}
                  onNavigate={setCurrentView}
                  connectionStatus={ConnectionStatus.CONNECTED}
                  isMobile={isMobile}
                  tunnelLatency={tunnelLatency}
                  onOpenNetworkConfig={() => window.location.reload()}
              />
              <AdminDashboard 
                  token={token} 
                  backendUrl={BACKEND_URL}
                  onAudit={(user) => { console.log('Auditing', user); }}
                  showToast={showToast}
                  onLogout={handleLogout}
              />
              <Toast toast={toast} onClose={() => setToast(null)} />
          </div>
      );
  }

  // CLIENT VIEW
  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brand-black text-gray-200 font-sans">
      <Header 
          isLoggedIn={true}
          userRole={userRole}
          onLoginClick={() => {}}
          onRegisterClick={() => {}}
          onLogoutClick={handleLogout}
          isBotGloballyActive={settings?.isActive || false}
          onToggleBot={() => handleToggleBot()}
          isAutonomousClosing={settings?.isAutonomousClosing || false}
          onToggleAutonomous={handleToggleAutonomous}
          isNetworkGlobalEnabled={true} 
          currentView={currentView}
          onNavigate={setCurrentView}
          connectionStatus={connectionStatus}
          isMobile={isMobile}
          tunnelLatency={tunnelLatency}
          onOpenNetworkConfig={() => window.location.reload()}
      />

      <PlanStatusBanner user={currentUser} />

      <div className="flex-1 flex overflow-hidden relative">
          
          {currentView === View.CHATS && (
              <>
                <div className={`${selectedConversationId && isMobile ? 'hidden' : 'flex'} w-full md:w-auto h-full`}>
                    <ConversationList
                        conversations={conversations}
                        selectedConversationId={selectedConversationId}
                        onSelectConversation={setSelectedConversationId}
                        backendError={backendError}
                        onRequestHistory={async () => {}}
                        isRequestingHistory={false}
                        connectionStatus={connectionStatus}
                        onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))}
                    />
                </div>
                <div className={`${!selectedConversationId && isMobile ? 'hidden' : 'flex'} flex-1 h-full`}>
                    <ChatWindow
                        conversation={selectedConversation}
                        onSendMessage={handleSendMessage}
                        onToggleBot={handleToggleBot}
                        isTyping={false}
                        isBotGloballyActive={settings?.isActive || false}
                        isMobile={isMobile}
                        onBack={() => setSelectedConversationId(null)}
                        onUpdateConversation={(id, updates) => setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))}
                        isPlanExpired={currentUser?.plan_status === 'expired'}
                        settings={settings}
                        onUpdateSettings={async (newSettings) => {
                            setSettings(newSettings);
                            await fetch(`${BACKEND_URL}/api/settings`, {
                                method: 'POST',
                                headers: getAuthHeaders(token),
                                body: JSON.stringify(newSettings)
                            });
                        }}
                    />
                </div>
              </>
          )}

          {currentView === View.SETTINGS && (
              <SettingsPanel 
                  token={token}
                  settings={settings}
                  isLoading={isLoadingSettings}
                  onUpdateSettings={async (newSettings) => {
                      setSettings(newSettings);
                      await fetch(`${BACKEND_URL}/api/settings`, {
                          method: 'POST',
                          headers: getAuthHeaders(token),
                          body: JSON.stringify(newSettings)
                      });
                  }}
                  onOpenLegal={(type) => setLegalModalType(type)}
                  showToast={showToast}
              />
          )}

          {currentView === View.CONNECTION && (
              <ConnectionPanel 
                  status={connectionStatus}
                  qrCode={qrCode}
                  pairingCode={pairingCode}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onWipe={handleWipe}
                  user={currentUser}
                  showToast={showToast}
              />
          )}

          {currentView === View.BLACKLIST && (
              <BlacklistPanel 
                  settings={settings}
                  conversations={conversations}
                  onUpdateSettings={async (newSettings) => {
                      setSettings(newSettings);
                      await fetch(`${BACKEND_URL}/api/settings`, {
                          method: 'POST',
                          headers: getAuthHeaders(token),
                          body: JSON.stringify(newSettings)
                      });
                  }}
              />
          )}

          {currentView === View.DASHBOARD && (
              <AgencyDashboard 
                  token={token} 
                  backendUrl={BACKEND_URL}
                  settings={settings || {} as BotSettings}
                  onUpdateSettings={async (newSettings) => {
                      setSettings(newSettings);
                      await fetch(`${BACKEND_URL}/api/settings`, { method: 'POST', headers: getAuthHeaders(token), body: JSON.stringify(newSettings) });
                  }}
                  currentUser={currentUser}
                  showToast={showToast}
              />
          )}

          {currentView === View.CAMPAIGNS && (
              <CampaignsPanel 
                  token={token}
                  backendUrl={BACKEND_URL}
                  showToast={showToast}
                  settings={settings}
              />
          )}

          {currentView === View.RADAR && (
              <RadarPanel token={token} backendUrl={BACKEND_URL} showToast={showToast} />
          )}

          {currentView === View.NETWORK && (
              <NetworkPanel 
                  token={token} 
                  backendUrl={BACKEND_URL} 
                  currentUser={currentUser}
                  settings={settings}
                  onUpdateSettings={async (newSettings) => {
                      setSettings(newSettings);
                      await fetch(`${BACKEND_URL}/api/settings`, { method: 'POST', headers: getAuthHeaders(token), body: JSON.stringify(newSettings) });
                  }}
                  showToast={showToast}
              />
          )}
      </div>

      <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};
