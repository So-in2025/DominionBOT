
import React, { useState, useEffect } from 'react';
import { BotSettings, PromptArchetype } from '../types';
import { BACKEND_URL, getAuthHeaders } from '../config.js';

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto') => void;
}

const DEFAULT_SETTINGS: BotSettings = {
    productName: '',
    productDescription: '',
    priceText: '',
    freeTrialDays: 0,
    ctaLink: '',
    isActive: true,
    disabledMessage: '',
    archetype: PromptArchetype.CONSULTATIVE,
    toneValue: 3,
    rhythmValue: 3,
    intensityValue: 3,
    isWizardCompleted: false,
    pwaEnabled: false,
    pushEnabled: false,
    audioEnabled: false,
    ttsEnabled: false,
    proxyUrl: '' 
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal }) => {
  const [current, setCurrent] = useState<BotSettings>(settings || DEFAULT_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResults, setSimResults] = useState<any[]>([]);

  const token = localStorage.getItem('saas_token');

  useEffect(() => {
    if (settings) setCurrent(settings);
  }, [settings]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (current) {
        onUpdateSettings(current);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const runSimulation = async () => {
      if (!current || !token) return;
      setIsSimulating(true);
      setSimResults([]);
      try {
          // FIX: Uso de BACKEND_URL central
          const res = await fetch(`${BACKEND_URL}/api/settings/simulate`, {
              method: 'POST',
              headers: getAuthHeaders(token),
              body: JSON.stringify(current)
          });
          if (res.ok) {
              setSimResults(await res.json());
          }
      } catch (e) {
          console.error("Error simulando:", e);
      } finally {
          setIsSimulating(false);
      }
  };

  if (isLoading || !current) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10">
            <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-brand-gold/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-brand-gold rounded-full animate-spin"></div>
            </div>
            <p className="text-[10px] font-black text-brand-gold uppercase tracking-[0.4em] animate-pulse">Sincronizando Cerebro Neural...</p>
        </div>
    );
  }

  const slider = (label: string, id: keyof BotSettings, minLabel: string, maxLabel: string, desc: string) => (
    <div className="mb-6 group">
        <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest group-hover:text-brand-gold transition-colors">{label}</label>
            <span className="text-brand-gold text-[10px] font-bold bg-brand-gold/10 px-2 py-0.5 rounded">Lvl {current[id] as number}</span>
        </div>
        <p className="text-[8px] text-gray-600 uppercase font-bold mb-3 tracking-tighter">{desc}</p>
        <input 
            type="range" min="1" max="5" 
            value={current[id] as number} 
            onChange={(e) => setCurrent({...current, [id]: parseInt(e.target.value)})}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-gold"
        />
        <div className="flex justify-between mt-2 text-[8px] text-gray-700 font-bold uppercase tracking-tighter">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
        </div>
    </div>
  );

  const layerHeader = (num: string, title: string, desc: string) => (
    <div className="mb-6">
        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center text-brand-gold text-[11px]">{num}</span>
            {title}
        </h3>
        <p className="text-[9px] text-gray-500 font-bold uppercase mt-2 tracking-widest border-l-2 border-brand-gold/30 pl-3">{desc}</p>
    </div>
  );

  return (
    <div className="flex-1 bg-brand-black p-6 md:p-10 overflow-y-auto h-full custom-scrollbar font-sans animate-fade-in">
      <form onSubmit={save} className="max-w-6xl mx-auto space-y-10 pb-20">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-10">
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <svg className="w-20 h-20 text-brand-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5-10-5zM2 17l10 5 10-5-10-5-10 5z"/></svg>
                    </div>
                    {layerHeader("01", "La Constitución", "Reglas éticas y comportamiento base de la IA.")}
                    <div className="grid grid-cols-2 gap-3 mb-10">
                        {Object.values(PromptArchetype).map(arch => (
                            <button 
                                key={arch} type="button"
                                onClick={() => setCurrent({...current, archetype: arch})}
                                className={`p-4 rounded-xl border transition-all text-center group ${current.archetype === arch ? 'bg-brand-gold/10 border-brand-gold text-brand-gold' : 'bg-black/40 border-white/5 text-gray-600 hover:border-white/20'}`}
                            >
                                <span className="text-[9px] font-black uppercase tracking-widest block">{arch.replace('_', ' ')}</span>
                            </button>
                        ))}
                    </div>

                    {layerHeader("02", "Personalidad", "Ajustes neurales de tono y agresividad comercial.")}
                    {slider("Tono", "toneValue", "Formal", "Cercano", "Impacta en el vocabulario y trato.")}
                    {slider("Ritmo", "rhythmValue", "Breve", "Detallado", "Impacta en la longitud de mensajes.")}
                    {slider("Intensidad", "intensityValue", "Informativo", "Cierre Agresivo", "Impacta en el empuje de ventas.")}
                </section>
                
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl border-l-4 border-l-brand-gold">
                    {layerHeader("05", "Laboratorio de Prompts", "Replay de Seguridad: Prueba cambios sin riesgo.")}
                    <div className="space-y-4">
                        <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                            Ejecuta una simulación contra conversaciones recientes para verificar que la IA responde correctamente.
                        </p>
                        <button 
                            type="button"
                            onClick={runSimulation}
                            disabled={isSimulating}
                            className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${isSimulating ? 'bg-white/5 text-gray-500' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'}`}
                        >
                            {isSimulating ? 'Simulando...' : 'Ejecutar Test de Regresión'}
                        </button>
                        {simResults.length > 0 && (
                            <div className="space-y-3 mt-4 animate-fade-in">
                                {simResults.map((res, i) => (
                                    <div key={i} className="p-3 bg-black/40 border border-white/10 rounded-lg">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-[9px] text-brand-gold font-bold uppercase">{res.leadName}</span>
                                            <span className="text-[9px] text-gray-500 font-mono uppercase">{res.status}</span>
                                        </div>
                                        <div className="space-y-2 text-[10px]">
                                            <p className="text-gray-400 border-l-2 border-white/10 pl-2">"{res.input}"</p>
                                            <p className="text-white border-l-2 border-brand-gold pl-2">{res.output}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <div className="space-y-10">
                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl">
                    {layerHeader("03", "Conocimiento", "Información específica de su producto o servicio.")}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Nombre Comercial</label>
                            <input value={current.productName} onChange={e => setCurrent({...current, productName: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none transition-all font-medium" placeholder="Ej: Dominion Agency" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Pitch de Venta (Contexto IA)</label>
                            <textarea value={current.productDescription} onChange={e => setCurrent({...current, productDescription: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xs h-40 resize-none focus:border-brand-gold outline-none transition-all custom-scrollbar leading-relaxed" placeholder="Describa su oferta detalladamente..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">CTA Link</label>
                                <input value={current.ctaLink} onChange={e => setCurrent({...current, ctaLink: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-[10px] font-mono focus:border-brand-gold outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Precio Base</label>
                                <input value={current.priceText} onChange={e => setCurrent({...current, priceText: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-[10px] font-mono focus:border-brand-gold outline-none" />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-brand-surface border border-white/5 rounded-3xl p-8 shadow-2xl">
                    {layerHeader("04", "Conectividad & Seguridad", "Configuración de red y túneles.")}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Proxy Residencial (Solo Cloud)</label>
                            <input 
                                type="text"
                                value={current.proxyUrl || ''} 
                                onChange={e => setCurrent({...current, proxyUrl: e.target.value})} 
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xs font-mono focus:border-brand-gold outline-none transition-all" 
                                placeholder="http://user:pass@host:port" 
                            />
                            <p className="text-[9px] text-gray-600 leading-relaxed">
                                OPCIONAL: Solo necesario si despliegas en Render/AWS. Si ejecutas en tu PC, deja esto vacío.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <div className="flex justify-center pt-10">
            <button type="submit" className={`px-20 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all duration-500 shadow-2xl ${isSaved ? 'bg-green-600 text-white scale-95' : 'bg-brand-gold text-black hover:scale-105 hover:shadow-brand-gold/20'}`}>
                {isSaved ? "Infraestructura Actualizada" : "Sincronizar Cerebro IA"}
            </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPanel;
