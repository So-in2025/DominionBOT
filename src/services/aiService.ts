
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype, Conversation } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js';
import { depthEngine } from './depthEngine.js';
import { db } from '../database.js';

const aiResponseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// --- BLACKLIST SYSTEM (PERSISTENT VIA DB) ---
// const modelCooldowns = new Map<string, number>(); // REMOVED IN FAVOR OF DB
const MODEL_COOLDOWN_MS = 60 * 60 * 1000; // 60 Minutes

// Updated Priority List: 5-Tier Fallback Architecture for Maximum Availability
const MODEL_PRIORITY = [
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-3-pro-preview"
];

export const generateBotResponse = async (
  conversation: Conversation,
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

  // --- START: AI Caching ---
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
      const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
      if (aiResponseCache.has(cacheKey)) {
          const cached = aiResponseCache.get(cacheKey)!;
          if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
              logService.info(`[AI-CACHE] HIT for user ${user.username}`, user.id);
              return cached.data;
          }
      }
  }
  // --- END: AI Caching ---

  const cleanKey = user.settings.geminiApiKey?.trim();

  if (!cleanKey) {
      logService.error(`[AI-SERVICE] Usuario ${user.username} (ID: ${user.id}) intentó generar respuesta AI sin API Key de Gemini configurada.`, null, user.id, user.username);
      if (isSimulation) {
          return { responseText: "[ERROR SISTEMA] No has configurado tu API Key de Gemini. Ve a Configuración > Panel de Control de Gemini.", newStatus: LeadStatus.COLD, tags: ['ERROR_CONFIG'] };
      }
      return null; 
  }
  
  // 1. RESOLVE CAPABILITIES (WITH DEPTH BRAKE)
  let capabilities = await capabilityResolver.resolve(user.id);
  if (capabilities.depthLevel >= 10 && conversation.status === LeadStatus.COLD) {
      logService.warn(`[AI-DEPTH-BRAKE] Applied: Lvl ${capabilities.depthLevel} -> Lvl 3 for COLD lead.`, user.id);
      capabilities = depthEngine.resolve(3);
  }

  const features = planService.getClientFeatures(user);
  const settings = user.settings;

  // 2. Adjust History Depth based on Capabilities
  const memoryLimit = capabilities.memoryDepth || 15;
  const historyText = conversation.messages.slice(-memoryLimit).map(m => {
      let role = 'Dominion_Bot';
      if (m.sender === 'user' || m.sender === 'elite_bot') {
          role = 'Cliente';
      } else if (m.sender === 'owner') {
          role = 'Agente_Humano';
      }
      return `${role}: ${m.text}`;
  }).join('\n');

  const prompt = `## HISTORIAL DE SEÑALES (Profundidad: ${memoryLimit} msgs):\n${historyText}`;

  // 3. CONSTRUCT SYSTEM INSTRUCTION
  let systemInstruction = "";

  if (settings.useAdvancedModel && settings.neuralConfig) {
      // --- ADVANCED MODULAR LOGIC ---
      const modulesContext = settings.neuralConfig.modules.map(m => `
--- MÓDULO EXPERTO: ${m.name} ---
[PALABRAS CLAVE / INTENCIÓN]: ${m.triggerKeywords}
[CONTEXTO ESPECÍFICO (FUENTE DE VERDAD)]:
${m.contextContent}
----------------------------------
`).join('\n');

      systemInstruction = `
# SISTEMA NEURAL MODULAR v1.0 (ROUTER ACTIVO)
Eres el Nodo Central de Inteligencia para "${settings.productName}".
Tu Nivel de Profundidad Cognitiva es ${capabilities.depthLevel}.

## TU MISIÓN GLOBAL (IDENTIDAD MAESTRA):
${settings.neuralConfig.masterIdentity}

## MÓDULOS DE CONOCIMIENTO DISPONIBLES:
${modulesContext}

## REGLAS DE ENRUTAMIENTO Y VERDAD:
1. Analiza el último mensaje del cliente and el historial.
2. Si la intención coincide con un MÓDULO EXPERTO, ADOPTA ESA PERSONALIDAD TOTALMENTE.
3. **CANDADO COGNITIVO (PRECIOS):** Tu única fuente de verdad para precios es el texto dentro del [CONTEXTO ESPECÍFICO].
4. Responde de forma fluida.
`;
  } else {
      // --- CLASSIC LINEAL LOGIC ---
      systemInstruction = `
# CONSTITUCIÓN DOMINION BOT v2.9 (ELITE - Depth Level ${capabilities.depthLevel})
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina para "${settings.productName}".

## REGLAS DE ORO:
- Responde en Español Argentino Profesional (Voseo).
- PROHIBIDO: Emojis excesivos, mencionar que eres una IA.
- PROHIBIDO ALUCINAR PRECIOS: Tu única verdad es: "${settings.priceText}".
- Sé directo y eficiente.

## CONTEXTO DE PRODUCTO:
${settings.productDescription}
- Precio: ${settings.priceText}.
- Link de Cierre: ${settings.ctaLink}.
`;
  }

  // --- LOGICA DE ESTADOS SMARTER (Protocolo Intervención) ---
  const hasHumanIntervened = conversation.tags.includes('HUMAN_TOUCH');
  
  systemInstruction += `
## PROTOCOLO DE CALIFICACIÓN INTELIGENTE:
- **FRÍO (COLD):** Consulta inicial o sin intención clara.
- **TIBIO (WARM):** El cliente tiene dudas, pide detalles, pregunta "qué incluye" o muestra interés pero TIENE PREGUNTAS. 
- **CALIENTE (HOT):** El cliente NO TIENE MÁS DUDAS. Está pidiendo el link de pago, el CBU, o confirmando que va a comprar AHORA MISMO.

${hasHumanIntervened ? `
### ATENCIÓN: INTERVENCIÓN HUMANA DETECTADA (HUMAN_TOUCH)
Un Agente Humano ya participó en este chat. 
TU NUEVA MISIÓN: Quédate en estado TIBIO (WARM) y responde CUALQUIER duda técnica o de confianza que surja. 
NO actives el modo CALIENTE (HOT) a menos que el cliente esté 100% listo para el pago final y no tenga ninguna otra duda pendiente. 
Tu prioridad es APOYAR al humano, no callarte prematuramente.
` : ''}
`;

  // --- GUARDIA AUTÓNOMA VS SHADOW MODE ---
  if (features.close_assist) {
      if (isSimulation || settings.isAutonomousClosing) {
          systemInstruction += `
## PROTOCOLO DE CIERRE AUTÓNOMO (GUARDIA ACTIVA - isAutonomousClosing=TRUE):
- SI EL LEAD ES CALIENTE: Tienes permiso total para cerrar la venta de forma autónoma. NO te silencies. 
- Genera una 'responseText' de cierre convincente.
- Usa el precio exacto "${settings.priceText}" y el link "${settings.ctaLink}".
`;
      } else {
          systemInstruction += `
## PROTOCOLO "HOT-SHADOW" (MODO MANUAL - isAutonomousClosing=FALSE):
- SI EL LEAD ES CALIENTE (y solo si está 100% para cerrar sin dudas): NO generes 'responseText'. Genera 3 'suggestedReplies' para que el humano las use.
`;
      }
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
    // CHECK PERSISTENT COOLDOWN
    const cooldownUntil = await db.getModelCooldown(modelName);
    if (cooldownUntil && Date.now() < cooldownUntil) {
        // Skip silently, or log debug
        continue;
    }

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: prompt }] }],
        config: { systemInstruction, responseMimeType: "application/json", responseSchema }
      });
      
      const jsonText = response.text;
      if (!jsonText) throw new Error(`Respuesta vacía`);

      const result = JSON.parse(jsonText.trim());
      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;
      
      if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
          const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
          aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: result });
      }

      // Success? Clear cooldown just in case (optional, usually set on fail)
      // await db.setModelCooldown(modelName, 0); // Not necessary if we rely on expiration
      return result;

    } catch (err: any) { 
        logService.warn(`[AI FAILOVER] Fallo con ${modelName}.`, user.id, user.username);
        // SET PERSISTENT COOLDOWN
        await db.setModelCooldown(modelName, Date.now() + MODEL_COOLDOWN_MS);
    }
  }
  
  return null;
};

