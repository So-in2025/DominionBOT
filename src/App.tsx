
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
    { name: "Martina Flores", location: "Mendoza", text: "Lo estoy usando hace unos días y la experiencia viene siendo buena." },
    { name: "Santino Rivas", location: "Mendoza", text: "Simple, directo y sin vueltas. Eso suma." },
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
                const res = await fetch(`${BACKEND_URL}/api/testimonials`, { headers: API_HEADERS });

                if (!res.ok) {
                    console.error(`Fallo al cargar reseñas: El servidor respondió con estado ${res.status}`);
                    return;
                }

                const resClone = res.clone();
                const bodyText = await resClone.text();

                if (!bodyText) {
                    setRealTestimonials([]);
                    return;
                }

                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    setRealTestimonials(data);
                } else {
                    console.warn("Fallo al cargar reseñas: La respuesta no es un JSON válido, probablemente una página de advertencia de proxy.");
                    setRealTestimonials([]);
                }
            } catch (e) { 
                // FIX: Consolidated error handling, removed specific audio call here as it's handled globally.
                console.error("Fallo de red o de parseo al cargar reseñas:", e); 
                setRealTestimonials([]);
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
                    <p className="absolute bottom-3 right-4 text-[10px] text-gray-500 font-mono">{newTestimonialText.length} / 250{'}'}</p>
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
                                        {[...Array(5)].map((_, i) => <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}
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
        { q: "¿Es seguro para mi número? ¿Hay riesgo de bloqueo?", a: "Nuestra arquitectura está diseñada para mitigar activamente los riesgos emulando un comportamiento humano y profesional. No permitimos envíos masivos (spam), que es la principal causa de bloqueo. Si bien ningún sistema no oficial puede eliminar el riesgo al 100%, Dominion está construido para un uso seguro en ventas consultivas." },
        { q: "¿Necesito conocimientos técnicos para usarlo?", a: "No. La configuración inicial es un proceso guiado paso a paso. Una vez que el 'Cerebro Neural' está configurado y el nodo está conectado, el sistema funciona de forma 100% autónoma." },
        { q: "¿Qué significa 'BYOK' (Bring Your Own Key)?", a: "Significa que tú tienes el control total. Conectas tu propia clave de la API de Google Gemini, lo que asegura que tus datos, tus conversaciones y tus costos de IA son tuyos y de nadie más. Soberanía total." },
        { q: "¿Qué pasa cuando mi plan expira?", a: "Tu bot no se apaga. Para evitar que pierdas leads, el sistema revierte a las funcionalidades básicas de respuesta (Plan Starter), dándote tiempo para renovar sin interrumpir el servicio." }
    ];

    const toggleFaq = (index: number) => {
        setOpenFaq(prev => (prev === index ? null : index));
    };

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
                            <button onClick={() => toggleFaq(index)} className="w-full flex justify-between items-center text-left p-6">
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

function LandingPage({ onAuth, onRegister, visibleMessages, isSimTyping, simScrollRef, onOpenLegal, isServerReady, isLoggedIn, token, showToast }: any) {
    return (
        <div className="relative flex-1 bg-brand-black flex flex-col font-sans">
            <div className="absolute inset-0 neural-grid opacity-40 z-0 pointer-events-none"></div>
            
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

// --- END: Landing Page Strategic Sections ---

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
  const [backendError, setBackendError] = useState<string | null>(null); // Keep for general backend errors
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Polling interval refs
  const statusPollingIntervalRef = useRef<number | null>(null);
  const convoPollingIntervalRef = useRef<number | null>(null);

  // Simulación de Landing
  const [visibleMessages, setVisibleMessages] = useState<any[]>([]);
  const [isSimTyping, setIsSimTyping] = useState(false);
  const simScrollRef = useRef<HTMLDivElement>(null);
  
  // Efecto para inicializar el AudioContext y reproducir el sonido de intro en la primera interacción.
  useEffect(() => {
      const initAudioAndPlayIntro = () => {
          console.log("[AudioService] User interaction detected, initializing AudioContext.");
          audioService.initContext();
          
          // Si estamos en la landing page, reproducir el sonido de intro en la primera interacción.
          const isLanding = !localStorage.getItem('saas_token');
          if (isLanding && !sessionStorage.getItem('landing_intro_played')) {
              audioService.play('landing_intro');
              sessionStorage.setItem('landing_intro_played', 'true');
          }
      };
      
      // Estos listeners se activan una vez en la primera interacción y luego se eliminan.
      document.addEventListener('click', initAudioAndPlayIntro, { once: true, capture: true });
      document.addEventListener('keydown', initAudioAndPlayIntro, { once: true, capture: true });
      document.addEventListener('touchstart', initAudioAndPlayIntro, { once: true, capture: true });

      return () => {
          document.removeEventListener('click', initAudioAndPlayIntro, true);
          document.removeEventListener('keydown', initAudioAndPlayIntro, true);
          document.removeEventListener('touchstart', initAudioAndPlayIntro, true);
      };
  }, []); // El array vacío asegura que este efecto se ejecute solo una vez.

  const showToast = (message: string, type: 'success' | 'error') => {
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
      
      // Clear polling intervals on logout
      if (statusPollingIntervalRef.current) {
          clearInterval(statusPollingIntervalRef.current);
          statusPollingIntervalRef.current = null;
      }
      if (convoPollingIntervalRef.current) {
          clearInterval(convoPollingIntervalRef.current);
          convoPollingIntervalRef.current = null;
      }
      setBackendError(null); // Clear any backend error
  };

  useEffect(() => {
    if (userRole === 'super_admin' && ![View.ADMIN_GLOBAL, View.AUDIT_MODE].includes(currentView)) {
        setCurrentView(View.ADMIN_GLOBAL);
    }
  }, [currentView, userRole]);

  // Define fetchStatus and fetchConversations as useCallback hooks
  const fetchStatus = useCallback(async () => {
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
  }, [token, userRole, backendError]); // Dependencies for useCallback

  const fetchConversations = useCallback(async () => {
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
  }, [token, userRole, backendError]); // Dependencies for useCallback

  // Polling for connection status and conversations
  useEffect(() => {
    if (!token || userRole === 'super_admin') {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
        return;
    }

    // Fetch immediately on mount/token change
    fetchStatus();
    fetchConversations();

    // Set up polling intervals
    statusPollingIntervalRef.current = window.setInterval(fetchStatus, 5000); // Poll status every 5 seconds
    convoPollingIntervalRef.current = window.setInterval(fetchConversations, 3000); // Poll conversations every 3 seconds

    return () => {
        if (statusPollingIntervalRef.current) clearInterval(statusPollingIntervalRef.current);
        if (convoPollingIntervalRef.current) clearInterval(convoPollingIntervalRef.current);
        statusPollingIntervalRef.current = null;
        convoPollingIntervalRef.current = null;
    };
  }, [token, userRole, fetchStatus, fetchConversations]); // Dependencies: token, userRole, and the memoized callbacks

  // Initial user data load (now integrated with polling logic for status/conversations)
  useEffect(() => {
    if (!token) {
        setCurrentUser(null);
        return;
    };

    const loadInitialUserData = async () => {
        setIsLoadingSettings(true);
        try {
            // Fetch initial user and settings data once
            const [userRes, sRes, settingsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/user/me`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/settings`, { headers: getAuthHeaders(token) }),
                fetch(`${BACKEND_URL}/api/system/settings`, { headers: getAuthHeaders(token) }) // Fetch global settings
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
    
  }, [token]); // Only depends on token, polling handles continuous updates
  
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
      setConnectionStatus(ConnectionStatus.GENERATING_QR); // Set status immediately
      
      try {
          const res = await fetch(`${BACKEND_URL}/api/connect`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify({ phoneNumber }) 
          });
          if (res.ok) {
              // Immediately trigger a status fetch after backend confirms initiation
              await fetchStatus(); 
          } else {
              // Revert status on error, handled in outer catch as well
              setConnectionStatus(ConnectionStatus.DISCONNECTED); 
              audioService.play('alert_error_connection');
          }
      } catch (e: any) { 
          console.error("Fallo de conexión en handleConnect:", e);
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              setBackendError("Alerta: Error de red al iniciar conexión. Verifique su conexión a internet y que el servidor backend esté activo y accesible (Ej: Ngrok funcionando).");
          } else {
              setBackendError("Fallo al iniciar conexión.");
          }
          audioService.play('alert_error_connection');
          setConnectionStatus(ConnectionStatus.DISCONNECTED); // Revert status on error
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
      return <AdminDashboard token={token!} backendUrl={BACKEND_URL} onAudit={(u) => { setAuditTarget(u); setCurrentView(View.AUDIT_MODE); }} showToast={showToast} onLogout={handleLogout} />;
    }

    const handleDisconnect = async () => {
        if (!token) return;
        try {
            await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
            setConnectionStatus(ConnectionStatus.DISCONNECTED); // Optimistic update
            setQrCode(null);
            setPairingCode(null);
            // Polling will confirm the status change
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
        setConnectionStatus(ConnectionStatus.RESETTING); // Optimistic update
        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Visual feedback
            await fetch(`${BACKEND_URL}/api/disconnect`, { headers: getAuthHeaders(token!) });
            setQrCode(null);
            setPairingCode(null);
            setConnectionStatus(ConnectionStatus.DISCONNECTED); // Optimistic update
            showToast('La sesión anterior fue purgada.', 'success');
            // Polling will confirm the status change
        } catch(e: any) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                showToast('Error de red al purgar la sesión. Verifique su conexión a internet y el backend.', 'error');
            } else {
                showToast('Error al purgar la sesión.', 'error');
            }
            setConnectionStatus(ConnectionStatus.DISCONNECTED); // Revert status on error
        }
    };

    switch(currentView) {
        case View.DASHBOARD:
            return <AgencyDashboard token={token!} backendUrl={BACKEND_URL} settings={settings!} onUpdateSettings={handleUpdateSettings} currentUser={currentUser} showToast={showToast} />;
        case View.SETTINGS:
            return <SettingsPanel settings={settings} isLoading={isLoadingSettings} onUpdateSettings={isFunctionalityDisabled ? ()=>{} : handleUpdateSettings} onOpenLegal={setLegalModalType} />;
        case View.CONNECTION:
            return <ConnectionPanel user={currentUser} status={connectionStatus} qrCode={qrCode} pairingCode={pairingCode} onConnect={isFunctionalityDisabled ? async ()=>{} : handleConnect} onDisconnect={handleDisconnect} onWipe={handleWipeConnection} />;
        case View.CHATS:
        default:
            return (
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                        <ConversationList conversations={conversations} selectedConversationId={selectedConversationId} onSelectConversation={setSelectedConversationId} backendError={backendError} />
                    </div>
                    <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
                        <ChatWindow 
                            conversation={selectedConversation} 
                            onSendMessage={isFunctionalityDisabled ? ()=>{} : handleSendMessage} 
                            onToggleBot={(id) => fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates: { isBotActive: !selectedConversation?.isBotActive } }) })} 
                            isTyping={isTyping} 
                            isBotGloballyActive={isBotGloballyActive} 
                            isMobile={true} 
                            onBack={() => setSelectedConversationId(null)} 
                            onUpdateConversation={(id, updates) => { setConversations(prev => { const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c); return updated.sort((a, b) => { const dateA = new Date(a.lastActivity || a.firstMessageAt || 0); const dateB = new Date(b.lastActivity || b.firstMessageAt || 0); return dateB.getTime() - dateA.getTime(); }); }); fetch(`${BACKEND_URL}/api/conversation/update`, { method: 'POST', headers: getAuthHeaders(token!), body: JSON.stringify({ id, updates }) }); }} 
                            isPlanExpired={isFunctionalityDisabled}
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
