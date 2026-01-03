
import React, { useState, useEffect, useRef } from 'react';
import { BotSettings, PromptArchetype } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { audioService } from '../services/audioService';
import { openSupportWhatsApp } from '../utils/textUtils';

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto' | 'network') => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// --- CONSTANTS & MAPPINGS ---

const ARCHETYPE_NAMES: { [key in PromptArchetype]: string } = {
    [PromptArchetype.CONSULTATIVE]: 'Venta Consultiva',
    [PromptArchetype.DIRECT_CLOSER]: 'Cierre Directo',
    [PromptArchetype.SUPPORT]: 'Soporte Técnico',
    [PromptArchetype.EMPATHIC]: 'Relacional Empático',
    [PromptArchetype.AGRESSIVE]: 'Cierre Agresivo',
    [PromptArchetype.ACADEMIC]: 'Informativo Detallado',
    [PromptArchetype.CUSTOM]: 'Personalizado',
};

const ARCHETYPE_MAPPING = {
    [PromptArchetype.CONSULTATIVE]: { toneValue: 4, rhythmValue: 4, intensityValue: 2 },
    [PromptArchetype.DIRECT_CLOSER]: { toneValue: 2, rhythmValue: 2, intensityValue: 5 },
    [PromptArchetype.SUPPORT]: { toneValue: 5, rhythmValue: 3, intensityValue: 1 },
    [PromptArchetype.EMPATHIC]: { toneValue: 5, rhythmValue: 4, intensityValue: 2 },
    [PromptArchetype.AGRESSIVE]: { toneValue: 1, rhythmValue: 1, intensityValue: 5 },
    [PromptArchetype.ACADEMIC]: { toneValue: 5, rhythmValue: 5, intensityValue: 1 },
    [PromptArchetype.CUSTOM]: { toneValue: 3, rhythmValue: 3, intensityValue: 3 },
};

