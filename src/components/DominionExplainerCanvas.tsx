import React, { useRef, useEffect, useState, useCallback } from 'react';
import { interpolateColor, hexToRgb } from '../utils/colorUtils';

interface Scene {
    name: string;
    duration: number; // in milliseconds
    text: string;
    textColor: string;
    textDuration: number; // Duration for text to fully appear/disappear
    textEasing: (t: number) => number;
    nodeIconType?: NodeIconType; // Optional icon for the main node in the scene
}

// Easing functions for smoother animations
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
const easeOutCirc = (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2));
const easeInQuint = (t: number) => t * t * t * t * t; // For faster text fade-in
const easeOutElastic = (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
        ? 0
        : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};


// NEW: Node Icon Types for visual coherence
enum NodeIconType {
    AI_CORE = 'AI_CORE',
    HUMAN_AGENT = 'HUMAN_AGENT',
    DATA_HUB = 'DATA_HUB',
    FILTER_COLD = 'FILTER_COLD',
    FILTER_WARM = 'FILTER_WARM',
    MESSAGE_INBOX = 'MESSAGE_INBOX', // New icon type
    NONE = 'NONE',
}

const SCENES: Scene[] = [
    // --- 1. INTRO: System Boot Up ---
    { name: 'Intro', duration: 5000, text: "DOMINION: Infraestructura de Inferencia.\nTu inteligencia comercial en piloto automático.", textColor: '#F9DF74', textDuration: 4000, textEasing: easeInOutQuad, nodeIconType: NodeIconType.AI_CORE },
    
    // --- 2. PROBLEM: Missed Opportunities ---
    { name: 'GlitchText', duration: 6500, text: "Cada mensaje, una oportunidad.\nCada silencio, una venta perdida.", textColor: '#D4AF37', textDuration: 5300, textEasing: easeInQuint },

    // --- 3. INGESTION: Real-time Data Stream ---
    { name: 'Ingestion', duration: 7000, text: "INGESTANDO CADA SEÑAL, 24/7.\nDe WhatsApp a Telegram, nada escapa a tu red neuronal.", textColor: '#D4AF37', textDuration: 5500, textEasing: easeInOutQuad, nodeIconType: NodeIconType.MESSAGE_INBOX },

    // --- 4. FILTERING: Noise vs Opportunity ---
    { name: 'Filtering', duration: 7500, text: "FILTRO NEURAL: Separando el 'ruido' de las 'oportunidades' reales con precisión quirúrgica.", textColor: '#D4AF37', textDuration: 6000, textEasing: easeInOutQuad, nodeIconType: NodeIconType.AI_CORE },

    // --- 5. RADAR 4.0: Proactive Discovery ---
    { name: 'Radar', duration: 8000, text: "RADAR 4.0: Cazando oportunidades ocultas en tu mercado.\nDetecta la venta antes de que otros sepan que existe.", textColor: '#D4AF37', textDuration: 6500, textEasing: easeInOutQuad, nodeIconType: NodeIconType.DATA_HUB },

    // --- 6. PREDICTIVE: When to Act ---
    { name: 'Predictive', duration: 6500, text: "PREDICCIÓN TÁCTICA: Cuándo hablar, cuándo callar. Con precisión milimétrica para cada lead.", textColor: '#F9DF74', textDuration: 5000, textEasing: easeInOutQuad, nodeIconType: NodeIconType.AI_CORE },

    // --- 7. SHADOW MODE: Human in the Loop ---
    { name: 'AgentAndShadow', duration: 7500, text: "SHADOW MODE: La IA califica y nutre.\nEl humano cierra. Sin fricción, solo resultados.", textColor: '#D4AF37', textDuration: 6000, textEasing: easeInOutQuad, nodeIconType: NodeIconType.HUMAN_AGENT },

    // --- 8. DEPTH ENGINE: Customizable Intelligence ---
    { name: 'DepthEngine', duration: 6000, text: "DEPTH ENGINE: Tu IA razona.\nEstrategia profunda para tu negocio.", textColor: '#F9DF74', textDuration: 4700, textEasing: easeInOutQuad, nodeIconType: NodeIconType.AI_CORE },

    // --- 9. MICRO-TENSION 2: Data-Driven Impact ---
    { name: 'FlashText', duration: 6500, text: "Decisiones basadas en datos puros.\nElimina la corazonada, maximiza el cierre.", textColor: '#F9DF74', textDuration: 5300, textEasing: easeInQuint },

    // --- 10. FOUNDERS MESSAGE: Subtle Urgency ---
    { name: 'FoundersMessage', duration: 6500, text: "MODO FUNDADORES · SLOTS LIMITADOS\nPrecio Fijo para Siempre.", textColor: '#F9DF74', textDuration: 5300, textEasing: easeInQuint},

    // --- 11. OUTRO: Grand Finale, Brand Statement ---
    { name: 'Outro', duration: 7500, text: "Algunos gestionan WhatsApp. Otros dominan el mercado.\nSé parte de la infraestructura Dominion.", textColor: '#F9DF74', textDuration: 6000, textEasing: easeOutCirc, nodeIconType: NodeIconType.AI_CORE },
];

