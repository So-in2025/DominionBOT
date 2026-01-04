
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype, Conversation } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js';
import { depthEngine } from './depthEngine.js';
import { db } from '../database.js';
import { generateContentWithFallback } from './geminiService.js'; 

const aiResponseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; 

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
  
  // CACHE CHECK
  if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
      const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
      if (aiResponseCache.has(cacheKey)) {
          const cached = aiResponseCache.get(cacheKey)!;
          if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
              return cached.data;
          }
      }
  }

  const cleanKey = user.settings.geminiApiKey?.trim();
  if (!cleanKey) return null;
  
  let capabilities = await capabilityResolver.resolve(user.id);
  const features = planService.getClientFeatures(user);
  const settings = user.settings;

  const memoryLimit = capabilities.memoryDepth || 15;
  
  // FIX: Ensure clean sorting and filtering for context
  const historyMessages = [...conversation.messages]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-memoryLimit);

  const historyText = historyMessages.map(m => {
      // Map roles clearly for the AI
      let role = 'Vendedor (IA)';
      if (m.sender === 'user' || m.sender === 'elite_bot') {
          role = 'Cliente';
      } else if (m.sender === 'owner') {
          role = 'Vendedor (Humano)';
      }
      // Remove any system tags or brackets that might confuse the AI
      const cleanText = m.text.replace(/\[.*?\]/g, '').trim(); 
      return `${role}: ${cleanText}`;
  }).join('\n');

  const prompt = `
HISTORIAL DE CONVERSACIÓN (Contexto reciente):
${historyText}

INSTRUCCIÓN:
Analiza el ÚLTIMO mensaje del Cliente y genera la respuesta del Vendedor.
`;

  let systemInstruction = "";

  if (settings.useAdvancedModel && settings.neuralConfig) {
      const modulesContext = settings.neuralConfig.modules.map(m => `
--- MÓDULO EXPERTO: ${m.name} ---
[ACTIVADORES]: ${m.triggerKeywords}
[INFORMACIÓN]:
${m.contextContent}
${m.moduleUrl ? `[LINK RECURSO]: ${m.moduleUrl}` : ''}
`).join('\n');

      systemInstruction = `
# SISTEMA NEURAL MODULAR
Identidad: ${settings.neuralConfig.masterIdentity}

MÓDULOS DE CONOCIMIENTO:
${modulesContext}

REGLAS:
1. Responde como un humano en WhatsApp (breve, directo).
2. Usa la información de los módulos si aplica.
`;
  } else {
      systemInstruction = `
# ROL: VENDEDOR EXPERTO (WhatsApp)
Negocio: "${settings.productName}".
Contexto: ${settings.productDescription}
Precio Base: ${settings.priceText}
Link Cierre: ${settings.ctaLink}

REGLAS DE FORMATO:
1. NUNCA uses "**". Usa "*" para negritas suaves.
2. NO saludes si ya hay conversación. Ve al grano.
3. Respuestas CORTAS (max 2 párrafos).
4. Objetivo: Llevar al cierre o agendar.
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
  }
  
  try {
      const response = await generateContentWithFallback({
          apiKey: cleanKey,
          prompt: prompt,
          systemInstruction: systemInstruction,
          responseSchema: responseSchema
      });

      if (!response || !response.text) throw new Error("Empty AI response");
      
      const result = JSON.parse(response.text.trim());

      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;
      
      if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
          const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
          aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: result });
      }

      return result;

  } catch (err: any) {
      logService.error(`[AI-SERVICE] Error`, err, user.id);
      return { 
          responseText: "Disculpa, estoy verificando esa información. ¿Me aguardas un momento?", 
          newStatus: conversation.status, 
          tags: ['AI_FAILURE'] 
      };
  }
};

export const regenerateSimulationScript = async (userId: string): Promise<void> => {
    const user = await db.getUser(userId);
    if (!user || !user.settings.geminiApiKey) return;

    const prompt = `
        ACTÚA COMO: Diseñador de Pruebas de Software (QA) especializado en Chatbots de Venta.
        
        CONTEXTO DEL NEGOCIO A PROBAR:
        Nombre: "${user.settings.productName}"
        Descripción: "${user.settings.productDescription}"
        
        OBJETIVO:
        Genera una secuencia de mensajes que un "Cliente Potencial" enviaría por WhatsApp para probar la capacidad de venta del bot.
        La secuencia debe cubrir: Saludo -> Pregunta Específica -> Objeción de Precio -> Intención de Compra.
        
        FORMATO DE SALIDA (JSON ARRAY de Strings):
        ["Mensaje 1", "Mensaje 2", "Mensaje 3", "Mensaje 4"]
    `;

    try {
        const response = await generateContentWithFallback({
            apiKey: user.settings.geminiApiKey,
            prompt: prompt,
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        });

        if (response && response.text) {
            let script: string[] = [];
            try {
                script = JSON.parse(response.text);
            } catch {
                const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
                script = JSON.parse(cleanText);
            }

            if (Array.isArray(script)) {
                const currentLab = user.simulationLab || { 
                    experiments: [], 
                    aggregatedScore: 0, 
                    topFailurePatterns: {}, 
                    customScript: [] 
                };
                
                currentLab.customScript = script;
                
                await db.updateUser(userId, { simulationLab: currentLab });
                logService.info(`[AI-SERVICE] Simulation script regenerated for ${userId}`, userId);
            }
        }
    } catch (e) {
        logService.error('Error generating simulation script', e, userId);
    }
};