// --- ELITE TEMPLATES ---
const INDUSTRY_TEMPLATES: Record<string, { label: string, icon: string, desc: string, data: Partial<WizardState & { priceText: string, ctaLink: string }> }> = {
    'AGENCY': {
        label: 'Agencia High-Ticket',
        icon: '🚀',
        desc: 'Para agencias de marketing, desarrollo o consultoría.',
        data: {
            mission: 'Soy el Consultor Senior de [NOMBRE_EMPRESA]. Mi objetivo es auditar la situación del cliente y ofrecer la solución exacta.',
            idealCustomer: 'Dueños de negocio que buscan escalar, tienen presupuesto y valoran la calidad sobre el precio.',
            detailedDescription: 'Servicios premium de [CONTEXTO_EMPRESA]. Nos enfocamos en el ROI y resultados tangibles. No vendemos horas, vendemos transformación.',
            priceText: 'A convenir según proyecto',
            ctaLink: '',
            objections: [
                { id: 1, objection: 'Es costoso', response: 'Lo costoso es no tener resultados. Nuestra solución se paga sola con el primer cliente que cierres gracias a esto.' },
                { id: 2, objection: '¿Cómo empezamos?', response: 'El primer paso es una auditoría breve para ver si calificas. ¿Te parece bien?' }
            ],
            rules: '- NO dar precios exactos sin calificar primero.\n- Mantener postura de autoridad.\n- Filtrar clientes sin presupuesto.'
        }
    },
    'REAL_ESTATE': {
        label: 'Real Estate / Inmobiliaria',
        icon: '🏙️',
        desc: 'Venta y alquiler de propiedades, terrenos y desarrollos.',
        data: {
            mission: 'Soy el Asesor Inmobiliario de [NOMBRE_EMPRESA]. Conecto personas con oportunidades de inversión o su hogar ideal.',
            idealCustomer: 'Compradores o inversores calificados buscando seguridad jurídica y revalorización.',
            detailedDescription: 'Cartera exclusiva de propiedades en [CONTEXTO_EMPRESA]. Gestión integral y asesoramiento legal incluido.',
            priceText: 'Consultar valor',
            ctaLink: '',
            objections: [
                { id: 1, objection: 'Solo quiero ver fotos', response: 'Entiendo. Para enviarte las fichas correctas y no hacerte perder tiempo, ¿qué presupuesto aproximado estás manejando?' },
                { id: 2, objection: 'La ubicación exacta', response: 'Por seguridad y privacidad de los propietarios, coordinamos una visita presencial para revelar la ubicación exacta.' }
            ],
            rules: '- Calificar solvencia antes de agendar visita.\n- Proyectar exclusividad.'
        }
    },
    'ECOMMERCE': {
        label: 'E-commerce / Retail',
        icon: '🛍️',
        desc: 'Tiendas online, productos físicos, moda y accesorios.',
        data: {
            mission: 'Soy el Asistente de Compras de [NOMBRE_EMPRESA]. Ayudo a elegir el producto perfecto y resolver dudas de envío.',
            idealCustomer: 'Compradores que valoran la calidad, el diseño y la rapidez en la entrega.',
            detailedDescription: 'Venta de [CONTEXTO_EMPRESA]. Envíos a todo el país. Garantía de satisfacción.',
            priceText: 'Ver catálogo',
            ctaLink: '',
            objections: [
                { id: 1, objection: 'Precio del envío', response: 'El envío es rápido y seguro. Además, si tu compra supera cierto monto, ¡es gratis!' },
                { id: 2, objection: '¿Tienen garantía?', response: 'Sí, garantía total de cambio directo si no estás conforme con el producto.' }
            ],
            rules: '- Respuestas cortas y amables.\n- Fomentar la compra impulsiva.'
        }
    },
    'SERVICES': {
        label: 'Servicios Profesionales',
        icon: '⚖️',
        desc: 'Abogados, Contadores, Arquitectos, Salud.',
        data: {
            mission: 'Soy el Asistente de [NOMBRE_EMPRESA]. Gestiono citas y filtro consultas para optimizar el tiempo de los profesionales.',
            idealCustomer: 'Personas con una necesidad específica o urgencia que requieren solución profesional.',
            detailedDescription: 'Estudio/Consultorio especializado en [CONTEXTO_EMPRESA]. Atención personalizada y confidencialidad.',
            priceText: 'Honorarios según caso',
            ctaLink: '',
            objections: [
                { id: 1, objection: 'Precio de la consulta', response: 'Cada caso es único. Ofrecemos una primera evaluación para determinar la viabilidad y el costo exacto.' },
                { id: 2, objection: 'Necesito hablar urgente', response: 'Entendido. Por favor, descríbeme brevemente la urgencia para priorizar tu caso con el especialista.' }
            ],
            rules: '- Tono formal y empático.\n- Priorizar el agendamiento de citas.'
        }
    }
};

// --- TYPES & UTILS ---

interface WizardState {
    mission: string;
    idealCustomer: string;
    detailedDescription: string;
    objections: { id: number; objection: string; response: string }[];
    rules: string;
}

