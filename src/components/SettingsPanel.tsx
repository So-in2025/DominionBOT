
import React from 'react';
import { BotSettings, PromptArchetype } from '../types';
import { GoogleGenAI } from '@google/genai';

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

// --- START: New Mappings & Templates ---
const ARCHETYPE_MAPPING = {
    [PromptArchetype.CONSULTATIVE]: { toneValue: 4, rhythmValue: 4, intensityValue: 2 },
    [PromptArchetype.DIRECT_CLOSER]: { toneValue: 2, rhythmValue: 2, intensityValue: 5 },
    [PromptArchetype.SUPPORT]: { toneValue: 5, rhythmValue: 3, intensityValue: 1 },
    [PromptArchetype.EMPATHIC]: { toneValue: 5, rhythmValue: 4, intensityValue: 2 },
    [PromptArchetype.AGRESSIVE]: { toneValue: 1, rhythmValue: 1, intensityValue: 5 },
    [PromptArchetype.ACADEMIC]: { toneValue: 5, rhythmValue: 5, intensityValue: 1 },
    [PromptArchetype.CUSTOM]: { toneValue: 3, rhythmValue: 3, intensityValue: 3 },
};

const ARCHETYPE_NAMES: { [key in PromptArchetype]: string } = {
    [PromptArchetype.CONSULTATIVE]: 'Venta Consultiva',
    [PromptArchetype.DIRECT_CLOSER]: 'Cierre Directo',
    [PromptArchetype.SUPPORT]: 'Soporte Técnico',
    [PromptArchetype.EMPATHIC]: 'Relacional Empático',
    [PromptArchetype.AGRESSIVE]: 'Cierre Agresivo',
    [PromptArchetype.ACADEMIC]: 'Informativo Detallado',
    [PromptArchetype.CUSTOM]: 'Personalizado',
};

