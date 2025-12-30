
import React from 'react';
import { LEGAL_TEXTS } from '../data/legalText';

// Simple Markdown-ish renderer
const SimpleRenderer: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.6' }}>
            {content.split('\n').map((line, i) => {
                if (line.startsWith('### ')) {
                    return <h3 key={i} style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginTop: '24px', marginBottom: '8px' }}>{line.replace('### ', '')}</h3>;
                }
                if (line.startsWith('* ')) {
                    return <li key={i} style={{ marginLeft: '20px', marginBottom: '4px' }}>{line.replace('* ', '')}</li>;
                }
                if (line.trim() === '') {
                    return <div key={i} style={{ height: '8px' }}></div>;
                }
                // Handle bold text roughly
                const parts = line.split('**');
                return (
                    <p key={i} style={{ marginBottom: '8px' }}>
                        {parts.map((part, idx) => 
                            idx % 2 === 1 ? <strong key={idx} style={{ color: '#D4AF37' }}>{part}</strong> : part
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
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)', backgroundColor: 'rgba(5, 5, 5, 0.8)'
        }}>
            <div style={{ position: 'absolute', inset: 0 }} onClick={onClose}></div>
            
            <div style={{
                position: 'relative',
                width: '90%', maxWidth: '600px', maxHeight: '85vh',
                backgroundColor: '#121212', 
                border: isManifesto ? '1px solid #D4AF37' : '1px solid #333',
                borderRadius: '16px',
                boxShadow: isManifesto ? '0 0 50px rgba(212, 175, 55, 0.15)' : '0 20px 50px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
                animation: 'fade-in 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{ 
                    padding: '24px', borderBottom: '1px solid #222', 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: isManifesto ? 'linear-gradient(180deg, rgba(212,175,55,0.05) 0%, rgba(0,0,0,0) 100%)' : 'transparent'
                }}>
                    <div>
                        {isManifesto && <span style={{ fontSize: '10px', color: '#D4AF37', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px' }}>NUESTRA FILOSOFÍA</span>}
                        <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{data.title}</h2>
                        {!isManifesto && <p style={{ color: '#666', fontSize: '11px', margin: '4px 0 0 0' }}>{(data as any).lastUpdated}</p>}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer' }}>×</button>
                </div>

                {/* Content */}
                <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
                    {isManifesto && (
                        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(212, 175, 55, 0.05)', borderRadius: '8px', borderLeft: '3px solid #D4AF37' }}>
                            <p style={{ fontSize: '13px', fontStyle: 'italic', color: '#e5e7eb' }}>
                                "Esto no es un documento legal. Es un acuerdo de caballeros sobre cómo usamos la tecnología."
                            </p>
                        </div>
                    )}
                    <SimpleRenderer content={data.content} />
                </div>

                {/* Footer */}
                <div style={{ padding: '20px', borderTop: '1px solid #222', textAlign: 'right' }}>
                    <button 
                        onClick={onClose}
                        style={{
                            padding: '10px 24px', borderRadius: '8px', border: 'none',
                            backgroundColor: isManifesto ? '#D4AF37' : '#333',
                            color: isManifesto ? '#000' : '#fff',
                            fontWeight: 'bold', cursor: 'pointer', fontSize: '14px'
                        }}
                    >
                        {isManifesto ? 'Entendido' : 'Cerrar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalModal;
