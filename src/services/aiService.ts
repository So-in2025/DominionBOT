
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype, Conversation } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js';
import { depthEngine } from './depthEngine.js';
import { db } from '../database.js';

const aiResponseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// --- BLACKLIST SYSTEM ---
const modelCooldowns = new Map<string, number>();
const MODEL_COOLDOWN_MS = 60 * 60 * 1000; // 60 Minutes

// Updated Priority List: 5-Tier Fallback Architecture for Maximum Availability
const MODEL_PRIORITY = [
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-3-pro-preview"
];

// ... (rest of the file)
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
  // LOGIC BRANCH: ADVANCED MODULAR ROUTER VS LINEAL MONOLITH
  
  let systemInstruction = "";

  if (settings.useAdvancedModel && settings.neuralConfig) {
      // --- ADVANCED MODULAR LOGIC ---
      logService.info(`[AI-ROUTER] Usando Arquitectura Modular para ${user.username}`, user.id);
      
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
Tienes acceso a los siguientes fragmentos de contexto especializados.
TU TAREA ES CLASIFICAR LA INTENCIÓN DEL CLIENTE Y USAR EL MÓDULO CORRECTO.

${modulesContext}

## REGLAS DE ENRUTAMIENTO Y VERDAD:
1. Analiza el último mensaje del cliente y el historial.
2. Si la intención coincide con un MÓDULO EXPERTO, ADOPTA ESA PERSONALIDAD TOTALMENTE.
3. **CANDADO COGNITIVO (PRECIOS):** Tu única fuente de verdad para precios es el texto dentro del [CONTEXTO ESPECÍFICO] del módulo seleccionado.
   - Si el módulo dice "USD 19/mes", ese es el precio.
   - Si el módulo dice "A convenir", di eso.
   - **PROHIBIDO:** Usar precios de tu entrenamiento general o inventar cifras que no estén explícitamente escritas en el módulo.
4. Responde de forma fluida, sin mencionar "Módulo X". Simplemente SÉ el experto.

## PARÁMETROS GLOBALES:
- Link Cierre: ${settings.ctaLink}
- Profundidad: ${capabilities.inferencePasses}
- ${capabilities.canPredictTrends ? 'Análisis de intención latente ACTIVO.' : ''}
`;

  } else {
      // --- CLASSIC LINEAL LOGIC ---
      systemInstruction = `
# CONSTITUCIÓN DOMINION BOT v2.8 (ELITE - Depth Level ${capabilities.depthLevel})
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina para "${settings.productName}".
Tu misión: Atender consultas y, si el plan lo permite, calificar la intención de compra.

## PARÁMETROS COGNITIVOS:
- Profundidad de Razonamiento: ${capabilities.inferencePasses} (1=Rápido, 3=Profundo)
- ${capabilities.canPredictTrends ? 'Activar análisis de intención latente.' : 'Análisis literal.'}

## REGLAS DE ORO (SEGURIDAD):
- Responde en Español Argentino Profesional (Voseo permitido).
- PROHIBIDO: Emojis excesivos, lenguaje de 'coach', mencionar que eres una IA.
- PROHIBIDO ALUCINAR PRECIOS: Tu única verdad sobre precios es: "${settings.priceText}". Si el usuario presiona por un número y el dato es "A convenir", NO INVENTES UNA CIFRA. En su lugar, explica que depende del proyecto y busca cerrar la reunión.
- Sé directo y eficiente.

## CONTEXTO DE PRODUCTO:
${settings.productDescription}
- Precio: ${settings.priceText}.
- Link de Cierre: ${settings.ctaLink}.
`;
  }

  if (features.lead_scoring) {
      systemInstruction += `
## PROTOCOLO DE CALIFICACIÓN (PLAN PRO):
Analiza el historial y determina el estado del lead (Frío, Tibio, Caliente).
`;
  }

  if (features.close_assist) {
      if (isSimulation) {
          // --- SIMULATION OVERRIDE ---
          // En simulación, queremos ver cómo la IA cerraría la venta, NO queremos silencio.
          systemInstruction += `
## MODO SIMULACIÓN ACTIVO:
- SI EL LEAD ES CALIENTE: IGNORA el protocolo de silencio (Shadow Mode).
- TU OBJETIVO: Asume el rol del MEJOR VENDEDOR HUMANO y cierra la venta con una respuesta directa y persuasiva ('responseText').
- RECUERDA: Usa SOLO la información de precios disponible en tu contexto/módulo. Si falta, vende la reunión.
`;
      } else {
          // --- PRODUCTION BEHAVIOR ---
          // En producción, silencio absoluto para proteger la venta.
          systemInstruction += `
## PROTOCOLO "HOT-SHADOW" (PLAN PRO):
- SI EL LEAD ES CALIENTE (listo para comprar): NO generes 'responseText'. En su lugar, genera 3 'suggestedReplies' para que el vendedor humano cierre.
- TU OBJETIVO: Alertar al humano y apartarte.
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

  // EXECUTE FAILOVER LOOP
  for (const modelName of MODEL_PRIORITY) {
    // 1. CHECK BLACKLIST
    if (modelCooldowns.has(modelName)) {
        const cooldownUntil = modelCooldowns.get(modelName)!;
        if (Date.now() < cooldownUntil) {
            logService.debug(`[AI-BLACKLIST] Skipping ${modelName} (Exhausted until ${new Date(cooldownUntil).toLocaleTimeString()})`, user.id);
            continue; // Skip to next model
        } else {
            modelCooldowns.delete(modelName); // Cooldown expired, unblock
        }
    }

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
      if (!jsonText) throw new Error(`Respuesta vacía de la IA (${modelName}).`);

      const result = JSON.parse(jsonText.trim());
      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;
      
      // --- START: Set Cache on Success ---
      if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
          const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
          aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: result });
          logService.info(`[AI-CACHE] SET for user ${user.username} using ${modelName}`, user.id);
      }
      // --- END: Set Cache ---

      // Clear cooldown if it existed (just in case)
      modelCooldowns.delete(modelName);

      return result;
    } catch (err: any) { 
        logService.warn(`[AI FAILOVER] Fallo con ${modelName}. Activando BLACKLIST (60m).`, user.id, user.username, { error: err.message });
        
        // 2. ADD TO BLACKLIST ON FAILURE
        modelCooldowns.set(modelName, Date.now() + MODEL_COOLDOWN_MS);
    }
  }
  
  return null;
};

// ... (rest of the file remains unchanged)
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
