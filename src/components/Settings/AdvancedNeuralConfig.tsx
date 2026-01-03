
import React, { useState, useEffect } from 'react';
import { NeuralRouterConfig, ContextShard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedNeuralConfigProps {
    initialConfig?: NeuralRouterConfig;
    onChange: (config: NeuralRouterConfig) => void;
}

const AdvancedNeuralConfig: React.FC<AdvancedNeuralConfigProps> = ({ initialConfig, onChange }) => {
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

    return (
        <div className="space-y-12 animate-fade-in">
            {/* Header / Intro */}
            <div className="text-center space-y-4">
                <div className="inline-block p-3 rounded-full bg-brand-gold/10 border border-brand-gold/30">
                    <svg className="w-8 h-8 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Arquitectura Modular</h2>
                <p className="text-gray-400 text-xs font-medium max-w-lg mx-auto">
                    Divide y vencerás. Configura un "Nodo Maestro" que actúe como recepcionista y derive a diferentes "Módulos Expertos" según la intención del cliente.
                </p>
            </div>

            {/* MASTER NODE CONFIG */}
            <div className="bg-[#0a0a0a] border border-brand-gold/30 rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-dark"></div>
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-gold/5 rounded-full blur-[50px] group-hover:bg-brand-gold/10 transition-colors"></div>
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                            Nodo Maestro <span className="px-2 py-0.5 bg-brand-gold text-black rounded text-[9px]">ROUTER</span>
                        </h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Identidad Global y Reglas de Derivación</p>
                    </div>
                </div>

                <div className="space-y-4 relative z-10">
                    <label className="block text-[10px] font-black text-brand-gold uppercase tracking-widest ml-1">Prompt de Identidad Global</label>
                    <textarea 
                        value={masterIdentity}
                        onChange={(e) => setMasterIdentity(e.target.value)}
                        className="w-full h-32 bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none resize-none custom-scrollbar font-mono placeholder-gray-700"
                        placeholder={`Ej: Eres el Asistente Central del Grupo Dominion. Tu trabajo es saludar, identificar qué necesita el cliente y derivar al experto correcto.
- Si preguntan por casas -> Usa el módulo INMOBILIARIA.
- Si preguntan por webs -> Usa el módulo AGENCIA.`}
                    />
                </div>
            </div>

            {/* MODULES GRID */}
            <div className="space-y-6">
                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                    <h3 className="text-xl font-black text-white uppercase tracking-widest">Módulos de Contexto</h3>
                    <button 
                        onClick={addModule}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:text-brand-gold"
                    >
                        <span className="text-lg leading-none">+</span> Agregar Experto
                    </button>
                </div>

                {modules.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-white/10 rounded-3xl bg-white/5">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Sin módulos activos. El bot usará solo el Nodo Maestro.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {modules.map((module) => (
                            <div key={module.id} className="bg-brand-surface border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all group relative flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <input 
                                        type="text" 
                                        value={module.name}
                                        onChange={(e) => updateModule(module.id, 'name', e.target.value)}
                                        className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-brand-gold outline-none text-sm font-black text-white uppercase tracking-wider w-2/3"
                                        placeholder="NOMBRE DEL MÓDULO"
                                    />
                                    <button onClick={() => deleteModule(module.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="space-y-4 flex-1">
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Triggers (Palabras Clave)</label>
                                        <input 
                                            type="text" 
                                            value={module.triggerKeywords}
                                            onChange={(e) => updateModule(module.id, 'triggerKeywords', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-brand-gold focus:border-brand-gold/50 outline-none"
                                            placeholder="ventas, precios, comprar..."
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Contexto Específico</label>
                                        <textarea 
                                            value={module.contextContent}
                                            onChange={(e) => updateModule(module.id, 'contextContent', e.target.value)}
                                            className="w-full h-32 bg-black/40 border border-white/5 rounded-lg p-3 text-xs text-gray-300 focus:border-brand-gold/50 outline-none resize-none custom-scrollbar flex-1"
                                            placeholder="Instrucciones específicas para este experto..."
                                        />
                                    </div>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:via-brand-gold/50 transition-all"></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdvancedNeuralConfig;
