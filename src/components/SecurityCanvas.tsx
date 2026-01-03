
import React, { useRef, useEffect, useState } from 'react';

// --- SCENE & ENTITY DEFINITIONS ---

interface Scene {
    name: string;
    duration: number;
    text: string;
    textColor: string;
}

const SCENES: Scene[] = [
    { name: 'RoboticPattern', duration: 4000, text: "PATRONES ROBÓTICOS = RIESGO", textColor: '#3B82F6' },
    { name: 'InjectingJitter', duration: 10000, text: "JITTER HUMANO • RITMO ORGÁNICO", textColor: '#D4AF37' },
    { name: 'Governance', duration: 8000, text: "GOBERNANZA ACTIVA • AUTO-PROTECCIÓN", textColor: '#FBBF24' },
    { name: 'StealthMode', duration: 8000, text: "MODO SIGILO ACTIVADO", textColor: '#10B981' },
];

class Particle {
    x: number; y: number;
    vx: number; vy: number;
    radius: number;
    color: string;
    alpha: number;
    initialDelay: number;
    speedFactor: number;
    isFlagged: boolean;
    life: number;

    constructor(x: number, y: number, color: string = 'rgba(255,255,255,0.5)') {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.radius = 1.8 + Math.random() * 1.2;
        this.color = color;
        this.alpha = 0.1;
        this.initialDelay = 0;
        this.speedFactor = 1;
        this.isFlagged = false;
        this.life = 0;
    }
    
    reset(w: number, h: number) {
        this.x = -this.radius;
        this.y = Math.random() * h;
        this.vx = 0;
        this.vy = 0;
        this.alpha = 0.1;
        this.life = 0;
        this.isFlagged = false;
        this.speedFactor = 0.8 + Math.random() * 0.4;
    }

    update() {
        if (this.initialDelay > 0) {
            this.initialDelay--;
            return;
        }
        
        this.x += this.vx;
        this.y += this.vy;
        this.alpha = Math.min(1, this.alpha + 0.05);
        this.life++;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.alpha <= 0.01) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        if (this.isFlagged) {
            ctx.fillStyle = `rgba(239, 68, 68, ${this.alpha * 0.9})`;
            ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = this.color.replace(/,(\d+\.?\d*)\)/, `,${this.alpha * parseFloat(this.color.split(',')[3] || '1')})`);
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

const SecurityCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    
    // Use refs for animation state to avoid stale closures in the single useEffect
    const sceneStateRef = useRef({
        index: 0,
        startTime: Date.now(),
    });
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let w = 0;
        let h = 0;
        let dpr = 1;
        let isIntersecting = false;

        const handleResize = () => {
            w = canvas.offsetWidth;
            h = canvas.offsetHeight;
            dpr = window.devicePixelRatio || 1;
            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width = w * dpr;
                canvas.height = h * dpr;
            }
            // Reset transform on every frame for consistency
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const animate = () => {
            if (!isIntersecting) {
                animationFrameIdRef.current = null;
                return;
            }
            
            handleResize();

            if (w === 0 || h === 0) {
                animationFrameIdRef.current = requestAnimationFrame(animate);
                return;
            }

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, w, h);

            const now = Date.now();
            const scene = SCENES[sceneStateRef.current.index];
            const sceneProgress = Math.min(1, (now - sceneStateRef.current.startTime) / scene.duration);
            
            switch (scene.name) {
                case 'RoboticPattern':
                    if (particlesRef.current.length < 80) {
                         for (let i = particlesRef.current.length; i < 80; i++) {
                            const p = new Particle(0, 0, 'rgba(59, 130, 246, 0.7)');
                            p.reset(w, h);
                            particlesRef.current.push(p);
                        }
                    }
                    if (now % 1000 < 50) {
                        particlesRef.current.forEach(p => {
                            if (p.x < 0 || p.x > w) {
                                p.reset(w, h);
                                p.vx = 2.5;
                            }
                        });
                    }
                    break;

                case 'InjectingJitter':
                    if (particlesRef.current[0]?.initialDelay === 0) {
                        particlesRef.current.forEach(p => {
                            p.initialDelay = Math.random() * 60;
                            p.vx = (1.5 + Math.random() * 2) * p.speedFactor;
                            p.color = `rgba(212, 175, 55, 0.8)`;
                        });
                    }
                    break;

                case 'Governance':
                    const gateX = w * 0.5; // MOVED TO 50%
                    ctx.beginPath();
                    ctx.moveTo(gateX, h * 0.1);
                    ctx.lineTo(gateX, h * 0.9);
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    particlesRef.current.forEach(p => {
                        p.color = `rgba(251, 191, 36, 0.8)`;
                        if (p.x < gateX - 50 && Math.random() < 0.005) p.vx = Math.max(p.vx, 6);
                        if (p.x > gateX - 5 && p.x < gateX + 5) {
                            if (p.vx > 4) {
                                p.isFlagged = true;
                                p.vx *= 0.3;
                            }
                        }
                        if (p.x > gateX + 5) p.isFlagged = false;
                    });
                    break;

                case 'StealthMode':
                    particlesRef.current.forEach(p => {
                        p.color = 'rgba(16, 185, 129, 0.7)';
                        p.vx = (1 + Math.random()) * p.speedFactor;
                    });
                    break;
            }

            particlesRef.current.forEach(p => {
                p.update();
                if (p.x > w + 20 || p.life > 500) p.reset(w, h);
                p.draw(ctx);
            });

            const textFadeIn = Math.min(1, sceneProgress * 4);
            const textFadeOut = Math.max(0, 1 - (sceneProgress - 0.75) * 4);
            const textAlpha = Math.min(textFadeIn, textFadeOut);

            if (textAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = textAlpha;
                
                const isMobile = w < 768;
                const baseFontSize = Math.max(12, Math.min(16, w / 30));
                const textY = isMobile ? h - 28 : h - 40;

                ctx.font = `900 ${baseFontSize}px Inter, sans-serif`;
                ctx.textAlign = "center";
                ctx.letterSpacing = isMobile ? "0.2em" : "0.3em";
                ctx.fillStyle = scene.textColor;
                ctx.shadowColor = scene.textColor;
                ctx.shadowBlur = isMobile ? 6 : 10;
                ctx.fillText(scene.text.toUpperCase(), w / 2, textY);
                ctx.restore();
            }

            if (now - sceneStateRef.current.startTime > scene.duration) {
                const nextIndex = (sceneStateRef.current.index + 1) % SCENES.length;
                if (nextIndex === 0) {
                    particlesRef.current = [];
                } else {
                    particlesRef.current.forEach(p => p.initialDelay = 0);
                }
                sceneStateRef.current.index = nextIndex;
                sceneStateRef.current.startTime = now;
            }

            animationFrameIdRef.current = requestAnimationFrame(animate);
        };

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                if (!isIntersecting) {
                    isIntersecting = true;
                    sceneStateRef.current.startTime = Date.now();
                    if (!animationFrameIdRef.current) {
                        animationFrameIdRef.current = requestAnimationFrame(animate);
                    }
                }
            } else {
                isIntersecting = false;
            }
        }, { threshold: 0.1 });
        
        observer.observe(canvas);

        return () => {
            isIntersecting = false;
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
            observer.disconnect();
        };
    }, []); // Empty dependency array ensures this runs only once.

    return (
        <section className="relative w-full h-64 bg-[#0a0a0a] border-y border-white/5 overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        </section>
    );
};

export default SecurityCanvas;
