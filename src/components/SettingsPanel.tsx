
import React, { useState, useEffect, useRef } from 'react';
import { BotSettings, PromptArchetype, NeuralRouterConfig } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { audioService } from '../services/audioService';
import { openSupportWhatsApp } from '../utils/textUtils';
import AdvancedNeuralConfig from './Settings/AdvancedNeuralConfig';

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
  const [isAdvancedMode, setIsAdvancedMode] = useState(false); // NEW STATE FOR TOGGLE
  
  // WIZARD STATE (Updated with API_SETUP)
  const [wizardStep, setWizardStep] = useState<'IDENTITY' | 'API_SETUP' | 'CONTEXT' | 'PATH' | 'LOADING'>('IDENTITY');
  
  // DATA STATE
  const [wizIdentity, setWizIdentity] = useState({ name: '', website: '' });
  const [wizApiKey, setWizApiKey] = useState('');
  const [wizContext, setWizContext] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showWebTooltip, setShowWebTooltip] = useState(false);
  const [isAnalyzingWeb, setIsAnalyzingWeb] = useState(false);
  
  // New: Advanced Wizard State
  const [wizNeuralConfig, setWizNeuralConfig] = useState<NeuralRouterConfig | undefined>(undefined);

  const [isProcessing, setIsProcessing] = useState(false);
  const [wizardState, setWizardState] = useState<WizardState>({
      mission: '', idealCustomer: '', detailedDescription: '',
      objections: [{ id: 1, objection: '', response: '' }], rules: ''
  });

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (settings) {
        setCurrent({ ...settings, ignoredJids: settings.ignoredJids || [] });
        if (settings.geminiApiKey) {
            setWizApiKey(settings.geminiApiKey);
        }
        // Init toggle based on settings
        setIsAdvancedMode(settings.useAdvancedModel || false);
        setWizNeuralConfig(settings.neuralConfig);
    }
  }, [settings]);

  const handleToggleAdvancedMode = () => {
      if (!current) return;
      const newVal = !isAdvancedMode;
      setIsAdvancedMode(newVal);
      // Persist the mode preference
      onUpdateSettings({ ...current, useAdvancedModel: newVal });
  };

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
      if (!wizApiKey) {
          showToast('Falta la API Key. Retrocede un paso.', 'error');
          return;
      }

      setIsAnalyzingWeb(true);
      try {
          const cleanKey = wizApiKey.trim(); 
          const ai = new GoogleGenAI({ apiKey: cleanKey }); 
          
          // REFINED PROMPT: MORE SALES ORIENTED, LESS DESCRIPTIVE
          const prompt = `
            Analiza el sitio web: ${wizIdentity.website}
            
            TU OBJETIVO: Configurar la "Personalidad de Venta" de una IA.
            
            Redacta en PRIMERA PERSONA ("Soy el asistente de...", "Ofrezco...").
            NO hagas un resumen corporativo aburrido.
            
            ESTRUCTURA REQUERIDA:
            1. ROL Y OFERTA: "Soy el especialista en [Rubro]. Mi meta es vender [Productos principales]..."
            2. PRECIOS Y PLANES: Lista los precios exactos encontrados (ej: "$180.000 ARS"). Si no hay, di "A cotizar".
            3. GANCHO COMERCIAL: 2 o 3 frases cortas sobre por qué elegirnos (Valor Único). Convierte características en beneficios.
            4. CLIENTE OBJETIVO: A quién le estoy vendiendo.
            
            IMPORTANTE: Si mencionan herramientas de competencia (ej: Chatfuel, ManyChat), omítelas o cámbialas por "Nuestras soluciones de IA", a menos que sea un servicio de implementación de esas herramientas.
          `;

          // UPDATED MODEL to gemini-2.5-flash as requested
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash', 
              contents: [{ parts: [{ text: prompt }] }],
              config: { 
                  tools: [{ googleSearch: {} }]
              }
          });

          const extractedText = response.text;
          if (extractedText) {
              setWizContext(prev => (prev ? prev + '\n\n' : '') + extractedText);
              showToast('Sitio web analizado exitosamente.', 'success');
              audioService.play('action_success');
          } else {
              showToast('No se pudo extraer información relevante.', 'error');
          }

      } catch (e: any) {
          console.error("WEB ANALYSIS ERROR:", e);
          showToast(`Error analizando la web: ${e.message || 'Error desconocido'}`, 'error');
      } finally {
          setIsAnalyzingWeb(false);
      }
  };

  // --- PATH A: AI AUTOCOMPLETE ---
  const executeNeuralPath = async () => {
      if (!wizApiKey) {
          showToast('Falta la API Key de Gemini.', 'error');
          setWizardStep('API_SETUP');
          return;
      }
      
      // IF ADVANCED MODE, JUST SAVE THE NEURAL CONFIG AND FINISH
      if (isAdvancedMode) {
          if (!wizNeuralConfig?.masterIdentity) {
              showToast('Debes configurar al menos la Identidad Maestra.', 'error');
              return;
          }
          
          setWizardStep('LOADING');
          // Short delay to simulate saving
          setTimeout(() => {
              if (!current) return;
              const newSettings = {
                  ...current,
                  productName: wizIdentity.name,
                  ctaLink: wizIdentity.website || current.ctaLink,
                  // Use Master Identity as description fallback
                  productDescription: wizNeuralConfig.masterIdentity, 
                  useAdvancedModel: true,
                  neuralConfig: wizNeuralConfig,
                  geminiApiKey: wizApiKey.trim(),
                  isWizardCompleted: true
              };
              onUpdateSettings(newSettings);
              showToast('🧠 Arquitectura Modular Activada.', 'success');
              audioService.play('action_success');
          }, 1500);
          return;
      }

      // LINEAR PATH (ORIGINAL AI GENERATION)
      if (!wizContext || wizContext.length < 10) {
          showToast('El contexto es muy corto. Escribe o dicta más detalles.', 'error');
          return;
      }

      setWizardStep('LOADING');
      setIsProcessing(true);

      try {
          const cleanKey = wizApiKey.trim();
          const ai = new GoogleGenAI({ apiKey: cleanKey });
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
          
          finishWizard(data, 'AI');

      } catch (e) {
          console.error(e);
          showToast('Error en la generación neural. Intenta de nuevo.', 'error');
          setWizardStep('CONTEXT'); 
          setIsProcessing(false);
      }
  };

  // --- PATH B: TEMPLATES ---
  const executeTemplatePath = (templateKey: string) => {
      const t = INDUSTRY_TEMPLATES[templateKey];
      if (!t) return;

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
          archetype: 'VENTA_CONSULTIVA' // Default
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
          geminiApiKey: wizApiKey.trim(), // Ensure Key is saved trimmed
          isWizardCompleted: true,
          useAdvancedModel: false // Explicitly set false for Linear Path
      };

      onUpdateSettings(newSettings);
      showToast(source === 'AI' ? '🧠 Cerebro Generado y Sincronizado.' : '📂 Plantilla Aplicada Exitosamente.', 'success');
      audioService.play('action_success');
  };

  if (isLoading || !current) return <div className="p-10 text-center text-gray-500 animate-pulse font-black uppercase tracking-widest">Cargando Núcleo...</div>;

  // VIEW: MAIN SETTINGS (If Wizard Completed)
  if (current.isWizardCompleted) {
      return (
        <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
            <div className="max-w-7xl mx-auto pb-32">
                
                {/* --- NEW PROMINENT HEADER WITH TOGGLE --- */}
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 border-b border-white/5 pb-8 gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                            Configuración <span className="text-brand-gold">Neural</span>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">
                            Personalidad y Comportamiento del Bot
                        </p>
                    </div>
                    
                    {/* THE TOGGLE SWITCH CONTAINER */}
                    <div className="flex items-center gap-6 bg-brand-surface border border-white/10 p-2 rounded-2xl shadow-lg">
                        <div className="flex flex-col items-end mr-2 hidden sm:flex">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Arquitectura Cognitiva</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isAdvancedMode ? 'text-brand-gold' : 'text-blue-400'}`}>
                                {isAdvancedMode ? 'MODULAR (COMPLEJA)' : 'LINEAL (SIMPLE)'}
                            </span>
                        </div>

                        <div className="flex items-center bg-black/50 rounded-xl p-1 border border-white/5">
                            <button 
                                onClick={() => { if(isAdvancedMode) handleToggleAdvancedMode(); }}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!isAdvancedMode ? 'bg-white/10 text-white shadow-inner' : 'text-gray-600 hover:text-gray-400'}`}
                            >
                                Simple
                            </button>
                            <button 
                                onClick={() => { if(!isAdvancedMode) handleToggleAdvancedMode(); }}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${isAdvancedMode ? 'bg-brand-gold text-black shadow-lg shadow-brand-gold/20' : 'text-gray-600 hover:text-gray-400'}`}
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                                Avanzado
                            </button>
                        </div>

                        {!isAdvancedMode && (
                            <button onClick={() => { 
                                if(confirm("¿Recalibrar todo el cerebro? Perderás los textos actuales.")) {
                                    const reset = {...current, isWizardCompleted: false};
                                    setCurrent(reset);
                                    onUpdateSettings(reset);
                                    setWizardStep('IDENTITY');
                                }
                            }} className="text-[10px] text-red-400/70 hover:text-red-400 font-bold uppercase tracking-widest border border-red-500/20 px-3 py-2 rounded-lg hover:border-red-500/50 transition-all ml-2">
                                Reiniciar Wizard
                            </button>
                        )}
                    </div>
                </div>
                
                {/* EDUCATIONAL BANNER */}
                <div className="mb-8 p-4 rounded-xl border border-white/5 bg-white/5 flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${isAdvancedMode ? 'bg-brand-gold/10 text-brand-gold' : 'bg-blue-500/10 text-blue-400'}`}>
                        {isAdvancedMode ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        )}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold uppercase mb-1 ${isAdvancedMode ? 'text-brand-gold' : 'text-blue-400'}`}>
                            {isAdvancedMode ? 'Arquitectura Modular (Router + Expertos)' : 'Arquitectura Lineal (Agente Único)'}
                        </h4>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            {isAdvancedMode 
                                ? 'El sistema actúa como un Router Central que deriva a Módulos Especializados según la intención del cliente. Ideal para negocios complejos con múltiples productos, áreas o sucursales.' 
                                : 'El sistema funciona como un único agente con un contexto unificado. Ideal para negocios enfocados en un producto/servicio principal donde la simplicidad y la coherencia son clave.'}
                        </p>
                    </div>
                </div>

                {isAdvancedMode ? (
                    <AdvancedNeuralConfig 
                        initialConfig={current.neuralConfig} 
                        onChange={(neuralConfig) => {
                            // Update local state without triggering full reload, persist on "Save" (which is implicit in parent)
                            handleUpdate('neuralConfig', neuralConfig);
                            onUpdateSettings({ ...current, neuralConfig });
                        }}
                    />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                        {/* Manual Editor */}
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
                             {/* GEMINI PANEL */}
                            <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-lg">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Motor IA</h3>
                                {/* Fake inputs to prevent password autofill */}
                                <div style={{ height: 0, overflow: 'hidden', opacity: 0, position: 'absolute', pointerEvents: 'none' }}>
                                    <input type="text" name="fake_user_prevent_autofill" autoComplete="off" tabIndex={-1} />
                                    <input type="password" name="fake_password_prevent_autofill" autoComplete="off" tabIndex={-1} />
                                </div>
                                <input 
                                    type="password" 
                                    name="gemini_api_key_settings_v3"
                                    id="gemini_api_key_settings_v3"
                                    autoComplete="new-password"
                                    data-lpignore="true"
                                    readOnly={true}
                                    onFocus={(e) => e.target.readOnly = false}
                                    value={current.geminiApiKey || ''} 
                                    onChange={e => handleUpdate('geminiApiKey', e.target.value)}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs font-mono tracking-widest focus:border-brand-gold outline-none mb-2"
                                    placeholder="API KEY"
                                />
                                <button onClick={() => onUpdateSettings(current)} className="text-[10px] text-gray-500 hover:text-white font-bold uppercase">Actualizar Key</button>
                            </div>

                            {/* SLIDERS */}
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
                )}
            </div>
        </div>
      );
  }

  // VIEW: WIZARD
  return (
    // FIX: Changed from 'h-screen overflow-hidden' to 'overflow-y-auto' for responsiveness.
    // Also added 'min-h-full' to ensure it takes at least the full height.
    <div className="flex-1 bg-brand-black flex flex-col items-center justify-start md:justify-center p-6 md:py-10 relative overflow-y-auto font-sans min-h-full">
        {/* Background Ambient */}
        <div className="absolute top-0 left-0 w-full h-full bg-noise opacity-5 pointer-events-none fixed"></div>
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-brand-gold/5 rounded-full blur-[100px] pointer-events-none fixed"></div>

        <div className="w-full max-w-2xl relative z-10 my-auto">
            
            {/* PROGRESS HEADER */}
            <div className="mb-10 text-center">
                <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-2">
                    Configuración <span className="text-brand-gold">Neural</span>
                </h2>
                <div className="flex justify-center gap-2 mt-4">
                    {['IDENTITY', 'API_SETUP', 'CONTEXT', 'PATH'].map((s, idx) => {
                        const steps = ['IDENTITY', 'API_SETUP', 'CONTEXT', 'PATH'];
                        const currIdx = steps.indexOf(wizardStep);
                        const isActive = idx <= currIdx;
                        return (
                            <div key={s} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${isActive ? 'bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]' : 'bg-white/10'}`}></div>
                        );
                    })}
                </div>
            </div>

            <div className={`bg-brand-surface border border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl relative backdrop-blur-sm transition-all duration-500 ${isAdvancedMode && wizardStep === 'CONTEXT' ? 'max-w-4xl w-full mx-auto' : ''}`}>
                
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
                            onClick={() => { if(wizIdentity.name) setWizardStep('API_SETUP'); else showToast('El nombre es obligatorio.', 'error'); }}
                            className="w-full py-4 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] mt-4"
                        >
                            Siguiente &rarr;
                        </button>
                    </div>
                )}

                {/* STEP 2: API SETUP (NEW STEP) */}
                {wizardStep === 'API_SETUP' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="text-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Motor Cognitivo</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium max-w-sm mx-auto">
                                Dominion opera con tu propia llave maestra de Google (BYOK). 
                                Esto garantiza privacidad total y control de costos.
                            </p>
                        </div>

                        <div className="bg-black/30 border border-brand-gold/20 p-6 rounded-2xl space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2 ml-1">Gemini API Key</label>
                                {/* Fake inputs to confuse browser password manager */}
                                <div style={{ height: 0, overflow: 'hidden', opacity: 0, position: 'absolute', pointerEvents: 'none' }}>
                                    <input type="text" name="fake_user_prevent_autofill_wiz" autoComplete="off" tabIndex={-1} />
                                    <input type="password" name="fake_password_prevent_autofill_wiz" autoComplete="off" tabIndex={-1} />
                                </div>
                                <input 
                                    type="password"
                                    name="gemini_api_key_setup_v3"
                                    id="gemini_api_key_setup_v3"
                                    autoComplete="new-password"
                                    data-lpignore="true"
                                    readOnly={true}
                                    onFocus={(e) => e.target.readOnly = false}
                                    value={wizApiKey}
                                    onChange={(e) => setWizApiKey(e.target.value)}
                                    placeholder="Pegar AI Studio Key aquí..."
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm font-mono focus:border-brand-gold outline-none transition-all placeholder-gray-700 tracking-wider"
                                />
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <a 
                                    href="https://aistudio.google.com/app/apikey" 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-gray-300 uppercase tracking-wider transition-all"
                                >
                                    <span>🔑</span> Obtener Key Gratis
                                </a>
                                {/* Placeholder for Tutorial Video */}
                                <button 
                                    onClick={() => showToast('Video tutorial próximamente. Usa el link de Google por ahora.', 'info')}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-gray-300 uppercase tracking-wider transition-all"
                                >
                                    <span>▶️</span> Ver Tutorial (1 min)
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button onClick={() => setWizardStep('IDENTITY')} className="px-6 py-3 text-gray-500 font-bold text-xs uppercase hover:text-white transition-colors">Atrás</button>
                            <button 
                                onClick={() => { 
                                    if(wizApiKey.length > 20) {
                                        // Save intermediate state to settings immediately so next steps can use it
                                        if (current) {
                                            const tempSettings = { ...current, geminiApiKey: wizApiKey.trim() };
                                            setCurrent(tempSettings);
                                            onUpdateSettings(tempSettings); // Persist early
                                        }
                                        setWizardStep('CONTEXT'); 
                                    } else {
                                        showToast('Ingresa una API Key válida.', 'error'); 
                                    }
                                }}
                                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02]"
                            >
                                Validar & Continuar &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: CONTEXT (HYBRID: LINEAR VS MODULAR CHOICE) */}
                {wizardStep === 'CONTEXT' && (
                    <div className="space-y-6 animate-fade-in relative">
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Definición de Inteligencia</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">Selecciona la arquitectura que mejor se adapte a la complejidad de tu negocio.</p>
                        </div>

                        {/* MODE SELECTOR */}
                        <div className="flex p-1 bg-black/40 border border-white/10 rounded-xl mb-6">
                            <button 
                                onClick={() => setIsAdvancedMode(false)}
                                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!isAdvancedMode ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}
                            >
                                Agente Lineal (Simple)
                            </button>
                            <button 
                                onClick={() => setIsAdvancedMode(true)}
                                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isAdvancedMode ? 'bg-brand-gold text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                                Enjambre Modular (Avanzado)
                            </button>
                        </div>

                        {/* EDUCATIONAL INFO BOX */}
                        <div className={`p-4 rounded-xl border mb-6 transition-all duration-300 ${isAdvancedMode ? 'bg-brand-gold/5 border-brand-gold/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                            <h4 className={`text-xs font-bold uppercase mb-1 ${isAdvancedMode ? 'text-brand-gold' : 'text-blue-400'}`}>
                                {isAdvancedMode ? '¿Para quién es el Modo Modular?' : '¿Para quién es el Modo Lineal?'}
                            </h4>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                                {isAdvancedMode 
                                    ? 'Para negocios complejos que requieren múltiples "especialistas". Por ejemplo: Una Inmobiliaria que tiene un departamento de Alquileres, otro de Ventas y otro de Administración. El sistema actúa como un "Router" inteligente.' 
                                    : 'Para la mayoría de los negocios. El bot actúa como un único agente con una identidad y conocimiento unificado. Ideal si vendes un producto principal o servicio específico.'}
                            </p>
                        </div>

                        {isAdvancedMode ? (
                            // ADVANCED MODULAR INTERFACE INSIDE WIZARD - FIX: Removed max-h scroll container
                            <div className="pr-2 p-1">
                                <AdvancedNeuralConfig 
                                    initialConfig={wizNeuralConfig}
                                    onChange={(cfg) => setWizNeuralConfig(cfg)}
                                    mode="WIZARD" // FIX: Passed mode prop
                                />
                            </div>
                        ) : (
                            // LINEAR CONTEXT INTERFACE
                            <div className="relative group animate-fade-in">
                                {/* WEB ANALYSIS BUTTON */}
                                {wizIdentity.website && (
                                    <div className="flex justify-end mb-2 px-1">
                                        <button 
                                            onClick={analyzeWebsite}
                                            disabled={isAnalyzingWeb}
                                            className="flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 hover:bg-brand-gold/20 text-brand-gold px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                        >
                                            {isAnalyzingWeb ? (
                                                <>
                                                    <div className="w-3 h-3 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                                                    Analizando...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs">✨</span> Analizar {wizIdentity.website}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                                <textarea 
                                    value={wizContext}
                                    onChange={(e) => setWizContext(e.target.value)}
                                    className="w-full h-48 bg-black/50 border border-white/10 rounded-xl p-5 pb-12 text-white text-sm leading-relaxed focus:border-brand-gold outline-none resize-none custom-scrollbar placeholder-gray-700 transition-all z-10 relative"
                                    placeholder={`Ej: Soy una agencia de marketing. Vendemos gestión de redes desde $300 USD. Quiero que el bot sea agresivo en el cierre. Si preguntan por descuentos, diles que no, pero que ofrecemos garantía.`}
                                />
                                {!wizContext && !isRecording && (
                                    <div className="absolute bottom-4 left-4 right-16 p-2 pointer-events-none flex flex-col justify-end text-left opacity-50 z-20">
                                        <p className="text-[10px] font-bold text-gray-400 mb-1">💡 Tip de Calibración:</p>
                                        <p className="text-[9px] text-gray-500 leading-snug">Incluye: Qué vendes, precios base, tu diferencial y reglas que el bot no debe romper nunca.</p>
                                    </div>
                                )}
                                
                                <button 
                                    onClick={toggleRecording}
                                    className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all z-30 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-brand-gold text-black hover:scale-110'}`}
                                    title="Dictar por voz"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                </button>
                            </div>
                        )}

                        <div className="flex gap-4 pt-4 border-t border-white/5">
                            <button onClick={() => setWizardStep('API_SETUP')} className="px-6 py-3 text-gray-500 font-bold text-xs uppercase hover:text-white transition-colors">Atrás</button>
                            {isAdvancedMode ? (
                                <button 
                                    onClick={executeNeuralPath} 
                                    className="flex-1 py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] shadow-lg shadow-brand-gold/20"
                                >
                                    Finalizar Arquitectura
                                </button>
                            ) : (
                                <button 
                                    onClick={() => { if(wizContext.length > 5) setWizardStep('PATH'); else showToast('Danos un poco más de contexto.', 'error'); }}
                                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02]"
                                >
                                    Siguiente &rarr;
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 4: THE FORK (CHOICE) - ONLY FOR LINEAR MODE NOW */}
                {wizardStep === 'PATH' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="text-center mb-8">
                            <h3 className="text-xl font-black text-white uppercase tracking-widest">Estrategia Lineal</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">¿Cómo quieres construir el cerebro de tu agente único?</p>
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
                        <p className="text-xs text-gray-500 mt-3 font-mono">Aplicando arquitectura {isAdvancedMode ? 'Modular' : 'Elite'}...</p>
                    </div>
                )}

                {/* SOS / AUDIT BUTTON */}
                {wizardStep !== 'LOADING' && (
                    <div className="mt-8 pt-6 border-t border-white/5 flex justify-center animate-fade-in">
                        <button 
                            onClick={() => openSupportWhatsApp('Hola, estoy trabado en la configuración del Cerebro. ¿Me ayudan con una auditoría?')} 
                            className="text-[9px] text-gray-500 hover:text-brand-gold font-bold uppercase tracking-widest flex items-center gap-2 transition-colors group"
                        >
                            <span className="grayscale group-hover:grayscale-0 transition-all">🆘</span> ¿Te sientes abrumado? Solicitar Auditoría Humana
                        </button>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
};

export default SettingsPanel;
