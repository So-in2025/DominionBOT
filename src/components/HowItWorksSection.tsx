import React from 'react';

const HowItWorksSection = () => {
    const pillars = [
        { 
            // FIXED ICON: Chip/Processor (Neural Filter) - Clean CPU icon
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>, 
            title: "Filtro Neural Avanzado", 
            description: "Utilizamos el poder de Google Gemini para decodificar la intención real de tus clientes. No solo respondemos, calificamos oportunidades." 
        },
        { 
            // FIXED ICON: Chemical Flask (Laboratory) - Clean Beaker icon
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 21a1.5 1.5 0 001.5-1.5c0-3.5-3-5-3-5V6a2 2 0 00-2-2h-4a2 2 0 00-2 2v8.5s-3 1.5-3 5a1.5 1.5 0 001.5 1.5h11zM10 7v.01M10 10v.01M10 13v.01" /></svg>, 
            title: "Laboratorio Adversarial", 
            description: "No experimentes con clientes reales. Somete a tu IA a escenarios de estrés y objeciones en un entorno simulado seguro antes del despliegue." 
        },
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>, 
            title: "Motor de Difusión Táctica", 
            description: "Ejecuta campañas programadas a grupos o listas. Nuestra tecnología 'Anti-Ban' utiliza delays heurísticos para escalar tu alcance sin riesgos." 
        },
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>, 
            title: "Soberanía y Seguridad (BYOK)", 
            description: "Opera con tu propia API Key de Google. Tus datos, tus conversaciones y tu inteligencia de negocio son solo tuyos. Siempre." 
        },
        { 
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, 
            title: "Telemetría de Alto Impacto", 
            description: "Accede a un panel con métricas reales de conversión y rendimiento. Mide lo que importa, optimiza para ganar." 
        },
        { 
            // NUEVO PILAR (6): PROTOCOLO SHADOW-MODE
            // GLIFO: Timón / Volante (Control Manual)
            icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
            title: "Protocolo Shadow-Mode", 
            description: "El sistema sabe cuándo callar. Detecta el momento exacto de compra, silencia la IA y cede el control al humano para el cierre final." 
        }
    ];

    return (
        <section className="bg-brand-black py-16 sm:py-24 relative overflow-hidden border-t border-white/5">
            {/* Ambient Light Effect for Mobile Visibility */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-full max-w-4xl opacity-10 pointer-events-none">
                <div className="w-full h-full bg-brand-gold/20 blur-[100px] rounded-full"></div>
            </div>

            <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
                <div className="max-w-2xl mx-auto lg:mx-0">
                    <h2 className="text-lg font-semibold leading-7 text-brand-gold uppercase tracking-widest">El Núcleo Operativo</h2>
                    <p className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">Más que un Bot, una Infraestructura</p>
                    <p className="mt-6 text-xl leading-8 text-gray-300">Dominion no es un chatbot de flujos. Es un sistema de calificación de señales comerciales diseñado para un propósito: la eficiencia.</p>
                </div>
                <div className="max-w-2xl mx-auto mt-16 sm:mt-20 lg:mt-24 lg:max-w-none">
                    <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
                        {pillars.map((pillar) => (
                            <div key={pillar.title} className="flex flex-col group bg-white/5 p-6 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors duration-300 backdrop-blur-sm">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex-none rounded-lg bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-brand-gold shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                                        {pillar.icon}
                                    </div>
                                    {pillar.title}
                                </dt>
                                <dd className="flex flex-auto flex-col text-base leading-7 text-gray-300">
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