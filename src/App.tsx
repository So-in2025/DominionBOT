
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, BotSettings, Message, View, ConnectionStatus, User, LeadStatus, PromptArchetype, Testimonial } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel';
import ConnectionPanel from './components/ConnectionPanel';
import BlacklistPanel from './components/BlacklistPanel'; 
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import AuthModal from './components/AuthModal';
import LegalModal from './components/LegalModal'; 
import AgencyDashboard from './components/AgencyDashboard';
import CampaignsPanel from './components/CampaignsPanel'; 
import RadarPanel from './components/RadarPanel'; 
import Toast, { ToastData } from './components/Toast';
import HowItWorksArt from './components/HowItWorksArt';
import HowItWorksSection from './components/HowItWorksSection';
import NeuralArchitectureSection from './components/NeuralArchitectureSection'; 
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

const TrialBanner: React.FC<{ user: User | null }> = ({ user }) => {
    if (!user || user.role === 'super_admin' || user.plan_status === 'active') return null;

    const endDate = new Date(user.billing_end_date);
    const now = new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const qualifiedLeads = user.trial_qualified_leads_count || 0;

    if (user.plan_status === 'trial' && daysRemaining > 0 && qualifiedLeads < 10) {
        return (
            <div className="bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark text-black text-center py-2 px-4 text-xs font-bold shadow-lg">
                Estás en un período de prueba PRO. Finaliza en {daysRemaining} {daysRemaining > 1 ? 'días' : 'día'} o al calificar tus primeros {10 - qualifiedLeads} leads.
            </div>
        );
    }

    if (user.plan_status === 'expired' || (user.plan_status === 'trial' && (daysRemaining <= 0 || qualifiedLeads >= 10))) {
        if (!sessionStorage.getItem('trial_ended_alert_played')) {
            audioService.play('alert_warning_trial_ended');
            sessionStorage.setItem('trial_ended_alert_played', 'true');
        }
        return (
            <div className="bg-red-800 text-white text-center py-2 px-4 text-xs font-bold shadow-lg flex items-center justify-center gap-4">
                <span>Tu período de prueba ha finalizado. Activa tu licencia para restaurar las funcionalidades.</span>
                <button className="bg-white text-red-800 px-3 py-1 rounded font-bold text-[10px] uppercase">Contactar Soporte</button>
            </div>
        );
    }

    return null;
};

// --- START: Landing Page Strategic Sections ---