export const regenerateSimulationScript = async (userId: string) => {
    try {
        const user = await db.getUser(userId);
        if (!user || !user.settings.geminiApiKey) return;

        logService.info(`[SIM-LAB] Generando script de estrés para ${user.username}...`, userId);

        const ai = new GoogleGenAI({ apiKey: user.settings.geminiApiKey });
        
        const prompt = `
        ACT AS: Un cliente potencial escéptico y directo.
        
        CONTEXTO DE NEGOCIO (Lo que estás evaluando comprar):
        "${user.settings.productDescription}"
        
        TU TAREA:
        Genera una secuencia de 5 a 7 mensajes cronológicos que simulen una interacción de compra natural y desafiante.
        Debes empezar desde un "Hola" frío, pasar por preguntas sobre el producto, objeciones de precio, y terminar preguntando cómo comprar (o dudando).
        
        REGLAS:
        - Idioma: Español Argentino (Natural, coloquial pero serio).
        - Mensajes cortos (como en WhatsApp).
        - Incluye al menos 1 pregunta difícil u objeción.
        
        OUTPUT FORMAT (JSON):
        {
            "script": ["Mensaje 1", "Mensaje 2", ...]
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ text: prompt }] }],
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        script: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });

        const json = JSON.parse(response.text || '{}');
        if (json.script && Array.isArray(json.script) && json.script.length > 0) {
            
            // Save to User Simulation Lab
            const currentLab = user.simulationLab || { experiments: [], aggregatedScore: 0, topFailurePatterns: {} };
            const updatedLab = { ...currentLab, customScript: json.script };
            
            await db.updateUser(userId, { simulationLab: updatedLab });
            logService.info(`[SIM-LAB] Script personalizado guardado (${json.script.length} msgs).`, userId);
        }

    } catch (e: any) {
        logService.error(`[SIM-LAB] Fallo al generar script.`, e, userId);
    }
};
