
// ... (imports remain the same)
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype, Conversation, BrainModule } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js';
import { depthEngine } from './depthEngine.js';
import { db } from '../database.js';

const aiResponseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Updated Priority List: Try new preview, then stable flash exp, then lite.
const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-2.0-flash-exp", "gemini-flash-lite-latest"];

// --- NEW HELPER: System Instruction Builder ---
const buildSystemInstruction = (user: User, capabilities: any, features: any, context: string) => {
  const settings = user.settings;
  let instruction = `
# CONSTITUCIÓN DOMINION BOT v3.1 (ELITE - Depth Level ${capabilities.depthLevel})
Eres un Agente Comercial Autónomo operando en Mendoza, Argentina para "${settings.productName}".
Tu misión: Atender consultas y, si el plan lo permite, calificar la intención de compra.

## PARÁMETROS COGNITIVOS:
- Profundidad de Razonamiento: ${capabilities.inferencePasses} (1=Rápido, 3=Profundo)
- ${capabilities.canPredictTrends ? 'Activar análisis de intención latente.' : 'Análisis literal.'}

## REGLAS DE ORO:
- Responde en Español Argentino Profesional (Voseo permitido).
- PROHIBIDO: Emojis excesivos, lenguaje de 'coach', mencionar que eres una IA.
- Sé directo y eficiente.

## CONTEXTO OPERATIVO (CEREBRO ACTUAL):
${context}

- Precio: ${settings.priceText}.
- Link de Cierre: ${settings.ctaLink}.
`;

  if (features.lead_scoring) {
      instruction += `
## PROTOCOLO DE CALIFICACIÓN (PLAN PRO):
Analiza el historial y determina el estado del lead (Frío, Tibio, Caliente).
`;
  }

  if (features.close_assist) {
      instruction += `
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
  
  instruction += `
## FORMATO DE SALIDA (JSON):
${JSON.stringify(Object.keys(responseSchema.properties))}
`;
  return { instruction, schema: responseSchema };
};


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

  const cleanKey = user.settings.geminiApiKey?.trim();

  if (!cleanKey) {
      logService.error(`[AI-SERVICE] Usuario ${user.username} (ID: ${user.id}) intentó generar respuesta AI sin API Key de Gemini configurada.`, null, user.id, user.username);
      if (isSimulation) {
          return { responseText: "[ERROR SISTEMA] No has configurado tu API Key de Gemini. Ve a Configuración > Panel de Control de Gemini.", newStatus: LeadStatus.COLD, tags: ['ERROR_CONFIG'] };
      }
      return null; 
  }
  
  let capabilities = await capabilityResolver.resolve(user.id);
  if (capabilities.depthLevel >= 10 && conversation.status === LeadStatus.COLD) {
      logService.warn(`[AI-DEPTH-BRAKE] Applied: Lvl ${capabilities.depthLevel} -> Lvl 3 for COLD lead.`, user.id);
      capabilities = depthEngine.resolve(3);
  }

  const features = planService.getClientFeatures(user);
  
  // --- BRAIN ARCHITECTURE LOGIC ---
  const arch = user.settings.brainArchitecture;
  let systemInstruction: string;
  let responseSchema: any;
  const ai = new GoogleGenAI({ apiKey: cleanKey });

  if (arch?.type === 'modular' && arch.modules.length > 0) {
    logService.debug(`[AI-SERVICE] Modular brain detected for ${user.username}`, user.id);
    const lastMessageText = conversation.messages[conversation.messages.length - 1]?.text;
    if (!lastMessageText) return null;

    const defaultModule = arch.modules.find(m => m.id === arch.defaultModuleId) || arch.modules[0];
    let selectedModule: BrainModule = defaultModule;

    try {
      const triagePrompt = `
        Analyze the user's message and select the most relevant module based on its triggers.
        User message: "${lastMessageText}"

        Available modules:
        ${arch.modules.map(m => `- ID: ${m.id}, Name: ${m.name}, Triggers: "${m.triggers.join(', ')}"`).join('\n')}

        Respond ONLY with a JSON object containing the ID of the best matching module.
        If no module is a clear match, use the default module ID: "${defaultModule.id}".
        JSON format: { "moduleId": "..." }
      `;

      const triageResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: triagePrompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const triageResult = JSON.parse(triageResponse.text || '{}');
      const foundModule = arch.modules.find(m => m.id === triageResult.moduleId);
      if (foundModule) {
        selectedModule = foundModule;
      }
      logService.info(`[AI-TRIAGE] Selected module "${selectedModule.name}" for user ${user.username}`, user.id);
    } catch (triageError) {
      logService.error(`[AI-TRIAGE] Triage failed for ${user.username}, falling back to default.`, triageError, user.id);
    }
    
    const { instruction, schema } = buildSystemInstruction(user, capabilities, features, selectedModule.context);
    systemInstruction = instruction;
    responseSchema = schema;

  } else {
    logService.debug(`[AI-SERVICE] Monolithic brain detected for ${user.username}`, user.id);
    const { instruction, schema } = buildSystemInstruction(user, capabilities, features, user.settings.productDescription);
    systemInstruction = instruction;
    responseSchema = schema;
  }
  // --- END OF ARCHITECTURE LOGIC ---

  const memoryLimit = capabilities.memoryDepth || 15;
  const historyText = conversation.messages.slice(-memoryLimit).map(m => {
      let role = 'Dominion_Bot';
      if (m.sender === 'user' || m.sender === 'elite_bot') { role = 'Cliente'; } 
      else if (m.sender === 'owner') { role = 'Agente_Humano'; }
      return `${role}: ${m.text}`;
  }).join('\n');
  const prompt = `## HISTORIAL DE SEÑALES (Profundidad: ${memoryLimit} msgs):\n${historyText}`;
  
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
      
      if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
          const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
          aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: result });
          logService.info(`[AI-CACHE] SET for user ${user.username}`, user.id);
      }

      return result;
    } catch (err: any) { 
        logService.warn(`[AI FAILOVER] Fallo con ${modelName}, intentando siguiente...`, user.id, user.username, { error: err.message }); 
    }
  }
  
  return null;
};

// --- NEW FUNCTION: Autonomous Script Generator ---
export const regenerateSimulationScript = async (userId: string) => {
    try {
        const user = await db.getUser(userId);
        if (!user || !user.settings.geminiApiKey) return;

        logService.info(`[SIM-LAB] Generando script de estrés para ${user.username}...`, userId);

        const ai = new GoogleGenAI({ apiKey: user.settings.geminiApiKey });
        
        let contextForScript = user.settings.productDescription;
        if(user.settings.brainArchitecture?.type === 'modular' && user.settings.brainArchitecture.modules.length > 0) {
            contextForScript = user.settings.brainArchitecture.modules.map(m => m.context).join('\n\n---\n\n');
        }

        const prompt = `
        ACT AS: Un cliente potencial escéptico y directo.
        
        CONTEXTO DE NEGOCIO (Lo que estás evaluando comprar):
        "${contextForScript}"
        
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