// --- Particle System Classes ---
class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    alpha: number;
    life: number; // 0-1
    maxLife: number;
    type?: 'HOT' | 'WARM' | 'COLD' | 'NOISE' | 'QUALIFIED' | undefined;
    trail: { x: number; y: number; alpha: number }[]; // For particle trails

    constructor(x: number, y: number, color: string = 'rgba(255,255,255,0.5)', radius: number = 1.5, speed: number = 1) {
        this.x = x;
        this.y = y;
        this.radius = radius * (1.5 + Math.random() * 1.5); // Slightly smaller base radius for more signals
        this.alpha = 0.3 + Math.random() * 0.5; // Slightly lower initial alpha
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        
        this.color = color;
        this.life = 0;
        this.maxLife = 120 + Math.random() * 80; // Slightly longer life
        this.type = undefined;
        this.trail = [];
    }

    reset(x: number, y: number, color: string, radius: number, speed: number) {
        this.x = x;
        this.y = y;
        this.radius = radius * (1.5 + Math.random() * 1.5);
        this.alpha = 0.3 + Math.random() * 0.5;
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        this.color = color;
        this.life = 0;
        this.maxLife = 120 + Math.random() * 80;
        this.type = undefined;
        this.trail = [];
    }

    update() {
        // Update trail
        this.trail.push({ x: this.x, y: this.y, alpha: this.alpha });
        if (this.trail.length > 1 && (this.type === 'HOT' || this.type === 'WARM' || this.type === 'QUALIFIED')) {
            this.trail.shift(); // Keep trail slightly longer for important particles
        } else if (this.trail.length > 5) { // Shorter trail for non-important particles
            this.trail.shift();
        }

        this.x += this.vx;
        this.y += this.vy;
        this.life++;
        this.alpha *= 0.992; // Slightly faster alpha decay for background noise
        this.radius *= 0.995; // Slowly shrink
    }

    draw(ctx: CanvasRenderingContext2D, baseVisualScale: number) {
        if (this.alpha <= 0.03 || this.radius <= 0.2) return; // Increased threshold
        
        // Draw trail
        if (this.trail.length > 1 && (this.type === 'HOT' || this.type === 'WARM' || this.type === 'QUALIFIED')) {
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.strokeStyle = this.color.replace(/,(\d+\.?\d*)\)/, `,${this.alpha * 0.25})`);
            ctx.lineWidth = this.radius * 0.4 * baseVisualScale;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color.replace(/,(\d+\.?\d*)\)/, `,${this.alpha * parseFloat(this.color.split(',')[3] || '1')})`);
        ctx.fill();
    }
}

class Node {
    x: number;
    y: number;
    radius: number;
    color: string;
    alpha: number; // Base alpha for the node
    pulse: number; // 0-1 for pulsating effect
    targetColorRgb: { r: number; g: number; b: number } | null;
    initialRadius: number; // Store initial radius for resetting
    iconType: NodeIconType; // NEW: Icon type for the node

