
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, BotSettings, PromptArchetype } from '../types.js';

// Jerarquía de modelos para failover táctico
const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3-pro-preview"];
const MAX_CONTEXT_MESSAGES = 15;

export const generateBotResponse = async (
  conversationHistory: Message[],
  settings: BotSettings
): Promise<{ responseText?: string, suggestedReplies?: string[], newStatus: LeadStatus, tags: string[], recommendedAction?: string } | null> => {
  
  if (!settings.isActive) return null;

  // Layer 4: Context Layer
  const historyText = conversationHistory.slice(-MAX_CONTEXT_MESSAGES).map(m => {
      const role = m.sender === 'user' ? 'Cliente' : (m.sender === 'owner' ? 'Agente_Humano' : 'Dominion_Bot');
      return `${role}: ${m.text}`;
  }).join('\n');

  // Layer 2: Identity Tuning
  const archetypes = {
      [PromptArchetype.CONSULTATIVE]: "Estrategia: Consultiva. Escucha activa y calificación.",
      [PromptArchetype.DIRECT_CLOSER]: "Estrategia: Closer. Enfoque en disponibilidad, precio y cierre.",
      [PromptArchetype.SUPPORT]: "Estrategia: Soporte. Técnico y resolutivo.",
      [PromptArchetype.CUSTOM]: `Estrategia Personalizada: ${settings.productDescription}`
  };

  const toneMap = ["Extremadamente Formal", "Profesional Seco", "Equilibrado", "Cercano", "Amigable"];
  const rhythmMap = ["Conciso/Bulletpoints", "Breve", "Natural", "Explicativo", "Detallado"];
  const intensityMap = ["Baja (Solo info)", "Moderada", "Persuasiva", "Agresiva", "Cierre Inmediato"];

  const systemInstruction = `
# CONSTITUCIÓN DOMINION BOT v2.8 (ELITE SHADOW MODE)
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina.
Tu misión: Calificar leads para "${settings.productName}" y detectar intención de compra.

## REGLAS DE ORO:
- Responde en Español Argentino Profesional (Voseo permitido pero con respeto comercial).
- PROHIBIDO: Emojis excesivos, lenguaje de 'coach', mencionar que eres una IA.
- Sé directo, eficiente y enfocado en el valor comercial.

## AJUSTES DE PERSONALIDAD (IDENTITY LAYER):
- Arquetipo: ${archetypes[settings.archetype]}
- Tono: ${toneMap[settings.toneValue - 1]}
- Ritmo de Respuesta: ${rhythmMap[settings.rhythmValue - 1]}
- Intensidad de Venta: ${intensityMap[settings.intensityValue - 1]}

## CONTEXTO DE PRODUCTO (KNOWLEDGE LAYER):
${settings.productDescription}
- Precio: ${settings.priceText}.
- Link de Pago/Cierre: ${settings.ctaLink}.

## PROTOCOLO "HOT-SHADOW" (CRÍTICO):
1. Analiza el historial y determina el estado (COLD, WARM, HOT).
2. **SI EL LEAD ES COLD O WARM:** Genera una 'responseText' para responder automáticamente.
3. **SI EL LEAD ES HOT (Listo para comprar/Objeción clave):**
   - **NO** generes 'responseText' (déjalo vacío).
   - Genera 'suggestedReplies': Un array con 3 opciones de cierre contundentes para que el vendedor humano elija.
   - Opción 1: Cierre directo (Link).
   - Opción 2: Manejo de objeción.
   - Opción 3: Pregunta de cierre (Doble alternativa).

## FORMATO DE SALIDA (JSON):
{
  "responseText": "Mensaje automático (Solo si COLD/WARM)",
  "suggestedReplies": ["Opción 1", "Opción 2", "Opción 3"] (Solo si HOT),
  "newStatus": "Frío" | "Tibio" | "Caliente",
  "tags": ["interés_precio", "objeción_tiempo", "listo_para_pagar", etc],
  "recommendedAction": "Breve nota para el humano"
}

## HISTORIAL DE SEÑALES:
${historyText}
`;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  for (const modelName of MODEL_PRIORITY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseText: { type: Type.STRING },
              suggestedReplies: { type: Type.ARRAY, items: { type: Type.STRING } },
              newStatus: { type: Type.STRING, enum: [LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT] },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedAction: { type: Type.STRING }
            },
            required: ['newStatus', 'tags']
          }
        }
      });
      
      const jsonText = response.text;
      if (!jsonText) throw new Error("Respuesta vacía de la IA.");

      return JSON.parse(jsonText.trim());
    } catch (err) { 
        console.warn(`[AI FAILOVER] Nodo falló con ${modelName}, intentando siguiente...`); 
    }
  }
  
  return null;
};
