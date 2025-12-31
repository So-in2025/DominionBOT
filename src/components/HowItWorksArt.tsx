import React, { useEffect, useRef } from 'react';

// SYSTEM STATE & ENTITY DEFINITIONS
type SystemPhase = 'INGESTION' | 'FILTERING' | 'PRIORITIZATION' | 'GOVERNANCE';
type SignalType = 'NOISE' | 'QUALIFIED';

class Signal {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    alpha: number;
    type: SignalType;
    weight: number;

    constructor(width: number, height: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = (Math.random() - 0.5) * 3;
        this.radius = 1 + Math.random() * 1.5;
        this.alpha = 0.1 + Math.random() * 0.3;
        this.weight = Math.random();
        this.type = this.weight > 0.92 ? 'QUALIFIED' : 'NOISE';
    }

    update(phase: SystemPhase, width: number, height: number) {
        switch (phase) {
            case 'INGESTION':
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
                break;

            case 'FILTERING':
                if (this.type === 'NOISE') {
                    this.alpha -= 0.01;
                    this.radius -= 0.02;
                } else {
                    this.vx *= 0.98;
                    this.vy *= 0.98;
                }
                this.x += this.vx;
                this.y += this.vy;
                break;
            
            case 'PRIORITIZATION':
                if (this.type === 'QUALIFIED') {
                    const targetX = width / 2;
                    this.vx += (targetX - this.x) * 0.0005;
                    this.vy += (height / 2 - this.y) * 0.0005;
                    this.vx *= 0.97;
                    this.vy *= 0.97;
                    this.x += this.vx;
                    this.y += this.vy;
                    if(this.alpha < 1) this.alpha += 0.01;
                }
                break;

            case 'GOVERNANCE':
                 if (this.type === 'QUALIFIED') {
                    this.vx += (width / 2 - this.x) * 0.001;
                    this.vy += (height / 2 - this.y) * 0.001;
                    this.vx *= 0.95; // Stronger damping
                    this.vy *= 0.95;
                    this.x += this.vx;
                    this.y += this.vy;
                }
                break;
        }
        if (this.radius < 0) this.radius = 0;
    }

    draw(ctx: CanvasRenderingContext2D, phase: SystemPhase) {
        if (this.alpha <= 0 || this.radius <= 0) return;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        if (this.type === 'QUALIFIED' && (phase === 'PRIORITIZATION' || phase === 'GOVERNANCE')) {
            ctx.fillStyle = `rgba(212, 175, 55, ${this.alpha * 0.8})`;
            if (phase === 'GOVERNANCE') {
                ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
                ctx.shadowBlur = 4;
            }
        } else {
            ctx.fillStyle = `rgba(130, 130, 130, ${this.alpha})`; // Slightly lighter grey for visibility on surface
        }
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow for next particle
    }
}

const HowItWorksArt: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sectionRef = useRef<HTMLDivElement>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = canvas.offsetWidth;
        let h = canvas.offsetHeight;
        let signals: Signal[] = [];
        let phase: SystemPhase = 'INGESTION';
        let textOpacity = 0;
        let currentText = "";
        let startTime = 0;

        const phaseConfig = {
            'INGESTION': { text: "INGESTANDO SEÑALES", duration: 3000 },
            'FILTERING': { text: "FILTRANDO RUIDO", duration: 3000 },
            'PRIORITIZATION': { text: "PRIORIZANDO DECISIONES", duration: 4000 },
            'GOVERNANCE': { text: "SISTEMA GOBERNADO", duration: 4000 },
        };

        const cycleDuration = Object.values(phaseConfig).reduce((sum, p) => sum + p.duration, 0);

        const init = () => {
            handleResize();
            signals = Array.from({ length: 400 }).map(() => new Signal(w, h));
            startTime = Date.now();
        };

        const animate = () => {
            const elapsed = Date.now() - startTime;

            if (elapsed > cycleDuration) {
                init(); // Reset for loop
            }
            
            const currentPhaseProgress = elapsed % cycleDuration;
            
            let accumulatedTime = 0;
            for (const [phaseKey, config] of Object.entries(phaseConfig)) {
                if (currentPhaseProgress < accumulatedTime + config.duration) {
                    phase = phaseKey as SystemPhase;
                    currentText = config.text;
                    break;
                }
                accumulatedTime += config.duration;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            signals = signals.filter(s => s.alpha > 0 && s.radius > 0);
            if (phase === 'INGESTION' && signals.length < 350) {
                 signals.push(new Signal(w,h)); // Replenish
            }

            signals.forEach(s => {
                s.update(phase, w, h);
                s.draw(ctx, phase);
            });

            const targetOpacity = (phase === 'INGESTION' || signals.length > 0) ? 1 : 0;
            textOpacity += (targetOpacity - textOpacity) * 0.04;
            
            if (textOpacity > 0.01) {
                const isGoverned = phase === 'GOVERNANCE';
                ctx.font = isGoverned ? "900 14px Inter, sans-serif" : "700 12px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.letterSpacing = "0.4em";
                ctx.fillStyle = isGoverned ? `rgba(212, 175, 55, ${textOpacity * 0.9})` : `rgba(160, 160, 160, ${textOpacity * 0.8})`; // Lighter text
                ctx.fillText(currentText, w / 2, h / 2);
                ctx.letterSpacing = "0px";
            }
            
            animationFrameIdRef.current = requestAnimationFrame(animate);
        };
        
        const startAnimation = () => {
            if (!hasStartedRef.current) {
                hasStartedRef.current = true;
                init();
                animate();
            }
        };

        const stopAnimation = () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            hasStartedRef.current = false;
        };

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    startAnimation();
                } else {
                    stopAnimation();
                }
            }, { threshold: 0.1 }
        );

        const handleResize = () => {
            const dpr = window.devicePixelRatio || 1;
            w = canvas.offsetWidth;
            h = canvas.offsetHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);
        };
        
        if (sectionRef.current) observer.observe(sectionRef.current);
        window.addEventListener('resize', handleResize);
        
        return () => {
            stopAnimation();
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    return (
        <section ref={sectionRef} className="relative w-full bg-brand-surface h-44 border-t border-white/10">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </section>
    );
};

export default HowItWorksArt;