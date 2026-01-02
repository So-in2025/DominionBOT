
import React, { useState, useEffect, useRef } from 'react';
import { BotSettings, PromptArchetype } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { audioService } from '../services/audioService';

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

// --- HIGH-LEVEL INDUSTRY TEMPLATES (ELITE LEVEL) ---
const INDUSTRY_TEMPLATES: Record<string, { label: string, data: Partial<WizardState & { priceText: string }> }> = {
    'AGENCY': {
        label: 'Agencia de Marketing High-Ticket',
        data: {
            mission: 'Actúo como el Director de Crecimiento Estratégico de [TU AGENCIA]. Mi imperativo es identificar y cualificar empresas con capacidad de inversión listas para escalar su facturación mediante ecosistemas de publicidad digital.',
            idealCustomer: 'CEOs y Fundadores de empresas de servicios o E-commerce facturando +$10k USD/mes, que valoran el tiempo sobre el dinero y buscan delegar la adquisición de clientes en expertos.',
            detailedDescription: 'Implementamos una infraestructura de adquisición "Done-For-You" validada. No vendemos leads, vendemos facturación predecible. Nuestro sistema garantiza un flujo constante de citas cualificadas o devolvemos la inversión (ROI Garantizado).',
            priceText: 'Inversión desde $2,000 USD/mes',
            objections: [
                { id: 1, objection: 'Es muy costoso', response: 'Entiendo que el precio sea un factor. Sin embargo, no somos un gasto operativo, somos una inversión de capital con retorno medible. Si nuestro sistema genera $5 por cada $1 invertido, ¿el costo sigue siendo relevante?' },
                { id: 2, objection: 'Ya trabajé con agencias y fallaron', response: 'Es común. La mayoría vende "humo" o métricas vanidosas (likes). Nosotros nos enfocamos exclusivamente en el ROI y facturación. ¿Estarías dispuesto a ver una auditoría de por qué falló tu estrategia anterior?' }
            ],
            rules: '- NUNCA revelar la estrategia completa por chat, el objetivo es la llamada.\n- Mantener autoridad y marco profesional (Frame Control).\n- Descalificar rápido si no tienen presupuesto.'
        }
    },
    'REAL_ESTATE': {
        label: 'Inversiones Inmobiliarias Premium',
        data: {
            mission: 'Soy el Consultor de Activos Inmobiliarios de [TU NOMBRE/EMPRESA]. Mi función es filtrar el mercado para conectar inversores de capital con oportunidades "Off-Market" de alta plusvalía y revalorización asegurada.',
            idealCustomer: 'Inversores patrimoniales, Family Offices o particulares con liquidez inmediata superior a $200k USD, buscando diversificación y seguridad jurídica.',
            detailedDescription: 'Acceso exclusivo a desarrollos en preventa y propiedades subvaluadas antes de su salida al mercado masivo. Ofrecemos gestión integral: legal, fiscal y administración de renta posterior.',
            priceText: 'Tickets desde $150,000 USD',
            objections: [
                { id: 1, objection: 'Solo estoy viendo opciones', response: 'Perfecto. El mercado inmobiliario es dinámico y las mejores oportunidades duran horas. Para no hacerte perder tiempo enviando fichas irrelevantes, ¿qué rentabilidad anual estás buscando?' },
                { id: 2, objection: 'La comisión es alta', response: 'Nuestros honorarios se pagan solos con la negociación de precio que logramos. Un 10% de descuento en la compra cubre nuestra comisión y te deja ganancia inmediata. ¿Buscás precio o rentabilidad?' }
            ],
            rules: '- NO enviar ubicaciones exactas sin registro previo (KYC).\n- Calificar solvencia antes de agendar visita.\n- Proyectar exclusividad y escasez.'
        }
    },
    'ECOMMERCE': {
        label: 'E-commerce / Retail Exclusivo',
        data: {
            mission: 'Soy el Concierge de Compras de [TU MARCA]. Mi objetivo es brindar una experiencia de compra asistida, eliminando dudas y guiando al cliente hacia el producto que elevará su estilo de vida.',
            idealCustomer: 'Compradores exigentes que valoran la calidad, la exclusividad y la inmediatez. Buscan una experiencia de unboxing superior y soporte post-venta garantizado.',
            detailedDescription: 'Curaduría de productos [NICHO] de diseño exclusivo. Logística prioritaria (24hs) y política de "Satisfacción Total o Devolución Inmediata". No vendemos productos, vendemos estatus y solución.',
            priceText: 'Catálogo Premium (Varía)',
            objections: [
                { id: 1, objection: 'El envío me parece caro', response: 'Utilizamos logística blindada para asegurar que tu producto llegue impecable en 24hs. Además, bonificamos el envío en compras superiores a $X. ¿Te gustaría agregar un accesorio para aprovecharlo?' },
                { id: 2, objection: '¿Tienen garantía real?', response: 'Absolutamente. Ofrecemos 30 días de garantía incondicional. Si no te enamora al abrir la caja, gestionamos el retiro y reembolso sin preguntas.' }
            ],
            rules: '- Respuestas concisas, estéticas y rápidas.\n- Usar gatillos mentales de urgencia (stock limitado).\n- Sugerir siempre un complemento (Upsell).'
        }
    },
    'COACHING': {
        label: 'Mentoria / Coaching High-Ticket',
        data: {
            mission: 'Soy el Asesor de Admisiones de [TU PROGRAMA]. Mi responsabilidad es auditar si el candidato tiene el perfil, el compromiso y la capacidad para ser un caso de éxito en nuestra mentoría.',
            idealCustomer: 'Profesionales o emprendedores estancados que son conscientes de que necesitan una nueva metodología para romper su techo de cristal y están dispuestos a invertir en sí mismos.',
            detailedDescription: 'Un protocolo de transformación de 12 semanas. No es un "cursito grabado", es un acompañamiento 1 a 1 con acceso directo al mentor, comunidad de élite y plan de acción a medida.',
            priceText: 'Inversión: $3,000 USD',
            objections: [
                { id: 1, objection: 'No tengo tiempo ahora', response: 'El programa está diseñado para ejecutivos ocupados. Si no tenés 4 horas a la semana para construir tu futuro, el problema no es el tiempo, es la prioridad. ¿Es este cambio una prioridad hoy?' },
                { id: 2, objection: 'Es mucho dinero', response: 'Es dinero si lo ves como gasto. Es "gratis" si lo ves como inversión. Si este programa te ayuda a generar $10k extra al mes, ¿te parecería caro invertir $3k una sola vez?' }
            ],
            rules: '- Postura de autoridad (Tú calificas al cliente, no al revés).\n- NO rogar. Si no califican, retiramos la oferta.\n- Enfocarse en el dolor actual y la visión futura.'
        }
    },
    'SOFTWARE': {
        label: 'SaaS B2B Enterprise',
        data: {
            mission: 'Soy el Especialista de Soluciones de [TU SOFTWARE]. Ayudo a directores de operaciones a visualizar cómo nuestra tecnología puede automatizar sus flujos de trabajo y reducir costos operativos.',
            idealCustomer: 'Empresas tecnológicas o agencias con equipos de +10 personas que sufren de caos operativo y procesos manuales ineficientes.',
            detailedDescription: 'Suite integral de gestión empresarial. Centraliza CRM, Project Management y Facturación en un solo dashboard. Reduce el tiempo administrativo en un 40% garantizado durante el primer mes.',
            priceText: 'Planes desde $99/mo',
            objections: [
                { id: 1, objection: 'La migración es difícil', response: 'Es una preocupación válida. Por eso incluimos un equipo de "Concierge Onboarding" que migra todos tus datos gratis en 48hs. No tenés que mover un dedo.' },
                { id: 2, objection: 'Es más caro que X', response: 'Correcto. X es una herramienta básica. Nosotros somos un sistema operativo completo. Al usarnos, podés cancelar X, Y y Z, ahorrando dinero total a fin de mes.' }
            ],
            rules: '- Lenguaje técnico preciso pero accesible.\n- Enfocarse en el costo de inacción (cuánto pierden hoy).\n- Objetivo: Demo técnica.'
        }
    },
    'LEGAL': {
        label: 'Estudio Jurídico Corporativo',
        data: {
            mission: 'Soy el Asistente Legal Senior de [TU ESTUDIO]. Realizo el triaje inicial para identificar casos de alta viabilidad y derivarlos a nuestros socios especialistas.',
            idealCustomer: 'Empresas o particulares con conflictos legales activos que requieren representación agresiva y estratégica inmediata.',
            detailedDescription: 'Defensa legal de alto perfil en derecho comercial y laboral. No cobramos consultas, cobramos soluciones. Historial de éxito del 92% en litigios complejos.',
            priceText: 'Honorarios según complejidad',
            objections: [
                { id: 1, objection: '¿Cuánto sale la consulta?', response: 'La evaluación de viabilidad inicial es sin cargo. Si tomamos el caso, trabajamos con un esquema de honorarios transparente y pre-acordado. Lo costoso es no tener una buena defensa.' },
                { id: 2, objection: 'Necesito garantía de ganar', response: 'En derecho, garantizar resultados es anti-ético. Garantizamos la mejor estrategia posible y dedicación total. Nuestro track record habla por sí mismo.' }
            ],
            rules: '- Tono extremadamente formal, sobrio y distante.\n- Nunca dar consejo legal específico por chat.\n- Filtrar casos pequeños o sin sustento.'
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

const parseProductDescription = (description: string): WizardState => {
    const sections: Record<string, string> = {};
    const sectionHeaders = [
        "## MISIÓN PRINCIPAL",
        "## CLIENTE IDEAL",
        "## DESCRIPCIÓN DETALLADA DEL SERVICIO",
        "## MANEJO DE OBJECIONES FRECUENTES",
        "## REGLAS DE ORO Y LÍMITES"
    ];

    let currentSection: string | null = null;
    let currentContent: string[] = [];

    const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    for (const line of lines) {
        if (sectionHeaders.includes(line)) {
            if (currentSection) {
                sections[currentSection] = currentContent.join('\n').trim();
            }
            currentSection = line;
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }
    if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
    }

    const objectionsRaw = sections["## MANEJO DE OBJECIONES FRECUENTES"] || '';
    const objections: { id: number; objection: string; response: string }[] = [];
    const objectionLines = objectionsRaw.split('\n').filter(line => line.startsWith('- Sobre "'));

    objectionLines.forEach((line, index) => {
        const match = line.match(/- Sobre "(.*?)": Respondo: "(.*?)"/);
        if (match && match[1] && match[2]) {
            objections.push({ id: index, objection: match[1], response: match[2] });
        }
    });

    return {
        mission: sections["## MISIÓN PRINCIPAL"] || '',
        idealCustomer: sections["## CLIENTE IDEAL"] || '',
        detailedDescription: sections["## DESCRIPCIÓN DETALLADA DEL SERVICIO"] || '',
        objections: objections.length > 0 ? objections : [{ id: 1, objection: '', response: '' }],
        rules: sections["## REGLAS DE ORO Y LÍMITES"] || ''
    };
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal, showToast }) => {
  const [current, setCurrent] = useState<BotSettings | null>(null);
  const [wizardState, setWizardState] = useState<WizardState>({
      mission: '', idealCustomer: '', detailedDescription: '',
      objections: [{ id: 1, objection: '', response: '' }], rules: ''
  });
  const [step, setStep] = useState(0); 
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isWizardCompleted, setIsWizardCompleted] = useState(false);

  useEffect(() => {
    if (settings) {
        setCurrent({ ...settings, ignoredJids: settings.ignoredJids || [] });
        setIsWizardCompleted(settings.isWizardCompleted || false);
        if (settings.productDescription) {
            setWizardState(parseProductDescription(settings.productDescription));
        }
    }
  }, [settings]);

  const handleUpdate = (field: keyof BotSettings, value: any) => {
    if (!current) return;
    const newSettings = { ...current, [field]: value };
    setCurrent(newSettings);
  };

  const handleArchetypeSelect = (archetype: PromptArchetype) => {
      if (!current) return;
      const mapping = ARCHETYPE_MAPPING[archetype];
      const newSettings = { 
          ...current, 
          archetype,
          toneValue: mapping.toneValue,
          rhythmValue: mapping.rhythmValue,
          intensityValue: mapping.intensityValue
      };
      setCurrent(newSettings);
      onUpdateSettings(newSettings);
  };

  // Restablecer valores de personalidad a los defaults del arquetipo seleccionado
  const resetPersonality = () => {
      if (!current) return;
      const mapping = ARCHETYPE_MAPPING[current.archetype];
      const newSettings = {
          ...current,
          toneValue: mapping.toneValue,
          rhythmValue: mapping.rhythmValue,
          intensityValue: mapping.intensityValue
      };
      setCurrent(newSettings);
      showToast('Ajustes restablecidos al arquetipo base.', 'info');
  };

  // Guardar explícitamente los ajustes de personalidad
  const savePersonalitySettings = () => {
      if (!current) return;
      onUpdateSettings(current);
      showToast('Ajustes de personalidad guardados.', 'success');
      audioService.play('action_success');
  };

  const saveWizardToSettings = () => {
      if (!current) return;
      const compiledDescription = `
## MISIÓN PRINCIPAL
${wizardState.mission}

## CLIENTE IDEAL
${wizardState.idealCustomer}

## DESCRIPCIÓN DETALLADA DEL SERVICIO
${wizardState.detailedDescription}

## MANEJO DE OBJECIONES FRECUENTES
${wizardState.objections.map(obj => `- Sobre "${obj.objection}": Respondo: "${obj.response}"`).join('\n')}

## REGLAS DE ORO Y LÍMITES
${wizardState.rules}
      `;
      
      const newSettings = { 
          ...current, 
          productDescription: compiledDescription,
          isWizardCompleted: true
      };
      setCurrent(newSettings);
      onUpdateSettings(newSettings);
      setIsWizardCompleted(true);
      showToast('Cerebro sincronizado y activado.', 'success');
      audioService.play('action_success');
  };

  // --- MAGIC AI AUTOCOMPLETE & REFINEMENT ---
  const handleMagicFill = async () => {
      if (!current?.geminiApiKey) {
          showToast('Configura tu API Key de Gemini en el panel derecho primero.', 'error');
          return;
      }
      if (!wizardState.mission || !wizardState.idealCustomer) {
          showToast('Ingresa una idea base de Misión y Cliente para que la IA pueda trabajar.', 'info');
          return;
      }

      setIsMagicFilling(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          
          // Enhanced Prompt: Ask AI to REFINE the inputs first, then generate the rest.
          const prompt = `
            Actúa como un Consultor de Negocios de Élite y Copywriter Senior.
            
            Tengo estos borradores iniciales de un usuario:
            Misión Base: "${wizardState.mission}"
            Cliente Base: "${wizardState.idealCustomer}"

            TU TAREA:
            1. MEJORA PROFESIONALMENTE la "Misión" y el "Cliente Ideal". Reescríbelos para que suenen autoritarios, persuasivos y de alto nivel (High-Ticket).
            2. BASADO EN ESO, genera el resto de la configuración del bot.

            Output JSON Schema:
            {
                "refinedMission": string, // La misión mejorada
                "refinedIdealCustomer": string, // El cliente mejorado
                "detailedDescription": string, // Descripción irresistible de la oferta
                "priceText": string, // Sugerencia de precio/anchor
                "objections": [{ "objection": string, "response": string }], // 3 objeciones probables y respuestas ganadoras
                "rules": string // 3 reglas de oro de comportamiento
            }
          `;

          const res = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ parts: [{ text: prompt }] }],
              config: { responseMimeType: "application/json" }
          });

          const data = JSON.parse(res.text || '{}');
          
          if (data.detailedDescription) {
              setWizardState(prev => ({
                  ...prev,
                  // Replace inputs with the AI-refined versions
                  mission: data.refinedMission || prev.mission,
                  idealCustomer: data.refinedIdealCustomer || prev.idealCustomer,
                  
                  detailedDescription: data.detailedDescription,
                  objections: data.objections.map((o: any, i: number) => ({ id: Date.now() + i, ...o })),
                  rules: data.rules
              }));
              handleUpdate('priceText', data.priceText || '');
              showToast('✨ Estrategia mejorada y generada por IA.', 'success');
              audioService.play('action_success');
              // Auto-advance to next step to show the magic
              setStep(1); 
          }
      } catch (e) {
          console.error(e);
          showToast('Error al generar contenido mágico. Verifica tu API Key.', 'error');
      } finally {
          setIsMagicFilling(false);
      }
  };

  const applyTemplate = (key: string) => {
      const t = INDUSTRY_TEMPLATES[key];
      if (t) {
          setWizardState(prev => ({
              ...prev,
              mission: t.data.mission || '',
              idealCustomer: t.data.idealCustomer || '',
              detailedDescription: t.data.detailedDescription || '',
              objections: t.data.objections || [],
              rules: t.data.rules || ''
          }));
          if (t.data.priceText) handleUpdate('priceText', t.data.priceText);
          showToast(`Plantilla cargada: ${t.label}`, 'info');
      }
  };

  const verifyAndSaveKey = async () => {
      if (!current?.geminiApiKey) return;
      setIsSavingApiKey(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: [{ parts: [{ text: 'ping' }] }] });
          onUpdateSettings(current);
          showToast('API Key verificada y guardada.', 'success');
          audioService.play('action_success');
      } catch (e) {
          showToast('API Key inválida o modelo no disponible.', 'error');
          audioService.play('alert_error_apikey');
      } finally {
          setIsSavingApiKey(false);
      }
  };

  if (isLoading || !current) return <div className="p-10 text-center text-gray-500 animate-pulse uppercase font-black tracking-widest">Cargando Neuro-Configuración...</div>;

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
        <div className="max-w-7xl mx-auto pb-32">
            
            {/* --- LAYOUT GRID --- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* --- LEFT COLUMN: CALIBRATION WIZARD (7 Cols) --- */}
                <div className="lg:col-span-7 space-y-6 relative">
                    
                    {/* BRAIN CONFIGURED OVERLAY */}
                    {isWizardCompleted && (
                        <div className="absolute inset-0 z-20 bg-brand-black/90 backdrop-blur-md rounded-[32px] flex flex-col items-center justify-center border border-brand-gold/30 shadow-[0_0_80px_rgba(212,175,55,0.15)] animate-fade-in">
                            <div className="w-24 h-24 rounded-full bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center mb-6 animate-pulse shadow-[0_0_30px_rgba(212,175,55,0.2)]">
                                <svg className="w-12 h-12 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Cerebro Configurado</h2>
                            <p className="text-sm text-gray-400 font-medium mb-8 max-w-md text-center leading-relaxed">La red neuronal está operativa y lista para procesar señales. El protocolo de calibración ha finalizado exitosamente.</p>
                            <button 
                                onClick={() => setIsWizardCompleted(false)}
                                className="px-8 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 hover:border-brand-gold/50 transition-all hover:scale-105"
                            >
                                Recalibrar Parámetros
                            </button>
                        </div>
                    )}

                    <div className={`bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden h-full flex flex-col transition-all duration-500 ${isWizardCompleted ? 'blur-sm opacity-20' : ''}`}>
                        
                        {/* WIZARD HEADER */}
                        <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">IA</span>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Protocolo de Calibración</h3>
                                </div>
                                <div className="flex gap-1 mt-3">
                                    {[0, 1, 2].map(i => (
                                        <div key={i} className={`h-1 w-8 rounded-full transition-colors ${i <= step ? 'bg-brand-gold' : 'bg-white/10'}`}></div>
                                    ))}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">Fase {step + 1} / 3</span>
                                <span className="text-xs font-black text-white uppercase tracking-widest">
                                    {step === 0 ? 'La Misión' : (step === 1 ? 'El Arsenal' : 'El Playbook')}
                                </span>
                            </div>
                        </div>

                        {/* PHASE 1: MISSION */}
                        {step === 0 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="text-lg font-black text-white">Identidad y Objetivo</h4>
                                        <p className="text-xs text-gray-400 mt-1">Define quién es la IA y a quién sirve.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {/* FIX: Improved Select Styling for visibility with bg-brand-black on options */}
                                        <select onChange={(e) => applyTemplate(e.target.value)} className="bg-brand-surface border border-white/20 text-white text-[9px] font-bold uppercase rounded-lg px-3 py-2 outline-none focus:border-brand-gold cursor-pointer hover:bg-white/5 transition-colors shadow-lg">
                                            <option value="" className="bg-brand-black text-gray-400">⚡ Cargar Plantilla...</option>
                                            {Object.entries(INDUSTRY_TEMPLATES).map(([k, v]) => (
                                                <option key={k} value={k} className="bg-brand-black text-white py-2">{v.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Misión (SOIN)</label>
                                    <textarea 
                                        value={wizardState.mission} 
                                        onChange={e => setWizardState({...wizardState, mission: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none placeholder-gray-700 transition-all focus:bg-black/60"
                                        placeholder="Ej: Soy el Asistente de [Tu Negocio]. Mi objetivo es calificar clientes interesados en..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Cliente Ideal</label>
                                    <textarea 
                                        value={wizardState.idealCustomer} 
                                        onChange={e => setWizardState({...wizardState, idealCustomer: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none placeholder-gray-700 transition-all focus:bg-black/60"
                                        placeholder="Ej: Dueños de negocio que buscan escalar sus ventas..."
                                    />
                                </div>

                                <button 
                                    onClick={handleMagicFill} 
                                    disabled={isMagicFilling}
                                    className="w-full py-4 bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:border-brand-gold/50 transition-all flex items-center justify-center gap-2 group shadow-lg hover:shadow-brand-gold/10"
                                >
                                    {isMagicFilling ? (
                                        <span className="animate-pulse">Analizando y Refinando Estrategia...</span>
                                    ) : (
                                        <>
                                            <span className="text-lg group-hover:rotate-12 transition-transform">✨</span> 
                                            <span className="group-hover:text-brand-gold transition-colors">Mejorar y Autocompletar con IA</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* PHASE 2: ARSENAL */}
                        {step === 1 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="space-y-2">
                                    <h4 className="text-lg font-black text-white">Oferta y Valor</h4>
                                    <p className="text-xs text-gray-400 mt-1">¿Qué vendes y por qué deberían comprarte?</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Descripción del Servicio</label>
                                    <textarea 
                                        value={wizardState.detailedDescription} 
                                        onChange={e => setWizardState({...wizardState, detailedDescription: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-40 resize-none placeholder-gray-700 transition-all focus:bg-black/60"
                                        placeholder="Ofrecemos X que logra Y en Z tiempo..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest block mb-2">Precio (Texto)</label>
                                        <input 
                                            type="text" value={current.priceText} onChange={e => handleUpdate('priceText', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-brand-gold outline-none"
                                            placeholder="Desde $500 USD"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest block mb-2">Valor Promedio (Métricas)</label>
                                        <input 
                                            type="number" value={current.ticketValue || ''} onChange={e => handleUpdate('ticketValue', parseFloat(e.target.value))}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-brand-gold outline-none"
                                            placeholder="Ej: 150 (en USD)"
                                        />
                                        <span className="text-[9px] text-gray-500">Usado para calcular el ROIE real.</span>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest block mb-2">Link de Cierre</label>
                                    <input 
                                        type="text" value={current.ctaLink} onChange={e => handleUpdate('ctaLink', e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-brand-gold outline-none"
                                        placeholder="https://calendly.com/..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* PHASE 3: PLAYBOOK */}
                        {step === 2 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="space-y-2">
                                    <h4 className="text-lg font-black text-white">Reglas de Combate</h4>
                                    <p className="text-xs text-gray-400 mt-1">Instrucciones críticas para el manejo de la conversación.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Reglas de Oro</label>
                                    <textarea 
                                        value={wizardState.rules} 
                                        onChange={e => setWizardState({...wizardState, rules: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none placeholder-gray-700 transition-all focus:bg-black/60"
                                        placeholder="- NO usar emojis.\n- NO dar precios sin calificar antes."
                                    />
                                </div>

                                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Objeciones</label>
                                        <button onClick={() => setWizardState(prev => ({...prev, objections: [...prev.objections, { id: Date.now(), objection: '', response: '' }]}))} className="text-[9px] bg-white/10 px-2 py-1 rounded text-white hover:bg-brand-gold hover:text-black transition-all font-bold">+ AGREGAR</button>
                                    </div>
                                    <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar">
                                        {wizardState.objections.map((obj, idx) => (
                                            <div key={obj.id} className="grid grid-cols-1 gap-2 border-b border-white/5 pb-2">
                                                <input 
                                                    placeholder="Ej: Es muy caro" 
                                                    value={obj.objection}
                                                    onChange={e => {
                                                        const newObjs = [...wizardState.objections];
                                                        newObjs[idx].objection = e.target.value;
                                                        setWizardState({...wizardState, objections: newObjs});
                                                    }}
                                                    className="bg-transparent text-xs text-white placeholder-gray-600 outline-none font-bold"
                                                />
                                                <input 
                                                    placeholder="Respuesta: Es una inversión..." 
                                                    value={obj.response}
                                                    onChange={e => {
                                                        const newObjs = [...wizardState.objections];
                                                        newObjs[idx].response = e.target.value;
                                                        setWizardState({...wizardState, objections: newObjs});
                                                    }}
                                                    className="bg-transparent text-xs text-gray-400 placeholder-gray-700 outline-none"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* WIZARD NAVIGATION */}
                        <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                            {step > 0 ? (
                                <button onClick={() => setStep(step - 1)} className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-colors">ANTERIOR</button>
                            ) : <div></div>}
                            
                            {step < 2 ? (
                                <button onClick={() => setStep(step + 1)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                                    SIGUIENTE &rarr;
                                </button>
                            ) : (
                                <button onClick={saveWizardToSettings} className="px-8 py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-gold/20 hover:scale-105 transition-all">
                                    SINCRONIZAR CEREBRO
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- RIGHT COLUMN: PERSONALITY & CONFIG (5 Cols) --- */}
                <div className="lg:col-span-5 space-y-4">
                    
                    {/* PERSONALITY SETTINGS */}
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-6 shadow-2xl relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Ajustes de Personalidad</h3>

                        {/* Archetype Grid */}
                        <div className="grid grid-cols-2 gap-2 mb-6">
                            {Object.values(PromptArchetype).filter(a => a !== PromptArchetype.CUSTOM).map(arch => (
                                <button
                                    key={arch}
                                    onClick={() => handleArchetypeSelect(arch)}
                                    className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${current.archetype === arch ? 'bg-brand-gold text-black border-brand-gold' : 'bg-black/40 text-gray-500 border-white/10 hover:border-white/30'}`}
                                >
                                    {ARCHETYPE_NAMES[arch]}
                                </button>
                            ))}
                        </div>

                        {/* Sliders */}
                        <div className="space-y-5">
                            {[
                                { label: 'Tono de Voz', val: current.toneValue, key: 'toneValue', minLabel: 'Agresivo', maxLabel: 'Amigable' },
                                { label: 'Ritmo de Chat', val: current.rhythmValue, key: 'rhythmValue', minLabel: 'Rápido', maxLabel: 'Pausado' },
                                { label: 'Intensidad de Venta', val: current.intensityValue, key: 'intensityValue', minLabel: 'Pasivo', maxLabel: 'Closer' }
                            ].map((slider) => (
                                <div key={slider.key}>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{slider.label}</label>
                                        <span className="text-[10px] font-bold text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20">Nivel {slider.val}</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="5" 
                                        value={slider.val} 
                                        onChange={(e) => handleUpdate(slider.key as keyof BotSettings, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                                    />
                                    <div className="flex justify-between mt-1">
                                        <span className="text-[8px] text-gray-600 uppercase">{slider.minLabel}</span>
                                        <span className="text-[8px] text-gray-600 uppercase">{slider.maxLabel}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* PERSONALITY ACTIONS FOOTER (ADDED) */}
                        <div className="mt-6 pt-6 border-t border-white/5 flex gap-3">
                            <button 
                                onClick={resetPersonality} 
                                className="flex-1 py-3 bg-white/5 text-gray-400 hover:text-white border border-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                            >
                                Restablecer
                            </button>
                            <button 
                                onClick={savePersonalitySettings} 
                                className="flex-1 py-3 bg-brand-gold/10 text-brand-gold border border-brand-gold/30 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-brand-gold hover:text-black transition-all"
                            >
                                Guardar Ajustes
                            </button>
                        </div>
                    </div>

                    {/* GEMINI PANEL */}
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Panel de Control Gemini</h3>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-6">El motor neural de la IA. <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-brand-gold underline hover:text-white">Obtener Key Aquí</a>.</p>
                        
                        <div className="space-y-4">
                            <input 
                                type="password" 
                                value={current.geminiApiKey || ''} 
                                onChange={e => handleUpdate('geminiApiKey', e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xs font-mono tracking-widest focus:border-brand-gold outline-none transition-all placeholder-gray-700"
                                placeholder="••••••••••••••••"
                            />
                            <button 
                                onClick={verifyAndSaveKey} 
                                disabled={isSavingApiKey}
                                className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-[1.02] transition-all disabled:opacity-50"
                            >
                                {isSavingApiKey ? 'Verificando...' : 'Guardar Key'}
                            </button>
                        </div>
                    </div>

                    {/* NETWORK CARD (Simplified) */}
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-5 shadow-2xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-full text-blue-500 border border-blue-500/20">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 009-9m-9 9a9 9 0 00-9-9" /></svg>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-white uppercase tracking-widest">Red Dominion</h3>
                                <p className="text-[9px] text-gray-500">Participación en ecosistema colaborativo.</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                const newVal = !current.isNetworkEnabled;
                                handleUpdate('isNetworkEnabled', newVal);
                                onUpdateSettings({...current, isNetworkEnabled: newVal});
                                showToast(`Red ${newVal ? 'Activada' : 'Desactivada'}`, 'info');
                            }} 
                            className={`w-10 h-5 rounded-full relative transition-colors ${current.isNetworkEnabled ? 'bg-blue-500' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${current.isNetworkEnabled ? 'translate-x-6' : 'translate-x-1'}`}></div>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    </div>
  );
};

export default SettingsPanel;