    constructor(x: number, y: number, radius: number, color: string = '#D4AF37', iconType: NodeIconType = NodeIconType.NONE) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.initialRadius = radius;
        this.color = color;
        this.alpha = 0.3; // Much lower base alpha (70% transparent)
        this.pulse = 0;
        this.targetColorRgb = hexToRgb(color);
        this.iconType = iconType;
    }

    reset(x: number, y: number, radius: number, color: string, iconType: NodeIconType) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.initialRadius = radius;
        this.color = color;
        this.alpha = 0.3; // Reset to 0.3
        this.pulse = 0;
        this.targetColorRgb = hexToRgb(color);
        this.iconType = iconType;
    }

    update() {
        this.pulse = (Math.sin(Date.now() / 70) + 1) / 2; // Slightly faster pulse
    }

    draw(ctx: CanvasRenderingContext2D, baseVisualScale: number, drawNodeIcon: (ctx: CanvasRenderingContext2D, type: NodeIconType, x: number, y: number, size: number, color: string, scale: number) => void) {
        if (!this.targetColorRgb) {
            this.targetColorRgb = hexToRgb(this.color);
            if (!this.targetColorRgb) return;
        }

        const baseColorRgb = this.targetColorRgb;
        const currentRadius = this.radius * baseVisualScale;

        // Outer glow: Drastically reduced intensity of shadowBlur and pulse effect
        ctx.save();
        ctx.beginPath();
        // Reduced pulse amplitude for glow size (0.03 instead of 0.05)
        ctx.arc(this.x, this.y, currentRadius * (1 + this.pulse * 0.03), 0, Math.PI * 2); 
        // Reduced alpha and pulse on alpha for the shadow color (0.08 instead of 0.3, 0.03 instead of 0.05)
        ctx.shadowColor = `rgba(${baseColorRgb.r},${baseColorRgb.g},${baseColorRgb.b}, ${0.08 + this.pulse * 0.03})`; 
        // Much smaller base blur, and less affected by pulse (0.2 instead of 0.4, 0.05 instead of 0.1)
        ctx.shadowBlur = currentRadius * 0.2 * (1 + this.pulse * 0.05); 
        ctx.fillStyle = `rgba(${baseColorRgb.r},${baseColorRgb.g},${baseColorRgb.b}, ${this.alpha})`;
        ctx.fill();
        ctx.restore();

        // Inner core
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseColorRgb.r},${baseColorRgb.g},${baseColorRgb.b}, ${this.alpha * 1.2})`;
        ctx.fill();

        if (this.iconType !== NodeIconType.NONE) {
            drawNodeIcon(ctx, this.iconType, this.x, this.y, currentRadius * 0.8, 'rgba(0,0,0,0.8)', baseVisualScale);
        }
    }
}

class Connection {
    nodeA: Node;
    nodeB: Node;
    alpha: number;
    strength: number; // 0-1
    flicker: number; // 0-1 for dynamic alpha

    constructor(nodeA: Node, nodeB: Node, strength: number = 0.5) {
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.alpha = 0.1;
        this.strength = strength;
        this.flicker = Math.random();
    }

    reset(nodeA: Node, nodeB: Node, strength: number) {
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.alpha = 0.1;
        this.strength = strength;
        this.flicker = Math.random();
    }

    update() {
        this.alpha = Math.min(1, this.alpha + 0.03); // Fade in faster
        this.flicker = Math.max(0, this.flicker - 0.04 + Math.random() * 0.08); // Dynamic flicker
    }

    draw(ctx: CanvasRenderingContext2D, baseVisualScale: number) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this.nodeA.x, this.nodeA.y);
        ctx.lineTo(this.nodeB.x, this.nodeB.y);
        ctx.strokeStyle = `rgba(255,255,255,${this.alpha * this.strength * (0.6 + this.flicker * 0.4)})`;
        ctx.lineWidth = (1 + this.strength * 2.5) * baseVisualScale; // Slightly thicker
        ctx.stroke();
        ctx.restore();
    }
}

type SceneEntities = {
    particles: Particle[];
    nodes: Node[];
    connections: Connection[];
};

const DominionExplainerCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
    const [sceneStartTime, setSceneStartTime] = useState(Date.now());
    const [currentSceneText, setCurrentSceneText] = useState('');
    const [currentSceneTextColor, setCurrentSceneTextColor] = useState('#D4AF37');
    const [textAlpha, setTextAlpha] = useState(0);

    const sceneEntitiesRef = useRef<Map<string, SceneEntities>>(new Map());
    const iconPaths = useRef<Map<NodeIconType, Path2D>>(new Map());

    const drawNodeIcon = useCallback((ctx: CanvasRenderingContext2D, type: NodeIconType, x: number, y: number, size: number, color: string, scale: number) => {
        const lw = 2 / scale; // Slightly bolder line width
        if (!iconPaths.current.has(type)) {
            const path = new Path2D();
            const hs = size / 2; // Half size for easier positioning

            switch (type) {
                case NodeIconType.AI_CORE:
                    // Abstract Brain/Processor
                    path.moveTo(0.2 * hs, -hs); path.lineTo(-0.2 * hs, -hs);
                    path.lineTo(-0.7 * hs, -0.4 * hs); path.lineTo(-0.7 * hs, 0.4 * hs);
                    path.lineTo(-0.2 * hs, hs); path.lineTo(0.2 * hs, hs);
                    path.lineTo(0.7 * hs, 0.4 * hs); path.lineTo(0.7 * hs, -0.4 * hs);
                    path.closePath();
                    // Inner lines
                    path.moveTo(-0.4 * hs, -0.6 * hs); path.lineTo(0.4 * hs, -0.6 * hs);
                    path.moveTo(-0.4 * hs, 0); path.lineTo(0.4 * hs, 0);
                    path.moveTo(-0.4 * hs, 0.6 * hs); path.lineTo(0.4 * hs, 0.6 * hs);
                    break;
                case NodeIconType.HUMAN_AGENT:
                    // Simple Human Silhouette
                    path.arc(0, -0.3 * hs, 0.25 * hs, 0, Math.PI * 2); // Head
                    path.moveTo(0, -0.05 * hs); path.lineTo(0, 0.4 * hs); // Body
                    path.moveTo(-0.25 * hs, 0.15 * hs); path.lineTo(0.25 * hs, 0.15 * hs); // Arms
                    path.moveTo(-0.15 * hs, 0.4 * hs); path.lineTo(-0.25 * hs, 0.6 * hs); // Legs
                    path.moveTo(0.15 * hs, 0.4 * hs); path.lineTo(0.25 * hs, 0.6 * hs);
                    break;
                case NodeIconType.DATA_HUB:
                    // Concentric circles with a central dot
                    path.arc(0, 0, hs * 0.8, 0, Math.PI * 2);
                    path.arc(0, 0, hs * 0.5, 0, Math.PI * 2);
                    path.moveTo(hs * 0.1, 0); path.arc(0, 0, hs * 0.1, 0, Math.PI * 2);
                    break;
                case NodeIconType.FILTER_COLD:
                    // Funnel shape (cold/blue)
                    path.moveTo(-hs * 0.7, -hs * 0.7); path.lineTo(hs * 0.7, -hs * 0.7);
                    path.lineTo(hs * 0.2, hs * 0.7); path.lineTo(-hs * 0.2, hs * 0.7);
                    path.closePath();
                    break;
                case NodeIconType.FILTER_WARM:
                    // Funnel shape (warm/orange)
                    path.moveTo(-hs * 0.7, -hs * 0.7); path.lineTo(hs * 0.7, -hs * 0.7);
                    path.lineTo(hs * 0.2, hs * 0.7); path.lineTo(-hs * 0.2, hs * 0.7);
                    path.closePath();
                    break;
                case NodeIconType.MESSAGE_INBOX:
                    // Redesigned to be more like a chat bubble (WhatsApp/Telegram style)
                    const bubbleWidth = hs * 1.5;
                    const bubbleHeight = hs * 1.2;
                    const bubbleRadius = hs * 0.3;
                    
                    // Main bubble shape (rounded rectangle)
                    path.moveTo(-bubbleWidth / 2 + bubbleRadius, -bubbleHeight / 2);
                    path.arcTo(bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth / 2, bubbleHeight / 2, bubbleRadius);
                    path.arcTo(bubbleWidth / 2, bubbleHeight / 2, -bubbleWidth / 2, bubbleHeight / 2, bubbleRadius);
                    path.arcTo(-bubbleWidth / 2, bubbleHeight / 2, -bubbleWidth / 2, -bubbleHeight / 2, bubbleRadius);
                    path.arcTo(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth / 2, -bubbleHeight / 2, bubbleRadius);
                    path.closePath();

                    // Optional: Small triangle for chat bubble tail (simplified)
                    const tailSize = hs * 0.3;
                    path.moveTo(bubbleWidth / 2 - tailSize, bubbleHeight / 2 - hs * 0.1);
                    path.lineTo(bubbleWidth / 2 + hs * 0.1, bubbleHeight / 2 + tailSize);
                    path.lineTo(bubbleWidth / 2 - hs * 0.1, bubbleHeight / 2 + tailSize);
                    path.closePath();
                    break;
            }
            iconPaths.current.set(type, path);
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke(iconPaths.current.get(type)!);
        ctx.restore();
    }, []);

    const getSceneEntities = useCallback((sceneName: string): SceneEntities => {
        if (!sceneEntitiesRef.current.has(sceneName)) {
            sceneEntitiesRef.current.set(sceneName, {
                particles: [],
                nodes: [],
                connections: [],
            });
        }
        return sceneEntitiesRef.current.get(sceneName)!;
    }, []);

    const spawnParticles = useCallback((
        particlesArray: Particle[],
        x: number,
        y: number,
        count: number,
        color: string,
        speed: number,
        baseVisualScale: number,
        type?: 'HOT' | 'WARM' | 'COLD' | 'NOISE' | 'QUALIFIED'
    ) => {
        for (let i = 0; i < count; i++) {
            const newParticle = new Particle(x, y, color, 1.5 * baseVisualScale, speed * baseVisualScale);
            if (type) newParticle.type = type;
            particlesArray.push(newParticle);
        }
    }, []);

    // NEW: Word wrapping utility function
    const wrapText = useCallback((ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
        const lines: string[] = [];
        const words = text.split(' ');
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + ' ' + word;
            if (ctx.measureText(testLine).width < maxWidth) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine); // Add the last line
        return lines;
    }, []);

    const drawTextWithEffects = useCallback((
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        color: string,
        alpha: number,
        scale: number,
        blur: number,
        baseVisualScale: number,
        glitchOffset: { x: number; y: number } = { x: 0, y: 0 },
        brightness: number = 1,
        isMobile: boolean,
        canvasCssWidth: number // NEW: Pass the CSS width of the canvas
    ) => {
        if (alpha <= 0.01 || !text) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        
        let filters = [];
        // Max blur drastically reduced for better readability
        if (blur > 0.1) filters.push(`blur(${Math.min(blur, 2 * baseVisualScale)}px)`); // Even more reduced max blur
        if (brightness !== 1) filters.push(`brightness(${brightness}%)`);
        
        ctx.filter = filters.join(' ');
        if(filters.length === 0) ctx.filter = 'none';

        ctx.translate(x + glitchOffset.x, y + glitchOffset.y);
        ctx.scale(scale, scale);

        // Adjust base font size for mobile
        const baseFontSize = isMobile ? 28 : 48; // Smaller base font for mobile
        ctx.font = `900 ${baseFontSize * baseVisualScale}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        // Enhanced shadowBlur for more vibrant text.
        ctx.shadowBlur = alpha * (28 * baseVisualScale); 
        
        // Handle multiline text with word wrapping
        const rawLines = text.split('\n');
        const wrappedLines: string[] = [];
        // Use the passed canvasCssWidth for max width calculation.
        // Apply 90% width for mobile, 85% for desktop.
        const maxWidth = canvasCssWidth * (isMobile ? 0.9 : 0.85);

        for (const line of rawLines) {
            wrappedLines.push(...wrapText(ctx, line, maxWidth));
        }

        const lineHeight = baseFontSize * baseVisualScale * 1.2; // 1.2 is a good line spacing factor
        const totalTextHeight = wrappedLines.length * lineHeight;
        let currentY = -totalTextHeight / 2 + lineHeight / 2; // Start from top of first line

        for (const line of wrappedLines) {
            ctx.fillText(line, 0, currentY);
            currentY += lineHeight;
        }

        ctx.restore();
    }, [wrapText]);


    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            animationFrameIdRef.current = requestAnimationFrame(animate);
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            animationFrameIdRef.current = requestAnimationFrame(animate);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.offsetWidth; // Get CSS pixel width
        const h = canvas.offsetHeight; // Get CSS pixel height

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const now = Date.now();
        const scene = SCENES[currentSceneIndex];
        // const sceneProgress = Math.min(1, (now - sceneStartTime) / scene.duration); // Scene progress is not directly used for drawing now

        const REFERENCE_HEIGHT = 700;
        const baseVisualScale = h / REFERENCE_HEIGHT; // Use h for scaling

        const isMobile = window.innerWidth < 768; // Detect mobile for responsive text
        const mobileSpawnFactor = isMobile ? 0.6 : 1; // More aggressive throttle for mobile particles

        const { particles, nodes, connections } = getSceneEntities(scene.name);

        setCurrentSceneText(scene.text);
        setCurrentSceneTextColor(scene.textColor);
        
        const textProgress = Math.min(1, (now - sceneStartTime) / scene.textDuration);
        const fadeInFactor = scene.textEasing(textProgress);

        // Text stays fully visible for 85% of its designated `textDuration` before fading out
        const visibleDurationRatio = 0.85; 
        const fadeOutStart = scene.textDuration * visibleDurationRatio;
        const fadeOutProgress = Math.max(0, (now - sceneStartTime - fadeOutStart) / (scene.textDuration * (1 - visibleDurationRatio)));
        const fadeOutFactor = 1 - easeInQuint(Math.min(1, fadeOutProgress));
        setTextAlpha(Math.max(0, Math.min(fadeInFactor, fadeOutFactor)));

        switch (scene.name) {
            case 'Intro':
                if (nodes.length === 0) {
                    nodes.push(new Node(w / 2, h / 2, 20, '#D4AF37', scene.nodeIconType));
                    for(let i=0; i<8; i++) {
                        const angle = i * (Math.PI * 2 / 8);
                        const px = w / 2 + Math.cos(angle) * (150 * baseVisualScale);
                        const py = h / 2 + Math.sin(angle) * (150 * baseVisualScale);
                        nodes.push(new Node(px, py, 5, 'rgba(200,200,200,0.6)'));
                        connections.push(new Connection(nodes[0], nodes[i+1], 0.1));
                    }
                }
                nodes.forEach(node => node.update());
                connections.forEach(conn => { conn.update(); conn.draw(ctx, baseVisualScale); });
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));
                
                if (Math.random() < (1.5 * mobileSpawnFactor)) {
                    spawnParticles(particles, w / 2, h / 2, 3, 'rgba(212,175,55,0.7)', 7, baseVisualScale);
                }
                particles.forEach(p => {
                    p.update();
                    const dx = p.x - w / 2;
                    const dy = p.y - h / 2;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    p.vx += (dx / dist) * 0.25 * baseVisualScale;
                    p.vy += (dy / dist) * 0.25 * baseVisualScale;
                    p.radius += 0.1 * baseVisualScale;
                    p.draw(ctx, baseVisualScale);
                });
                break;

            case 'GlitchText': {
                if (Math.random() < (1 * mobileSpawnFactor)) spawnParticles(particles, Math.random() * w, Math.random() * h, 1, 'rgba(255,255,255,0.08)', 0.7, baseVisualScale);
                particles.forEach(p => p.update());
                particles.forEach(p => p.draw(ctx, baseVisualScale));

                // Glitch amount and blur further reduced for readability
                const glitchAmount = (1 - textAlpha) * 5 * baseVisualScale; 
                const glitchOffset = {
                    x: (Math.random() - 0.5) * glitchAmount * 0.2, 
                    y: (Math.random() - 0.5) * glitchAmount * 0.2
                };

                ctx.save();
                ctx.filter = `hue-rotate(${Math.random() * glitchAmount * 1}deg) blur(${glitchAmount * 0.1}px)`; 
                drawTextWithEffects(
                    ctx,
                    currentSceneText,
                    w / 2,
                    h / 2, // Centered vertically
                    currentSceneTextColor,
                    textAlpha,
                    1 + (1 - textAlpha) * 0.05, // Subtle scale
                    glitchAmount * 0.1, 
                    baseVisualScale,
                    glitchOffset,
                    100,
                    isMobile,
                    w // Pass w here
                );
                ctx.restore();
                break;
            }

            case 'Ingestion':
                if (nodes.length === 0) {
                    nodes.push(new Node(w / 2, h / 2, 25, '#D4AF37', scene.nodeIconType)); // Central node now MESSAGE_INBOX
                }
                nodes.forEach(node => node.update());
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                // Particles simulating incoming messages from all edges
                if (Math.random() < (5 * mobileSpawnFactor)) { // High density, frequent spawns
                    const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
                    let spawnX, spawnY, initialVx, initialVy;

                    const edgeOffset = 50 * baseVisualScale; // Spawn slightly outside canvas
                    const targetX = nodes[0].x;
                    const targetY = nodes[0].y;
                    const randomOffset = (Math.random() - 0.5) * (100 * baseVisualScale);

                    switch(edge) {
                        case 0: // Top
                            spawnX = Math.random() * w;
                            spawnY = -edgeOffset;
                            initialVx = (targetX - spawnX) * 0.005;
                            initialVy = (targetY - spawnY) * 0.005 + Math.random() * (1 * baseVisualScale);
                            break;
                        case 1: // Right
                            spawnX = w + edgeOffset;
                            spawnY = Math.random() * h;
                            initialVx = (targetX - spawnX) * 0.005 - Math.random() * (1 * baseVisualScale);
                            initialVy = (targetY - spawnY) * 0.005;
                            break;
                        case 2: // Bottom
                            spawnX = Math.random() * w;
                            spawnY = h + edgeOffset;
                            initialVx = (targetX - spawnX) * 0.005;
                            initialVy = (targetY - spawnY) * 0.005 - Math.random() * (1 * baseVisualScale);
                            break;
                        case 3: // Left
                            spawnX = -edgeOffset;
                            spawnY = Math.random() * h;
                            initialVx = (targetX - spawnX) * 0.005 + Math.random() * (1 * baseVisualScale);
                            initialVy = (targetY - spawnY) * 0.005;
                            break;
                        default: // Fallback to center
                            spawnX = Math.random() * w;
                            spawnY = Math.random() * h;
                            initialVx = (targetX - spawnX) * 0.005;
                            initialVy = (targetY - spawnY) * 0.005;
                    }
                    // Spawn with initial velocity towards center node
                    spawnParticles(particles, spawnX, spawnY, 1, 'rgba(180,180,180,0.6)', 3, baseVisualScale, 'NOISE');
                }
                
                particles.forEach(p => {
                    p.update();
                    // Particles are drawn towards the central node
                    p.vx += (nodes[0].x - p.x) * 0.008 * baseVisualScale;
                    p.vy += (nodes[0].y - p.y) * 0.008 * baseVisualScale;
                    p.alpha = Math.min(p.alpha, 0.2 + (1 - p.life / p.maxLife) * 0.6); 
                    p.draw(ctx, baseVisualScale);
                });
                break;
            
            case 'Filtering':
                if (nodes.length === 0) {
                    nodes.push(new Node(w * 0.25, h / 2, 20, '#D4AF37', NodeIconType.AI_CORE)); // Input
                    nodes.push(new Node(w * 0.75, h * 0.3, 10, 'rgba(59,130,246,0.5)', NodeIconType.FILTER_COLD)); // Noise filter (Blue)
                    nodes.push(new Node(w * 0.75, h * 0.7, 12, 'rgba(212,175,55,0.8)', NodeIconType.FILTER_WARM)); // Opportunity filter (Gold)
                    connections.push(new Connection(nodes[0], nodes[1], 0.2));
                    connections.push(new Connection(nodes[0], nodes[2], 0.3));
                }
                nodes.forEach(node => node.update());
                connections.forEach(conn => { conn.update(); conn.draw(ctx, baseVisualScale); });
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                // Particles flow from AI_CORE and split to filters
                if (Math.random() < (2.5 * mobileSpawnFactor)) spawnParticles(particles, nodes[0].x, nodes[0].y, 2, 'rgba(255,255,255,0.7)', 4, baseVisualScale);

                particles.forEach(p => {
                    p.update();
                    if (p.type === undefined) {
                        const rand = Math.random();
                        if (rand < 0.3) { p.type = 'QUALIFIED'; p.color = 'rgba(255, 193, 7, 0.9)'; p.maxLife = 300; p.radius = 4 * baseVisualScale; } // Brighter Gold/Yellow
                        else { p.type = 'NOISE'; p.color = 'rgba(100,100,100,0.5)'; p.maxLife = 100; p.radius = 2 * baseVisualScale; }
                    }

                    if (p.type === 'QUALIFIED') {
                        p.vx += (nodes[2].x - p.x) * 0.018 * baseVisualScale; // Stronger pull to opportunity filter
                        p.vy += (nodes[2].y - p.y) * 0.018 * baseVisualScale;
                        ctx.save();
                        ctx.shadowColor = 'rgba(255, 193, 7, 0.8)'; // Matching shadow
                        ctx.shadowBlur = 12 * baseVisualScale;
                        p.draw(ctx, baseVisualScale);
                        ctx.restore();
                    } else if (p.type === 'NOISE') {
                        p.vx += (nodes[1].x - p.x) * 0.018 * baseVisualScale; // Stronger pull to noise filter
                        p.vy += (nodes[1].y - p.y) * 0.018 * baseVisualScale;
                        p.alpha *= 0.93; // Noise fades faster
                        p.draw(ctx, baseVisualScale);
                    }
                });
                break;

            case 'Radar':
                if (nodes.length === 0 || nodes[0].iconType !== scene.nodeIconType) {
                    nodes.splice(0, nodes.length);
                    connections.splice(0, connections.length);
                    nodes.push(new Node(w / 2, h / 2, 25, '#D4AF37', scene.nodeIconType)); // Central Radar Core
                    for(let i=0; i<6; i++) {
                        for(let j=0; j<4; j++) {
                            const px = (w / 6) * i + (w / 12);
                            const py = (h / 4) * j + (h / 8);
                            nodes.push(new Node(px, py, 3, 'rgba(100,100,100,0.2)'));
                        }
                    }
                }
                nodes.forEach(node => node.update());
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                const sweepAngle = (now / 1000) % (Math.PI * 2); // Even faster sweep
                ctx.save();
                ctx.translate(w / 2, h / 2);
                ctx.rotate(sweepAngle);
                
                const sweepRadius = Math.max(w, h) / 2;
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, sweepRadius);
                gradient.addColorStop(0, 'rgba(212, 175, 55, 0.1)');
                gradient.addColorStop(0.3, 'rgba(212, 175, 55, 0.8)');
                gradient.addColorStop(0.7, 'rgba(212, 175, 55, 0.4)');
                gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, sweepRadius, -Math.PI / 7, Math.PI / 7);
                ctx.lineTo(0, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                if (Math.random() < (4 * mobileSpawnFactor)) {
                    const randomNode = nodes[1 + Math.floor(Math.random() * (nodes.length - 1))];
                    spawnParticles(particles, randomNode.x + (Math.random()-0.5)*(40 * baseVisualScale), randomNode.y + (Math.random()-0.5)*(40 * baseVisualScale), 3, 'rgba(180,180,180,0.7)', 2.5, baseVisualScale);
                }
                
                particles.forEach(p => {
                    p.update();
                    if (p.life > p.maxLife * 0.2 && p.type === undefined) {
                        if (Math.random() < 0.009) {
                            p.color = 'rgba(239,68,68,0.95)'; // Red for HOT
                            p.vx = (nodes[0].x - p.x) * 0.15 + (Math.random() - 0.5) * (1.8 * baseVisualScale);
                            p.vy = (nodes[0].y - p.y) * 0.15 + (Math.random() - 0.5) * (1.8 * baseVisualScale);
                            p.type = 'HOT';
                            p.maxLife = 350;
                            p.radius = 6 * baseVisualScale;
                        } else if (Math.random() < 0.04) {
                            p.color = 'rgba(249,115,22,0.7)'; // Orange for WARM
                            p.vx *= 0.85;
                            p.vy *= 0.85;
                            p.type = 'WARM';
                            p.maxLife = 250;
                            p.radius = 4 * baseVisualScale;
                        } else {
                            p.type = 'NOISE';
                            p.maxLife = 80;
                            p.alpha *= 0.9;
                        }
                    }
                    if (p.type === 'HOT') {
                        ctx.save(); ctx.shadowColor = 'rgba(239,68,68,1)'; ctx.shadowBlur = 22 * baseVisualScale;
                        p.draw(ctx, baseVisualScale); ctx.restore();
                    } else if (p.type === 'WARM') {
                        p.draw(ctx, baseVisualScale);
                    } else if (p.type === 'COLD' || p.type === 'NOISE') {
                        p.alpha *= 0.85;
                        p.draw(ctx, baseVisualScale);
                    } 
                    else if (p.type === 'QUALIFIED') { 
                        ctx.save(); ctx.shadowColor = 'rgba(212,175,55,1)'; ctx.shadowBlur = 18 * baseVisualScale;
                        p.draw(ctx, baseVisualScale); ctx.restore();
                    }
                    else {
                        p.draw(ctx, baseVisualScale);
                    }
                });
                break;
            
            case 'Predictive':
                if (nodes.length === 0) {
                    nodes.push(new Node(w / 2, h / 2, 25, '#F9DF74', scene.nodeIconType));
                    nodes.push(new Node(w * 0.25, h * 0.25, 8, 'rgba(34,197,94,0.6)')); // Action (Green)
                    nodes.push(new Node(w * 0.75, h * 0.25, 8, 'rgba(239,68,68,0.6)')); // Delay Risk (Red)
                    nodes.push(new Node(w * 0.25, h * 0.75, 8, 'rgba(59,130,246,0.6)')); // Wait (Blue)
                    connections.push(new Connection(nodes[0], nodes[1], 0.3));
                    connections.push(new Connection(nodes[0], nodes[2], 0.3));
                    connections.push(new Connection(nodes[0], nodes[3], 0.3));
                }
                nodes.forEach(node => node.update());
                connections.forEach(conn => { conn.update(); conn.draw(ctx, baseVisualScale); });
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                if (Math.random() < (2.5 * mobileSpawnFactor)) spawnParticles(particles, nodes[0].x, nodes[0].y, 2, 'rgba(249,223,116,0.8)', 2, baseVisualScale);
                
                particles.forEach(p => {
                    p.update();
                    if (p.life > p.maxLife * 0.2 && p.type === undefined) {
                        const rand = Math.random();
                        if (rand < 0.3) { p.type = 'HOT'; p.color = 'rgba(50, 205, 50, 0.9)'; p.vx = (nodes[1].x - p.x) * 0.02 * baseVisualScale; p.vy = (nodes[1].y - p.y) * 0.02 * baseVisualScale; } // Lime Green
                        else if (rand < 0.6) { p.type = 'COLD'; p.color = 'rgba(220, 20, 60, 0.9)'; p.vx = (nodes[2].x - p.x) * 0.02 * baseVisualScale; p.vy = (nodes[2].y - p.y) * 0.02 * baseVisualScale; } // Crimson Red
                        else { p.type = 'WARM'; p.color = 'rgba(0, 191, 255, 0.9)'; p.vx = (nodes[3].x - p.x) * 0.02 * baseVisualScale; p.vy = (nodes[3].y - p.y) * 0.02 * baseVisualScale; } // Deep Sky Blue
                    }
                    if (p.type === 'HOT') { ctx.save(); ctx.shadowColor = 'rgba(50, 205, 50, 1)'; ctx.shadowBlur = 15 * baseVisualScale; p.draw(ctx, baseVisualScale); ctx.restore(); }
                    else if (p.type === 'COLD') { ctx.save(); ctx.shadowColor = 'rgba(220, 20, 60, 1)'; ctx.shadowBlur = 15 * baseVisualScale; p.draw(ctx, baseVisualScale); ctx.restore(); }
                    else if (p.type === 'WARM') { ctx.save(); ctx.shadowColor = 'rgba(0, 191, 255, 1)'; ctx.shadowBlur = 15 * baseVisualScale; p.draw(ctx, baseVisualScale); ctx.restore(); }
                });
                break;

            case 'AgentAndShadow':
                if (nodes.length === 0 || nodes[0].iconType !== NodeIconType.AI_CORE || nodes.length < 5) { // Check AI_CORE for input node
                    nodes.splice(0, nodes.length);
                    connections.splice(0, connections.length);
                    nodes.push(new Node(w * 0.2, h / 2, 18, '#D4AF37', NodeIconType.AI_CORE)); // AI Core (Agent)
                    nodes.push(new Node(w * 0.8, h / 2, 20, 'rgba(239,68,68,1)', scene.nodeIconType)); // Hot Lead Output (Human Agent Icon)
                    
                    nodes.push(new Node(w * 0.45, h * 0.2, 8, 'rgba(59,130,246,0.5)', NodeIconType.FILTER_COLD)); // Cold filter
                    nodes.push(new Node(w * 0.45, h * 0.8, 8, 'rgba(249,115,22,0.5)', NodeIconType.FILTER_WARM)); // Warm filter
                    
                    connections.push(new Connection(nodes[0], nodes[2], 0.2));
                    connections.push(new Connection(nodes[0], nodes[3], 0.2));
                    connections.push(new Connection(nodes[2], nodes[1], 0.1));
                    connections.push(new Connection(nodes[3], nodes[1], 0.2));
                }
                
                nodes.forEach(node => node.update());
                connections.forEach(conn => { conn.update(); conn.draw(ctx, baseVisualScale); });
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                if (Math.random() < (1.8 * mobileSpawnFactor)) spawnParticles(particles, 0, Math.random() * h, 1, 'rgba(200,200,200,0.6)', 3.5, baseVisualScale); // Increased spawn/speed

                particles.forEach(p => {
                    p.update();
                    
                    if (p.x < nodes[0].x) {
                        p.vx += (nodes[0].x - p.x) * 0.018; // Stronger pull to AI Core
                        p.vy += (nodes[0].y - p.y) * 0.018;
                    } else if (p.x >= nodes[0].x && p.x < nodes[1].x) {
                        if (p.type === undefined) {
                            const rand = Math.random();
                            if (rand < 0.15) { p.type = 'HOT'; p.color = 'rgba(239,68,68,0.9)'; p.radius = 5.5 * baseVisualScale; p.maxLife = 280; }
                            else if (rand < 0.5) { p.type = 'WARM'; p.color = 'rgba(249,115,22,0.75)'; p.maxLife = 200; p.radius = 4 * baseVisualScale;}
                            else { p.type = 'COLD'; p.color = 'rgba(59,130,246,0.75)'; p.maxLife = 120; p.radius = 3 * baseVisualScale;}
                        }
                        
                        if (p.type === 'HOT') {
                            p.vx += (nodes[1].x - p.x) * 0.018;
                            p.vy += (nodes[1].y - p.y) * 0.018;
                            ctx.save();
                            ctx.shadowColor = 'rgba(239,68,68,1)';
                            ctx.shadowBlur = 20 * baseVisualScale;
                            p.draw(ctx, baseVisualScale);
                            ctx.restore();
                        } else if (p.type === 'WARM') {
                            p.vx += (nodes[3].x - p.x) * 0.015;
                            p.vy += (nodes[3].y - p.y) * 0.015;
                            p.alpha *= 0.97;
                            p.draw(ctx, baseVisualScale);
                        } else if (p.type === 'COLD') {
                            p.vx += (nodes[2].x - p.x) * 0.015;
                            p.vy += (nodes[2].y - p.y) * 0.015;
                            p.alpha *= 0.92;
                            p.draw(ctx, baseVisualScale);
                        }
                    } else if (p.x >= nodes[1].x && p.type === 'HOT') {
                        p.vx += (nodes[1].x + (nodes[1].radius * baseVisualScale) - p.x) * 0.03;
                        p.vy += (nodes[1].y - p.y) * 0.03;
                        ctx.save();
                        ctx.shadowColor = 'rgba(239,68,68,1)';
                        ctx.shadowBlur = 30 * baseVisualScale;
                        p.draw(ctx, baseVisualScale);
                        ctx.restore();
                        const distToHuman = Math.sqrt(Math.pow(p.x - nodes[1].x, 2) + Math.pow(p.y - nodes[1].y, 2));
                        if (distToHuman < nodes[1].radius * baseVisualScale * 0.5) {
                            p.alpha = 0;
                        }
                    } else {
                        p.draw(ctx, baseVisualScale);
                    }
                });
                break;

            case 'DepthEngine':
                if (nodes.length === 0) {
                    nodes.push(new Node(w / 2, h / 2, 25, '#F9DF74', scene.nodeIconType));
                    const numPeripherals = 6;
                    for(let i=0; i<numPeripherals; i++) {
                        const angle = i * (Math.PI * 2 / numPeripherals);
                        const px = w / 2 + Math.cos(angle) * (180 * baseVisualScale);
                        const py = h / 2 + Math.sin(angle) * (180 * baseVisualScale);
                        nodes.push(new Node(px, py, 6, 'rgba(59,130,246,0.6)'));
                        connections.push(new Connection(nodes[0], nodes[i+1], 0.15));
                    }
                }
                nodes.forEach(node => node.update());
                connections.forEach(conn => { conn.update(); conn.draw(ctx, baseVisualScale); });
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                if (Math.random() < (2 * mobileSpawnFactor)) spawnParticles(particles, nodes[0].x, nodes[0].y, 2, 'rgba(249,223,116,0.8)', 2.5, baseVisualScale);
                
                particles.forEach(p => {
                    p.update();
                    const targetPeripheral = nodes[1 + Math.floor(Math.random() * (nodes.length - 1))];
                    p.vx += (targetPeripheral.x - p.x) * 0.005 * baseVisualScale;
                    p.vy += (targetPeripheral.y - p.y) * 0.005 * baseVisualScale;
                    // More vibrant purple/blue for depth
                    p.color = interpolateColor(p.color, 'rgba(150, 50, 250, 0.8)', 0.08); 
                    ctx.save();
                    ctx.shadowColor = 'rgba(150, 50, 250, 0.5)';
                    ctx.shadowBlur = 10 * baseVisualScale;
                    p.draw(ctx, baseVisualScale);
                    ctx.restore();
                });
                break;
            
            case 'FlashText': {
                const flashScale = 1 + easeOutElastic(textAlpha) * 0.1; // Reduced elastic scale
                const flashBlur = (1 - textAlpha) * 8 * baseVisualScale; // Reduced max blur
                const currentBrightness = (textAlpha > 0.8 && textAlpha < 0.99) ? 180 : 100; // Softer flash brightness
                drawTextWithEffects(
                    ctx,
                    currentSceneText,
                    w / 2,
                    h / 2, // Centered vertically
                    currentSceneTextColor,
                    textAlpha,
                    flashScale,
                    flashBlur,
                    baseVisualScale,
                    { x: 0, y: 0 },
                    currentBrightness,
                    isMobile,
                    w // Pass w here
                );
                break;
            }

            case 'FoundersMessage': {
                drawTextWithEffects(
                    ctx,
                    scene.text,
                    w / 2,
                    h / 2, // Centered vertically
                    scene.textColor,
                    textAlpha,
                    1 + (textAlpha * 0.05),
                    textAlpha < 0.2 ? (1 - textAlpha) * 3 * baseVisualScale : 0, // Softer blur
                    baseVisualScale,
                    { x: 0, y: 0 },
                    100,
                    isMobile,
                    w // Pass w here
                );
                break;
            }

            case 'Outro':
                if (nodes.length === 0 || nodes[0].iconType !== scene.nodeIconType) {
                    nodes.splice(0, nodes.length);
                    connections.splice(0, connections.length);
                    nodes.push(new Node(w / 2, h / 2, 40, '#F9DF74', scene.nodeIconType));
                }
                nodes.forEach(node => node.update());
                nodes.forEach(node => node.draw(ctx, baseVisualScale, drawNodeIcon));

                if (Math.random() < (1.5 * mobileSpawnFactor))
                    spawnParticles(particles, Math.random() * w, Math.random() * h, 6, 'rgba(212,175,55,0.9)', 15, baseVisualScale); // Faster, more particles
                
                particles.forEach(p => {
                    p.update();
                    p.vx = (nodes[0].x - p.x) * 0.12 + (Math.random() - 0.5) * (baseVisualScale * 6);
                    p.vy = (nodes[0].y - p.y) * 0.12 + (Math.random() - 0.5) * (baseVisualScale * 6);
                    p.color = interpolateColor(p.color, 'rgba(249,223,116,0.98)', 0.2);
                    p.radius += 0.25 * baseVisualScale;
                    ctx.save();
                    ctx.shadowColor = 'rgba(249,223,116,1)';
                    ctx.shadowBlur = 50 * baseVisualScale; // More intense glow
                    p.draw(ctx, baseVisualScale);
                    ctx.restore();
                });
                
                // Adjust bloom effect timing
                const outroProgress = Math.min(1, (now - sceneStartTime) / scene.duration);
                if (outroProgress > 0.8 && outroProgress < 0.95) {
                    ctx.filter = 'brightness(300%) saturate(250%)'; // More intense bloom
                } else {
                    ctx.filter = 'none';
                }
                break;
        }

        particles.splice(0, particles.length, ...particles.filter(p => p.alpha > 0.03 && p.radius > 0.2));
        
        // Draw main scene text for non-effect scenes
        if (!['GlitchText', 'FlashText', 'FoundersMessage'].includes(scene.name)) {
             drawTextWithEffects(
                ctx,
                currentSceneText,
                w / 2,
                h / 2, // Centered vertically
                currentSceneTextColor,
                textAlpha,
                1,
                textAlpha < 0.2 ? (1 - textAlpha) * 10 * baseVisualScale : 0, // Stronger subtle blur on fade in/out
                baseVisualScale,
                { x: 0, y: 0 },
                100,
                isMobile,
                w // Pass w here
            );
        }

        animationFrameIdRef.current = requestAnimationFrame(animate);

        if (now - sceneStartTime > scene.duration) {
            setCurrentSceneIndex((prevIndex) => {
                const nextIndex = (prevIndex + 1) % SCENES.length;
                const prevSceneEntities = getSceneEntities(scene.name);
                prevSceneEntities.particles.length = 0;
                prevSceneEntities.nodes.length = 0;
                prevSceneEntities.connections.length = 0;
                return nextIndex;
            });
            setSceneStartTime(now);
        }
    }, [currentSceneIndex, sceneStartTime, currentSceneText, currentSceneTextColor, textAlpha, drawNodeIcon, drawTextWithEffects, getSceneEntities, spawnParticles]);


    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.style.width = '100%';
                canvas.style.height = '100%'; 
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        animationFrameIdRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
            window.removeEventListener('resize', handleResize);
            sceneEntitiesRef.current.clear();
            iconPaths.current.clear();
        };
    }, [animate]);


    return (
        <section 
            className="relative w-full h-[50vh] min-h-[400px] max-h-[800px] lg:h-[70vh] lg:min-h-[700px] lg:max-h-[1000px] bg-brand-black overflow-hidden flex items-center justify-center border-t border-white/5"
            aria-hidden="true" 
            role="img" 
            aria-label="Dynamic visual explanation of Dominion's neural operations"
        >
            <canvas ref={canvasRef} className="absolute inset-0 block"></canvas>
            <div className="absolute inset-0 flex items-center justify-center p-8 z-10">
                {/* Text is drawn directly on canvas for better control and effects */}
            </div>
        </section>
    );
};

export default DominionExplainerCanvas;