// Polyfill simple para SpeechRecognition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal, showToast }) => {
  const [current, setCurrent] = useState<BotSettings | null>(null);
  
  // WIZARD STATE
  const [wizardStep, setWizardStep] = useState<'IDENTITY' | 'CONTEXT' | 'PATH' | 'LOADING'>('IDENTITY');
  
  // DATA STATE
  const [wizIdentity, setWizIdentity] = useState({ name: '', website: '' });
  const [wizContext, setWizContext] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showWebTooltip, setShowWebTooltip] = useState(false);
  const [isAnalyzingWeb, setIsAnalyzingWeb] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [wizardState, setWizardState] = useState<WizardState>({
      mission: '', idealCustomer: '', detailedDescription: '',
      objections: [{ id: 1, objection: '', response: '' }], rules: ''
  });

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (settings) {
        setCurrent({ ...settings, ignoredJids: settings.ignoredJids || [] });
        // Si ya está completado, parseamos para mostrar en modo manual si se quiere editar luego
        if (settings.isWizardCompleted) {
            // Logic to populate manual fields if needed
        } else {
            // Pre-fill name if available
            // setWizIdentity(prev => ({...prev, name: settings.productName || ''}));
        }
    }
  }, [settings]);

  // --- AUDIO RECORDING LOGIC ---
  const toggleRecording = () => {
      if (isRecording) {
          recognitionRef.current?.stop();
          setIsRecording(false);
      } else {
          if (!SpeechRecognition) {
              showToast('Tu navegador no soporta entrada de voz. Usa Chrome.', 'error');
              return;
          }
          const recognition = new SpeechRecognition();
          recognition.lang = 'es-ES';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
              let finalTranscript = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                  if (event.results[i].isFinal) {
                      finalTranscript += event.results[i][0].transcript;
                  }
              }
              if (finalTranscript) {
                  setWizContext(prev => prev + ' ' + finalTranscript);
              }
          };

          recognition.onerror = (event: any) => {
              console.error(event.error);
              setIsRecording(false);
          };

          recognition.start();
          recognitionRef.current = recognition;
          setIsRecording(true);
          showToast('Escuchando... Habla sobre tu negocio.', 'info');
      }
  };

  const handleUpdate = (field: keyof BotSettings, value: any) => {
    if (!current) return;
    const newSettings = { ...current, [field]: value };
    setCurrent(newSettings);
  };

  // --- WEB ANALYSIS FEATURE ---
  const analyzeWebsite = async () => {
      if (!wizIdentity.website) return;
      if (!current?.geminiApiKey) {
          showToast('Configura tu API Key de Gemini en Ajustes primero.', 'error');
          return;
      }

      setIsAnalyzingWeb(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          const prompt = `
            Analiza el sitio web: ${wizIdentity.website}
            
            Tu objetivo es extraer el "Contexto Operativo" para configurar un vendedor de IA.
            
            Extrae y redacta en primera persona ("Somos...", "Ofrecemos..."):
            1. Qué productos/servicios venden.
            2. Quién es el cliente ideal (inferido).
            3. Propuesta de valor única.
            4. Información de precios si es pública.
            
            Mantén la respuesta concisa (max 150 palabras) y lista para ser usada como contexto base.
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ parts: [{ text: prompt }] }],
              config: { 
                  tools: [{ googleSearch: {} }] // Enable search to actually read the site
              }
          });

          const extractedText = response.text;
          if (extractedText) {
              setWizContext(prev => (prev ? prev + '\n\n' : '') + extractedText);
              showToast('Sitio web analizado. Revisa el texto generado.', 'success');
              audioService.play('action_success');
          } else {
              showToast('No se pudo extraer información relevante.', 'error');
          }

      } catch (e) {
          console.error(e);
          showToast('Error analizando la web. Intenta manualmente.', 'error');
      } finally {
          setIsAnalyzingWeb(false);
      }
  };

  // --- PATH A: AI AUTOCOMPLETE ---
  const executeNeuralPath = async () => {
      if (!current?.geminiApiKey) {
          showToast('Falta la API Key de Gemini. Configúrala en el panel derecho.', 'error');
          return;
      }
      if (!wizContext || wizContext.length < 10) {
          showToast('El contexto es muy corto. Escribe o dicta más detalles.', 'error');
          return;
      }

      setWizardStep('LOADING');
      setIsProcessing(true);

      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          const prompt = `
            ACTÚA COMO: Consultor de Negocios de Élite.
            
            INPUT DEL USUARIO:
            Nombre Negocio: "${wizIdentity.name}"
            Web: "${wizIdentity.website}"
            Contexto/Descripción: "${wizContext}"

            TU TAREA:
            Genera la configuración estratégica completa para un Chatbot de Ventas (Dominion Bot) basado en los datos anteriores.
            Deduce el arquetipo de personalidad ideal.

            FORMATO JSON REQUERIDO:
            {
                "mission": "...", // Misión principal del bot (1a persona)
                "idealCustomer": "...", // Quién es el cliente ideal
                "detailedDescription": "...", // Descripción persuasiva de la oferta
                "priceText": "...", // Texto sugerido para precios (ej: Desde $100)
                "objections": [{ "objection": "...", "response": "..." }], // 2 objeciones comunes y manejo
                "rules": "...", // 3 reglas de comportamiento críticas
                "archetype": "..." // Uno de: VENTA_CONSULTIVA, CIERRE_DIRECTO, SOPORTE_TECNICO, RELACIONAL_EMPATICO
            }
          `;

          const res = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ parts: [{ text: prompt }] }],
              config: { responseMimeType: "application/json" }
          });

          const data = JSON.parse(res.text || '{}');
          
          // Apply Logic
          finishWizard(data, 'AI');

      } catch (e) {
          console.error(e);
          showToast('Error en la generación neural. Intenta de nuevo.', 'error');
          setWizardStep('CONTEXT'); // Go back
          setIsProcessing(false);
      }
  };

  // --- PATH B: TEMPLATES ---
  const executeTemplatePath = (templateKey: string) => {
      const t = INDUSTRY_TEMPLATES[templateKey];
      if (!t) return;

      // Inject User Data into Template
      const inject = (text: string = '') => {
          return text
            .replace(/\[NOMBRE_EMPRESA\]/g, wizIdentity.name)
            .replace(/\[CONTEXTO_EMPRESA\]/g, wizContext || 'nuestro rubro');
      };

      const finalData = {
          mission: inject(t.data.mission),
          idealCustomer: t.data.idealCustomer,
          detailedDescription: inject(t.data.detailedDescription),
          priceText: t.data.priceText,
          objections: t.data.objections,
          rules: t.data.rules,
          archetype: 'VENTA_CONSULTIVA' // Default good one
      };

      finishWizard(finalData, 'TEMPLATE');
  };

  const finishWizard = (data: any, source: 'AI' | 'TEMPLATE') => {
      if (!current) return;

      const compiledDescription = `
## MISIÓN PRINCIPAL
${data.mission}

## CLIENTE IDEAL
${data.idealCustomer || ''}

## DESCRIPCIÓN DETALLADA DEL SERVICIO
${data.detailedDescription}

## MANEJO DE OBJECIONES FRECUENTES
${(data.objections || []).map((obj: any) => `- Sobre "${obj.objection}": Respondo: "${obj.response}"`).join('\n')}

## REGLAS DE ORO Y LÍMITES
${data.rules}
      `;

      // Determine Personality from AI or Default
      const arch = (data.archetype as PromptArchetype) || PromptArchetype.CONSULTATIVE;
      const mapping = ARCHETYPE_MAPPING[arch] || ARCHETYPE_MAPPING[PromptArchetype.CONSULTATIVE];

      const newSettings = {
          ...current,
          productName: wizIdentity.name,
          ctaLink: wizIdentity.website || current.ctaLink,
          productDescription: compiledDescription,
          priceText: data.priceText || current.priceText,
          archetype: arch,
          toneValue: mapping.toneValue,
          rhythmValue: mapping.rhythmValue,
          intensityValue: mapping.intensityValue,
          isWizardCompleted: true
      };

      onUpdateSettings(newSettings);
      showToast(source === 'AI' ? '🧠 Cerebro Generado y Sincronizado.' : '📂 Plantilla Aplicada Exitosamente.', 'success');
      audioService.play('action_success');
      // No need to change state here manually, parent prop update will trigger re-render showing the main dashboard
  };

  // --- RENDER HELPERS ---
  
  if (isLoading || !current) return <div className="p-10 text-center text-gray-500 animate-pulse font-black uppercase tracking-widest">Cargando Núcleo...</div>;

  // VIEW: MAIN SETTINGS (If Wizard Completed)
  if (current.isWizardCompleted) {
      return (
        <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
            <div className="max-w-7xl mx-auto pb-32">
                <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Ajuste Fino</h2>
                    <button onClick={() => { 
                        if(confirm("¿Recalibrar todo el cerebro? Perderás los textos actuales.")) {
                            const reset = {...current, isWizardCompleted: false};
                            setCurrent(reset);
                            onUpdateSettings(reset);
                            setWizardStep('IDENTITY');
                        }
                    }} className="text-[10px] text-gray-500 hover:text-brand-gold font-bold uppercase tracking-widest border border-white/10 px-4 py-2 rounded-lg hover:border-brand-gold transition-all">
                        Reiniciar Wizard
                    </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Manual Editor (Simplified) */}
                    <div className="space-y-4">
                        <label className="text-xs font-bold text-brand-gold uppercase tracking-widest">Prompt del Sistema (Solo Lectura / Edición Avanzada)</label>
                        <textarea 
                            value={current.productDescription} 
                            onChange={(e) => handleUpdate('productDescription', e.target.value)}
                            className="w-full h-[500px] bg-black/40 border border-white/10 rounded-xl p-4 text-gray-300 text-sm font-mono leading-relaxed focus:border-brand-gold outline-none custom-scrollbar"
                        />
                        <button onClick={() => onUpdateSettings(current)} className="w-full py-3 bg-brand-gold text-black font-black uppercase tracking-widest rounded-xl text-xs hover:scale-[1.01] transition-transform">Guardar Cambios Manuales</button>
                    </div>

                    {/* Controls */}
                    <div className="space-y-6">
                         {/* GEMINI PANEL (Mini) */}
                        <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-lg">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Motor IA</h3>
                            <input 
                                type="password" 
                                value={current.geminiApiKey || ''} 
                                onChange={e => handleUpdate('geminiApiKey', e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs font-mono tracking-widest focus:border-brand-gold outline-none mb-2"
                                placeholder="API KEY"
                            />
                            <button onClick={() => onUpdateSettings(current)} className="text-[10px] text-gray-500 hover:text-white font-bold uppercase">Actualizar Key</button>
                        </div>

                        {/* SLIDERS (Personality) */}
                        <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-lg space-y-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Personalidad</h3>
                            {[
                                { label: 'Tono', val: current.toneValue, key: 'toneValue' },
                                { label: 'Ritmo', val: current.rhythmValue, key: 'rhythmValue' },
                                { label: 'Intensidad', val: current.intensityValue, key: 'intensityValue' }
                            ].map((s) => (
                                <div key={s.key}>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">{s.label}</label>
                                        <span className="text-[10px] text-brand-gold font-bold">{s.val}</span>
                                    </div>
                                    <input type="range" min="1" max="5" value={s.val} onChange={(e) => handleUpdate(s.key as any, parseInt(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold" />
                                </div>
                            ))}
                            <button onClick={() => onUpdateSettings(current)} className="w-full py-2 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest rounded-lg text-[10px] transition-all">Aplicar Personalidad</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // VIEW: WIZARD
  return (
    <div className="flex-1 bg-brand-black flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Background Ambient */}
        <div className="absolute top-0 left-0 w-full h-full bg-noise opacity-5 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="w-full max-w-2xl relative z-10">
            
            {/* PROGRESS HEADER */}
            <div className="mb-10 text-center">
                <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-2">
                    Configuración <span className="text-brand-gold">Neural</span>
                </h2>
                <div className="flex justify-center gap-2 mt-4">
                    {['IDENTITY', 'CONTEXT', 'PATH'].map((s, idx) => {
                        const steps = ['IDENTITY', 'CONTEXT', 'PATH'];
                        const currIdx = steps.indexOf(wizardStep);
                        const isActive = idx <= currIdx;
                        return (
                            <div key={s} className={`h-1.5 w-12 rounded-full transition-all duration-500 ${isActive ? 'bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]' : 'bg-white/10'}`}></div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-brand-surface border border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl relative backdrop-blur-sm">
                
                {/* STEP 1: IDENTITY */}
                {wizardStep === 'IDENTITY' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="text-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Identidad Digital</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">¿Quién eres ante el mundo?</p>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2 ml-1">Nombre del Negocio</label>
                                <input 
                                    type="text" 
                                    value={wizIdentity.name}
                                    onChange={(e) => setWizIdentity({...wizIdentity, name: e.target.value})}
                                    placeholder="Ej: Agencia Alpha, Inmobiliaria Sur..."
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-lg font-bold focus:border-brand-gold outline-none transition-all placeholder-gray-700"
                                    autoFocus
                                />
                            </div>

                            <div className="relative">
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2 ml-1">Sitio Web (Opcional)</label>
                                <input 
                                    type="text" 
                                    value={wizIdentity.website}
                                    onChange={(e) => setWizIdentity({...wizIdentity, website: e.target.value})}
                                    onBlur={() => { if(!wizIdentity.website) setShowWebTooltip(true); }}
                                    placeholder="www.tu-negocio.com"
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none transition-all placeholder-gray-700"
                                />
                                {/* VALUE TRAP TOOLTIP */}
                                {showWebTooltip && !wizIdentity.website && (
                                    <div className="absolute top-0 right-0 -mt-10 md:-mr-4 bg-brand-gold text-black p-3 rounded-xl shadow-lg border border-white/20 animate-bounce cursor-pointer z-20 max-w-[200px]" onClick={() => openSupportWhatsApp('Hola, estoy configurando mi bot y vi que necesito una web profesional. ¿Me das info?')}>
                                        <div className="relative">
                                            <p className="text-[9px] font-black leading-tight uppercase">¿Sin web? Pierdes el 40% de confianza. <span className="underline">Hablemos.</span></p>
                                            <div className="absolute bottom-[-18px] right-4 w-3 h-3 bg-brand-gold rotate-45 transform"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button 
                            onClick={() => { if(wizIdentity.name) setWizardStep('CONTEXT'); else showToast('El nombre es obligatorio.', 'error'); }}
                            className="w-full py-4 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] mt-4"
                        >
                            Siguiente &rarr;
                        </button>
                    </div>
                )}

                {/* STEP 2: CONTEXT (HYBRID) */}
                {wizardStep === 'CONTEXT' && (
                    <div className="space-y-6 animate-fade-in relative">
                        <div className="text-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Contexto Operativo</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">Cuéntale a la IA qué vendes y cómo. Escribe o dicta.</p>
                        </div>

                        {/* WEB ANALYSIS BUTTON (Visible if URL is present) */}
                        {wizIdentity.website && (
                            <div className="absolute top-0 right-0">
                                <button 
                                    onClick={analyzeWebsite}
                                    disabled={isAnalyzingWeb}
                                    className="flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 hover:bg-brand-gold/20 text-brand-gold px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {isAnalyzingWeb ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                                            Analizando Web...
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xs">✨</span> Analizar {wizIdentity.website}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        <div className="relative group">
                            <textarea 
                                value={wizContext}
                                onChange={(e) => setWizContext(e.target.value)}
                                className="w-full h-48 bg-black/50 border border-white/10 rounded-xl p-5 pb-12 text-white text-sm leading-relaxed focus:border-brand-gold outline-none resize-none custom-scrollbar placeholder-gray-700 transition-all z-10 relative"
                                placeholder={`Ej: Soy una agencia de marketing. Vendemos gestión de redes desde $300 USD. Quiero que el bot sea agresivo en el cierre. Si preguntan por descuentos, diles que no, pero que ofrecemos garantía.`}
                            />
                            {/* EDUCATIONAL OVERLAY (Fades out when typing) - MOVED TO BOTTOM */}
                            {!wizContext && !isRecording && (
                                <div className="absolute bottom-4 left-4 right-16 p-2 pointer-events-none flex flex-col justify-end text-left opacity-50 z-20">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">💡 Tip de Calibración:</p>
                                    <p className="text-[9px] text-gray-500 leading-snug">Incluye: Qué vendes, precios base, tu diferencial y reglas que el bot no debe romper nunca.</p>
                                </div>
                            )}
                            
                            {/* MIC BUTTON */}
                            <button 
                                onClick={toggleRecording}
                                className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all z-30 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-brand-gold text-black hover:scale-110'}`}
                                title="Dictar por voz"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            </button>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button onClick={() => setWizardStep('IDENTITY')} className="px-6 py-3 text-gray-500 font-bold text-xs uppercase hover:text-white transition-colors">Atrás</button>
                            <button 
                                onClick={() => { if(wizContext.length > 5) setWizardStep('PATH'); else showToast('Danos un poco más de contexto.', 'error'); }}
                                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02]"
                            >
                                Siguiente &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: THE FORK (CHOICE) */}
                {wizardStep === 'PATH' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="text-center mb-8">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Elije tu Estrategia</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">¿Cómo quieres construir el cerebro?</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* OPTION A: AI AUTO */}
                            <button 
                                onClick={executeNeuralPath}
                                className="group relative bg-[#0a0a0a] border border-brand-gold/30 hover:border-brand-gold hover:bg-brand-gold/5 rounded-2xl p-6 text-left transition-all duration-300 hover:-translate-y-1 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
                            >
                                <div className="absolute top-4 right-4 text-2xl group-hover:scale-125 transition-transform">⚡</div>
                                <h4 className="text-lg font-black text-white mb-2 group-hover:text-brand-gold transition-colors">Auto-Completado Neural</h4>
                                <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300">
                                    La IA analiza tu contexto y deduce automáticamente tu Misión, Reglas y Manejo de Objeciones.
                                </p>
                                <div className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-gold/70 group-hover:text-brand-gold">
                                    <span>Recomendado</span> &rarr;
                                </div>
                            </button>

                            {/* OPTION B: TEMPLATES */}
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 text-left relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-800 to-gray-600"></div>
                                <h4 className="text-lg font-black text-white mb-4">Biblioteca Táctica</h4>
                                <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                                    {Object.entries(INDUSTRY_TEMPLATES).map(([key, tpl]) => (
                                        <button 
                                            key={key}
                                            onClick={() => executeTemplatePath(key)}
                                            className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all text-left group"
                                        >
                                            <span className="text-xl group-hover:scale-110 transition-transform">{tpl.icon}</span>
                                            <div>
                                                <p className="text-xs font-bold text-white uppercase tracking-tight">{tpl.label}</p>
                                                <p className="text-[9px] text-gray-500 truncate max-w-[120px]">{tpl.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-center pt-4">
                            <button onClick={() => setWizardStep('CONTEXT')} className="text-gray-500 font-bold text-xs uppercase hover:text-white transition-colors">Atrás</button>
                        </div>
                    </div>
                )}

                {/* LOADING STATE */}
                {wizardStep === 'LOADING' && (
                    <div className="py-20 text-center animate-fade-in flex flex-col items-center">
                        <div className="w-20 h-20 border-4 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin mb-8 shadow-[0_0_40px_rgba(212,175,55,0.2)]"></div>
                        <h3 className="text-xl font-black text-white uppercase tracking-widest animate-pulse">Estructurando Red Neural</h3>
                        <p className="text-xs text-gray-500 mt-3 font-mono">Aplicando arquitectura Elite++...</p>
                    </div>
                )}

                {/* SOS / AUDIT BUTTON */}
                {wizardStep !== 'LOADING' && (
                    <div className="mt-8 pt-6 border-t border-white/5 flex justify-center animate-fade-in">
                        <button 
                            onClick={() => openSupportWhatsApp('Hola, estoy trabado en la configuración del Cerebro. ¿Me ayudan con una auditoría?')} 
                            className="text-[9px] text-gray-500 hover:text-brand-gold font-bold uppercase tracking-widest flex items-center gap-2 transition-colors group"
                        >
                            <span className="grayscale group-hover:grayscale-0 transition-all">🆘</span> ¿Te sientes abrumado? Solicitar Auditoría Humana (Gratis)
                        </button>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
};

export default SettingsPanel;
