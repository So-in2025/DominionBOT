
import { GoogleGenAI, Type } from "@google/genai";
import { Message, LeadStatus, User, PromptArchetype, Conversation } from '../types.js';
import { planService } from './planService.js';
import { logService } from './logService.js';
import { capabilityResolver } from './capabilityResolver.js';
import { depthEngine } from './depthEngine.js';
import { db } from '../database.js';
import { generateContentWithFallback } from './geminiService.js'; // NEW IMPORT

const aiResponseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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
      let role = 'Vendedor';
      if (m.sender === 'user' || m.sender === 'elite_bot') {
          role = 'Cliente';
      } else if (m.sender === 'owner') {
          role = 'Vendedor_Humano';
      }
      return `${role}: ${m.text}`;
  }).join('\n');

  const prompt = `## HISTORIAL DE CONVERSACIÓN (Últimos ${memoryLimit} msgs):\n${historyText}`;

  // 3. CONSTRUCT SYSTEM INSTRUCTION
  let systemInstruction = "";

  if (settings.useAdvancedModel && settings.neuralConfig) {
      // --- ADVANCED MODULAR LOGIC ---
      const modulesContext = settings.neuralConfig.modules.map(m => `
--- MÓDULO EXPERTO: ${m.name} ---
[ACTIVADORES]: ${m.triggerKeywords}
[INFORMACIÓN EXPERTA]:
${m.contextContent}
----------------------------------
`).join('\n');

      systemInstruction = `
# SISTEMA NEURAL MODULAR (ROUTER ACTIVO)
Actúa como el Nodo Central de Inteligencia para "${settings.productName}".

## IDENTIDAD MAESTRA:
${settings.neuralConfig.masterIdentity}

## MÓDULOS DE CONOCIMIENTO:
${modulesContext}

## REGLAS DE EJECUCIÓN:
1. Analiza la intención del cliente.
2. Si coincide con un MÓDULO EXPERTO, usa esa información como verdad absoluta.
3. Responde como un humano en WhatsApp (breve, directo).
`;
  } else {
      // --- CLASSIC LINEAL LOGIC (HUMANIZED) ---
      systemInstruction = `
# ROL: VENDEDOR EXPERTO (WhatsApp)
Estás operando el WhatsApp comercial de "${settings.productName}".
Tu objetivo es VENDER y ASISTIR, no dar discursos ni parecer un folleto.

## 🧠 TU CEREBRO (DATOS DEL NEGOCIO):
${settings.productDescription}
- PRECIO OFICIAL: ${settings.priceText} (Úsalo solo si preguntan específicamente).
- LINK DE CIERRE: ${settings.ctaLink}.

## 🚫 REGLAS DE FORMATO (CRÍTICO):
1. **NUNCA uses doble asterisco (**texto**).** WhatsApp NO lo reconoce. Rompe la ilusión humana inmediatamente.
2. Usa un solo asterisco (*texto*) para negritas, pero ÚSALO POCO. Solo para resaltar precios o datos clave. El exceso de negritas parece spam.
3. **NO uses listas con viñetas (- )** a menos que te pidan explícitamente "qué incluye". Escribe en párrafos cortos y fluidos.
4. **NO SALUDES** como un robot ("Hola, soy el especialista..."). Si ya saludaste, ve al grano. Si el cliente ya sabe quién eres, no te presentes.
5. **BREVEDAD:** Si puedes decirlo en 10 palabras, no uses 20. La gente en WhatsApp no lee biblias.
6. **TONO:** Usa voseo natural si es Argentina ("¿Cómo estás?", "¿Qué te parece?"). Profesional pero cercano. Evita palabras como "estimado", "cordial saludo".

## 🎯 OBJETIVO TÁCTICO:
Lleva al cliente al cierre o a agendar. Si duda, resuelve la duda en una frase y vuelve a proponer el siguiente paso. No dejes el chat abierto sin una pregunta o call-to-action.
`;
  }

  // --- LOGICA DE ESTADOS SMARTER (Protocolo Intervención) ---
  const hasHumanIntervened = conversation.tags.includes('HUMAN_TOUCH');
  
  systemInstruction += `
## TERMÓMETRO DE VENTA (ESTADOS):
- **FRÍO (COLD):** Curiosidad inicial, sin compromiso.
- **TIBIO (WARM):** Pregunta detalles, precios, dudas. Hay interés real.
- **CALIENTE (HOT):** Pide CBU, Link de Pago, Dirección exacta o dice "Lo quiero". Cierre inminente.

${hasHumanIntervened ? `
⚠️ ALERTA: Un humano ya intervino.
TU MISIÓN AHORA: Apoyo Táctico. Responde dudas técnicas. NO intentes cerrar agresivamente sobre el humano. Mantén el estado TIBIO (WARM) a menos que el cliente diga explícitamente "Compro ya".
` : ''}
`;

  // --- GUARDIA AUTÓNOMA VS SHADOW MODE ---
  if (features.close_assist) {
      if (isSimulation || settings.isAutonomousClosing) {
          systemInstruction += `
## MODO AUTÓNOMO (CIERRE ACTIVO):
- Si detectas intención de compra (HOT), TIENES PERMISO PARA CERRAR.
- Pasa el precio "${settings.priceText}" y el link "${settings.ctaLink}" con confianza.
- Frase de cierre sugerida: "Te dejo el link para confirmar ahora: [LINK]. ¿Te queda alguna duda?"
`;
      } else {
          systemInstruction += `
## MODO SHADOW (ASISTENTE SILENCIOSO):
- Si el cliente está LISTO PARA COMPRAR (HOT):
- 1. Cambia 'newStatus' a HOT.
- 2. Deja 'responseText' VACÍO (o null).
- 3. Genera 3 'suggestedReplies' perfectas para que el humano las envíe con un clic.
`;
      }
  }
  
  const responseSchema: any = {
      type: Type.OBJECT,
      properties: {
          responseText: { type: Type.STRING, description: "El mensaje que se enviará por WhatsApp. Déjalo vacío si es momento de callar (Shadow Mode)." },
          newStatus: { type: Type.STRING, enum: [LeadStatus.COLD, LeadStatus.WARM, LeadStatus.HOT] },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['newStatus', 'tags']
  };

  if(features.close_assist) {
      responseSchema.properties.suggestedReplies = { type: Type.ARRAY, items: { type: Type.STRING } };
      responseSchema.properties.recommendedAction = { type: Type.STRING };
  }
  
  // Clean empty/null values from user inputs to avoid JSON errors
  prompt.replace(/undefined/g, '');

  try {
      const response = await generateContentWithFallback({
          apiKey: cleanKey,
          prompt: prompt,
          systemInstruction: systemInstruction,
          responseSchema: responseSchema
      });

      if (!response || !response.text) {
          throw new Error("Respuesta vacía del servicio de IA.");
      }
      
      const jsonText = response.text;
      const result = JSON.parse(jsonText.trim());

      // Fallback/Safety Defaults
      if (!features.lead_scoring) result.newStatus = LeadStatus.WARM;
      if (!features.close_assist) result.suggestedReplies = undefined;
      
      // Cache Result
      if (lastMessage && (lastMessage.sender === 'user' || lastMessage.sender === 'elite_bot')) {
          const cacheKey = `${user.id}::${lastMessage.text.trim()}`;
          aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: result });
      }

      return result;

  } catch (err: any) {
      logService.error(`[AI-SERVICE] Fallo total de la matriz de IA para ${user.username}`, err, user.id);
      // Fallback a una respuesta segura en caso de fallo total, pero HUMANIZADA
      return { 
          responseText: "Disculpa, dame un segundo que reviso eso y te confirmo.", 
          newStatus: conversation.status, 
          tags: ['AI_FAILURE'] 
      };
  }
};

