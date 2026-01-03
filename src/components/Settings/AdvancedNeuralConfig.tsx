
import React, { useState, useEffect } from 'react';
import { NeuralRouterConfig, ContextShard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedNeuralConfigProps {
    initialConfig?: NeuralRouterConfig;
    onChange: (config: NeuralRouterConfig) => void;
    mode?: 'FULL' | 'WIZARD';
}

const AdvancedNeuralConfig: React.FC<AdvancedNeuralConfigProps> = ({ initialConfig, onChange, mode = 'FULL' }) => {
    const [masterIdentity, setMasterIdentity] = useState(initialConfig?.masterIdentity || '');
    const [modules, setModules] = useState<ContextShard[]>(initialConfig?.modules || []);
    const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null); // For accordion logic
    
    useEffect(() => {
        onChange({
            masterIdentity,
            modules
        });
    }, [masterIdentity, modules]);

    const addModule = () => {
        const newId = uuidv4();
        const newModule: ContextShard = {
            id: newId,
            name: 'Nuevo Módulo',
            triggerKeywords: '',
            contextContent: ''
        };
        setModules([...modules, newModule]);
        setExpandedModuleId(newId); // Auto-expand new module
    };

    const updateModule = (id: string, field: keyof ContextShard, value: string) => {
        setModules(modules.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const deleteModule = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(confirm('¿Eliminar este módulo de conocimiento?')) {
            setModules(modules.filter(m => m.id !== id));
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedModuleId(expandedModuleId === id ? null : id);
    };

    const isWizard = mode === 'WIZARD';

    return (
        <div className={`space-y-8 animate-fade-in ${isWizard ? 'w-full' : ''}`}>
            
            {!isWizard && (
                <div className="flex justify-between items-end">
                    <div className="space-y-4">
                        <div className="inline-block p-3 rounded-full bg-brand-gold/10 border border-brand-gold/30">
                            <svg className="w-8 h-8 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 3.86l-.477 2.387c-.037.184.011.373.13.514l1.392 1.624a1 1 0 00.707.362h2.242a2 2 0 001.022-.547l1.022-1.022a2 2 0 00.547-1.022l.477-2.387c.037-.184-.011-.373-.13-.514l-1.392-1.624a1 1 0 00-.707-.362z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Arquitectura Modular</h2>
                            <p className="text-gray-400 text-xs font-medium max-w-lg">
                                Divide y vencerás. Configura un "Nodo Maestro" que derive a "Módulos Expertos".
                            </p>
                        </div>
                    </div>
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
                        className={`w-full ${isWizard ? 'h-32' : 'h-32'} bg-black/50 border border-white/10 rounded-xl p-3 text-white text-xs focus:border-brand-gold outline-none resize-none custom-scrollbar font-mono placeholder-gray-700 leading-relaxed`}
                        placeholder={`Ej: Eres el Asistente Central. Identifica qué necesita el cliente y deriva al módulo correcto.`}
                    />
                </div>
            </div>

            {/* MODULES ACCORDION */}
            <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Módulos de Contexto ({modules.length})</h3>
                    <button 
                        onClick={addModule}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:text-brand-gold"
                    >
                        <span className="text-sm leading-none">+</span> Agregar
                    </button>
                </div>

                {modules.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl bg-white/5">
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Sin módulos definidos.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {modules.map((module) => (
                            <div key={module.id} className={`bg-brand-surface border rounded-xl overflow-hidden transition-all duration-300 ${expandedModuleId === module.id ? 'border-brand-gold/50 shadow-lg shadow-brand-gold/5' : 'border-white/10 hover:border-white/20'}`}>
                                {/* Header / Trigger */}
                                <div 
                                    onClick={() => toggleExpand(module.id)}
                                    className="p-4 flex items-center justify-between cursor-pointer bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${module.name && module.triggerKeywords ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        <div>
                                            <h4 className="text-xs font-black text-white uppercase tracking-wide">{module.name || 'Sin Nombre'}</h4>
                                            <p className="text-[9px] text-gray-500 truncate max-w-[200px] font-mono">{module.triggerKeywords || 'Sin triggers'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={(e) => deleteModule(module.id, e)} 
                                            className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                            title="Eliminar"
                                        >
                                            ✕
                                        </button>
                                        <svg className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${expandedModuleId === module.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>

                                {/* Body */}
                                {expandedModuleId === module.id && (
                                    <div className="p-4 border-t border-white/5 bg-black/20 animate-fade-in">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nombre del Módulo</label>
                                                <input 
                                                    type="text" 
                                                    value={module.name}
                                                    onChange={(e) => updateModule(module.id, 'name', e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-brand-gold font-bold focus:border-brand-gold outline-none"
                                                    placeholder="Ej: Experto en Soporte"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Disparadores (Keywords)</label>
                                                <input 
                                                    type="text" 
                                                    value={module.triggerKeywords}
                                                    onChange={(e) => updateModule(module.id, 'triggerKeywords', e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-brand-gold outline-none"
                                                    placeholder="soporte, ayuda, problema, error..."
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Contexto / Cerebro del Módulo</label>
                                                <textarea 
                                                    value={module.contextContent}
                                                    onChange={(e) => updateModule(module.id, 'contextContent', e.target.value)}
                                                    className="w-full h-40 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-gray-300 focus:border-brand-gold outline-none resize-none custom-scrollbar font-mono"
                                                    placeholder="Instrucciones específicas para este experto..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdvancedNeuralConfig;