const TestimonialsSection = ({ isLoggedIn, token, showToast }: { isLoggedIn: boolean, token: string | null, showToast: (message: string, type: 'success' | 'error') => void }) => {
    const [realTestimonials, setRealTestimonials] = useState<Testimonial[]>([]);
    const [newTestimonialText, setNewTestimonialText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchRealTestimonials = async () => {
            try {
                if (!BACKEND_URL) return;
                const res = await fetch(`${BACKEND_URL}/api/testimonials`, { headers: API_HEADERS });

                if (!res.ok) {
                    setRealTestimonials([]);
                    return;
                }

                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    setRealTestimonials(data);
                } else {
                    setRealTestimonials([]);
                }
            } catch (e) { 
                setRealTestimonials([]);
            }
        };
        fetchRealTestimonials();
    }, []);

    const visibleTestimonials = useMemo(() => {
        const now = new Date();
        // DRIP LOGIC: Only show testimonials where createdAt <= Now
        return realTestimonials
            .filter(t => new Date(t.createdAt) <= now)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [realTestimonials]);

    // PRECISE DUPLICATION FOR MARQUEE
    // We duplicate EXACTLY once to create a seamless loop with translateX(-50%)
    const marqueeTestimonials = useMemo(() => {
        if (visibleTestimonials.length === 0) return [];
        // Ensure we have enough items to fill the screen width for smooth scrolling
        let items = [...visibleTestimonials];
        while (items.length < 10) { // Artificial minimum length to ensure marquee works on wide screens
            items = [...items, ...visibleTestimonials];
        }
        return [...items, ...items];
    }, [visibleTestimonials]);

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
                audioService.play('action_success_feedback');
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
                 <div className="mt-20 text-center relative group px-4">
                    <input type="text" placeholder="Dejá tu reseña..." disabled className="w-full max-w-2xl mx-auto bg-brand-black border border-dashed border-white/20 rounded-2xl py-6 px-8 text-center text-gray-500 cursor-not-allowed" />
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-max opacity-0 group-hover:opacity-100 transition-opacity bg-brand-gold text-black text-xs font-bold px-4 py-2 rounded-lg shadow-lg pointer-events-none">
                        Inicia sesión para compartir tu experiencia
                    </div>
                </div>
            );
        }

        return (
            <form onSubmit={handleSubmitTestimonial} className="mt-20 max-w-2xl mx-auto animate-fade-in px-4">
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
        <section className="bg-brand-surface py-20 border-t border-white/5 overflow-hidden w-full relative">
            <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-16">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-lg font-semibold leading-8 tracking-tight text-brand-gold uppercase">El Muro de la Verdad</h2>
                    <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Resultados Reales de Negocios Reales</p>
                </div>
            </div>

            {/* PREMIUM INFINITE MARQUEE CAROUSEL */}
            <div className="relative w-full overflow-hidden mask-gradient group">
                {/* Mask overlay for smooth edges */}
                <div className="absolute left-0 top-0 bottom-0 w-8 md:w-32 bg-gradient-to-r from-brand-surface to-transparent z-10 pointer-events-none"></div>
                <div className="absolute right-0 top-0 bottom-0 w-8 md:w-32 bg-gradient-to-l from-brand-surface to-transparent z-10 pointer-events-none"></div>

                {/* MARQUEE TRACK - Note: 'animate-scroll' MUST exist in tailwind config */}
                <div className="flex w-max animate-scroll will-change-transform group-hover:[animation-play-state:paused]">
                    {marqueeTestimonials.map((testimonial, idx) => (
                        <div 
                            key={`${testimonial._id}-${idx}`} 
                            className="w-[85vw] sm:w-[350px] md:w-[400px] flex-shrink-0 mx-2 md:mx-4 p-6 md:p-8 bg-brand-black border border-white/10 rounded-3xl shadow-lg hover:shadow-brand-gold/10 transition-shadow duration-300 flex flex-col justify-between whitespace-normal"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-x-4">
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center text-brand-gold font-bold text-lg border border-white/10 flex-shrink-0">
                                            {testimonial.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-white text-sm truncate">{testimonial.name}</div>
                                            <div className="text-gray-500 text-[10px] uppercase tracking-wider truncate">{testimonial.location}</div>
                                        </div>
                                    </div>
                                    {/* Date Display */}
                                    <div className="text-[10px] text-gray-600 font-mono text-right leading-tight flex-shrink-0">
                                        {testimonial.createdAt ? new Date(testimonial.createdAt).toLocaleDateString() : 'Reciente'}
                                        <br/>
                                        {testimonial.createdAt ? new Date(testimonial.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                    </div>
                                </div>
                                <div className="relative">
                                    <p className="text-sm leading-6 text-gray-300 italic line-clamp-4">“{testimonial.text}”</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
                                <div className="flex text-brand-gold">
                                    {[...Array(5)].map((_, i) => (
                                        <svg key={i} className="w-4 h-4 text-brand-gold" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 22 20">
                                            <path d="M20.924 7.625a1.523 1.523 0 0 0-1.238-1.044l-5.051-.734-2.259-4.577a1.534 1.534 0 0 0-2.752 0L7.365 5.847l-5.051.734A1.535 1.535 0 0 0 1.463 9.2l3.656 3.563-.863 5.031a1.532 1.532 0 0 0 2.226 1.616L11 17.033l4.518 2.375a1.534 1.534 0 0 0 2.226-1.617l-.863-5.03L20.537 9.2a1.523 1.523 0 0 0 .387-1.575Z"/>
                                        </svg>
                                    ))}
                                </div>
                                <div className="text-[8px] font-black uppercase tracking-widest text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">Verificado</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {renderTestimonialForm()}
        </section>
    );
};

const FaqSection = () => {
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const faqs = [
        { q: "¿En qué se diferencia de otros bots de WhatsApp?", a: "Dominion no es un bot común; es una infraestructura de calificación. Usamos IA avanzada (Google Gemini) para entender la intención real de compra, no solo para seguir un script predefinido." },
        { q: "¿Es seguro para mi número? ¿Hay riesgo de bloqueo?", a: "Nuestra arquitectura está diseñada para mitigar activamente los riesgos emulando un comportamiento humano y profesional. No permitimos envíos masivos (spam), que es la principal causa de bloqueo. Si bien ningún sistema no oficial puede eliminar el riesgo al 100%, Dominion está construido para un uso seguro en ventas consultivas." },
        { q: "¿Necesito conocimientos técnicos para usarlo?", a: "No. La configuración inicial es un proceso guiado paso a paso. Una vez que el 'Cerebro Neural' está configurado y el nodo está conectado, el sistema funciona de forma 100% autónoma." },
        { q: "¿Qué significa 'BYOK' (Bring Your Own Key)?", a: "Significa que tú tienes el control total. Conectas tu propia clave de la API de Google Gemini, lo que asegura que tus datos, tus conversaciones y tus costos de IA son tuyos y de nadie más. Soberanía total." },
        { q: "¿Qué pasa cuando mi plan expira?", a: "Tu bot no se apaga. Para evitar que pierdas leads, el sistema revierte a las funcionalidades básicas de respuesta (Plan Starter), dándote tiempo para renovar sin interrumpir el servicio." }
    ];

    const toggleFaq = (index: number) => {
        setOpenFaq(prev => (prev === index ? null : index));
    };

    return (
        <section className="bg-brand-black py-20 sm:py-32 w-full px-4 overflow-hidden">
            <div className="mx-auto max-w-4xl lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                     <h2 className="text-base font-semibold leading-7 text-brand-gold uppercase tracking-widest">Protocolo de Claridad</h2>
                     <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Respuestas a Preguntas Estratégicas</p>
                </div>
                <div className="mt-16 space-y-4">
                    {faqs.map((faq, index) => (
                        <div key={index} className="border border-white/10 rounded-2xl bg-brand-surface overflow-hidden transition-all duration-300">
                            <button onClick={() => toggleFaq(index)} className="w-full flex justify-between items-center text-left p-6">
                                <span className={`text-sm md:text-base font-semibold ${openFaq === index ? 'text-brand-gold' : 'text-white'}`}>{faq.q}</span>
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

function LandingPage({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast }: any) {
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
                            Vender en <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold-dark">Piloto Automático</span>
                        </h1>
                        <p className="text-lg md:text-2xl text-gray-400 leading-relaxed border-l-4 border-brand-gold/40 pl-8 mx-auto lg:mx-0 max-w-2xl font-medium">
                           Dominion es la herramienta de IA que responde y califica a tus clientes en WhatsApp 24/7, para que vos o tu equipo solo se dedique a cerrar las ventas que importan.
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
            </div>
            
            <HowItWorksArt />
            <HowItWorksSection />
            <NeuralArchitectureSection />
            <TestimonialsSection isLoggedIn={isLoggedIn} token={token} showToast={showToast} />
            <FaqSection />

            <footer className="relative z-10 w-full border-t border-white/5 bg-brand-black/95 backdrop-blur-2xl px-12 py-8 flex flex-col md:flex-row justify-between items-center gap-12">
                <div className="text-center md:text-left space-y-4">
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <p className="text-white font-black text-lg tracking-tight flex items-center justify-center md:justify-start gap-2">
                            Powered By <a href="https://websoin.netlify.app" target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-gold-light transition-colors">SO-&gt;IN</a>
                        </p>
                        <div className="flex items-center gap-4 border-l border-white/10 pl-4 justify-center md:justify-start">
                            <a href="https://www.facebook.com/SolucionesSOIN" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-brand-gold transition-colors">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            </a>
                            <a href="https://www.instagram.com/so.in_mendoza/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-brand-gold transition-colors">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                            </a>
                        </div>
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

  const statusPollingIntervalRef = useRef<number | null>(null);
  const convoPollingIntervalRef = useRef<number | null>(null);

  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
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

  useEffect(() => {
    if (!token || userRole === 'super_admin') {
        setCurrentUser(null);
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
        setBackendError(null); 
        return;
    }

    const fetchStatus = async () => {
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
                const msg = `Fallo al obtener estado del nodo (${res.status}). Posiblemente el backend está inactivo.`;
                setBackendError(`Alerta: ${msg}. Detalles: ${errorText.substring(0, 100)}`);
                audioService.play('alert_error_connection');
            }
        } catch (e: any) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                setBackendError("Alerta: Error de red al obtener estado. Verifique su conexión y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
            } else {
                setBackendError("Alerta: Fallo de conexión con el nodo central al obtener estado.");
            }
            audioService.play('alert_error_connection');
        }
    };

    const fetchConversations = async () => {
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
                const msg = `Fallo al obtener conversaciones (${res.status}).`;
                setBackendError(`Alerta: ${msg}. Detalles: ${errorText.substring(0, 100)}`);
                audioService.play('alert_error_connection');
            }
        } catch (e: any) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                setBackendError("Alerta: Error de red al obtener conversaciones. Verifique su conexión y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
            } else {
                setBackendError("Alerta: Fallo de conexión con el nodo central al obtener conversaciones.");
            }
            audioService.play('alert_error_connection');
        }
    };

    fetchStatus();
    fetchConversations();

    statusPollingIntervalRef.current = window.setInterval(fetchStatus, 5000); 
    convoPollingIntervalRef.current = window.setInterval(fetchConversations, 3000); 

    return () => {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
        setBackendError(null); 
    };
  }, [token, userRole]); 

  useEffect(() => {
    if (!token) {
        setCurrentUser(null);
        return;
    };

    const loadInitialUserData = async () => {
        setIsLoadingSettings(true);
        try {
            const [userRes, sRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) })
            ]);
            
            if ([userRes, sRes].some(res => res.status === 403)) {
                handleLogout();
                return;
            }

            if (userRes.ok) setCurrentUser(await userRes.json());
            if (sRes.ok) setSettings(await sRes.json());

            if (backendError) setBackendError(null);
        } catch (e: any) {
            console.error("DATA ERROR:", e);
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                setBackendError("Alerta: Error de red al cargar datos iniciales. Verifique su conexión a internet y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
            } else {
                setBackendError("Alerta: Fallo de conexión con el nodo central al cargar datos iniciales.");
            }
            audioService.play('alert_error_connection');
        } finally {
            setIsLoadingSettings(false);
        }
    };
    loadInitialUserData();
    
  }, [token]);
  
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
      } catch (e: any) { 
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              setBackendError("Alerta: Error de red al iniciar conexión. Verifique su conexión a internet y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
          } else {
              setBackendError("Fallo al iniciar conexión.");
          }
          audioService.play('alert_error_connection');
          setConnectionStatus(ConnectionStatus.DISCONNECTED); 
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
          if (res.ok) {
              setSettings(newSettings);
              audioService.play('action_success');
          } else {
              setBackendError(`Fallo al actualizar configuración (${res.status}).`);
              audioService.play('alert_error_generic');
          }
      } catch (e: any) { 
          console.error(e); 
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              setBackendError("Alerta: Error de red al actualizar configuración. Verifique su conexión a internet y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
          } else {
              setBackendError("Alerta: Fallo de conexión con el nodo central al actualizar configuración.");
          }
          audioService.play('alert_error_connection');
      }
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;
  const isFunctionalityDisabled = currentUser?.plan_status === 'expired' || (currentUser?.plan_status === 'trial' && new Date() > new Date(currentUser.billing_end_date));

  const renderClientView = () => {
    if (userRole === 'super_admin') {
      if (currentView === View.AUDIT_MODE && auditTarget) {
        return <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} onUpdate={(user) => setAuditTarget(user)} showToast={showToast} />;
      }
      return <AdminDashboard token={token!} backendUrl={BACKEND_URL} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.ADMIN_GLOBAL); }} showToast={showToast} onLogout={handleLogout} />;
    }

    const handleDisconnect = async () => {
        if (!token) return;
        try {
            await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
            setConnectionStatus(ConnectionStatus.DISCONNECTED); 
            setQrCode(null);
            setPairingCode(null);
        } catch(e: any) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                showToast('Error de red al intentar desconectar. Verifique su conexión a internet y el backend.', 'error');
            } else {
                showToast('Error al intentar desconectar.', 'error');
            }
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
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                showToast('Error de red al purgar la sesión. Verifique su conexión a internet y el backend.', 'error');
            } else {
                showToast('Error al purgar la sesión.', 'error');
            }
            setConnectionStatus(ConnectionStatus.DISCONNECTED); 
        }
    };

    switch(currentView) {
        case View.DASHBOARD:
            return <AgencyDashboard token={token!} backendUrl={BACKEND_URL} settings={settings!} onUpdateSettings={handleUpdateSettings} currentUser={currentUser} showToast={showToast} />;
        case View.CAMPAIGNS: 
            return <CampaignsPanel token={token!} backendUrl={BACKEND_URL} showToast={showToast} />;
        case View.RADAR: 
            return <RadarPanel token={token!} backendUrl={BACKEND_URL} showToast={showToast} />;
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
                        <ConversationList conversations={conversations} selectedConversationId={selectedConversationId} onSelectConversation={setSelectedConversationId} backendError={backendError} onRequestHistory={()=>{return Promise.resolve()}} isRequestingHistory={false} connectionStatus={connectionStatus} />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow conversation={selectedConversation} onSendMessage={isFunctionalityDisabled ? ()=>{} : handleSendMessage} onToggleBot={(id) => fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates: { isBotActive: !selectedConversation?.isBotActive } }) }).then(()=>{})} isTyping={isTyping} isBotGloballyActive={isBotGloballyActive} isMobile={true} onBack={() => setSelectedConversationId(null)} onUpdateConversation={(id, updates) => { setConversations(prev => { const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c); return updated.sort((a, b) => { const dateA = new Date(a.lastActivity || a.firstMessageAt || 0); const dateB = new Date(b.lastActivity || b.firstMessageAt || 0); return dateB.getTime() - dateA.getTime(); }); }); fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates }) }); }} settings={settings} onUpdateSettings={handleUpdateSettings} />
                    </div>
                </div>
            );
    }
  }

  const isAppView = !!token && !showLanding;

  return (
    <div className={`flex flex-col bg-brand-black text-white font-sans ${isAppView ? 'h-screen overflow-hidden' : 'min-h-screen'} max-w-[100vw]`}>
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
      {isAppView && <TrialBanner user={currentUser} />}

      <main className={`flex-1 relative ${isAppView ? 'flex overflow-hidden' : 'block'}`}>
        {backendError && ( 
            <div className="absolute top-0 left-0 right-0 z-[200] flex items-center justify-center p-2 text-[10px] font-black shadow-xl animate-pulse
                bg-red-600/95 text-white">
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