export const regenerateSimulationScript = async (userId: string) => {
    try {
        const user = await db.getUser(userId);
        if (!user || !user.settings.geminiApiKey) return;

        logService.info(`[SIM-LAB] Generando script de estrés para ${user.username}...`, userId);
        
        const prompt = `
        ACT AS: Un cliente potencial escéptico y directo en WhatsApp.
        CONTEXTO DE NEGOCIO: "${user.settings.productDescription}"
        
        TU TAREA:
        Genera una secuencia de 5 mensajes cronológicos que simulen una compra difícil.
        
        REGLAS:
        - Español Argentino.
        - Mensajes cortos (tipo WhatsApp).
        - Debe haber una objeción de precio o competencia.
        
        OUTPUT JSON: { "script": ["Mensaje 1", "Mensaje 2", ...] }
        `;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                script: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        };

        const response = await generateContentWithFallback({
            apiKey: user.settings.geminiApiKey,
            prompt: prompt,
            responseSchema: responseSchema
        });

        if (!response || !response.text) throw new Error("Empty AI response");

        const json = JSON.parse(response.text || '{}');
        if (json.script && Array.isArray(json.script)) {
            const currentLab = user.simulationLab || { experiments: [], aggregatedScore: 0, topFailurePatterns: {} };
            const updatedLab = { ...currentLab, customScript: json.script };
            await db.updateUser(userId, { simulationLab: updatedLab });
        }

    } catch (e: any) {
        logService.error(`[SIM-LAB] Fallo al generar script.`, e, userId);
    }
};
