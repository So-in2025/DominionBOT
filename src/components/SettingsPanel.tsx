
import React, { useState, useEffect } from 'react';
import { BotSettings, PromptArchetype, User, NetworkProfile } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { BACKEND_URL, getAuthHeaders } from '../config';
import { audioService } from '../services/audioService';

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto' | 'network') => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// --- MAPPINGS & TEMPLATES ---
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

// Wizard State Interface
interface WizardState {
    mission: string;
    idealCustomer: string;
    detailedDescription: string;
    objections: { id: number; objection: string; response: string }[];
    rules: string;
}

// Utility to parse/stringify the prompt blob
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
  const [step, setStep] = useState(0); // 0: Misión, 1: Arsenal, 2: Playbook
  const [enhancingField, setEnhancingField] = useState<string | null>(null);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

  useEffect(() => {
    if (settings) {
        setCurrent({ ...settings, ignoredJids: settings.ignoredJids || [] });
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
      
      const newSettings = { ...current, productDescription: compiledDescription };
      setCurrent(newSettings);
      onUpdateSettings(newSettings);
      showToast('Cerebro sincronizado.', 'success');
  };

  const enhanceFieldWithAI = async (field: keyof WizardState | 'price' | 'link') => {
      if (!current?.geminiApiKey) {
          showToast('Configura tu API Key primero.', 'error');
          return;
      }
      setEnhancingField(field);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          let prompt = "";
          let context = `Contexto del negocio: ${wizardState.mission} ${wizardState.detailedDescription}`;

          if (field === 'mission') prompt = `Mejora esta misión para un bot de ventas. Hazla clara, persuasiva y orientada a la conversión: "${wizardState.mission}". Responde solo el texto mejorado.`;
          else if (field === 'idealCustomer') prompt = `Describe mejor al cliente ideal basándote en esto: "${wizardState.idealCustomer}". Enfócate en sus dolores y deseos. Responde solo el texto.`;
          else if (field === 'detailedDescription') prompt = `Mejora esta descripción de oferta para que sea irresistible: "${wizardState.detailedDescription}". Usa neuromarketing. Responde solo el texto.`;
          
          if (prompt) {
              const res = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: [{ parts: [{ text: prompt + `\n\nContexto extra: ${context}` }] }]
              });
              const text = res.text?.trim();
              if (text) {
                  setWizardState(prev => ({ ...prev, [field]: text }));
                  showToast('Campo mejorado con IA.', 'success');
              }
          }
      } catch (e) {
          showToast('Error al mejorar con IA.', 'error');
      } finally {
          setEnhancingField(null);
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
          showToast('API Key inválida.', 'error');
          audioService.play('alert_error_apikey');
      } finally {
          setIsSavingApiKey(false);
      }
  };

  if (isLoading || !current) return <div className="p-10 text-center text-gray-500 animate-pulse">Cargando Neuro-Configuración...</div>;

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
        <div className="max-w-7xl mx-auto pb-32">
            
            {/* --- LAYOUT GRID --- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* --- LEFT COLUMN: CALIBRATION WIZARD (7 Cols) --- */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden h-full flex flex-col">
                        
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

                        {/* WIZARD CONTENT - STEP 0: MISSION */}
                        {step === 0 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="space-y-2">
                                    <h4 className="text-lg font-black text-white">Define tu Identidad y Cliente Ideal</h4>
                                    <p className="text-xs text-gray-400 leading-relaxed">La IA necesita saber quién es y para quién trabaja. Esto define el 80% de su éxito.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Misión (SOIN)</label>
                                    <textarea 
                                        value={wizardState.mission} 
                                        onChange={e => setWizardState({...wizardState, mission: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none"
                                        placeholder="Soy el Asistente de [Tu Negocio]. Mi objetivo es..."
                                    />
                                    <button onClick={() => enhanceFieldWithAI('mission')} disabled={!!enhancingField} className="text-[9px] font-bold text-brand-gold hover:text-white flex items-center gap-1">
                                        {enhancingField === 'mission' ? 'Mejorando...' : '✨ Mejorar con IA'}
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Cliente Ideal</label>
                                    <textarea 
                                        value={wizardState.idealCustomer} 
                                        onChange={e => setWizardState({...wizardState, idealCustomer: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none"
                                        placeholder="Dueños de negocio que buscan..."
                                    />
                                    <button onClick={() => enhanceFieldWithAI('idealCustomer')} disabled={!!enhancingField} className="text-[9px] font-bold text-brand-gold hover:text-white flex items-center gap-1">
                                        {enhancingField === 'idealCustomer' ? 'Mejorando...' : '✨ Mejorar con IA'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* WIZARD CONTENT - STEP 1: ARSENAL */}
                        {step === 1 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="space-y-2">
                                    <h4 className="text-lg font-black text-white">Configura tu Oferta</h4>
                                    <p className="text-xs text-gray-400 leading-relaxed">¿Qué vendes exactamente y cuánto cuesta? La IA usará estos datos para cerrar.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Descripción del Servicio</label>
                                    <textarea 
                                        value={wizardState.detailedDescription} 
                                        onChange={e => setWizardState({...wizardState, detailedDescription: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-40 resize-none"
                                        placeholder="Ofrecemos X que logra Y en Z tiempo..."
                                    />
                                    <button onClick={() => enhanceFieldWithAI('detailedDescription')} disabled={!!enhancingField} className="text-[9px] font-bold text-brand-gold hover:text-white flex items-center gap-1">
                                        {enhancingField === 'detailedDescription' ? 'Mejorando...' : '✨ Mejorar con IA'}
                                    </button>
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

                        {/* WIZARD CONTENT - STEP 2: PLAYBOOK */}
                        {step === 2 && (
                            <div className="space-y-6 animate-slide-in-right flex-1">
                                <div className="space-y-2">
                                    <h4 className="text-lg font-black text-white">Reglas de Combate</h4>
                                    <p className="text-xs text-gray-400 leading-relaxed">Instruye a la IA sobre qué hacer y qué NO hacer.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gold uppercase tracking-widest">Reglas de Oro</label>
                                    <textarea 
                                        value={wizardState.rules} 
                                        onChange={e => setWizardState({...wizardState, rules: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none h-32 resize-none"
                                        placeholder="- NO usar emojis.\n- NO dar precios sin calificar antes.\n- SIEMPRE pedir el nombre."
                                    />
                                </div>

                                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Objeciones</label>
                                        <button onClick={() => setWizardState(prev => ({...prev, objections: [...prev.objections, { id: Date.now(), objection: '', response: '' }]}))} className="text-[9px] bg-white/10 px-2 py-1 rounded text-white hover:bg-brand-gold hover:text-black transition-all">+ Agregar</button>
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
                                                    className="bg-transparent text-xs text-white placeholder-gray-600 outline-none"
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
                                <button onClick={() => setStep(step - 1)} className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest">Anterior</button>
                            ) : <div></div>}
                            
                            {step < 2 ? (
                                <button onClick={() => setStep(step + 1)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                                    Siguiente: {step === 0 ? 'Arsenal' : 'Playbook'} &rarr;
                                </button>
                            ) : (
                                <button onClick={saveWizardToSettings} className="px-8 py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-gold/20 hover:scale-105 transition-all">
                                    Sincronizar Cerebro
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
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-6">El motor neural de la IA. <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-brand-gold underline">Obtener Key</a>.</p>
                        
                        <div className="space-y-4">
                            <input 
                                type="password" 
                                value={current.geminiApiKey || ''} 
                                onChange={e => handleUpdate('geminiApiKey', e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xs font-mono tracking-widest focus:border-brand-gold outline-none"
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

                </div>
            </div>

            {/* --- BOTTOM: NETWORK CARD (Preserved) --- */}
            <div className="mt-8 bg-brand-surface border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex justify-between items-center">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-900 to-blue-600"></div>
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Red Dominion</h3>
                    <p className="text-[10px] text-gray-500">Participación en ecosistema colaborativo.</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-bold uppercase ${current.isNetworkEnabled ? 'text-blue-400' : 'text-gray-600'}`}>
                        {current.isNetworkEnabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <button 
                        onClick={() => {
                            const newVal = !current.isNetworkEnabled;
                            handleUpdate('isNetworkEnabled', newVal);
                            onUpdateSettings({...current, isNetworkEnabled: newVal});
                            showToast(`Red ${newVal ? 'Activada' : 'Desactivada'}`, 'info');
                        }} 
                        className={`w-10 h-5 rounded-full relative transition-colors ${current.isNetworkEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${current.isNetworkEnabled ? 'translate-x-6' : 'translate-x-1'}`}></div>
                    </button>
                </div>
            </div>

        </div>
    </div>
  );
};

export default SettingsPanel;
