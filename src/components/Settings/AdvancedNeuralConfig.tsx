
import React, { useState, useEffect } from 'react';
import { NeuralRouterConfig, ContextShard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedNeuralConfigProps {
    initialConfig?: NeuralRouterConfig;
    onChange: (config: NeuralRouterConfig) => void;
    mode?: 'FULL' | 'WIZARD'; // NEW PROP
}

const AdvancedNeuralConfig: React.FC<AdvancedNeuralConfigProps> = ({ initialConfig, onChange, mode = 'FULL' }) => {
    const [masterIdentity, setMasterIdentity] = useState(initialConfig?.masterIdentity || '');
    const [modules, setModules] = useState<ContextShard[]>(initialConfig?.modules || []);
    
    // Auto-save effect
    useEffect(() => {
        onChange({
            masterIdentity,
            modules
        });
    }, [masterIdentity, modules]);

    const addModule = () => {
        const newModule: ContextShard = {
            id: uuidv4(),
            name: 'Nuevo Módulo',
            triggerKeywords: '',
            contextContent: ''
        };
        setModules([...modules, newModule]);
    };

    const updateModule = (id: string, field: keyof ContextShard, value: string) => {
        setModules(modules.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const deleteModule = (id: string) => {
        if(confirm('¿Eliminar este módulo de conocimiento?')) {
            setModules(modules.filter(m => m.id !== id));
        }
    };

    const isWizard = mode === 'WIZARD';

    return (
        <div className={`space-y-8 animate-fade-in ${isWizard ? 'w-full' : ''}`}>
            
            {/* Header / Intro - ONLY IN FULL MODE */}
            {!isWizard && (
                <div className="text-center space-y-4">
                    <div className="inline-block p-3 rounded-full bg-brand-gold/10 border border-brand-gold/30">
                        <svg className="w-8 h-8 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Arquitectura Modular</h2>
                    <p className="text-gray-400 text-xs font-medium max-w-lg mx-auto">
                        Divide y vencerás. Configura un "Nodo Maestro" que actúe como recepcionista y derive a diferentes "Módulos Expertos" según la intención del cliente.
                    </p>
                </div>
            )}

            {/* MASTER NODE CONFIG */}
            <div className={`${isWizard ? 'bg-black/40 border-white/10' : 'bg-[#0a0a0a] border-brand-gold/30'} border rounded-3xl p-6 relative overflow-hidden group shadow-lg`}>
                {!isWizard && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark"></div>}
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            Nodo Maestro <span className="px-1.5 py-0.5 bg-brand-gold text-black rounded text-[8px]">ROUTER</span>
                        </h3>
                        {!isWizard && <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Identidad Global y Reglas de Derivación</p>}
                    </div>
                </div>

                <div className="space-y-2 relative z-10">
                    <label className="block text-[9px] font-black text-brand-gold uppercase tracking-widest ml-1">Identidad Global (Prompt)</label>
                    <textarea 
                        value={masterIdentity}
                        onChange={(e) => setMasterIdentity(e.target.value)}
                        className={`w-full ${isWizard ? 'h-24' : 'h-32'} bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs focus:border-brand-gold outline-none resize-none custom-scrollbar font-mono placeholder-gray-700 leading-relaxed`}
                        placeholder={`Ej: Eres el Asistente Central. Identifica qué necesita el cliente:
- Casas -> Módulo INMOBILIARIA.
- Webs -> Módulo AGENCIA.`}
                    />
                </div>
            </div>

            {/* MODULES GRID */}
            <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Módulos de Contexto</h3>
                    <button 
                        onClick={addModule}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:text-brand-gold"
                    >
                        <span className="text-sm leading-none">+</span> Agregar
                    </button>
                </div>

                {modules.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl bg-white/5">
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Sin módulos. (Solo Router)</p>
                    </div>
                ) : (
                    <div className={`grid grid-cols-1 ${isWizard ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-4`}>
                        {modules.map((module) => (
                            <div key={module.id} className="bg-brand-surface border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all group relative flex flex-col">
                                <div className="flex justify-between items-start mb-3">
                                    <input 
                                        type="text" 
                                        value={module.name}
                                        onChange={(e) => updateModule(module.id, 'name', e.target.value)}
                                        className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-brand-gold outline-none text-xs font-black text-white uppercase tracking-wider w-3/4"
                                        placeholder="NOMBRE DEL MÓDULO"
                                    />
                                    <button onClick={() => deleteModule(module.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                                        ✕
                                    </button>
                                </div>

                                <div className="space-y-3 flex-1">
                                    <div>
                                        <label className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Triggers (Palabras Clave)</label>
                                        <input 
                                            type="text" 
                                            value={module.triggerKeywords}
                                            onChange={(e) => updateModule(module.id, 'triggerKeywords', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-brand-gold focus:border-brand-gold/50 outline-none"
                                            placeholder="ventas, precios..."
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Contexto Específico</label>
                                        <textarea 
                                            value={module.contextContent}
                                            onChange={(e) => updateModule(module.id, 'contextContent', e.target.value)}
                                            className="w-full h-20 bg-black/40 border border-white/5 rounded-lg p-2 text-[10px] text-gray-300 focus:border-brand-gold/50 outline-none resize-none custom-scrollbar flex-1"
                                            placeholder="Instrucciones..."
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdvancedNeuralConfig;