const TEMPLATES: Record<string, { name: string, data?: Partial<WizardState & { priceText: string; ctaLink: string; }> }> = {
    'DEFAULT': { name: 'Cargar Plantilla Táctica...' },
    'AGENCIA': {
        name: 'Agencia de Marketing Digital',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente de IA de [TU AGENCIA]. Mi ÚNICO objetivo es filtrar y calificar leads. NO vendo, NO agendo, NO doy opiniones. Mi trabajo es entender el problema del cliente y, si califica, pasarlo a un especialista humano.
Mi nombre es Dominion. Soy el primer filtro de [TU AGENCIA]. Mi propósito es entender tus necesidades de marketing para asegurar que solo los especialistas adecuados inviertan tiempo en leads de alto potencial.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: Describe a tu cliente perfecto. ¿Qué venden? ¿Cuánto facturan? ¿Qué problema tienen?
Empresas y dueños de negocio que ya están invirtiendo en marketing pero no ven un ROI claro. Generalmente facturan más de 10,000 USD/mes y entienden el valor de la publicidad digital. Su problema principal es la falta de tiempo y expertise para gestionar campañas complejas.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: ¿Qué vendes EXACTAMENTE? Sé específico. ¿Qué transformación logras?
Ofrecemos un servicio de "Growth Partner" donde nos integramos a tu equipo para gestionar la estrategia y ejecución de publicidad en Meta e Instagram Ads. Nuestro sistema se enfoca en 3 pilares: Creativos de alto impacto, optimización de embudo y escalamiento de campañas rentables. No vendemos "likes", vendemos crecimiento medible.`,
            objections: [
                { id: 1, objection: '¿Cuánto cuesta?', response: 'La inversión depende del nivel de agresividad y escala que busquemos. Para darte un número preciso, primero necesito entender tu situación actual. ¿Cuál es tu presupuesto de marketing mensual actual?' },
                { id: 2, objection: 'Ya tengo una agencia / freelancer', response: 'Entendido. No buscamos reemplazar lo que funciona. Muchos de nuestros mejores clientes vienen para una segunda opinión o para enfocar una parte de su presupuesto en nuestra metodología de "performance". ¿Qué es lo que más valoras de tu proveedor actual?' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]: Reglas INQUEBRANTABLES para la IA.
- Tono: Profesional, directo, como un consultor senior. Con autoridad pero sin ser arrogante.
- Prohibido: Usar emojis, tutear, garantizar resultados, ofrecer descuentos, hablar de política o temas no relacionados al negocio.
- Finalidad: Mi único objetivo es determinar si el lead tiene un problema que podemos resolver y el presupuesto para hacerlo. Si es así, mi trabajo es pasarlo a un humano con la frase: "Excelente, basado en esto, creo que podemos ayudarte. Un estratega de nuestro equipo se pondrá en contacto contigo en breve para coordinar una llamada."`,
            priceText: "Servicios desde 950 USD/mes + inversión publicitaria.",
            ctaLink: "El siguiente paso es una llamada de diagnóstico con un estratega. [TU ENLACE DE CALENDLY]"
        }
    },
    'COACH': {
        name: 'Coaching / Consultoría',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente virtual de [Nombre del Coach/Consultor]. Mi función es actuar como un filtro de claridad. Debo entender las metas y desafíos del prospecto para asegurar que solo las personas 100% comprometidas lleguen a una sesión de descubrimiento.
Soy el asistente de [Nombre del Coach/Consultor]. Mi objetivo es entender tus aspiraciones y lo que te frena actualmente para ver si nuestro programa es el vehículo correcto para tu transformación.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: ¿Quién necesita realmente tu ayuda? Sé ultra específico.
Profesionales y emprendedores ambiciosos que sienten que han tocado un techo. No buscan "motivación barata", sino un sistema accionable para desbloquear su siguiente nivel de ingresos, liderazgo o rendimiento.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: Describe la transformación, no las características.
Es un programa de acompañamiento intensivo y personalizado de 12 semanas. No es un curso grabado. Es un sistema de "accountability" donde trabajamos mano a mano en 3 fases: 1. Claridad absoluta de objetivos. 2. Desmantelamiento de barreras limitantes. 3. Ejecución de un plan de acción de alto impacto.`,
            objections: [
                { id: 1, objection: 'No tengo tiempo', response: 'Comprendo. De hecho, la falta de tiempo es el síntoma N°1 que abordamos. El programa está diseñado para crear sistemas y apalancamiento que te devuelvan el control de tu agenda, no para añadir más carga.' },
                { id: 2, objection: '¿Es como terapia?', response: 'Es una buena pregunta. Mientras la terapia mira hacia el pasado para sanar, nuestro coaching mira hacia el futuro para construir. Nos enfocamos 100% en acciones y resultados tangibles.' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]:
- Tono: Empático pero firme. Inspirador pero anclado en la realidad.
- Prohibido: Dar consejos de coaching, presionar la venta, usar lenguaje cliché de "ley de atracción".
- Finalidad: Mi meta es identificar si la persona está lista para invertir en sí misma. Si lo está, la derivo a una sesión de descubrimiento con la frase: "Basado en lo que me dices, eres un candidato ideal. El siguiente paso es una sesión de claridad sin costo con [Nombre]. Puedes agendar aquí:"`,
            priceText: "La inversión en el programa completo de 12 semanas es de 2.500 USD.",
            ctaLink: "[Tu enlace para la sesión de descubrimiento]"
        }
    },
    'CURSOS_ONLINE': {
        name: 'Venta de Cursos Online',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente de inscripción para el curso [Nombre del Curso]. Mi trabajo es responder dudas puntuales sobre el programa y guiar a los estudiantes decididos hacia la página de pago. No estoy aquí para convencer a nadie, solo para facilitar el acceso a quienes ya están interesados.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: ¿Quién se beneficia más de tu curso?
Personas que quieren aprender [Habilidad específica, ej: a invertir en criptomonedas, a programar en Python] y están buscando un método paso a paso. Están frustrados con la información gratuita desordenada y quieren un camino claro de A a Z.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: ¿Qué aprenderán y qué lograrán?
[Nombre del Curso] es un programa de formación online con más de [Número] lecciones en video, acceso a una comunidad privada y soporte directo de los instructores. Está diseñado para llevarte de cero a [Resultado específico, ej: tu primer portafolio de inversión rentable] en menos de [Tiempo, ej: 6 semanas]. El acceso es de por vida.`,
            objections: [
                { id: 1, objection: '¿Hay garantía?', response: 'Sí, tenemos una garantía de satisfacción de 7 días. Si después de ver los primeros módulos sientes que no es para ti, te devolvemos el 100% de la inversión, sin preguntas.' },
                { id: 2, objection: '¿No puedo aprender esto gratis en YouTube?', response: 'Absolutamente, pero te costará cientos de horas de prueba y error. Nuestro curso es un atajo. Te damos el sistema exacto, ordenado y probado para que tengas resultados en semanas, no en años.' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]:
- Tono: Entusiasta, claro y servicial.
- Prohibido: Ofrecer descuentos no autorizados, dar opiniones sobre otros cursos.
- Finalidad: Responder dudas y, cuando el lead esté listo, enviar el link de pago con la frase: "¡Excelente! Puedes asegurar tu cupo y empezar hoy mismo desde este enlace:"`,
            priceText: "El acceso completo y de por vida al curso es de 297 USD (pago único).",
            ctaLink: "[Tu enlace de Hotmart, Stripe, etc.]"
        }
    },
    'INMOBILIARIA': {
        name: 'Inmobiliaria / Real Estate',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente inmobiliario de [Nombre Inmobiliaria]. Mi objetivo es entender los requisitos básicos de la propiedad que buscas (zona, habitaciones, presupuesto) para filtrar nuestro inventario y conectar al agente adecuado para ti.
Soy el asistente de [Nombre Inmobiliaria]. Mi función es acelerar tu búsqueda. Dime qué necesitas y te conecto con las mejores propiedades y el agente correcto.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: ¿Compradores, vendedores, alquileres?
Personas o familias buscando activamente comprar, vender o alquilar propiedades en [Tu Zona]. Buscamos clientes decididos que valoren un servicio eficiente y profesional para no perder tiempo en visitas inútiles.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: ¿En qué te especializas?
Nos especializamos en la venta y alquiler de [casas, departamentos, lotes] en las mejores zonas de [Tu Ciudad]. Ofrecemos un servicio integral que incluye tasación, marketing de la propiedad y asesoramiento legal hasta la firma.`,
            objections: [
                { id: 1, objection: 'Solo estoy mirando, sin apuro', response: 'Perfecto, mirar es el primer paso. Para que tu búsqueda sea más efectiva, ¿cuáles son las 3 características que sí o sí tendría la propiedad de tus sueños? Así te avisamos si entra algo que sea una oportunidad única.' },
                { id: 2, objection: 'El precio es muy alto', response: 'Entiendo tu punto. El mercado está muy dinámico. Mi función no es negociar precios, pero puedo pasar tu interés a un agente para que explore si hay margen de negociación o te presente opciones similares dentro de tu presupuesto. ¿Te parece bien?' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]:
- Tono: Servicial, profesional, rápido y eficiente.
- Prohibido: Negociar precios, dar opiniones personales sobre propiedades, prometer disponibilidad.
- Finalidad: Recopilar la información básica (zona, tipo, habitaciones, presupuesto) y luego coordinar una visita o pasar el contacto a un agente humano. Frase de pase: "Excelente. Tengo algunas opciones que encajan. Para darte un servicio personalizado, un agente se comunicará contigo en breve."`,
            priceText: "Los precios varían según la propiedad. Las comisiones son las estándares del mercado inmobiliario.",
            ctaLink: "El siguiente paso es que un agente te contacte para coordinar una visita."
        }
    },
     'GIMNASIO': {
        name: 'Gimnasio / Fitness Studio',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente de [Nombre del Gimnasio]. Estoy aquí para darte información sobre nuestros planes, horarios y clases, y para ayudarte a agendar tu primera clase de prueba gratuita.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: ¿A quién te diriges?
Personas en [Tu Zona] que buscan mejorar su salud y estado físico. Desde principiantes que no saben por dónde empezar hasta atletas que buscan llevar su entrenamiento al siguiente nivel.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: ¿Qué ofreces?
Somos un gimnasio premium con equipamiento de última generación, una amplia variedad de clases grupales (CrossFit, Yoga, Spinning) y un equipo de entrenadores certificados para ayudarte a alcanzar tus metas de forma segura y efectiva. Más que un gimnasio, somos una comunidad.`,
            objections: [
                { id: 1, objection: 'No tengo tiempo para ir', response: 'Entiendo perfectamente, la vida es ocupada. Por eso tenemos horarios flexibles desde las 6 AM hasta las 10 PM y clases cortas de alta intensidad de solo 45 minutos. ¿En qué momento del día te quedaría mejor entrenar?' },
                { id: 2, objection: 'Los gimnasios me intimidan', response: 'Muchos se sienten así al principio. Por eso nuestra clase de prueba es con un entrenador que te guía paso a paso. El ambiente aquí es de apoyo, no de competencia. Lo más difícil es dar el primer paso.' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]:
- Tono: Motivador, amigable y enérgico.
- Prohibido: Dar consejos médicos o de nutrición, criticar otros gimnasios.
- Finalidad: El único objetivo es lograr que el lead agende su clase de prueba gratuita. Frase de cierre: "¡Genial! El mejor momento para empezar es ahora. Te reservo tu clase de prueba gratuita aquí mismo:"`,
            priceText: "Tenemos planes desde $35 USD mensuales. La clase de prueba es 100% gratuita.",
            ctaLink: "[Tu enlace para agendar la clase de prueba]"
        }
    },
    'SERVICIOS_PRO': {
        name: 'Servicios Profesionales (Abogados, Contadores)',
        data: {
            mission: `// [ROL PRINCIPAL]: Soy el asistente legal/contable de [Nombre del Estudio]. Mi función es realizar un primer filtro para entender la naturaleza de su consulta y agendar una cita con el profesional adecuado. No puedo brindar asesoramiento legal o fiscal.`,
            idealCustomer: `// [PÚBLICO OBJETIVO]: ¿A quién sirves?
Empresas y particulares que enfrentan una situación legal o contable específica y requieren asesoramiento experto y confidencial. Valoran la seriedad y la trayectoria.`,
            detailedDescription: `// [TU OFERTA IRRESISTIBLE]: ¿Cuál es tu especialidad?
Somos un estudio especializado en [Derecho Corporativo, Impuestos, etc.]. Nuestro equipo de profesionales ofrece soluciones estratégicas y personalizadas para proteger sus intereses y optimizar su situación fiscal/legal.`,
            objections: [
                { id: 1, objection: '¿Cuánto me cobran por la consulta?', response: 'La primera consulta tiene un honorario de [Monto, ej: 100 USD], que se acredita a futuros servicios si decide contratarnos. Es una sesión de diagnóstico para darle un plan de acción claro.' },
                { id: 2, objection: 'Solo es una pregunta rápida', response: 'Comprendo. Sin embargo, para darle una respuesta responsable y precisa, el profesional necesita conocer todos los detalles de su caso en un marco de confidencialidad. Por eso es necesaria la consulta formal.' }
            ],
            rules: `// [LÍMITES Y DIRECTIVAS]:
- Tono: Formal, profesional, discreto y muy respetuoso.
- Prohibido: Dar cualquier tipo de consejo, opinión o recomendación legal/fiscal. Usar un lenguaje informal o emojis.
- Finalidad: Agendar la consulta inicial. Frase de pase: "Entiendo la situación. Para analizar su caso en detalle, lo correcto es agendar una consulta con uno de nuestros especialistas. Puede reservar su cita aquí:"`,
            priceText: "La consulta inicial tiene un costo de [Monto].",
            ctaLink: "[Tu enlace de agendamiento de consultas]"
        }
    }
};
// --- END: New Mappings & Templates ---

