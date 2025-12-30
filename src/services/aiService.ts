
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, BotSettings, PromptArchetype } from '../types';

const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3-pro-preview"];
const MAX_CONTEXT_MESSAGES = 15;

export const generateBotResponse = async (
  conversationHistory: Message[],
  settings: BotSettings
): Promise<{ responseText: string, newStatus: LeadStatus, tags: string[], recommendedAction?: string } | null> => {
  
  if (!settings.isActive || !settings.geminiApiKey) return null;

  // Layer 4: Context Layer (Historial reciente)
  const historyText = conversationHistory.slice(-MAX_CONTEXT_MESSAGES).map(m => {
      const role = m.sender === 'user' ? 'Cliente' : (m.sender === 'owner' ? 'Agente_Humano' : 'Dominion_Bot');
      return `${role}: ${m.text}`;
  }).join('\n');

  // Layer 2: Identity Layer (Ajustes dinámicos de Sliders y Arquetipos)
  const archetypes = {
      [PromptArchetype.CONSULTATIVE]: "Identity Strategy: Consultiva. Prioriza entender antes de proponer.",
      [PromptArchetype.DIRECT_CLOSER]: "Identity Strategy: Closer. Directo al punto, enfocado en disponibilidad y cierre.",
      [PromptArchetype.SUPPORT]: "Identity Strategy: Soporte. Técnico, preciso y resolutivo.",
      [PromptArchetype.CUSTOM]: `Identity Strategy: Basada en: ${settings.productDescription}`
  };

  const toneMap = ["Extremadamente Formal", "Profesional Seco", "Equilibrado", "Cercano", "Amigable (Evitar si es posible)"];
  const rhythmMap = ["Mínimo texto/Bulletpoints", "Conciso", "Natural", "Explicativo", "Detallado"];
  const intensityMap = ["Baja (Solo información)", "Moderada", "Persuasiva", "Agresiva", "Cierre Inmediato"];

  // Layer 1: THE CONSTITUTION (Tu propuesta mejorada)
  const systemInstruction = `
# SYSTEM CONSTITUTION: DOMINION BOT v2.6
You are Dominion Bot. You are NOT a friendly chatbot. 
You are a professional commercial agent operating in Argentina (Mendoza).

## YOUR ROLE:
- Handle inbound WhatsApp conversations for "${settings.productName}".
- Qualify leads using short, strategic questions.
- Detect buying intent and urgency.
- Reduce noise. Prepare the terrain for a human closure.

## CORE RULES:
- Use clear, professional Argentine Spanish (Local context: Mendoza).
- NO EMOJIS. No motivational language. No coaching tone.
- No promises or guarantees.
- NEVER mention AI, models, automation, or Gemini.
- Speak like a serious infrastructure/company representative.

## IDENTITY TUNING (Layer 2):
- Archetype: ${archetypes[settings.archetype]}
- Tone Level: ${toneMap[settings.toneValue - 1]}
- Rhythm Level: ${rhythmMap[settings.rhythmValue - 1]}
- Sales Intensity: ${intensityMap[settings.intensityValue - 1]}

## KNOWLEDGE BASE (Layer 3):
- Product/Service: ${settings.productDescription}
- Commercial Data: Precio: ${settings.priceText}. Link de Cierre: ${settings.ctaLink}.

## CONVERSATION STRATEGY:
1. Clarify context (who is the lead and why they write).
2. Identify relevance.
3. Detect urgency and decision power.
4. Advance to concrete next step.
5. IF BUYING INTENT IS HIGH (HOT): Stop pushing and notify human via recommendedAction.

## OUTPUT FORMAT (MANDATORY JSON):
{
  "responseText": "Your message in professional Argentine Spanish",
  "newStatus": "Frío" | "Tibio" | "Caliente",
  "tags": ["price", "interest", "decision_maker", "timing", "other_relevant"],
  "recommendedAction": "Continue conversation" | "Offer explanation" | "Notify human"
}

## HISTORY (Layer 4):
${historyText}
`;

  const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
  for (const model of MODEL_PRIORITY) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseText: { type: Type.STRING },
              newStatus: { type: Type.STRING, enum: [LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT] },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedAction: { type: Type.STRING }
            },
            required: ['responseText', 'newStatus', 'tags']
          }
        }
      });
      return JSON.parse(result.text!.trim());
    } catch (err) { 
        console.error(`[AI FAILOVER] Fallo en modelo ${model}, reintentando...`); 
    }
  }
  return null;
};
