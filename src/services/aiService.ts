
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js'; // NEW IMPORT

// Updated Priority List: Try new preview, then stable flash exp, then lite.
const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-2.0-flash-exp", "gemini-flash-lite-latest"];

export const generateBotResponse = async (
  conversationHistory: Message[],
  user: User,
  isSimulation: boolean = false
): Promise<{ responseText?: string, suggestedReplies?: string[], newStatus: LeadStatus, tags: string[], recommendedAction?: string } | null> => {
  
  if (!isSimulation) {
      if (!user.settings.isActive || (user.plan_status !== 'active' && user.plan_status !== 'trial')) {
          if(user.plan_status === 'expired') {
              return { responseText: "Disculpa la demora, en breve te atenderemos.", newStatus: LeadStatus.COLD, tags: [] };
          }
          return null;
      }
  }

  // Trim key here as well for safety
  const cleanKey = user.settings.geminiApiKey?.trim();

  if (!cleanKey) {
      logService.error(`[AI-SERVICE] Usuario ${user.username} (ID: ${user.id}) intentó generar respuesta AI sin API Key de Gemini configurada.`, null, user.id, user.username);
      if (isSimulation) {
          return { responseText: "[ERROR SISTEMA] No has configurado tu API Key de Gemini. Ve a Configuración > Panel de Control de Gemini.", newStatus: LeadStatus.COLD, tags: ['ERROR_CONFIG'] };
      }
      return null; 
  }
  
  // 1. RESOLVE CAPABILITIES
  const capabilities = await capabilityResolver.resolve(user.id);

  const features = planService.getClientFeatures(user);
  const settings = user.settings;

  // 2. Adjust History Depth based on Capabilities
  const memoryLimit = capabilities.memoryDepth || 15;
  const historyText = conversationHistory.slice(-memoryLimit).map(m => {
      let role = 'Dominion_Bot';
      if (m.sender === 'user' || m.sender === 'elite_bot') {
          role = 'Cliente';
      } else if (m.sender === 'owner') {
          role = 'Agente_Humano';
      }
      return `${role}: ${m.text}`;
  }).join('\n');

  const prompt = `## HISTORIAL DE SEÑALES (Profundidad: ${memoryLimit} msgs):\n${historyText}`;

  // 3. Inject Cognitive Depth Instructions
  let systemInstruction = `
# CONSTITUCIÓN DOMINION BOT v2.8 (ELITE - Depth Level ${capabilities.depthLevel})
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina para "${settings.productName}".
Tu misión: Atender consultas y, si el plan lo permite, calificar la intención de compra.

## PARÁMETROS COGNITIVOS:
- Profundidad de Razonamiento: ${capabilities.inferencePasses} (1=Rápido, 3=Profundo)
- ${capabilities.canPredictTrends ? 'Activar análisis de intención latente.' : 'Análisis literal.'}

## REGLAS DE ORO:
- Responde en Español Argentino Profesional (Voseo permitido).
- PROHIBIDO: Emojis excesivos, lenguaje de 'coach', mencionar que eres una IA.
- Sé directo y eficiente.

## CONTEXTO DE PRODUCTO:
${settings.productDescription}
- Precio: ${settings.priceText}.
- Link de Cierre: ${settings.ctaLink}.
`;

  if (features.lead_scoring) {
      systemInstruction += `
## PROTOCOLO DE CALIFICACIÓN (PLAN PRO):
Analiza el historial y determina el estado del lead (Frío, Tibio, Caliente).
`;
  }

  if (features.close_assist) {
      systemInstruction += `
## PROTOCOLO "HOT-SHADOW" (PLAN PRO):
- SI EL LEAD ES CALIENTE (listo para comprar): NO generes 'responseText'. En su lugar, genera 3 'suggestedReplies' para que el vendedor humano cierre.
`;
  }
  
  const responseSchema: any = {
      type: Type.OBJECT,
      properties: {
          responseText: { type: Type.STRING },
          newStatus: { type: Type.STRING, enum: [LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT] },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['newStatus', 'tags']
  };

  if(features.close_assist) {
      responseSchema.properties.suggestedReplies = { type: Type.ARRAY, items: { type: Type.STRING } };
      responseSchema.properties.recommendedAction = { type: Type.STRING };
  }
  
  systemInstruction += `
## FORMATO DE SALIDA (JSON):
${JSON.stringify(Object.keys(responseSchema.properties))}
`;
  
  const ai = new GoogleGenAI({ apiKey: cleanKey });

  for (const modelName of MODEL_PRIORITY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
          systemInstruction,
          responseMimeType: "application/json", 
          responseSchema 
        }
      });
      
      const jsonText = response.text;
      if (!jsonText) throw new Error("Respuesta vacía de la IA.");

      const result = JSON.parse(jsonText.trim());
      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;

      return result;
    } catch (err: any) { 
        logService.warn(`[AI FAILOVER] Fallo con ${modelName}, intentando siguiente...`, user.id, user.username, { error: err.message }); 
    }
  }
  
  return null;
};
