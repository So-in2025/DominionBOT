
import { GoogleGenAI, Type } from "@google/genai";
import { db } from '../database.js';
import { RadarSignal, User, MarketContextSnapshot, HiddenSignal, SocketEvents } from '../types.js'; // Added SocketEvents
import { logService } from './logService.js';
import { v4 as uuidv4 } from 'uuid';
import { capabilityResolver } from './capabilityResolver.js';
import { generateHighReasoningBatch } from './geminiService.js'; 
import { redis } from '../redis.js'; 
import { socketService } from './socketService.js'; // Added socketService

const BATCH_SIZE = 5; // Process when 5 messages accumulate
const BATCH_LOCK_TTL = 120; // 2 minutes lock for processing

// FAST LANE KEYWORDS (Default Global)
const DEFAULT_FAST_LANE_KEYWORDS = ['precio', 'comprar', 'info', 'urgente', 'necesito', 'busco', 'cuanto sale', 'costo'];

interface BufferedSignal {
    tempId: string;
    userId: string;
    groupJid: string;
    groupName: string;
    senderJid: string;
    senderName: string;
    messageContent: string;
    timestamp: string;
    contextSummary: string; // Brief history summary
}

class RadarService {
    
    public async processGroupMessage(userId: string, groupJid: string, groupName: string, senderJid: string, senderName: string | undefined, messageContent: string) {
        // 1. Resolve Capabilities & Settings
        const settings = await db.getRadarSettings(userId);
        if (!settings.isEnabled) return;
        if (!settings.monitoredGroups.includes(groupJid)) return;

        // --- LAYER 0: SLEEP MODE (STEALTH) ---
        if (settings.sleepWindow?.enabled) {
            const nowHour = new Date().getHours();
            const { startHour, endHour } = settings.sleepWindow;
            const isSleeping = startHour <= endHour 
                ? (nowHour >= startHour && nowHour < endHour)
                : (nowHour >= startHour || nowHour < endHour);
            if (isSleeping) return;
        }

        // --- LAYER 1: HARD FILTERS (NO AI) ---
        const user = await db.getUser(userId);
        if (senderJid.includes(user?.whatsapp_number || 'xxxxx')) return; 
        if (messageContent.length < 5 || messageContent.length > 800) return;

        const lowerContent = messageContent.toLowerCase();

        if (settings.keywordsExclude && settings.keywordsExclude.length > 0) {
            if (settings.keywordsExclude.some(k => lowerContent.includes(k.toLowerCase()))) return;
        }

        if (settings.keywordsInclude && settings.keywordsInclude.length > 0) {
            if (!settings.keywordsInclude.some(k => lowerContent.includes(k.toLowerCase()))) return;
        }

        // --- FAST LANE CHECK ---
        const isFastLane = DEFAULT_FAST_LANE_KEYWORDS.some(k => lowerContent.includes(k));

        // --- LAYER 1.5: CONTEXT SNAPSHOT (Pre-Fetch) ---
        // We capture context NOW, because when the batch runs, the "recent" messages might be different.
        const recentSignals = await db.getRecentGroupSignals(groupJid, 3);
        const contextHistory = recentSignals.map(s => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.senderName}: "${s.messageContent}"`).join(' | ');

        // --- LAYER 2: BUFFERING (REDIS) ---
        const bufferedItem: BufferedSignal = {
            tempId: uuidv4(),
            userId,
            groupJid,
            groupName: groupName || 'Grupo Desconocido',
            senderJid,
            senderName: senderName || 'Usuario Desconocido',
            messageContent,
            timestamp: new Date().toISOString(),
            contextSummary: contextHistory || "Sin contexto previo."
        };

        const redisKey = `radar:batch:${userId}`;
        await redis.rpush(redisKey, JSON.stringify(bufferedItem));
        
        logService.info(`[RADAR-BUFFER] 📥 Mensaje encolado (${await redis.llen(redisKey)}/${BATCH_SIZE}) ${isFastLane ? '[FAST LANE]' : ''}.`, userId);

        // TRIGGER CHECK
        const currentSize = await redis.llen(redisKey);
        
        // --- HYDRA UPGRADE: FAST LANE TRIGGER ---
        // If Fast Lane (Hot keyword detected), trigger processing immediately regardless of batch size.
        if (isFastLane || currentSize >= BATCH_SIZE) {
            if (isFastLane) logService.info(`[RADAR-FAST] ⚡ Señal de alta prioridad detectada. Procesando inmediato.`, userId);
            await this.processBatch(userId, user!, settings);
        }
    }

    /**
     * Called by Server Interval (Time Flush) OR Trigger (Size Flush)
     */
    public async processBatch(userId: string, user?: User, settings?: any) {
        const lockKey = `radar:lock:${userId}`;
        const redisKey = `radar:batch:${userId}`;

        // 1. Acquire Lock
        // FIX: Reordered arguments to (key, value, 'EX', time, 'NX') for ioredis Type compliance
        const isLocked = await redis.set(lockKey, 'LOCKED', 'EX', BATCH_LOCK_TTL, 'NX');
        if (!isLocked) return; // Already processing

        try {
            // 2. Fetch Data
            const batchRaw = await redis.lrange(redisKey, 0, -1);
            if (batchRaw.length === 0) return;

            // 3. Prepare User & Settings (if not passed from trigger)
            if (!user) user = (await db.getUser(userId)) as User;
            if (!settings) settings = await db.getRadarSettings(userId);
            if (!user || !user.settings.geminiApiKey) {
                // If user invalid, clear buffer to prevent clog
                await redis.del(redisKey);
                return;
            }

            const batch: BufferedSignal[] = batchRaw.map(s => JSON.parse(s));
            logService.info(`[RADAR-BATCH] 🚀 Procesando lote de ${batch.length} señales con Gemini 3 Pro...`, userId);

            // 4. AI Analysis
            const capabilities = await capabilityResolver.resolve(userId);
            const results = await this.analyzeBatchWithHighReasoning(batch, user, capabilities, settings);

            // 5. Process Results
            if (results && Array.isArray(results)) {
                let savedCount = 0;
                
                for (const analysis of results) {
                    // Match result to original signal by tempId (assumes AI maintains order or returns ID)
                    // We instruct AI to return the input ID.
                    const originalSignal = batch.find(s => s.tempId === analysis.input_id);
                    if (!originalSignal) continue;

                    // Strategic Qualification Logic
                    let baseThreshold = capabilities.confidenceThreshold;
                    if (settings.calibration && settings.calibration.sensitivity) {
                        const sensitivityMod = (settings.calibration.sensitivity - 5) * 3;
                        baseThreshold = Math.max(20, Math.min(95, baseThreshold + sensitivityMod));
                    }

                    if (analysis.analysis.score >= baseThreshold) {
                        // Calculate Strategic Score
                        let strategicScore = analysis.analysis.score;
                        if (analysis.predictedWindow?.urgencyLevel === 'CRITICAL') strategicScore += 15;
                        if (analysis.predictedWindow?.urgencyLevel === 'HIGH') strategicScore += 10;
                        if (analysis.predictedWindow?.delayRisk === 'HIGH') strategicScore -= 10;
                        strategicScore = Math.min(100, Math.max(0, strategicScore));

                        const signal: RadarSignal = {
                            id: uuidv4(),
                            userId,
                            groupJid: originalSignal.groupJid,
                            groupName: originalSignal.groupName,
                            senderJid: originalSignal.senderJid,
                            senderName: originalSignal.senderName,
                            messageContent: originalSignal.messageContent,
                            timestamp: originalSignal.timestamp,
                            analysis: analysis.analysis,
                            marketContext: analysis.marketContext,
                            predictedWindow: analysis.predictedWindow,
                            hiddenSignals: analysis.hiddenSignals,
                            actionIntelligence: analysis.actionIntelligence,
                            strategicScore,
                            status: 'NEW'
                        };

                        await db.createRadarSignal(signal);
                        // 🔥 REAL-TIME EMISSION
                        socketService.emitToUser(userId, SocketEvents.RADAR_SIGNAL, signal);
                        
                        savedCount++;

                        // --- CRM INTEGRATION TRIGGER ---
                        if (settings.webhookUrl && settings.webhookUrl.startsWith('http')) {
                            // Fire and forget (don't await) to not block the batch processing
                            this.triggerWebhook(settings.webhookUrl, signal).catch(err => 
                                logService.error(`[WEBHOOK-FAIL] Fallo al enviar señal ${signal.id}`, err, userId)
                            );
                        }
                    }
                }
                
                if (savedCount > 0) {
                    logService.info(`[RADAR-BATCH] ✅ Lote completado. ${savedCount} oportunidades detectadas.`, userId);
                } else {
                    logService.info(`[RADAR-BATCH] 📉 Lote procesado. Sin oportunidades relevantes.`, userId);
                }
            }

            // 6. Clear Buffer (Only after successful processing)
            await redis.del(redisKey);

        } catch (error) {
            logService.error(`[RADAR-BATCH] Error procesando lote`, error, userId);
            // We DO NOT delete the buffer on error, allowing retry (or manual clearance if stuck)
        } finally {
            await redis.del(lockKey);
        }
    }

    private async triggerWebhook(url: string, signal: RadarSignal) {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'RADAR_OPPORTUNITY_DETECTED',
                timestamp: new Date().toISOString(),
                data: signal
            })
        });
    }

    private async analyzeBatchWithHighReasoning(batch: BufferedSignal[], user: User, capabilities: any, settings: any) {
        
        let calibrationInstructions = "";
        if (settings.calibration && settings.calibration.opportunityDefinition) {
            calibrationInstructions = `
*** PROTOCOLO DE PRECISIÓN ***
OBJETIVO: "${settings.calibration.opportunityDefinition}"
RUIDO A IGNORAR: "${settings.calibration.noiseDefinition}"
`;
        }

        // Construct Batch Prompt
        const signalsText = batch.map(s => `
--- SIGNAL ID: ${s.tempId} ---
GRUPO: ${s.groupName}
CONTEXTO RECIENTE: ${s.contextSummary}
MENSAJE: "${s.messageContent}"
`).join('\n');

        const prompt = `
Contexto: Eres "Radar 4.5", un Motor de Inferencia Masiva para: "${user.settings.productName}".
Negocio: ${user.settings.productDescription}

${calibrationInstructions}

INSTRUCCIÓN DE LOTE:
Analiza los siguientes ${batch.length} mensajes. Para cada uno, determina si es una oportunidad de venta real.
Aplica razonamiento profundo. Ignora ventas, spam y charlas casuales. Buscamos COMPRADORES.

INPUTS:
${signalsText}

OUTPUT REQUERIDO:
Un Array JSON donde cada objeto corresponda a una señal analizada.
`;

        const responseSchema: any = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    input_id: { type: Type.STRING, description: "El ID original del input (SIGNAL ID)" },
                    analysis: {
                        type: Type.OBJECT,
                        properties: {
                            score: { type: Type.NUMBER },
                            category: { type: Type.STRING },
                            intentType: { type: Type.STRING, enum: ['SEARCH', 'COMPARISON', 'QUESTION', 'URGENT'] },
                            reasoning: { type: Type.STRING },
                            suggestedAction: { type: Type.STRING }
                        },
                        required: ['score', 'intentType', 'reasoning']
                    },
                    marketContext: {
                        type: Type.OBJECT,
                        properties: {
                            momentum: { type: Type.STRING, enum: ['ACCELERATING', 'STABLE', 'COOLING'] },
                            sentiment: { type: Type.STRING, enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'TENSE'] },
                            activeTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                            noiseLevel: { type: Type.NUMBER }
                        }
                    },
                    predictedWindow: {
                        type: Type.OBJECT,
                        properties: {
                            confidenceScore: { type: Type.NUMBER },
                            urgencyLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                            delayRisk: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
                            reasoning: { type: Type.STRING }
                        }
                    },
                    hiddenSignals: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING, enum: ['MICRO_LANGUAGE', 'EMOTIONAL_SHIFT', 'SILENCE_PATTERN', 'CONVERGENCE'] },
                                description: { type: Type.STRING },
                                intensity: { type: Type.NUMBER }
                            }
                        }
                    },
                    actionIntelligence: {
                        type: Type.OBJECT,
                        properties: {
                            suggestedEntryType: { type: Type.STRING, enum: ['DIRECT', 'CONSULTATIVE', 'PRIVATE', 'WAIT'] },
                            communicationFraming: { type: Type.STRING },
                            spamRiskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
                            recommendedWaitTimeSeconds: { type: Type.NUMBER }
                        }
                    }
                },
                required: ['input_id', 'analysis', 'predictedWindow']
            }
        };

        try {
            // CALL DEDICATED GEMINI 3 PRO METHOD
            const response = await generateHighReasoningBatch({
                apiKey: user.settings.geminiApiKey,
                prompt: prompt,
                responseSchema: responseSchema
            });

            if (!response || !response.text) return null;
            return JSON.parse(response.text);

        } catch (e) {
            logService.error('[RADAR-SERVICE] Fallo en inferencia por lotes (Gemini 3 Pro).', e, user.id);
            return null;
        }
    }
}

export const radarService = new RadarService();
