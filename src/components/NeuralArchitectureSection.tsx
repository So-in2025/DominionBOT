import React, { useEffect, useState } from 'react';
import { openSupportWhatsApp } from '../utils/textUtils';

const NeuralArchitectureSection = () => {
    // This component is mostly static/promotional but triggers actions
    const handlePlanSelect = (planName: string, price: string) => {
        const message = `Hola, quiero activar el *${planName}* (${price}). \n\nMe gustaría recibir las instrucciones para realizar la transferencia y dar de alta mi nodo.`;
        openSupportWhatsApp(message);
    };

    return (
        <section className="bg-brand-black py-24 relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full bg-noise opacity-5 pointer-events-none"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-gold/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <h2 className="text-base font-black leading-7 text-brand-gold uppercase tracking-[0.3em]">Arquitectura Cognitiva</h2>
                    <p className="mt-4 text-4xl font-black tracking-tighter text-white sm:text-5xl">
                        No todos los bots <br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-500 via-white to-gray-500">piensan igual.</span>
                    </p>
                    <p className="mt-6 text-lg leading-8 text-gray-400">
                        Dominion opera bajo un "Depth Engine" (Motor de Profundidad). Puedes elegir cuánta potencia de cálculo y razonamiento estratégico asignar a tu negocio.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* LEVEL 1: STANDARD */}
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 relative group hover:border-white/20 transition-all duration-300 flex flex-col">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-800 to-gray-600"></div>
                        <div className="flex justify-between items-center mb-6">
                            <span className="bg-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/10">Nivel 3: Standard</span>
                            <span className="bg-brand-gold/10 text-brand-gold text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">PRECIO FUNDADORES</span>
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Protocolo Base</h3>
                        <p className="text-sm text-gray-500 font-medium mb-8 min-h-[60px]">
                            Ideal para atención al cliente y filtrado rápido. Responde dudas, califica leads básicos y mantiene tu WhatsApp 24/7.
                        </p>
                        <ul className="space-y-4 text-sm text-gray-300 mb-8 flex-1">
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                Memoria Corta (15 msgs)
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                Respuestas Inmediatas
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                Tono Profesional
                            </li>
                        </ul>
                        <div className="pt-6 border-t border-white/5 mt-auto">
                             <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider text-center mb-4">Quienes ingresen en esta etapa mantienen este precio mientras su suscripción permanezca activa.</p>
                            <div className="flex justify-between items-end mb-4">
                                <p className="text-3xl font-black text-white">$29<span className="text-sm text-gray-600 font-bold ml-1">/mes</span></p>
                            </div>
                            <button onClick={() => handlePlanSelect('Plan Standard', '$29/mes')} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">Solicitar Alta</button>
                        </div>
                    </div>

                    {/* LEVEL 2: SNIPER (Popular) */}
                    <div className="bg-[#0f0f0f] border border-brand-gold/30 rounded-3xl p-8 relative group hover:border-brand-gold/60 transition-all duration-300 transform md:-translate-y-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-gold-dark to-brand-gold"></div>
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-gold text-black text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1 rounded-full shadow-lg">
                            Más Elegido
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <span className="bg-brand-gold/10 text-brand-gold text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-brand-gold/20">Nivel 7: Sniper</span>
                            <span className="bg-brand-gold text-black text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">PRECIO FUNDADORES</span>
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Modo Estratega</h3>
                        <p className="text-sm text-gray-400 font-medium mb-8 min-h-[60px]">
                            Para ventas consultivas y High-Ticket. Detecta intenciones ocultas, maneja objeciones complejas y usa el Radar 4.0.
                        </p>
                        <ul className="space-y-4 text-sm text-gray-200 mb-8 flex-1">
                            <li className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Memoria Contextual (30+ msgs)
                            </li>
                            <li className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Detección de Micro-lenguaje
                            </li>
                            <li className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                <span className="text-brand-gold font-bold">Radar 4.0 Incluido</span>
                            </li>
                        </ul>
                        <div className="pt-6 border-t border-white/10 mt-auto">
                             <p className="text-[10px] text-brand-gold/70 font-bold uppercase tracking-wider text-center mb-4">Quienes ingresen en esta etapa mantienen este precio mientras su suscripción permanezca activa.</p>
                            <div className="flex justify-between items-end mb-4">
                                <p className="text-3xl font-black text-white">$49<span className="text-sm text-gray-600 font-bold ml-1">/mes</span></p>
                            </div>
                            <button onClick={() => handlePlanSelect('Plan Sniper', '$49/mes')} className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20">Solicitar Alta</button>
                        </div>
                    </div>

                    {/* LEVEL 3: NEURO-BOOST */}
                    <div className="bg-[#0a0a0a] border border-purple-500/30 rounded-3xl p-8 relative group hover:border-purple-500/60 transition-all duration-300 overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-2xl group-hover:bg-purple-600/20 transition-all"></div>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-900 to-purple-600"></div>
                        <div className="flex justify-between items-center mb-6">
                            <span className="bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-purple-500/20">Nivel 10: Neuro-Boost</span>
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Inyección de Potencia</h3>
                        <p className="text-sm text-gray-500 font-medium mb-8 min-h-[60px]">
                            Capacidad cognitiva al máximo. Múltiples pasadas de inferencia para predicción de mercado. Solo disponible por periodos cortos.
                        </p>
                        <ul className="space-y-4 text-sm text-gray-300 mb-8 flex-1">
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Razonamiento Profundo (Chain-of-Thought)
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Predicción de Tendencias
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Ideal para Lanzamientos
                            </li>
                        </ul>
                        <div className="pt-6 border-t border-white/5 mt-auto">
                            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider text-center mb-4">Este es un servicio bajo demanda y no un plan mensual.</p>
                            <div className="flex justify-between items-end mb-4">
                                <p className="text-3xl font-black text-white">$15<span className="text-sm text-gray-600 font-bold ml-1">/48hs</span></p>
                            </div>
                            <button onClick={() => handlePlanSelect('Neuro-Boost', '$15/48hs')} className="w-full py-3 bg-purple-900/40 border border-purple-500/50 text-purple-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all">Activar Boost</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default NeuralArchitectureSection;