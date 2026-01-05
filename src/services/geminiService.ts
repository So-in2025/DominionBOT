
import { GoogleGenAI } from "@google/genai";
import { db } from '../database.js';
import { logService } from './logService.js';

const MODEL_PRIORITY = [
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-3-pro-preview"
];

const MODEL_COOLDOWN_MS = 60 * 60 * 1000; // 60 Minutes

interface GenerateContentParams {
    apiKey: string;
    prompt: string;
    systemInstruction?: string;
    responseSchema?: any;
    tools?: any[];
}

/**
 * Genera contenido utilizando la Matriz de Derivación Secuencial de 5 modelos.
 * Incluye lógica de lista negra (cooldown) para modelos que fallan.
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
        // 1. CHEQUEO DE LISTA NEGRA ANTES DE INTENTAR
        const cooldownUntil = await db.getModelCooldown(modelName);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            // logService.debug(`[GEMINI-SERVICE] Modelo ${modelName} en cooldown. Saltando.`, undefined, undefined);
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
            
            // 2. MANEJO DE RATE LIMIT (429) O CUOTA AGOTADA
            if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                logService.warn(`[GEMINI-SERVICE] ⚠️ RATE LIMIT (429) con ${modelName}. Bloqueando por 60m y saltando motor (0ms delay).`, undefined, undefined);
                
                // CRÍTICO: Guardar en DB que este modelo está muerto por 1 hora.
                // Así la próxima petición (loop 2) ni siquiera entra al 'try'.
                await db.setModelCooldown(modelName, Date.now() + MODEL_COOLDOWN_MS);
                
                continue; 
            }

            // 3. MANEJO DE OTROS ERRORES (500, Overloaded, etc)
            logService.warn(`[GEMINI-FAILOVER] Fallo técnico con ${modelName}. Mensaje: ${errorMessage}. Pasando al siguiente modelo.`, undefined, undefined);
            // También bloqueamos modelos con fallos técnicos para evitar latencia
            await db.setModelCooldown(modelName, Date.now() + (5 * 60 * 1000)); // 5 min cooldown para errores técnicos
        }
    }

    // Si todos los modelos fallaron (o están en cooldown)
    logService.error('[GEMINI-SERVICE] CRITICAL: Todos los modelos de la matriz de derivación fallaron o están agotados.', new Error('All models failed'), undefined, undefined);
    throw new Error("Todos los modelos de IA fallaron. Por favor, intente más tarde.");
};
