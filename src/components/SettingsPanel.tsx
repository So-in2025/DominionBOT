
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

// --- INDUSTRY TEMPLATES (10 Plantillas Reales) ---
const INDUSTRY_TEMPLATES: Record<string, { label: string, data: Partial<WizardState & { priceText: string }> }> = {
    'AGENCY': {
        label: 'Agencia de Marketing (SMMA)',
        data: {
            mission: 'Soy el Asistente de Crecimiento de [TU AGENCIA]. Mi objetivo es calificar dueños de negocio interesados en escalar sus ventas mediante publicidad digital.',
            idealCustomer: 'Dueños de PYMES o E-commerce que facturan +$5k/mes y quieren delegar su marketing.',
            detailedDescription: 'Ofrecemos un sistema de adquisición de clientes "Hecho para ti" usando Meta Ads y Google Ads. Garantizamos 10 citas calificadas en 30 días o no pagas.',
            priceText: 'Desde $1000 USD / mes',
            objections: [
                { id: 1, objection: 'Es muy caro', response: 'Entiendo. No es un gasto, es una inversión con retorno medible. Si te traigo $5 por cada $1 que pones, ¿te parecería caro?' },
                { id: 2, objection: 'Ya tengo agencia', response: 'Genial. Muchos clientes llegan a nosotros buscando una segunda opinión o mejores resultados. ¿Estás 100% satisfecho con tu ROI actual?' }
            ],
            rules: '- NO dar precios exactos sin calificar facturación.\n- SIEMPRE pedir agendar llamada de diagnóstico.\n- Tono experto y directo.'
        }
    },
    'REAL_ESTATE': {
        label: 'Inmobiliaria / Real Estate',
        data: {
            mission: 'Soy el Asistente Inmobiliario de [TU NOMBRE]. Ayudo a compradores e inversores a encontrar propiedades de oportunidad antes de que salgan al mercado masivo.',
            idealCustomer: 'Inversores o familias buscando propiedades en zonas premium, con presupuesto +$150k USD.',
            detailedDescription: 'Asesoramiento integral para compra/venta de propiedades. Acceso a listado exclusivo "Off-Market". Gestión legal y financiera incluida.',
            priceText: 'Comisión del 3% al 4%',
            objections: [
                { id: 1, objection: 'Solo estoy mirando', response: 'Perfecto. El mercado cambia rápido. ¿Qué características debería tener una propiedad para que dejes de mirar y quieras visitarla?' },
                { id: 2, objection: 'La zona es cara', response: 'Es una zona de alta revalorización. ¿Buscas precio o buscas una inversión segura a largo plazo?' }
            ],
            rules: '- NO enviar ubicación exacta sin registro previo.\n- Calificar presupuesto antes de enviar fichas.\n- Objetivo: Agendar visita física.'
        }
    },
    'ECOMMERCE': {
        label: 'E-commerce / Retail',
        data: {
            mission: 'Soy el Asistente de Ventas de [TU TIENDA]. Ayudo a los clientes a elegir el producto perfecto y resolver dudas sobre envíos y tallas.',
            idealCustomer: 'Compradores impulsivos o recurrentes que buscan calidad y rapidez en la entrega.',
            detailedDescription: 'Tienda online de productos exclusivos. Envíos a todo el país en 24hs. Cambio gratis si no te queda bien.',
            priceText: 'Varía según producto',
            objections: [
                { id: 1, objection: 'El envío es caro', response: 'Tenemos envío gratis en compras superiores a cierto monto. ¿Te gustaría agregar algo más al carrito?' },
                { id: 2, objection: '¿Tienen garantía?', response: 'Sí, garantía total de satisfacción por 30 días. Si no te gusta, te devolvemos el dinero.' }
            ],
            rules: '- Respuestas cortas y rápidas.\n- Usar emojis.\n- SIEMPRE ofrecer productos complementarios (Cross-sell).'
        }
    },
    'COACHING': {
        label: 'Coaching / Mentoria',
        data: {
            mission: 'Soy el Asistente de Admisiones de [TU PROGRAMA]. Filtro candidatos para asegurar que solo ingresen personas comprometidas con su transformación.',
            idealCustomer: 'Profesionales estancados que buscan un cambio radical en su carrera/vida y tienen capacidad de inversión.',
            detailedDescription: 'Programa intensivo de 12 semanas "Transformación Total". Mentoria 1a1, grupo de soporte y recursos grabados.',
            priceText: '$2500 USD (Plan Pago)',
            objections: [
                { id: 1, objection: 'No tengo tiempo', response: 'El programa está diseñado para gente ocupada. Si no tienes 3 horas a la semana para tu futuro, ese es justamente el problema que resolvemos.' },
                { id: 2, objection: 'Déjame pensarlo', response: 'Claro. Pero la indecisión es lo que te ha mantenido en el mismo lugar. ¿Qué duda específica te impide avanzar hoy?' }
            ],
            rules: '- Tono autoritario pero empático.\n- NO rogar por la venta.\n- Descalificar si no muestran compromiso.'
        }
    },
    'SOFTWARE': {
        label: 'Software SaaS / B2B',
        data: {
            mission: 'Soy el Bot de Onboarding de [TU SAAS]. Ayudo a empresas a entender cómo nuestro software puede automatizar sus procesos.',
            idealCustomer: 'Gerentes de operaciones o dueños de empresas tecnológicas buscando eficiencia.',
            detailedDescription: 'Plataforma All-in-One para gestión de proyectos. Incluye CRM, facturación y reportes automáticos.',
            priceText: 'Desde $49/mes',
            objections: [
                { id: 1, objection: 'Es difícil de usar', response: 'Para nada. La curva de aprendizaje es de 30 minutos. Además, te asignamos un especialista de onboarding gratis.' },
                { id: 2, objection: 'Es más caro que la competencia', response: 'Sí, porque hacemos lo que ellos hacen, más X e Y. Te ahorras pagar 3 herramientas distintas.' }
            ],
            rules: '- Enfocarse en el ahorro de tiempo/dinero.\n- Ofrecer Demo gratuita.\n- Lenguaje técnico moderado.'
        }
    },
    'FINANCE': {
        label: 'Asesoría Financiera',
        data: {
            mission: 'Soy el Asistente Financiero de [TU FIRMA]. Conecto inversores con oportunidades de alto rendimiento.',
            idealCustomer: 'Personas con liquidez excedente buscando superar la inflación.',
            detailedDescription: 'Portafolio diversificado de inversiones. Renta fija y variable. Asesoría personalizada regulada.',
            priceText: 'Mínimo de Inversión $1000',
            objections: [
                { id: 1, objection: 'Me da miedo', response: 'El riesgo se gestiona con diversificación. Nuestro historial muestra una rentabilidad promedio sólida.' },
                { id: 2, objection: '¿Puedo retirar cuando quiera?', response: 'Depende del instrumento. Tenemos opciones de liquidez inmediata (24hs) y opciones a plazo fijo con mayor tasa.' }
            ],
            rules: '- Tono MUY profesional y seguro.\n- NO prometer ganancias garantizadas imposibles.\n- Generar confianza.'
        }
    },
    'LEGAL': {
        label: 'Estudio Jurídico',
        data: {
            mission: 'Soy el Asistente Legal de [TU ESTUDIO]. Mi función es realizar un triaje inicial de casos para derivar al abogado especialista.',
            idealCustomer: 'Personas con conflictos legales activos que necesitan representación inmediata.',
            detailedDescription: 'Servicios legales en derecho civil, laboral y comercial. Primera consulta bonificada si tomamos el caso.',
            priceText: 'Honorarios según regulación',
            objections: [
                { id: 1, objection: '¿Cuánto cobran la consulta?', response: 'La primera evaluación de viabilidad es sin cargo. Si procedemos, se pactan honorarios.' },
                { id: 2, objection: '¿Garantizan el resultado?', response: 'En derecho no se garantizan resultados, se garantizan medios y profesionalismo. Nuestro historial de éxito es del 90%.' }
            ],
            rules: '- Tono formal y distante.\n- No dar asesoramiento legal específico por chat.\n- Filtrar casos no rentables.'
        }
    },
    'GYM': {
        label: 'Gimnasio / Fitness',
        data: {
            mission: 'Soy el Coach Virtual de [TU GIMNASIO]. Ayudo a las personas a elegir el plan de entrenamiento ideal.',
            idealCustomer: 'Personas que quieren mejorar su salud física y estética cerca de nuestra ubicación.',
            detailedDescription: 'Gimnasio completo con musculación, cardio y clases grupales (Crossfit, Zumba, Yoga). Abierto 24hs.',
            priceText: '$30 USD / mes',
            objections: [
                { id: 1, objection: 'Está lejos', response: 'Entiendo. Aunque muchos socios vienen de lejos por la calidad de las máquinas y el ambiente. ¿Te gustaría venir a probar un día gratis?' },
                { id: 2, objection: 'Es caro', response: 'Incluye acceso ilimitado a todas las clases y seguimiento por app. Es menos de $1 por día.' }
            ],
            rules: '- Tono enérgico y motivador.\n- Invitar siempre a una clase de prueba.\n- Usar emojis de fuerza 💪.'
        }
    },
    'DENTAL': {
        label: 'Clínica Dental / Estética',
        data: {
            mission: 'Soy el Asistente de Pacientes de [TU CLÍNICA]. Gestiono turnos y resuelvo dudas sobre tratamientos.',
            idealCustomer: 'Pacientes que buscan mejorar su sonrisa o tratar dolores dentales con tecnología moderna.',
            detailedDescription: 'Odontología integral, ortodoncia invisible, implantes y estética dental. Tecnología sin dolor.',
            priceText: 'Consulta diagnóstico $20',
            objections: [
                { id: 1, objection: 'Tengo miedo al dentista', response: 'Es normal. Nos especializamos en "Odontología Slow" y sin dolor. Usamos anestesia digital computarizada.' },
                { id: 2, objection: '¿Aceptan obra social?', response: 'Trabajamos principalmente de forma particular para garantizar los mejores materiales, pero te damos factura para reintegro.' }
            ],
            rules: '- Tono cálido y contenedor.\n- Transmitir higiene y seguridad.\n- Priorizar urgencias.'
        }
    },
    'RESTAURANT': {
        label: 'Gastronomía / Delivery',
        data: {
            mission: 'Soy el Camarero Virtual de [TU RESTAURANTE]. Tomo pedidos y reservas de forma eficiente.',
            idealCustomer: 'Comensales hambrientos que buscan comida rica y rápida.',
            detailedDescription: 'El mejor [TIPO DE COMIDA] de la ciudad. Ingredientes frescos y recetas de autor.',
            priceText: 'Promedio $15 p/p',
            objections: [
                { id: 1, objection: '¿Cuánto tardan?', response: 'El tiempo promedio de entrega es de 40-50 minutos. Sale caliente y recién hecho.' },
                { id: 2, objection: '¿Tienen opciones veganas?', response: 'Sí, tenemos una sección exclusiva en el menú con opciones deliciosas sin origen animal.' }
            ],
            rules: '- Tono apetitoso y servicial.\n- Enviar fotos de los platos si piden recomendación.\n- Confirmar dirección de envío.'
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

  // --- MAGIC AI AUTOCOMPLETE ---
  const handleMagicFill = async () => {
      if (!current?.geminiApiKey) {
          showToast('Configura tu API Key de Gemini en el panel derecho primero.', 'error');
          return;
      }
      if (!wizardState.mission || !wizardState.idealCustomer) {
          showToast('Completa la Misión y el Cliente Ideal para que la IA tenga contexto.', 'info');
          return;
      }

      setIsMagicFilling(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          const prompt = `
            Actúa como un estratega de ventas de élite.
            Basado en esta Misión: "${wizardState.mission}" 
            y este Cliente Ideal: "${wizardState.idealCustomer}",
            
            Genera el resto de la configuración del bot en formato JSON estricto:
            1. "detailedDescription": Una descripción persuasiva e irresistible de la oferta/servicio.
            2. "priceText": Un texto de precio sugerido coherente (ej: "Desde $X").
            3. "objections": Un array con 3 objeciones probables y sus respuestas ganadoras de manejo de objeciones.
            4. "rules": 3 reglas de oro para el comportamiento del bot (ej: No usar emojis, ser breve).

            Output JSON Schema:
            {
                "detailedDescription": string,
                "priceText": string,
                "objections": [{ "objection": string, "response": string }],
                "rules": string
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
                  detailedDescription: data.detailedDescription,
                  objections: data.objections.map((o: any, i: number) => ({ id: Date.now() + i, ...o })),
                  rules: data.rules
              }));
              handleUpdate('priceText', data.priceText || '');
              showToast('✨ Estrategia Neural generada exitosamente.', 'success');
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
                                        <select onChange={(e) => applyTemplate(e.target.value)} className="bg-black/40 border border-white/10 text-white text-[9px] font-bold uppercase rounded-lg px-3 py-2 outline-none focus:border-brand-gold cursor-pointer hover:bg-white/5 transition-colors">
                                            <option value="">⚡ Cargar Plantilla...</option>
                                            {Object.entries(INDUSTRY_TEMPLATES).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
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
                                        <span className="animate-pulse">Generando Inteligencia Neural...</span>
                                    ) : (
                                        <>
                                            <span className="text-lg group-hover:rotate-12 transition-transform">✨</span> 
                                            <span className="group-hover:text-brand-gold transition-colors">Autocompletar con IA</span>
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
                                        <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest block mb-2">Precio / Anchor</label>
                                        <input 
                                            type="text" value={current.priceText} onChange={e => handleUpdate('priceText', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-brand-gold outline-none"
                                            placeholder="Desde $500 USD"
                                        />
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
                <div className="lg:col-span-5 space-y-6">
                    
                    {/* PERSONALITY SETTINGS */}
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Ajustes de Personalidad</h3>

                        {/* Archetype Grid */}
                        <div className="grid grid-cols-2 gap-2 mb-8">
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
                        <div className="space-y-6">
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
                    </div>

                    {/* GEMINI PANEL */}
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
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
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-6 shadow-2xl flex items-center justify-between">
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