interface WizardState {
    mission: string;
    idealCustomer: string;
    detailedDescription: string;
    objections: { id: number; objection: string; response: string }[];
    rules: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal }) => {
  const [current, setCurrent] = React.useState<BotSettings | null>(null);
  const [isSaved, setIsSaved] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState(0); 
  const [newIgnored, setNewIgnored] = React.useState('');
  const [isEnhancing, setIsEnhancing] = React.useState<keyof WizardState | null>(null);
  const [sessionTokenCount, setSessionTokenCount] = React.useState(0);
  
  const [wizardState, setWizardState] = React.useState<WizardState>({
      mission: '',
      idealCustomer: '',
      detailedDescription: '',
      objections: [{ id: 1, objection: '', response: '' }],
      rules: '- Tono: Profesional, directo, experto.\n- Prohibido: Usar emojis, tutear, hacer chistes, ofrecer descuentos.\n- Finalidad: Mi trabajo termina cuando el lead está listo para hablar con un humano.'
  });

  React.useEffect(() => {
    if (!current) return;
    const objectionsText = wizardState.objections
        .filter(o => o.objection && o.response)
        .map(o => `- Sobre "${o.objection}": Respondo: "${o.response}"`)
        .join('\n');
    const combinedDescription = `
## MISIÓN PRINCIPAL
${wizardState.mission}
## CLIENTE IDEAL
${wizardState.idealCustomer}
## DESCRIPCIÓN DETALLADA DEL SERVICIO
${wizardState.detailedDescription}
## MANEJO DE OBJECIONES FRECUENTES
${objectionsText}
## REGLAS DE ORO Y LÍMITES
${wizardState.rules}
    `.trim();
    if (current.productDescription !== combinedDescription) {
        setCurrent(prev => prev ? ({ ...prev, productDescription: combinedDescription }) : null);
    }
  }, [wizardState, current?.productName]);

  React.useEffect(() => {
    if (settings) {
        const validatedSettings = { ...settings, ignoredJids: settings.ignoredJids || [] };
        setCurrent(validatedSettings);
    }
  }, [settings]);

  const save = () => {
    if (current) {
        onUpdateSettings(current);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleArchetypeChange = (arch: PromptArchetype) => {
      if (!current) return;
      const values = ARCHETYPE_MAPPING[arch];
      setCurrent({ ...current, archetype: arch, ...values });
  };

  const loadTemplate = (templateKey: string) => {
    if(templateKey === 'DEFAULT') return;
    const template = TEMPLATES[templateKey];
    if (!template || !template.data) return;
    setWizardState(prev => ({ ...prev, ...template.data }));
    if (current) {
        setCurrent({ ...current, priceText: template.data.priceText || '', ctaLink: template.data.ctaLink || '' });
    }
  };

  const enhanceWithAI = async (field: keyof Pick<WizardState, 'mission' | 'idealCustomer' | 'detailedDescription'>) => {
    if (!current?.geminiApiKey) {
        alert("Por favor, ingresa tu API Key de Gemini en la sección correspondiente antes de usar esta función.");
        return;
    }
    const contentToEnhance = wizardState[field];
    if (!contentToEnhance.trim()) {
        alert("Por favor, escribe algo en el campo antes de mejorarlo con IA.");
        return;
    }
    setIsEnhancing(field);
    try {
        const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
        const fieldMap = {
            mission: 'misión principal del bot',
            idealCustomer: 'descripción del cliente ideal',
            detailedDescription: 'descripción detallada del producto/servicio'
        };
        const prompt = `Eres un experto en prompt engineering y copywriting para ventas. Toma el siguiente texto, que define la "${fieldMap[field]}", y mejóralo drásticamente. Hazlo más detallado, preciso, persuasivo y efectivo para instruir a una IA de ventas en WhatsApp. Mantén un tono profesional y directo. No agregues introducciones ni conclusiones, solo devuelve el texto mejorado.\n\nTEXTO A MEJORAR:\n"${contentToEnhance}"`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        // Although usageMetadata is not in the public type, some models return it.
        // We defensively check for it to provide token usage feedback.
        const usage = (response as any).usageMetadata;
        if (usage && typeof usage.totalTokenCount === 'number') {
            setSessionTokenCount(prev => prev + usage.totalTokenCount);
        }

        const enhancedText = response.text;
        if (enhancedText) {
            handleWizardStateChange(field, enhancedText.trim());
        } else {
            throw new Error("La IA no devolvió texto.");
        }
    } catch (error) {
        console.error("Error enhancing with AI:", error);
        alert("Hubo un error al comunicarse con la IA. Revisa tu API Key y la consola para más detalles.");
    } finally {
        setIsEnhancing(null);
    }
  };
  
  const handleWizardStateChange = (field: keyof WizardState, value: any) => setWizardState(prev => ({...prev, [field]: value}));
  const handleObjectionChange = (id: number, field: 'objection' | 'response', value: string) => setWizardState(prev => ({ ...prev, objections: prev.objections.map(o => o.id === id ? { ...o, [field]: value } : o) }));
  const addObjection = () => setWizardState(prev => ({ ...prev, objections: [...prev.objections, { id: Date.now(), objection: '', response: '' }] }));
  const removeObjection = (id: number) => setWizardState(prev => ({ ...prev, objections: prev.objections.filter(o => o.id !== id) }));

  const addIgnored = () => {
      if (!newIgnored.trim() || !current) return;
      const numbers = newIgnored.split(/[\s,;\n]+/);
      const newJids: string[] = [];

      numbers.forEach(numStr => {
          const clean = numStr.replace(/[^0-9]/g, '');
          if (clean && !current.ignoredJids?.includes(clean) && !newJids.includes(clean)) {
              newJids.push(clean);
          }
      });
      
      if (newJids.length > 0) {
          setCurrent({ ...current, ignoredJids: [...(current.ignoredJids || []), ...newJids] });
      }
      setNewIgnored('');
  };

  const removeIgnored = (num: string) => { if(!current) return; setCurrent({ ...current, ignoredJids: current.ignoredJids.filter(n => n !== num) }); };

  if (isLoading || !current) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10">
            <div className="relative w-20 h-20 mb-6 border-4 border-brand-gold/10 rounded-full border-t-brand-gold animate-spin"></div>
            <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Inyectando Conciencia...</p>
        </div>
    );
  }
  
  const slider = (label: string, id: keyof BotSettings, desc: string) => (
    <div className="group">
        <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-black uppercase text-white tracking-widest">{label}</label>
            <span className="text-brand-gold text-[11px] font-bold bg-brand-gold/10 px-3 py-1 rounded-lg border border-brand-gold/20 shadow-lg shadow-brand-gold/5">Nivel {current[id] as number}</span>
        </div>
        <p className="text-[10px] text-gray-400 uppercase font-bold mb-4 tracking-tighter leading-tight">{desc}</p>
        <div className="relative flex items-center">
             <input type="range" min="1" max="5" value={current[id] as number} onChange={(e) => setCurrent({...current, [id]: parseInt(e.target.value)})} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-brand-gold border border-white/5 transition-all hover:bg-white/10" />
        </div>
    </div>
  );

  const AiEnhanceButton: React.FC<{ field: keyof Pick<WizardState, 'mission' | 'idealCustomer' | 'detailedDescription'> }> = ({ field }) => (
    <button type="button" onClick={() => enhanceWithAI(field)} disabled={isEnhancing !== null} className="flex items-center justify-center gap-2 text-[10px] text-brand-gold font-bold hover:underline disabled:opacity-50">
        {isEnhancing === field ? (
            <><div className="w-3 h-3 border-2 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin"></div> Mejorando...</>
        ) : (
            'Mejorar con IA ✨'
        )}
    </button>
  );

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-10 overflow-y-auto h-full custom-scrollbar animate-fade-in font-sans">
      <div className="max-w-6xl mx-auto space-y-10 pb-32">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-8">
            <div>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Cerebro <span className="text-brand-gold">Neural</span></h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Configuración de Red Inferencia v3.2</p>
            </div>
            <button onClick={save} className={`px-12 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all duration-500 shadow-2xl ${isSaved ? 'bg-green-600 text-white scale-95' : 'bg-brand-gold text-black hover:scale-105 active:opacity-80'}`}>{isSaved ? "SINCRONIZACIÓN EXITOSA ✓" : "Sincronizar IA"}</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-8">
                <section className="bg-brand-surface border border-white/5 rounded-[40px] p-0 shadow-2xl overflow-hidden min-h-[650px] flex flex-col relative">
                    <div className="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center backdrop-blur-md">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-brand-gold/20 border border-brand-gold/40 flex items-center justify-center text-brand-gold text-[11px]">IA</span>Protocolo de Calibración</h3>
                        <div className="flex gap-1.5">{[0, 1, 2].map(s => (<div key={s} className={`w-10 h-1.5 rounded-full transition-all duration-500 ${wizardStep === s ? 'bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]' : (wizardStep > s ? 'bg-brand-gold/40' : 'bg-white/5')}`}></div>))}</div>
                    </div>

                    <div className="flex-1 p-10 flex flex-col justify-center">
                        {wizardStep === 0 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-3 mb-8"><label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">FASE 1: LA MISIÓN</label><h4 className="text-2xl font-black text-white tracking-tighter">Define tu Identidad y Cliente Ideal</h4><p className="text-sm text-gray-400 leading-relaxed font-medium">La IA necesita saber quién es y para quién trabaja. Esto define el 80% de su éxito.</p></div>
                                <div className="space-y-4">
                                    <input value={current.productName} onChange={e => setCurrent({...current, productName: e.target.value})} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm font-bold text-white focus:border-brand-gold outline-none" placeholder="Nombre de tu Negocio/Producto" />
                                    <div><textarea value={wizardState.mission} onChange={e => handleWizardStateChange('mission', e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-gray-300 h-24 resize-none focus:border-brand-gold outline-none" placeholder="Misión: Mi propósito es..."/><div className="text-right mt-1"><AiEnhanceButton field="mission"/></div></div>
                                    <div><textarea value={wizardState.idealCustomer} onChange={e => handleWizardStateChange('idealCustomer', e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-gray-300 h-24 resize-none focus:border-brand-gold outline-none" placeholder="Cliente Ideal: Agencias que facturan..."/><div className="text-right mt-1"><AiEnhanceButton field="idealCustomer"/></div></div>
                                </div>
                                <div className="pt-4"><button onClick={() => setWizardStep(1)} disabled={!current.productName || !wizardState.mission || !wizardState.idealCustomer} className="w-full py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-20 transition-all border border-white/10">Siguiente: Arsenal &rarr;</button></div>
                            </div>
                        )}
                        {wizardStep === 1 && (
                             <div className="space-y-6 animate-fade-in">
                                <div className="space-y-3 mb-8"><label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">FASE 2: EL ARSENAL</label><h4 className="text-2xl font-black text-white tracking-tighter">Detalla tu Oferta y Cierre</h4><p className="text-sm text-gray-400 leading-relaxed font-medium">Qué vendes, cuánto cuesta y cuál es el siguiente paso para el cliente.</p></div>
                                <div className="space-y-4">
                                    <div><textarea value={wizardState.detailedDescription} onChange={e => handleWizardStateChange('detailedDescription', e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-gray-300 h-32 resize-none focus:border-brand-gold outline-none" placeholder="Descripción detallada del producto/servicio..."/><div className="text-right mt-1"><AiEnhanceButton field="detailedDescription"/></div></div>
                                    <input value={current.priceText} onChange={e => setCurrent({...current, priceText: e.target.value})} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-brand-gold outline-none" placeholder="Inversión / Precio. Ej: $1.000 USD" />
                                    <textarea value={current.ctaLink} onChange={e => setCurrent({...current, ctaLink: e.target.value})} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-gray-300 h-24 resize-none focus:border-brand-gold outline-none" placeholder="Llamada a la acción. Ej: 'Excelente, agenda una llamada aquí: [link]'"/>
                                </div>
                                <div className="flex gap-4 pt-4"><button onClick={() => setWizardStep(0)} className="flex-1 py-5 text-gray-500 font-black text-[11px] uppercase tracking-widest hover:text-white transition-colors">Atrás</button><button onClick={() => setWizardStep(2)} disabled={!wizardState.detailedDescription || !current.priceText || !current.ctaLink} className="flex-[2] py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-20 transition-all border border-white/10">Siguiente: Playbook &rarr;</button></div>
                            </div>
                        )}
                        {wizardStep === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-3"><label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">FASE 3: EL PLAYBOOK</label><h4 className="text-2xl font-black text-white tracking-tighter">Manejo de Objeciones y Reglas</h4><p className="text-sm text-gray-400 leading-relaxed font-medium">Enséñale a la IA cómo pensar como tú. Define cómo manejar las dudas y qué tiene prohibido hacer.</p></div>
                                <div className="space-y-4 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                                    {wizardState.objections.map(o => (<div key={o.id} className="p-4 bg-black/60 border border-white/10 rounded-xl space-y-2 relative"><button onClick={() => removeObjection(o.id)} className="absolute top-2 right-2 text-red-500 text-xs">✕</button><input value={o.objection} onChange={e => handleObjectionChange(o.id, 'objection', e.target.value)} className="w-full bg-transparent text-white text-xs font-bold" placeholder="Objeción del cliente..."/><textarea value={o.response} onChange={e => handleObjectionChange(o.id, 'response', e.target.value)} className="w-full bg-transparent text-gray-400 text-xs h-12 resize-none" placeholder="Respuesta de la IA..."/></div>))}
                                    <button onClick={addObjection} className="w-full text-center text-xs text-brand-gold font-bold py-2">+ Añadir Objeción</button>
                                </div>
                                <textarea value={wizardState.rules} onChange={e => handleWizardStateChange('rules', e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-gray-300 h-24 resize-none focus:border-brand-gold outline-none" placeholder="Reglas de Oro y Límites..."/>
                                <div className="flex gap-4 pt-4"><button onClick={() => setWizardStep(1)} className="flex-1 py-5 text-gray-500 font-black text-[11px] uppercase tracking-widest hover:text-white">Atrás</button><button onClick={() => { setWizardStep(0); save(); }} className="flex-[2] py-5 bg-brand-gold text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-[0_15px_40px_rgba(212,175,55,0.3)] hover:scale-[1.02] transition-all">Desplegar Cerebro</button></div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 text-center border-t border-white/5"><select onChange={(e) => loadTemplate(e.target.value)} className="w-full bg-transparent text-center text-[10px] font-bold text-brand-gold uppercase tracking-widest hover:underline cursor-pointer outline-none"><option value="DEFAULT">Cargar Plantilla Táctica...</option>{Object.entries(TEMPLATES).filter(([key]) => key !== 'DEFAULT').map(([key, { name }]) => (<option key={key} value={key}>{name}</option>))}</select></div>
                </section>
            </div>
            
            <div className="space-y-8">
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Ajustes de Personalidad</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-8">
                        {Object.values(PromptArchetype).map(arch => (<button key={arch} type="button" onClick={() => handleArchetypeChange(arch)} className={`p-3 rounded-lg border text-center group text-[9px] font-black uppercase tracking-widest ${current.archetype === arch ? 'bg-brand-gold/10 border-brand-gold text-brand-gold' : 'bg-black/40 border-white/5 text-gray-600 hover:text-gray-300'}`}>{ARCHETYPE_NAMES[arch]}</button>))}
                    </div>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-6">
                        {slider("Tono de Voz", "toneValue", "Nivel de respeto, formalidad y cercanía en el trato.")}
                        {slider("Ritmo de Chat", "rhythmValue", "Determina la longitud de párrafos y tiempo de respuesta.")}
                        {slider("Intensidad de Venta", "intensityValue", "Determina el nivel de empuje hacia el enlace de pago.")}
                    </div>
                </section>
                
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Panel de Control de Gemini</h3>
                     <p className="text-[10px] text-gray-400 uppercase font-bold mb-4 tracking-widest">El motor neural de la IA. <a href="https://aistudio.google.com/app/apikey" target="_blank"  rel="noopener noreferrer" className="text-brand-gold underline">Obtener API Key aquí</a>.</p>
                     
                     <div className="flex gap-2 mb-6">
                        <input type="password" value={current.geminiApiKey || ''} onChange={e => {setCurrent({...current, geminiApiKey: e.target.value});}} className="flex-1 bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-brand-gold font-mono focus:border-brand-gold outline-none" placeholder="AIzaSy..." />
                     </div>

                    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">Asistente de Calibración</p>
                        <p className="text-2xl font-black text-brand-gold">{sessionTokenCount.toLocaleString()}</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Tokens Usados (Sesión)</p>
                    </div>
                </section>

                <section className="bg-brand-surface border border-red-500/10 rounded-3xl p-8 shadow-2xl border-l-4 border-l-red-500/30">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">Escudo de Privacidad</h3>
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-6 tracking-widest">Ingresa o pega números que el bot ignorará por completo.</p>
                    <div className="flex flex-col gap-2 mb-6">
                        <textarea value={newIgnored} onChange={e => setNewIgnored(e.target.value)} placeholder="Pega una lista de números separados por comas, espacios o saltos de línea..." className="flex-1 bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs outline-none focus:border-brand-gold font-mono h-24 resize-none"/>
                        <button type="button" onClick={addIgnored} className="px-4 py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase transition-transform active:scale-95">Añadir a la Lista Negra</button>
                    </div>
                    <div className="flex flex-wrap gap-2">{current.ignoredJids?.map(num => (<div key={num} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg group"><span className="text-[10px] text-gray-400 font-mono group-hover:text-white transition-colors">{num}</span><button type="button" onClick={() => removeIgnored(num)} className="text-red-500 hover:text-red-400 font-bold ml-1">✕</button></div>))}</div>
                </section>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
