
import { GoogleGenAI, Modality } from "@google/genai";
import { db } from '../database.js';
import { logService } from './logService.js';
import { redis } from '../redis.js'; // IMPORT REDIS

const MODEL_PRIORITY = [
    "gemini-3.8-flash",
    "gemini-3.1-pro-preview"
];

// DEDICATED MODEL FOR RADAR BATCHING (High Reasoning, separate quota)
const RADAR_MODEL = "gemini-3.1-pro-preview";

const TTS_MODEL_PRIORITY = [
    "gemini-3.1-flash-tts-preview"
];

const MODEL_COOLDOWN_SECONDS = 60 * 60; // 60 Minutes

const safeRedisGet = async (key: string): Promise<string | null> => {
    if (redis.status !== 'ready') return null;
    try {
        const getPromise = redis.get(key);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 300));
        return await Promise.race([getPromise, timeoutPromise]);
    } catch {
        return null;
    }
};

const safeRedisSet = async (key: string, val: string, mode?: string, duration?: number): Promise<void> => {
    if (redis.status !== 'ready') return;
    try {
        if (mode && duration) {
            await redis.set(key, val, mode as any, duration);
        } else {
            await redis.set(key, val);
        }
    } catch {}
};

interface GenerateContentParams {
    apiKey: string;
    prompt: string;
    systemInstruction?: string;
    responseSchema?: any;
    tools?: any[];
}

/**
 * STANDARD FALLBACK GENERATION (For Chatbot & Fast Responses)
 */
export const generateContentWithFallback = async ({
    apiKey,
    prompt,
    systemInstruction,
    responseSchema,
    tools
}: GenerateContentParams) => {
    
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of MODEL_PRIORITY) {
        // 1. CHEQUEO DE LISTA NEGRA EN REDIS (Ultra rápido)
        const isCooldown = await safeRedisGet(`model:cooldown:${modelName}`);
        if (isCooldown) {
            // logService.debug(`[GEMINI-REDIS] Modelo ${modelName} en cooldown. Saltando.`);
            continue;
        }

        try {
            const config: any = {};
            if (systemInstruction) config.systemInstruction = systemInstruction;
            if (responseSchema) {
                config.responseMimeType = "application/json";
                config.responseSchema = responseSchema;
            }
            if (tools) config.tools = tools;

            const response = await ai.models.generateContent({
                model: modelName,
                contents: [{ parts: [{ text: prompt }] }],
                config,
            });

            return response;

        } catch (err: any) {
            const errorMessage = err.message || '';
            
            // 2. MANEJO DE RATE LIMIT (429) -> Bloqueo Redis por 1h
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                logService.warn(`[GEMINI-SERVICE] ⚠️ RATE LIMIT (429) con ${modelName}. Bloqueando en Redis por 60m.`, undefined, undefined);
                
                // SET key, Value '1', EXpire 3600s
                await safeRedisSet(`model:cooldown:${modelName}`, '1', 'EX', MODEL_COOLDOWN_SECONDS);
                
                continue; 
            }

            // 3. FALLO TÉCNICO -> Bloqueo corto (5 min)
            logService.warn(`[GEMINI-FAILOVER] Fallo técnico con ${modelName}. Mensaje: ${errorMessage}. Pasando al siguiente.`, undefined, undefined);
            await safeRedisSet(`model:cooldown:${modelName}`, '1', 'EX', 300);
        }
    }

    logService.error('[GEMINI-SERVICE] CRITICAL: Todos los modelos de la matriz de derivación fallaron o están agotados.', new Error('All models failed'), undefined, undefined);
    throw new Error("Todos los modelos de IA fallaron. Por favor, intente más tarde.");
};

/**
 * EXCLUSIVE HIGH-REASONING BATCH GENERATION (Radar 4.5)
 * Uses Gemini 3 Pro exclusively for deep analysis of multiple signals.
 * Does NOT fallback to Flash models to maintain analysis quality.
 */
export const generateHighReasoningBatch = async ({
    apiKey,
    prompt,
    systemInstruction,
    responseSchema
}: GenerateContentParams) => {
    const ai = new GoogleGenAI({ apiKey });
    
    // Check specific cooldown for the Pro model
    const isCooldown = await safeRedisGet(`model:cooldown:${RADAR_MODEL}`);
    if (isCooldown) {
        throw new Error(`Modelo Radar (${RADAR_MODEL}) en enfriamiento por límites de cuota.`);
    }

    try {
        const config: any = {
            // High reasoning needs higher budget if using thinkingConfig, 
            // but for 3-pro-preview standard, we just use standard generation
            // unless we want to enable thinking. For batching, standard is usually fine.
            responseMimeType: "application/json",
            responseSchema: responseSchema
        };
        
        if (systemInstruction) config.systemInstruction = systemInstruction;

        const response = await ai.models.generateContent({
            model: RADAR_MODEL,
            contents: [{ parts: [{ text: prompt }] }],
            config,
        });

        return response;

    } catch (err: any) {
        const errorMessage = err.message || '';
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            logService.warn(`[RADAR-BATCH] ⚠️ Cuota agotada para ${RADAR_MODEL}. Pausando Radar por 1 hora.`, undefined, undefined);
            await safeRedisSet(`model:cooldown:${RADAR_MODEL}`, '1', 'EX', MODEL_COOLDOWN_SECONDS);
        }
        throw err;
    }
};

export const generateAudioWithFallback = async (apiKey: string, text: string, voiceName: string = 'Kore') => {
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of TTS_MODEL_PRIORITY) {
        const isCooldown = await safeRedisGet(`model:cooldown:${modelName}`);
        if (isCooldown) {
            continue;
        }

        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName },
                        },
                    },
                },
            });

            return response;

        } catch (err: any) {
            const errorMessage = err.message || '';
            
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                logService.warn(`[GEMINI-TTS] ⚠️ RATE LIMIT (429) con ${modelName}. Bloqueando en Redis.`, undefined, undefined);
                await safeRedisSet(`model:cooldown:${modelName}`, '1', 'EX', MODEL_COOLDOWN_SECONDS);
                continue;
            }

            logService.warn(`[GEMINI-TTS-FAILOVER] No se pudo generar audio con ${modelName}: ${errorMessage}`);
            await safeRedisSet(`model:cooldown:${modelName}`, '1', 'EX', 300);
        }
    }

    logService.warn('[GEMINI-TTS] Servicio de generación de audio no disponible.');
    throw new Error("El servicio de generación de audio no está disponible.");
};
