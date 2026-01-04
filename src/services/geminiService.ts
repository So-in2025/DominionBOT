
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
        const cooldownUntil = await db.getModelCooldown(modelName);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            logService.debug(`[GEMINI-SERVICE] Modelo ${modelName} en cooldown. Saltando.`, undefined, undefined);
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

            // Si llegamos aquí, la llamada fue exitosa
            logService.debug(`[GEMINI-SERVICE] Contenido generado exitosamente con ${modelName}.`);
            return response;

        } catch (err: any) {
            logService.warn(`[GEMINI-FAILOVER] Fallo con ${modelName}. Mensaje: ${err.message}. Pasando al siguiente modelo.`, undefined, undefined);
            await db.setModelCooldown(modelName, Date.now() + MODEL_COOLDOWN_MS);
        }
    }

    // Si todos los modelos fallaron
    logService.error('[GEMINI-SERVICE] CRITICAL: Todos los modelos de la matriz de derivación fallaron.', new Error('All models failed'), undefined, undefined);
    throw new Error("Todos los modelos de IA fallaron. Por favor, intente más tarde.");
};
