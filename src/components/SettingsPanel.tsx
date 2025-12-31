
import React, { useState, useEffect } from 'react';
import { BotSettings, PromptArchetype } from '../types';
import { GoogleGenAI } from "@google/genai";

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

const ARCHETYPE_MAPPING = {
    [PromptArchetype.CONSULTATIVE]: { tone: 4, rhythm: 4, intensity: 2 },
    [PromptArchetype.DIRECT_CLOSER]: { tone: 2, rhythm: 2, intensity: 5 },
    [PromptArchetype.SUPPORT]: { tone: 5, rhythm: 3, intensity: 1 },
    [PromptArchetype.EMPATHIC]: { tone: 5, rhythm: 4, intensity: 2 },
    [PromptArchetype.AGRESSIVE]: { tone: 1, rhythm: 1, intensity: 5 },
    [PromptArchetype.ACADEMIC]: { tone: 5, rhythm: 5, intensity: 1 },
    [PromptArchetype.CUSTOM]: { tone: 3, rhythm: 3, intensity: 3 },
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal }) => {
  const [current, setCurrent] = useState<BotSettings | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); 
  const [newIgnored, setNewIgnored] = useState('');
  const [isGeneratingIA, setIsGeneratingIA] = useState(false);

  useEffect(() => {
    if (settings) {
        // Ensure ignoredJids is always an array
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
      setCurrent({
          ...current,
          archetype: arch,
          toneValue: values.tone,
          rhythmValue: values.rhythm,
          intensityValue: values.intensity
      });
  };

  const handleMagicIA = async () => {
      if (!current?.geminiApiKey || !current?.productName) {
          alert("Ingresa la API Key y el nombre del producto primero en los pasos anteriores.");
          return;
      }
      setIsGeneratingIA(true);
      try {
          const ai = new GoogleGenAI({ apiKey: current.geminiApiKey });
          const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: `Actúa como un experto en ventas High Ticket y copywriting. 
              Redacta una descripción de producto profesional, persuasiva y técnica para: "${current.productName}".
              Enfócate en la transformación que genera el producto. Máximo 150 palabras.
              Responde únicamente con el texto de la descripción, sin introducciones ni saludos.`,
          });
          const text = response.text;
          if (text) {
              setCurrent({ ...current, productDescription: text.trim() });
          }
      } catch (e) {
          console.error(e);
          alert("Fallo en la red neuronal. Verifica que tu API Key de Gemini sea válida.");
      } finally {
          setIsGeneratingIA(false);
      }
  };

  const addIgnored = () => {
      if (!newIgnored.trim() || !current) return;
      const clean = newIgnored.replace(/[^0-9]/g, '');
      if (clean && !current.ignoredJids?.includes(clean)) {
          setCurrent({ ...current, ignoredJids: [...(current.ignoredJids || []), clean] });
      }
      setNewIgnored('');
  };

  const removeIgnored = (num: string) => {
      if(!current) return;
      setCurrent({ ...current, ignoredJids: current.ignoredJids.filter(n => n !== num) });
  };

  if (isLoading || !current) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10">
            <div className="relative w-20 h-20 mb-6 border-4 border-brand-gold/10 rounded-full border-t-brand-gold animate-spin"></div>
            <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Inyectando Conciencia...</p>
        </div>
    );
  }

  const slider = (label: string, id: keyof BotSettings, desc: string) => (
    <div className="mb-8 group">
        <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-black uppercase text-white tracking-widest">{label}</label>
            <span className="text-brand-gold text-[11px] font-bold bg-brand-gold/10 px-3 py-1 rounded-lg border border-brand-gold/20 shadow-lg shadow-brand-gold/5">Nivel {current[id] as number}</span>
        </div>
        <p className="text-[10px] text-gray-400 uppercase font-bold mb-4 tracking-tighter leading-tight">{desc}</p>
        <div className="relative flex items-center">
             <input 
                type="range" min="1" max="5" 
                value={current[id] as number} 
                onChange={(e) => setCurrent({...current, [id]: parseInt(e.target.value)})}
                className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-brand-gold border border-white/5 transition-all hover:bg-white/10"
            />
        </div>
    </div>
  );

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-10 overflow-y-auto h-full custom-scrollbar animate-fade-in font-sans">
      <div className="max-w-6xl mx-auto space-y-10 pb-32">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-8">
            <div>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Cerebro <span className="text-brand-gold">Neural</span></h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Configuración de Red Inferencia v3.2</p>
            </div>
            <button 
                onClick={save}
                className={`px-12 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all duration-500 shadow-2xl ${isSaved ? 'bg-green-600 text-white scale-95' : 'bg-brand-gold text-black hover:scale-105 active:opacity-80'}`}
            >
                {isSaved ? "SINCRONIZACIÓN EXITOSA ✓" : "Sincronizar IA"}
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            
            <div className="space-y-8">
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-8 flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center text-brand-gold text-[11px]">01</span>
                        Personalidad Estratégica
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 mb-10">
                        {Object.values(PromptArchetype).map(arch => (
                            <button 
                                key={arch} type="button"
                                onClick={() => handleArchetypeChange(arch)}
                                className={`p-4 rounded-xl border transition-all text-center group ${current.archetype === arch ? 'bg-brand-gold/10 border-brand-gold text-brand-gold shadow-[0_0_20px_rgba(212,175,55,0.1)]' : 'bg-black/40 border-white/5 text-gray-600 hover:border-brand-gold/30 hover:text-gray-300'}`}
                            >
                                <span className="text-[10px] font-black uppercase tracking-widest block">{arch.replace(/_/g, ' ')}</span>
                            </button>
                        ))}
                    </div>

                    <div className="bg-black/40 p-8 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-black text-brand-gold uppercase tracking-[0.2em] mb-8 border-b border-brand-gold/10 pb-4">Ajustes Manuales de Empatía</h4>
                        {slider("Tono de Voz", "toneValue", "Nivel de respeto, formalidad y cercanía en el trato.")}
                        {slider("Ritmo de Chat", "rhythmValue", "Determina la longitud de párrafos y tiempo de respuesta.")}
                        {slider("Intensidad de Venta", "intensityValue", "Determina el nivel de empuje hacia el enlace de pago.")}
                    </div>
                </section>

                <section className="bg-brand-surface border border-red-500/10 rounded-3xl p-8 shadow-2xl border-l-4 border-l-red-500/30">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2 flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 text-[11px]">SH</span>
                        Escudo de Privacidad
                    </h3>
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-6 tracking-widest leading-relaxed">Ingresa números que el bot ignorará por completo (Familia, Amigos, Socios).</p>
                    <div className="flex gap-2 mb-6">
                        <input 
                            type="text" value={newIgnored} onChange={e => setNewIgnored(e.target.value)}
                            placeholder="Número (ej: 549261...)"
                            className="flex-1 bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs outline-none focus:border-brand-gold font-mono"
                        />
                        <button type="button" onClick={addIgnored} className="px-4 bg-brand-gold text-black rounded-xl font-black text-[10px] uppercase transition-transform active:scale-95">Añadir</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {current.ignoredJids?.map(num => (
                            <div key={num} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg group">
                                <span className="text-[10px] text-gray-400 font-mono group-hover:text-white transition-colors">{num}</span>
                                <button type="button" onClick={() => removeIgnored(num)} className="text-red-500 hover:text-red-400 font-bold ml-1">✕</button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <div className="space-y-8">
                <section className="bg-brand-surface border border-white/5 rounded-[40px] p-0 shadow-2xl overflow-hidden min-h-[650px] flex flex-col relative">
                    <div className="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center backdrop-blur-md">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-brand-gold/20 border border-brand-gold/40 flex items-center justify-center text-brand-gold text-[11px]">02</span>
                            Asistente de Entrenamiento
                        </h3>
                        <div className="flex gap-1.5">
                            {[0, 1, 2, 3].map(s => (
                                <div key={s} className={`w-10 h-1.5 rounded-full transition-all duration-500 ${wizardStep === s ? 'bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]' : (wizardStep > s ? 'bg-brand-gold/40' : 'bg-white/5')}`}></div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-10 flex flex-col justify-center">
                        {wizardStep === 0 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="space-y-3">
                                    <label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">PASO 0: MOTOR NEURAL</label>
                                    <h4 className="text-2xl font-black text-white tracking-tighter">Vincula tu Gemini API Key</h4>
                                    <p className="text-sm text-gray-400 leading-relaxed font-medium">Es el combustible de la inteligencia. Dominion no guarda esta clave de forma externa fuera de tu nodo.</p>
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-gold text-xs underline font-bold uppercase">Obtener clave gratis aquí</a>
                                </div>
                                <input 
                                    type="password"
                                    value={current.geminiApiKey || ''} 
                                    onChange={e => setCurrent({...current, geminiApiKey: e.target.value})} 
                                    className="w-full bg-black/60 border border-white/10 rounded-2xl p-6 text-sm text-brand-gold font-mono focus:border-brand-gold outline-none transition-all placeholder-gray-800" 
                                    placeholder="AIzaSy..." 
                                />
                                <div className="pt-6">
                                    <button onClick={() => setWizardStep(1)} disabled={!current.geminiApiKey} className="w-full py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-20 transition-all border border-white/10">Siguiente Paso &rarr;</button>
                                </div>
                            </div>
                        )}

                        {wizardStep === 1 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="space-y-3">
                                    <label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">PASO 1: IDENTIDAD COMERCIAL</label>
                                    <h4 className="text-2xl font-black text-white tracking-tighter">¿Cómo se llama tu producto?</h4>
                                    <p className="text-sm text-gray-400 leading-relaxed font-medium">Este nombre será usado por la IA para presentarse ante los clientes con autoridad.</p>
                                </div>
                                <input 
                                    value={current.productName} 
                                    onChange={e => setCurrent({...current, productName: e.target.value})} 
                                    className="w-full bg-black/60 border border-white/10 rounded-2xl p-6 text-2xl font-black text-white focus:border-brand-gold outline-none transition-all placeholder-gray-800" 
                                    placeholder="Ej: Dominion Agency" 
                                />
                                <div className="flex gap-4 pt-6">
                                    <button onClick={() => setWizardStep(0)} className="flex-1 py-5 text-gray-500 font-black text-[11px] uppercase tracking-widest hover:text-white transition-colors">Atrás</button>
                                    <button onClick={() => setWizardStep(2)} disabled={!current.productName} className="flex-[2] py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-20 transition-all border border-white/10 shadow-xl">Siguiente &rarr;</button>
                                </div>
                            </div>
                        )}

                        {wizardStep === 2 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">PASO 2: CONOCIMIENTO NEURAL</label>
                                        <button 
                                            onClick={handleMagicIA}
                                            disabled={isGeneratingIA || !current.geminiApiKey}
                                            className={`flex items-center gap-2 px-4 py-2 bg-brand-gold/10 border border-brand-gold/20 rounded-full text-[10px] font-black uppercase text-brand-gold hover:bg-brand-gold hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isGeneratingIA ? 'animate-pulse' : ''}`}
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            {isGeneratingIA ? 'Redactando...' : 'Magia IA'}
                                        </button>
                                    </div>
                                    <h4 className="text-2xl font-black text-white tracking-tighter">Define tu oferta comercial</h4>
                                    <p className="text-sm text-gray-400 leading-relaxed font-medium">Describe qué vendes y cómo resuelves problemas. Usa "Magia IA" si quieres un pitch profesional basado en tu nombre.</p>
                                </div>
                                <textarea 
                                    value={current.productDescription} 
                                    onChange={e => setCurrent({...current, productDescription: e.target.value})} 
                                    className="w-full bg-black/60 border border-white/10 rounded-2xl p-6 text-sm text-gray-300 h-80 resize-none focus:border-brand-gold outline-none transition-all custom-scrollbar leading-relaxed" 
                                    placeholder="Nuestra oferta consiste en... Los beneficios son... Atendemos a..." 
                                />
                                <div className="flex gap-4 pt-6">
                                    <button onClick={() => setWizardStep(1)} className="flex-1 py-5 text-gray-500 font-black text-[11px] uppercase tracking-widest hover:text-white transition-colors">Atrás</button>
                                    <button onClick={() => setWizardStep(3)} disabled={!current.productDescription || current.productDescription.length < 10} className="flex-[2] py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-20 transition-all border border-white/10 shadow-xl">Siguiente &rarr;</button>
                                </div>
                            </div>
                        )}

                        {wizardStep === 3 && (
                            <div className="space-y-10 animate-fade-in">
                                <div className="space-y-3">
                                    <label className="text-[12px] font-black text-brand-gold uppercase tracking-[0.3em]">PASO 3: CIERRE ESTRATÉGICO</label>
                                    <h4 className="text-2xl font-black text-white tracking-tighter">Protocolos de Conversión</h4>
                                    <p className="text-sm text-gray-400 leading-relaxed font-medium">¿Cuál es la inversión y a dónde deben ir los clientes para pagar o agendar?</p>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Inversión / Precio Público</label>
                                        <input value={current.priceText} onChange={e => setCurrent({...current, priceText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-sm focus:border-brand-gold outline-none shadow-inner" placeholder="Ej: $1.000 USD / A convenir" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Enlace de Pago o Agenda (CTA)</label>
                                        <input value={current.ctaLink} onChange={e => setCurrent({...current, ctaLink: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-xs font-mono focus:border-brand-gold outline-none shadow-inner" placeholder="https://calendly.com/..." />
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-6">
                                    <button onClick={() => setWizardStep(2)} className="flex-1 py-5 text-gray-500 font-black text-[11px] uppercase tracking-widest hover:text-white transition-colors">Atrás</button>
                                    <button onClick={() => { setWizardStep(0); save(); }} className="flex-[2] py-5 bg-brand-gold text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-[0_15px_40px_rgba(212,175,55,0.3)] hover:scale-[1.02] transition-all">Desplegar Cerebro</button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
