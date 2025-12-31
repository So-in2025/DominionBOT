
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype } from '../types.js';
import { planService } from './planService.js';

const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-flash-lite-latest"];

export const generateBotResponse = async (
  conversationHistory: Message[],
  user: User
): Promise<{ responseText?: string, suggestedReplies?: string[], newStatus: LeadStatus, tags: string[], recommendedAction?: string } | null> => {
  
  if (!user.settings.isActive || user.plan_status !== 'active') {
      // If plan is expired or suspended, or bot is off, send a generic polite message or do nothing
      if(user.plan_status === 'expired') {
          return { responseText: "Disculpa la demora, en breve te atenderemos.", newStatus: LeadStatus.COLD, tags: [] };
      }
      return null;
  }
  
  const features = planService.getClientFeatures(user);
  const settings = user.settings;

  const historyText = conversationHistory.slice(-15).map(m => {
      const role = m.sender === 'user' ? 'Cliente' : (m.sender === 'owner' ? 'Agente_Humano' : 'Dominion_Bot');
      return `${role}: ${m.text}`;
  }).join('\n');

  const archetypes = {
      [PromptArchetype.CONSULTATIVE]: "Estrategia: Consultiva. Escucha activa y calificación.",
      [PromptArchetype.DIRECT_CLOSER]: "Estrategia: Closer. Enfoque en disponibilidad, precio y cierre.",
      [PromptArchetype.SUPPORT]: "Estrategia: Soporte. Técnico y resolutivo.",
      [PromptArchetype.CUSTOM]: `Estrategia Personalizada: ${settings.productDescription}`
  };

  // FIX: Separated system instruction from the prompt (conversation history) to align with Gemini API best practices.
  const prompt = `## HISTORIAL DE SEÑALES:\n${historyText}`;

  // Build prompt dynamically based on features
  let systemInstruction = `
# CONSTITUCIÓN DOMINION BOT v2.8 (ELITE)
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina para "${settings.productName}".
Tu misión: Atender consultas y, si el plan lo permite, calificar la intención de compra.

## REGLAS DE ORO:
- Responde en Español Argentino Profesional (Voseo permitido).
- PROHIBIDO: Emojis excesivos, lenguaje de 'coach', mencionar que eres una IA.
- Sé directo y eficiente.

## CONTEXTO DE PRODUCTO:
${settings.productDescription}
- Precio: ${settings.priceText}.
- Link de Cierre: ${settings.ctaLink}.
`;

  // Add feature-based instructions
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
  
  // Define JSON schema based on features
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
  
  const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey || process.env.API_KEY });

  for (const modelName of MODEL_PRIORITY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
          systemInstruction,
          responseMimeType: "application/json", 
          responseSchema 
        }
      });
      
      const jsonText = response.text;
      if (!jsonText) throw new Error("Respuesta vacía de la IA.");

      const result = JSON.parse(jsonText.trim());
      // Downgrade if feature is not enabled but AI still produced it
      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;

      return result;
    } catch (err) { 
        console.warn(`[AI FAILOVER] Fallo con ${modelName}, intentando siguiente...`); 
    }
  }
  
  return null;
};
