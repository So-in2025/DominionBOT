
import { GoogleGenAI, Type } from "@google/genai";
import { Message, BotSettings, LeadStatus } from '../types';

// ============================================================================
// CONFIGURACIÓN DE ROBUSTEZ IA
// ============================================================================

// Orden de prioridad: Rápido/Barato -> Estable -> Potente
const MODEL_PRIORITY = [
  "gemini-3-flash-preview", 
  "gemini-2.5-flash",       
  "gemini-3-pro-preview"    
];

const BLACKLIST_DURATION_MS = 5 * 60 * 1000;
const modelBlacklist = new Map<string, number>();

const isModelBlacklisted = (modelName: string): boolean => {
  const expiry = modelBlacklist.get(modelName);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelBlacklist.delete(modelName);
    return false;
  }
  return true;
};

const blacklistModel = (modelName: string) => {
  console.warn(`[IA SAFETY] Bloqueando modelo temporalmente: ${modelName}`);
  modelBlacklist.set(modelName, Date.now() + BLACKLIST_DURATION_MS);
};

const getAvailableModels = (): string[] => {
  const available = MODEL_PRIORITY.filter(m => !isModelBlacklisted(m));
  if (available.length === 0) return MODEL_PRIORITY; // Fail-open
  return available;
};

// ============================================================================
// SERVICIO PRINCIPAL (CLIENT SIDE)
// ============================================================================

export const getBotResponse = async (
  conversationHistory: Message[],
  settings: BotSettings
): Promise<{ responseText: string, newStatus: LeadStatus }> => {
  
  // 1. Obtener API Key (BYOK) de la configuración cargada en el frontend
  const apiKey = settings.geminiApiKey;

  if (!apiKey) {
    return {
      responseText: "[SISTEMA] No hay API Key configurada. Por favor ve a Configuración.",
      newStatus: LeadStatus.COLD
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const historyText = conversationHistory
    .map(m => `${m.sender === 'user' ? 'Cliente' : 'Vendedor'}: ${m.text}`)
    .join('\n');

  const systemInstruction = `
Eres Dominion Bot, un vendedor experto para ${settings.productName}.

**Tu Objetivo:**
Vender ${settings.productName} (${settings.productDescription}).
Precio: ${settings.priceText}.
Prueba: ${settings.freeTrialDays} días.
Link: ${settings.ctaLink}.

**Reglas:**
1. Responde de forma corta y persuasiva.
2. Si el cliente está listo para comprar, mándalo al Link.
3. Clasifica el lead: COLD (Curioso), WARM (Interesado), HOT (Listo para pagar).

**Historial:**
${historyText}
`;

  const modelsToTry = getAvailableModels();

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseText: { type: Type.STRING },
              newStatus: { type: Type.STRING, enum: [LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT] }
            },
            required: ['responseText', 'newStatus']
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Respuesta vacía");

      return JSON.parse(jsonText.trim());

    } catch (error) {
      console.error(`[IA FRONTEND] Fallo en ${model}:`, error);
      blacklistModel(model);
    }
  }

  return {
    responseText: "Estoy teniendo problemas de conexión, ¿podrías repetirme eso?",
    newStatus: LeadStatus.WARM,
  };
};
