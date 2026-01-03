
import React, { useState, useEffect } from 'react';
import { BotSettings, PromptArchetype, BrainModule, ModularBrain } from '../types';

interface SettingsPanelProps {
  settings: BotSettings | null;
  isLoading: boolean;
  onUpdateSettings: (newSettings: BotSettings) => void;
  onOpenLegal: (type: 'privacy' | 'terms' | 'manifesto' | 'network') => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ARCHETYPE_NAMES: { [key in PromptArchetype]: string } = {
    [PromptArchetype.CONSULTATIVE]: 'Venta Consultiva',
    [PromptArchetype.DIRECT_CLOSER]: 'Cierre Directo',
    [PromptArchetype.SUPPORT]: 'Soporte Técnico',
    [PromptArchetype.EMPATHIC]: 'Relacional Empático',
    [PromptArchetype.AGRESSIVE]: 'Cierre Agresivo',
    [PromptArchetype.ACADEMIC]: 'Informativo Detallado',
    [PromptArchetype.CUSTOM]: 'Personalizado',
};

const generateUniqueId = () => `mod_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, isLoading, onUpdateSettings, onOpenLegal, showToast }) => {
  const [current, setCurrent] = useState<BotSettings | null>(null);
  
  // Modular Brain State (used only when active)
  const [modules, setModules] = useState<BrainModule[]>([]);
  const [defaultModuleId, setDefaultModuleId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
        setCurrent(settings);
        if (settings.brainArchitecture === 'MODULAR' && typeof settings.productDescription === 'object' && settings.productDescription !== null) {
            const modularBrain = settings.productDescription as ModularBrain;
            setModules(modularBrain.modules || []);
            setDefaultModuleId(modularBrain.defaultModule || '');
        } else {
            setModules([]);
            setDefaultModuleId('');
        }
    }
  }, [settings]);

  const handleFieldUpdate = (field: keyof BotSettings, value: any) => {
    if (!current) return;
    const newSettings = { ...current, [field]: value };
    setCurrent(newSettings);
    onUpdateSettings(newSettings); // Optimistic update for simple fields
  };

  const handleBrainUpdate = (value: string) => {
      if (!current) return;
      setCurrent({ ...current, productDescription: value });
  }

  const handleSaveMonolithicBrain = () => {
    if (!current) return;
    onUpdateSettings(current);
    showToast('Cerebro actualizado.', 'success');
  }

  const handleSaveModularBrain = () => {
    if (!current) return;
    if (modules.length === 0 || !defaultModuleId) {
        showToast('Debes tener al menos un cerebro y seleccionar uno por defecto.', 'error');
        return;
    }

    const newModularBrain: ModularBrain = {
        architecture: 'MODULAR',
        defaultModule: defaultModuleId,
        modules: modules
    };

    const newSettings = { ...current, productDescription: newModularBrain };
    setCurrent(newSettings);
    onUpdateSettings(newSettings);
    showToast('Arquitectura modular guardada.', 'success');
  };

  const handleMigrateToModular = () => {
    if (!current || typeof current.productDescription !== 'string') return;
    
    const confirmation = window.confirm(
        "¿Migrar a la Arquitectura Modular?\n\n" +
        "Tu configuración actual se convertirá en tu primer 'cerebro'. Podrás añadir más contextos para diferentes productos o servicios.\n\n" +
        "Esta acción se puede revertir."
    );
    if (!confirmation) return;
    
    const newModuleId = generateUniqueId();
    const newModularBrain: ModularBrain = {
        architecture: 'MODULAR',
        defaultModule: newModuleId,
        modules: [
            {
                id: newModuleId,
                name: 'Cerebro Principal',
                triggers: 'hola, info, precio, ayuda',
                context: current.productDescription 
            }
        ]
    };

    onUpdateSettings({
        ...current,
        brainArchitecture: 'MODULAR',
        productDescription: newModularBrain
    });

    showToast('¡Arquitectura actualizada! Ahora puedes añadir más cerebros.', 'success');
  };

  const handleDowngradeToMonolithic = () => {
      if (!current || typeof current.productDescription !== 'object' || modules.length === 0) return;
      
      const confirmation = window.confirm(
        "¿Volver a la Arquitectura Simple (Monolítica)?\n\n" +
        "Se usará el contenido de tu 'Cerebro por Defecto' como el único prompt para todo el sistema. Perderás la configuración de los otros cerebros.\n\n" +
        "Esta acción es irreversible."
      );
      if (!confirmation) return;

      const defaultModule = modules.find(m => m.id === defaultModuleId);
      if (!defaultModule) {
          showToast('No se encontró el cerebro por defecto. Por favor, selecciona uno.', 'error');
          return;
      }

      onUpdateSettings({
          ...current,
          brainArchitecture: 'MONOLITHIC',
          productDescription: defaultModule.context
      });
      showToast('Arquitectura simplificada.', 'success');
  }

  if (isLoading || !current) {
    return <div className="p-10 text-center text-gray-500 animate-pulse font-black uppercase tracking-widest">Cargando Núcleo...</div>;
  }

  const isModular = current.brainArchitecture === 'MODULAR';

  return (
    <div className="flex-1 bg-brand-black p-4 md:p-8 overflow-y-auto custom-scrollbar font-sans relative z-10 animate-fade-in">
        <div className="max-w-7xl mx-auto pb-32">
            <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Ajuste Fino ({isModular ? 'Modular' : 'Monolítico'})
                </h2>
                {/* Remove wizard reset button */}
            </div>

            {isModular ? (
                 <div className="bg-brand-surface border border-brand-gold/20 rounded-2xl p-6 mb-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-brand-gold">Modo de Arquitectura Modular</h3>
                            <p className="text-xs text-gray-400 mt-1">Estás usando múltiples cerebros. La IA seleccionará el más adecuado según el mensaje del cliente.</p>
                        </div>
                        <button onClick={handleDowngradeToMonolithic} className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-bold uppercase hover:bg-red-500/20 hover:text-red-400 transition-colors">
                            Volver a Modo Simple
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-white">✨ Potencia tu IA con Arquitectura Modular</h3>
                            <p className="text-xs text-gray-400 mt-1">Crea cerebros separados para diferentes productos, servicios o tipos de consulta.</p>
                        </div>
                        <button onClick={handleMigrateToModular} className="px-4 py-2 bg-brand-gold text-black rounded-lg text-xs font-bold uppercase hover:scale-105 transition-transform">
                            Pasar a Modo Modular
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3">
                    {isModular ? (
                        <>
                            <ModularEditor 
                                modules={modules} 
                                setModules={setModules} 
                                defaultModuleId={defaultModuleId} 
                                setDefaultModuleId={setDefaultModuleId} 
                            />
                            <button onClick={handleSaveModularBrain} className="w-full mt-4 py-3 bg-brand-gold text-black font-black uppercase tracking-widest rounded-xl text-xs hover:scale-[1.01] transition-transform">Guardar Arquitectura</button>
                        </>
                    ) : (
                        <>
                            <label className="text-xs font-bold text-brand-gold uppercase tracking-widest">Cerebro del Sistema (Prompt)</label>
                            <textarea 
                                value={typeof current.productDescription === 'string' ? current.productDescription : ''} 
                                onChange={(e) => handleBrainUpdate(e.target.value)}
                                className="w-full h-[500px] mt-2 bg-black/40 border border-white/10 rounded-xl p-4 text-gray-300 text-sm font-mono leading-relaxed focus:border-brand-gold outline-none custom-scrollbar"
                            />
                            <button onClick={handleSaveMonolithicBrain} className="w-full mt-4 py-3 bg-brand-gold text-black font-black uppercase tracking-widest rounded-xl text-xs hover:scale-[1.01] transition-transform">Sincronizar Cerebro</button>
                        </>
                    )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {/* General settings can be added here */}
                    <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-lg">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Motor IA</h3>
                        <input 
                            type="password" 
                            autoComplete="new-password"
                            value={current.geminiApiKey || ''} 
                            onChange={e => handleFieldUpdate('geminiApiKey', e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs font-mono tracking-widest focus:border-brand-gold outline-none mb-2"
                            placeholder="API KEY DE GEMINI"
                        />
                         <p className="text-[10px] text-gray-500 mt-2">Tu clave es privada y se usa para todas las operaciones de IA.</p>
                    </div>
                     <div className="bg-brand-surface border border-white/5 rounded-2xl p-6 shadow-lg">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Datos del Negocio</h3>
                         <input 
                            value={current.productName} 
                            onChange={e => handleFieldUpdate('productName', e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm mb-4"
                            placeholder="Nombre de tu Negocio"
                        />
                         <input 
                            type="number"
                            value={current.ticketValue} 
                            onChange={e => handleFieldUpdate('ticketValue', parseFloat(e.target.value) || 0)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm"
                            placeholder="Valor Promedio de Venta (USD)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

// --- SUB-COMPONENT: MODULAR EDITOR ---
interface ModularEditorProps {
    modules: BrainModule[];
    setModules: React.Dispatch<React.SetStateAction<BrainModule[]>>;
    defaultModuleId: string;
    setDefaultModuleId: React.Dispatch<React.SetStateAction<string>>;
}

const ModularEditor: React.FC<ModularEditorProps> = ({ modules, setModules, defaultModuleId, setDefaultModuleId }) => {
    const addModule = () => {
        const newModule: BrainModule = { id: generateUniqueId(), name: `Nuevo Cerebro ${modules.length + 1}`, triggers: '', context: '' };
        setModules([...modules, newModule]);
        if (modules.length === 0) setDefaultModuleId(newModule.id);
    };

    const updateModule = (id: string, field: keyof BrainModule, value: string) => {
        setModules(modules.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const deleteModule = (id: string) => {
        if (modules.length <= 1) { alert("No puedes eliminar el último cerebro."); return; }
        if (confirm('¿Eliminar este cerebro?')) {
            const newModules = modules.filter(m => m.id !== id);
            setModules(newModules);
            if (defaultModuleId === id) setDefaultModuleId(newModules[0]?.id || '');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <label className="text-xs font-bold text-brand-gold uppercase tracking-widest">Cerebros del Sistema</label>
                <button onClick={addModule} className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-bold">+ Añadir Cerebro</button>
            </div>
            {modules.map(module => (
                <div key={module.id} className="bg-black/20 border border-white/10 rounded-2xl p-6 space-y-4 animate-fade-in">
                    <div className="flex justify-between items-start">
                        <input value={module.name} onChange={e => updateModule(module.id, 'name', e.target.value)} className="bg-transparent text-white font-bold text-lg outline-none" />
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                <input type="radio" name="default-module" checked={defaultModuleId === module.id} onChange={() => setDefaultModuleId(module.id)} className="accent-brand-gold" /> Por Defecto
                            </label>
                            <button onClick={() => deleteModule(module.id)} className="text-red-500 text-xs font-bold">Eliminar</button>
                        </div>
                    </div>
                     <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Disparadores (triggers)</label>
                        <input value={module.triggers} onChange={e => updateModule(module.id, 'triggers', e.target.value)} className="w-full mt-1 bg-black/40 p-2 rounded text-xs text-gray-300 font-mono" placeholder="Ej: marketing, redes sociales, seo" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contexto (Cerebro)</label>
                        <textarea value={module.context} onChange={e => updateModule(module.id, 'context', e.target.value)} className="w-full mt-1 h-40 bg-black/40 p-3 rounded text-sm text-gray-300 font-mono custom-scrollbar" placeholder="Pega aquí el prompt..." />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SettingsPanel;
