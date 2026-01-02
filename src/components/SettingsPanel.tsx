
import React, { useState, useEffect } from 'react';
import { BotSettings, PromptArchetype, User, NetworkProfile } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
// FIX: Import BACKEND_URL and getAuthHeaders for API calls
import { BACKEND_URL, getAuthHeaders } from '../config';
import { audioService } from '../services/audioService';


interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto' | 'network') => void;
  // NEW: Added showToast prop for consistency with other panels
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
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
            rules: `// [LÍMITES Y DIRECTIVAS]: Reglas INQUEBRABLES para la IA.
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

// Utility function to parse the combined productDescription string back into wizardState
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
        objections: objections.length > 0 ? objections : [{ id: 1, objection: '', response: '' }], // Ensure at least one empty objection
        rules: sections["## REGLAS DE ORO Y LÍMITES"] || '- Tono: Profesional, directo, experto.\n- Prohibido: Usar emojis, tutear, hacer chistes, ofrecer descuentos.\n- Finalidad: Mi trabajo termina cuando el lead está listo para hablar con un humano.'
    };
};

const NETWORK_CATEGORIES = [
    'Marketing Digital', 'Desarrollo Web', 'Diseño Gráfico', 'Consultoría de Negocios',
    'Servicios Financieros', 'Real Estate', 'Coaching', 'E-commerce', 'Fitness y Salud',
    'Software SaaS', 'Eventos', 'Logística', 'Educación Online', 'Recursos Humanos'
];


const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal, showToast }) => {
  const [current, setCurrent] = useState<BotSettings | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); 
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [sessionTokenCount, setSessionTokenCount] = useState(0);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  
  const [wizardState, setWizardState] = useState<WizardState>({
      mission: '',
      idealCustomer: '',
      detailedDescription: '',
      objections: [{ id: 1, objection: '', response: '' }],
      rules: '- Tono: Profesional, directo, experto.\n- Prohibido: Usar emojis, tutear, hacer chistes, ofrecer descuentos.\n- Finalidad: Mi trabajo termina cuando el lead está listo para hablar con un humano.'
  });

  // Network State
  const [isNetworkEnabled, setIsNetworkEnabled] = useState(false);
  const [categoriesOfInterest, setCategoriesOfInterest] = useState<string[]>([]);
  const [currentNetworkProfile, setCurrentNetworkProfile] = useState<NetworkProfile | null>(null);

  // Effect to initialize current settings and parse productDescription for wizardState
  useEffect(() => {
    if (settings) {
        const validatedSettings = { ...settings, ignoredJids: settings.ignoredJids || [] };
        setCurrent(validatedSettings);
        if (settings.productDescription) {
            setWizardState(parseProductDescription(settings.productDescription));
        }
        setIsNetworkEnabled(settings.isNetworkEnabled || false);
        // Call fetchNetworkProfile when settings are available, it will update categoriesOfInterest
        // The token needs to be retrieved inside the effect or passed as a prop
    }
  }, [settings]);

    // Effect to fetch NetworkProfile when component mounts or token changes
    useEffect(() => {
        const fetchNetworkProfile = async () => {
            const storedToken = localStorage.getItem('saas_token');
            if (!storedToken) return; // Ensure token exists before fetching
            try {
                const res = await fetch(`${BACKEND_URL}/api/network/profile`, { headers: getAuthHeaders(storedToken) });
                if (res.ok) {
                    const profileData = await res.json();
                    setCurrentNetworkProfile(profileData);
                    setCategoriesOfInterest(profileData.categoriesOfInterest || []);
                } else {
                    console.error("Failed to fetch network profile in settings panel.");
                    // Initialize with default if not found
                    setCurrentNetworkProfile({ networkEnabled: false, categoriesOfInterest: [], contributionScore: 0, receptionScore: 0 });
                    setCategoriesOfInterest([]);
                }
            } catch (e) {
                console.error("Error fetching network profile in settings panel:", e);
                // Initialize with default on error
                setCurrentNetworkProfile({ networkEnabled: false, categoriesOfInterest: [], contributionScore: 0, receptionScore: 0 });
                setCategoriesOfInterest([]);
            }
        };
        fetchNetworkProfile();
    }, []); // Empty dependency array means this runs once on mount. `settings` change is handled by the first effect.

    // Function to persist network profile changes
    const saveNetworkProfile = async (profileToSave?: NetworkProfile) => {
        const payload = profileToSave || currentNetworkProfile;
        const storedToken = localStorage.getItem('saas_token'); // Get token here
        if (!payload || !storedToken) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/network/profile`, {
                method: 'POST',
                headers: getAuthHeaders(storedToken),
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const updatedProfile = await res.json();
                setCurrentNetworkProfile(updatedProfile);
                showToast("Perfil de red guardado.", "success");
            } else {
                showToast("Error al guardar perfil de red.", "error");
            }
        } catch (error) {
            showToast("Error de conexión al guardar perfil.", "error");
        }
    };

    const handleToggleNetworkEnabled = async () => {
        if (!current || !currentNetworkProfile) return;
        const newStatus = !current.isNetworkEnabled;
        
        // Update bot settings toggle
        onUpdateSettings({ ...current, isNetworkEnabled: newStatus });
        
        // Update network profile's enabled status
        const updatedNetworkProfile = { ...currentNetworkProfile, networkEnabled: newStatus };
        await saveNetworkProfile(updatedNetworkProfile);
        showToast(`Red Dominion ${newStatus ? 'Activada' : 'Desactivada'}`, 'info');
    };

    const handleToggleCategory = (category: string) => {
        if (!currentNetworkProfile) return;
        const newCategories = currentNetworkProfile.categoriesOfInterest.includes(category)
            ? currentNetworkProfile.categoriesOfInterest.filter(c => c !== category)
            : [...currentNetworkProfile.categoriesOfInterest, category];
        
        // Update local state immediately for responsiveness
        setCategoriesOfInterest(newCategories);
        setCurrentNetworkProfile(prev => prev ? { ...prev, categoriesOfInterest: newCategories } : null);
        // Persist to backend
        saveNetworkProfile({ ...currentNetworkProfile, categoriesOfInterest: newCategories });
    };

  const handleUpdate = (field: keyof BotSettings, value: any) => {
    if (!current) return;
    const newSettings = { ...current, [field]: value };
    setCurrent(newSettings);
    setIsSaved(false);
  };

  const handleSaveSettings = async () => {
    if (!current) return;
    
    // Validate Gemini API Key before saving
    const cleanKey = current.geminiApiKey?.trim();
    if (!cleanKey) {
        showToast('API Key de Gemini no puede estar vacía.', 'error');
        return;
    }
    
    setIsSavingApiKey(true);
    try {
        const ai = new GoogleGenAI({ apiKey: cleanKey });
        // Use a lightweight model for ping, and specify response schema to avoid old API errors.
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{text: 'ping'}] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        status: { type: Type.STRING }
                    }
                }
            }
        });
        showToast('API Key verificada. Guardando configuración...', 'success');
        audioService.play('action_success');
    } catch (error: any) {
        showToast(`Error de verificación de API Key: ${error.message}`, 'error');
        audioService.play('alert_error_apikey');
        setIsSavingApiKey(false);
        return;
    } finally {
        setIsSavingApiKey(false);
    }

    // Combine wizard state into productDescription
    const updatedProductDescription = `
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

    const settingsToSave = { 
        ...current, 
        productDescription: updatedProductDescription,
        // Ensure network settings are also propagated from local state
        isNetworkEnabled: isNetworkEnabled 
    };

    onUpdateSettings(settingsToSave);
    setIsSaved(true);
    showToast('Configuración guardada exitosamente.', 'success');
    audioService.play('action_success');
  };

  const handleArchetypeChange = (archetype: PromptArchetype) => {
      if (!current) return;
      const newSettings = { ...current, archetype };
      if (archetype !== PromptArchetype.CUSTOM) {
          const mapping = ARCHETYPE_MAPPING[archetype];
          newSettings.toneValue = mapping.toneValue;
          newSettings.rhythmValue = mapping.rhythmValue;
          newSettings.intensityValue = mapping.intensityValue;
      }
      setCurrent(newSettings);
      setIsSaved(false);
  };

  const addObjection = () => {
    setWizardState(prev => ({
        ...prev,
        objections: [...prev.objections, { id: Date.now(), objection: '', response: '' }]
    }));
  };

  const updateObjection = (id: number, field: 'objection' | 'response', value: string) => {
    setWizardState(prev => ({
        ...prev,
        objections: prev.objections.map(obj => obj.id === id ? { ...obj, [field]: value } : obj)
    }));
  };

  const removeObjection = (id: number) => {
    setWizardState(prev => ({
        ...prev,
        objections: prev.objections.filter(obj => obj.id !== id)
    }));
  };

  const applyTemplate = (templateKey: string) => {
      const template = TEMPLATES[templateKey];
      if (template && template.data) {
          setWizardState({
              mission: template.data.mission || '',
              idealCustomer: template.data.idealCustomer || '',
              detailedDescription: template.data.detailedDescription || '',
              objections: template.data.objections || [{ id: Date.now(), objection: '', response: '' }],
              rules: template.data.rules || ''
          });
          if (template.data.priceText && current) {
            setCurrent(prev => prev ? { ...prev, priceText: template.data?.priceText || '', ctaLink: template.data?.ctaLink || '' } : null);
          }
          showToast('Plantilla cargada.', 'info');
      }
  };

  const enhanceWithAI = async () => {
      if (!current || !current.geminiApiKey) {
          showToast('Por favor, configure su API Key de Gemini primero.', 'error');
          return;
      }
      setIsEnhancing(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          const prompt = `
            Actúa como un experto en copywriting y estrategia de ventas para mejorar el siguiente brief de un bot de WhatsApp.
            Tu objetivo es hacerlo más persuasivo, claro y efectivo para calificar leads, manteniendo el tono original pero mejorándolo.

            Aquí está el brief actual:
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

            Genera una versión mejorada de este brief. Mantén las secciones y el formato JSON con las siguientes propiedades:
            - "mission": string (Mejorar la misión)
            - "idealCustomer": string (Mejorar la descripción del cliente ideal)
            - "detailedDescription": string (Hacer la oferta más irresistible)
            - "objections": array de { "id": number, "objection": string, "response": string } (Mejorar las respuestas a objeciones. Puedes añadir o modificar hasta 2 objeciones más si lo consideras útil, pero prioriza la calidad.)
            - "rules": string (Optimizar las reglas y límites)
            
            Asegúrate de que las IDs de las objeciones sean únicas.
            `;

          const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Use a more capable model for enhancement
            contents: [{ parts: [{ text: prompt }] }],
            config: { 
                responseMimeType: "application/json", 
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        mission: { type: Type.STRING },
                        idealCustomer: { type: Type.STRING },
                        detailedDescription: { type: Type.STRING },
                        objections: { 
                            type: Type.ARRAY, 
                            items: { 
                                type: Type.OBJECT, 
                                properties: { 
                                    id: { type: Type.NUMBER }, 
                                    objection: { type: Type.STRING }, 
                                    response: { type: Type.STRING } 
                                }, 
                                required: ['id', 'objection', 'response'] 
                            } 
                        },
                        rules: { type: Type.STRING }
                    },
                    required: ['mission', 'idealCustomer', 'detailedDescription', 'objections', 'rules']
                }
            }
          });
          
          const result = JSON.parse(response.text.trim());
          if (result) {
              setWizardState({
                  mission: result.mission || '',
                  idealCustomer: result.idealCustomer || '',
                  detailedDescription: result.detailedDescription || '',
                  // Ensure IDs are unique for new/modified objections
                  objections: result.objections.map((obj: any) => ({ ...obj, id: obj.id || Date.now() + Math.random() })),
                  rules: result.rules || ''
              });
              showToast('Brief mejorado con IA.', 'success');
          } else {
              showToast('La IA no pudo mejorar el brief. Intenta nuevamente.', 'error');
          }

      } catch (error: any) {
          console.error("AI Enhancement failed:", error);
          showToast(`Error al mejorar con IA: ${error.message}`, 'error');
      } finally {
          setIsEnhancing(false);
      }
  };


  if (isLoading || !current) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-black">
        <div className="w-16 h-16 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin mb-6"></div>
        <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Cargando Configuración...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-10 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-10 pb-32">
        
        <header className="flex justify-between items-end border-b border-white/5 pb-8">
            <div>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Panel de <span className="text-brand-gold">Control</span></h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">Configuración Central del Nodo</p>
            </div>
            <button onClick={handleSaveSettings} disabled={isSavingApiKey} className="px-6 py-3 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSavingApiKey ? 'Verificando API...' : 'Guardar Configuración'}
            </button>
        </header>

        {isSaved && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-xs font-bold text-center animate-fade-in">
                Cambios guardados.
            </div>
        )}

        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/5 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-gold/10 transition-colors duration-1000"></div>

            <div className="flex items-center gap-3 mb-6">
                <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></span>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Ajustes Principales</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Nombre del Producto/Negocio</label>
                    <input type="text" value={current.productName} onChange={e => handleUpdate('productName', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Link de Cierre (CTA)</label>
                    <input type="url" value={current.ctaLink} onChange={e => handleUpdate('ctaLink', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" placeholder="https://tuweb.com/oferta" />
                </div>
                 <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">API Key de Google Gemini</label>
                    <div className="flex gap-4">
                        <input type="password" value={current.geminiApiKey || ''} onChange={e => handleUpdate('geminiApiKey', e.target.value)} className="flex-1 bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" placeholder="AIzaSy..." />
                        <button onClick={() => onOpenLegal('privacy')} className="flex-shrink-0 px-4 py-2 bg-white/5 border border-white/10 text-gray-400 rounded-xl text-[9px] font-bold uppercase hover:bg-white/10">¿Qué es esto?</button>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-2 italic">Necesitas tu propia API Key de Google AI Studio. Asegúrate de que tenga facturación habilitada.</p>
                </div>
            </div>
        </section>

        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/10 transition-colors duration-1000"></div>
            
            <div className="flex items-center gap-3 mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Brief de Inferencia (AI)</h3>
                <button onClick={enhanceWithAI} disabled={isEnhancing} className="px-3 py-1.5 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-gold hover:text-black transition-all flex items-center gap-2">
                    {isEnhancing ? <span className="animate-pulse">Optimizando...</span> : <>✨ Mejorar con IA</>}
                </button>
                <select onChange={e => applyTemplate(e.target.value)} className="bg-black/50 border border-white/10 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg px-2 py-1 outline-none">
                    {Object.entries(TEMPLATES).map(([key, value]) => (
                        <option key={key} value={key}>{value.name}</option>
                    ))}
                </select>
            </div>
            
            <div className="space-y-6">
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Misión Principal del Bot</label>
                    <textarea value={wizardState.mission} onChange={e => setWizardState(prev => ({ ...prev, mission: e.target.value }))} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none" placeholder="Cuál es su rol principal, qué debe lograr y qué NO debe hacer." />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Cliente Ideal</label>
                    <textarea value={wizardState.idealCustomer} onChange={e => setWizardState(prev => ({ ...prev, idealCustomer: e.target.value }))} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none" placeholder="Describe a tu cliente perfecto. ¿Qué problema tiene que tu negocio resuelve?" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Descripción Detallada del Servicio/Producto</label>
                    <textarea value={wizardState.detailedDescription} onChange={e => setWizardState(prev => ({ ...prev, detailedDescription: e.target.value }))} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-40 focus:border-brand-gold outline-none resize-none" placeholder="Qué ofreces, sus beneficios únicos, y la transformación que logrará el cliente." />
                </div>
                
                {/* OBJECTIONS */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Manejo de Objeciones Frecuentes</label>
                        <button onClick={addObjection} className="px-3 py-1 bg-white/5 text-gray-400 rounded-lg text-[9px] font-bold uppercase hover:bg-white/10">+ Añadir Objeción</button>
                    </div>
                    <div className="space-y-4">
                        {wizardState.objections.map(obj => (
                            <div key={obj.id} className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[9px] font-bold text-gray-400">Objeción</label>
                                    <button onClick={() => removeObjection(obj.id)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                                </div>
                                <input type="text" value={obj.objection} onChange={e => updateObjection(obj.id, 'objection', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs focus:border-brand-gold outline-none" placeholder="Ej: Es muy caro" />
                                <label className="text-[9px] font-bold text-gray-400">Respuesta del Bot</label>
                                <textarea value={obj.response} onChange={e => updateObjection(obj.id, 'response', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs h-20 focus:border-brand-gold outline-none resize-none" placeholder="Cómo debe responder la IA a esta objeción." />
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Reglas de Oro y Límites</label>
                    <textarea value={wizardState.rules} onChange={e => setWizardState(prev => ({ ...prev, rules: e.target.value }))} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none" placeholder="Ej: NO usar emojis. SOLO vender. NUNCA mentir." />
                </div>
            </div>
        </section>

        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/10 transition-colors duration-1000"></div>
            
            <div className="flex items-center gap-3 mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Ajustes Neurales (IA)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Arquetipo de Conversación</label>
                    <select value={current.archetype} onChange={e => handleArchetypeChange(e.target.value as PromptArchetype)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none">
                        {Object.values(PromptArchetype).map(archetype => (
                            <option key={archetype} value={archetype}>{ARCHETYPE_NAMES[archetype]}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Texto de Precios</label>
                    <input type="text" value={current.priceText} onChange={e => handleUpdate('priceText', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none" placeholder="Ej: Desde 97 USD / mes" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Ignorar Números (JID's) - Blacklist</label>
                    <p className="text-[9px] text-gray-500 mb-2">
                        Añade números de WhatsApp que la IA debe ignorar. (Ej: '5492611234567').
                    </p>
                    <textarea 
                        value={current.ignoredJids.join('\n')} 
                        onChange={e => handleUpdate('ignoredJids', e.target.value.split('\n').filter(Boolean).map(s => s.trim()))} 
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm h-32 focus:border-brand-gold outline-none resize-none font-mono" 
                        placeholder="54911xxxxxxx (uno por línea)" 
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-white/5 mt-8">
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Tono ({current.toneValue})</label>
                    <input type="range" min="1" max="5" value={current.toneValue} onChange={e => handleUpdate('toneValue', parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold" />
                    <p className="text-[9px] text-gray-500 mt-2">1=Agresivo, 5=Amigable</p>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Ritmo ({current.rhythmValue})</label>
                    <input type="range" min="1" max="5" value={current.rhythmValue} onChange={e => handleUpdate('rhythmValue', parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold" />
                    <p className="text-[9px] text-gray-500 mt-2">1=Directo, 5=Detallado</p>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Intensidad ({current.intensityValue})</label>
                    <input type="range" min="1" max="5" value={current.intensityValue} onChange={e => handleUpdate('intensityValue', parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold" />
                    <p className="text-[9px] text-gray-500 mt-2">1=Pasivo, 5=Enérgico</p>
                </div>
            </div>
        </section>

        {/* Network Participation Section */}
        <section className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/10 transition-colors duration-1000"></div>

            <div className="flex items-center gap-3 mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Red Dominion (Beta)</h3>
            </div>
            
            <div className="flex items-center justify-between">
                <div>
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Participar en la Red</label>
                    <p className="text-[9px] text-gray-500">
                        Activa para compartir y recibir leads cualificados con otros miembros de la red.
                        <button onClick={() => onOpenLegal('network')} className="text-brand-gold underline ml-1">Ver términos.</button>
                    </p>
                </div>
                <button onClick={handleToggleNetworkEnabled} className={`w-12 h-6 rounded-full relative transition-colors ${current.isNetworkEnabled ? 'bg-blue-500' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${current.isNetworkEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
            </div>

            {isNetworkEnabled && currentNetworkProfile && (
                <div className="animate-fade-in space-y-6 mt-4">
                    <div>
                        <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest mb-2">Categorías de Interés</label>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-black/50 border border-white/10 rounded-xl">
                            {NETWORK_CATEGORIES.map(category => (
                                <button 
                                    key={category}
                                    type="button"
                                    onClick={() => handleToggleCategory(category)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${categoriesOfInterest.includes(category) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-black/40 text-gray-500 border border-white/10 hover:text-white'}`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-gray-500 mt-2 italic">Selecciona las categorías de leads que te gustaría recibir.</p>
                    </div>
                    <button onClick={() => saveNetworkProfile()} className="w-full py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] transition-all">Guardar Perfil de Red</button>
                </div>
            )}
        </section>

      </div>
    </div>
  );
};

export default SettingsPanel;