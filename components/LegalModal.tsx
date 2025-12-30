
import React from 'react';
import { LEGAL_TEXTS } from '../data/legalText';

// Renderer de Markdown simplificado
const SimpleRenderer: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="space-y-4 text-gray-300 text-sm leading-relaxed">
            {content.split('\n').map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2"></div>;
                
                if (trimmed.startsWith('### ')) {
                    return (
                        <h3 key={i} className="text-white text-base font-bold mt-6 mb-2">
                            {trimmed.replace('### ', '')}
                        </h3>
                    );
                }
                
                if (trimmed.startsWith('* ')) {
                    return (
                        <li key={i} className="ml-5 mb-1 list-disc">
                            {trimmed.replace('* ', '')}
                        </li>
                    );
                }
                
                // Manejo básico de negritas
                const parts = trimmed.split('**');
                return (
                    <p key={i}>
                        {parts.map((part, idx) => 
                            idx % 2 === 1 ? <strong key={idx} className="text-brand-gold font-bold">{part}</strong> : part
                        )}
                    </p>
                );
            })}
        </div>
    );
};

interface LegalModalProps {
    type: 'privacy' | 'terms' | 'manifesto' | null;
    onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
    if (!type) return null;

    const data = LEGAL_TEXTS[type];
    const isManifesto = type === 'manifesto';

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-brand-black/80 backdrop-blur-md animate-fade-in">
            <div className="absolute inset-0" onClick={onClose}></div>
            
            <div className={`relative w-full max-w-2xl max-h-[85vh] bg-brand-surface border rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isManifesto ? 'border-brand-gold' : 'border-white/10'}`}>
                {/* Header */}
                <div className={`px-6 py-5 border-b border-white/10 flex justify-between items-center ${isManifesto ? 'bg-brand-gold/5' : 'bg-black/20'}`}>
                    <div>
                        {isManifesto && <span className="text-[10px] text-brand-gold font-black uppercase tracking-[0.2em] mb-1 block">NUESTRA FILOSOFÍA</span>}
                        <h2 className="text-white text-xl font-black">{data.title}</h2>
                        {!isManifesto && <p className="text-gray-500 text-[10px] mt-1">{(data as any).lastUpdated}</p>}
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl p-2 transition-colors">&times;</button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                    {isManifesto && (
                        <div className="mb-6 p-4 bg-brand-gold/5 border-l-4 border-brand-gold rounded-r-lg">
                            <p className="text-sm italic text-gray-200">
                                "Esto no es un documento legal. Es un acuerdo de caballeros sobre cómo usamos la tecnología."
                            </p>
                        </div>
                    )}
                    <SimpleRenderer content={data.content} />
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10 bg-black/40 text-right">
                    <button 
                        onClick={onClose}
                        className={`px-8 py-2.5 rounded-lg font-black text-sm uppercase tracking-widest transition-all ${isManifesto ? 'bg-brand-gold text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        {isManifesto ? 'Entendido' : 'Cerrar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalModal;
