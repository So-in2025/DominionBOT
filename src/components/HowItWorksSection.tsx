
import React from 'react';

const HowItWorksSection = () => {
    const pillars = [
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 19c-3.866 0-7-3.134-7-7s3.134-7 7-7 7 3.134 7 7-3.134 7-7 7zM9 13l2-2 2 2" /></svg>, 
            title: "Filtro Neural Avanzado", 
            description: "Utilizamos el poder de Google Gemini para decodificar la intención real de tus clientes. No solo respondemos, calificamos oportunidades." 
        },
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>, 
            title: "Soberanía y Seguridad (BYOK)", 
            description: "Opera con tu propia API Key de Google. Tus datos, tus conversaciones y tu inteligencia de negocio son solo tuyos. Siempre." 
        },
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, 
            title: "Telemetría de Alto Impacto", 
            description: "Accede a un panel con métricas reales de conversión y rendimiento. Mide lo que importa, optimiza para ganar." 
        }
    ];

    return (
        <section className="bg-brand-black py-16 sm:py-24">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <div className="max-w-2xl mx-auto lg:mx-0">
                    <h2 className="text-base font-semibold leading-7 text-brand-gold uppercase tracking-widest">El Núcleo Operativo</h2>
                    <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Más que un Bot, una Infraestructura</p>
                    <p className="mt-6 text-lg leading-8 text-gray-400">Dominion no es un chatbot de flujos. Es un sistema de calificación de señales comerciales diseñado para un propósito: la eficiencia.</p>
                </div>
                <div className="max-w-2xl mx-auto mt-16 sm:mt-20 lg:mt-24 lg:max-w-none">
                    <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
                        {pillars.map((pillar) => (
                            <div key={pillar.title} className="flex flex-col group">
                                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
                                    <div className="h-12 w-12 flex-none rounded-lg bg-white/5 group-hover:bg-brand-gold/10 border border-white/10 group-hover:border-brand-gold/30 transition-all flex items-center justify-center text-brand-gold">
                                        {pillar.icon}
                                    </div>
                                    {pillar.title}
                                </dt>
                                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-400">
                                    <p className="flex-auto">{pillar.description}</p>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </section>
    );
};

export default HowItWorksSection;
