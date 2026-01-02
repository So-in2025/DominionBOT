
import { GoogleGenAI, Type } from "@google/genai";
import { db } from '../database.js';
import { RadarSignal, User, MarketContextSnapshot, HiddenSignal } from '../types.js';
import { logService } from './logService.js';
import { v4 as uuidv4 } from 'uuid';
import { capabilityResolver } from './capabilityResolver.js'; // NEW IMPORT

class RadarService {
    
    public async processGroupMessage(userId: string, groupJid: string, groupName: string, senderJid: string, senderName: string | undefined, messageContent: string) {
        // 1. Resolve Capabilities FIRST
        const capabilities = await capabilityResolver.resolve(userId);

        // 2. Check if Radar is enabled and group is monitored
        const settings = await db.getRadarSettings(userId);
        
        if (!settings.isEnabled) return;
        if (!settings.monitoredGroups.includes(groupJid)) return;

        // 3. Early Filters (Safety Layer)
        const user = await db.getUser(userId);
        if (senderJid.includes(user?.whatsapp_number || 'xxxxx')) return; 

        // 4. Keyword Pre-filter (Optional optimization)
        if (settings.keywordsInclude && settings.keywordsInclude.length > 0) {
            const lowerContent = messageContent.toLowerCase();
            const hasKeyword = settings.keywordsInclude.some(k => lowerContent.includes(k.toLowerCase()));
            if (!hasKeyword) return;
        }

        // 5. RADAR 4.0: Context Injection using CAPABILITIES
        // Fetch recent signals based on Memory Depth from capabilities
        // Default was 5, now dynamic based on depth level
        const historyLimit = Math.max(3, Math.floor(capabilities.memoryDepth / 2)); // Use half memory depth for group context
        const recentSignals = await db.getRecentGroupSignals(groupJid, historyLimit);
        const contextHistory = recentSignals.map(s => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.senderName}: "${s.messageContent}"`).join('\n');

        // Fetch Group Memory (Long Term Context)
        const groupMemory = await db.getGroupMemory(groupJid);
        
        let memoryContext = "Sin memoria histórica.";
        if (groupMemory) {
            const recentSentiment = groupMemory.sentimentHistory.slice(-3).join(' -> ');
            memoryContext = `
            - Ventanas Exitosas Previas: ${groupMemory.successfulWindows}
            - Velocidad Respuesta Promedio: ${groupMemory.avgResponseTime || 'N/A'}s
            - Tendencia Sentimiento: ${recentSentiment || 'N/A'}
            `.trim();
        }

        // 6. AI Analysis (Predictive Engine)
        try {
            const analysisResult = await this.analyzeMessageWithAI(messageContent, groupName, contextHistory, memoryContext, user!, capabilities);
            
            // 7. Strategic Qualification using CAPABILITIES
            // Use dynamic confidence threshold instead of hardcoded 40
            const threshold = Math.max(40, capabilities.confidenceThreshold); // Minimum 40, scales up with depth

            if (analysisResult && analysisResult.analysis.score >= threshold) {
                
                // Calculate Strategic Score (Composite)
                let strategicScore = analysisResult.analysis.score;
                if (analysisResult.predictedWindow?.urgencyLevel === 'CRITICAL') strategicScore += 15;
                if (analysisResult.predictedWindow?.urgencyLevel === 'HIGH') strategicScore += 10;
                if (analysisResult.predictedWindow?.delayRisk === 'HIGH') strategicScore -= 10;
                strategicScore = Math.min(100, Math.max(0, strategicScore));

                const signal: RadarSignal = {
                    id: uuidv4(),
                    userId,
                    groupJid,
                    groupName: groupName || 'Grupo Desconocido',
                    senderJid,
                    senderName: senderName || 'Usuario Desconocido',
                    messageContent,
                    timestamp: new Date().toISOString(),
                    
                    // Mapped fields from AI
                    analysis: analysisResult.analysis,
                    marketContext: analysisResult.marketContext,
                    predictedWindow: analysisResult.predictedWindow,
                    hiddenSignals: analysisResult.hiddenSignals,
                    actionIntelligence: analysisResult.actionIntelligence,
                    strategicScore,
                    
                    status: 'NEW'
                };

                await db.createRadarSignal(signal);
                
                // 8. Update Group Memory (Feedback Loop)
                const newSentiment = analysisResult.marketContext?.sentiment || 'NEUTRAL';
                const currentHistory = groupMemory?.sentimentHistory || [];
                const newHistory = [...currentHistory, newSentiment].slice(-10); 
                
                await db.updateGroupMemory(groupJid, {
                    lastUpdated: new Date().toISOString(),
                    sentimentHistory: newHistory
                });

                logService.info(`[RADAR-4.0] 🔮 Predicción (Depth ${capabilities.depthLevel}): ${analysisResult.predictedWindow?.confidenceScore}% Confianza`, userId);
            }
        } catch (error) {
            console.error(`[RADAR] Error analyzing message:`, error);
        }
    }

    private async analyzeMessageWithAI(message: string, groupName: string, contextHistory: string, memoryContext: string, user: User, capabilities: any) {
        if (!user.settings.geminiApiKey) return null;

        // Inject Capabilities into Prompt
        const depthInstructions = `
Nivel de Profundidad Cognitiva: ${capabilities.depthLevel} / 10.
- Pases de Inferencia: ${capabilities.inferencePasses}
- Análisis de Tendencias: ${capabilities.canPredictTrends ? 'ACTIVO' : 'INACTIVO'}
- Señales Ocultas: ${capabilities.canAnalyzeHiddenSignals ? 'ACTIVO' : 'INACTIVO'}
`;

        const prompt = `
Contexto: Eres "Radar 4.0", un Motor de Ventaja Predictiva para el negocio: "${user.settings.productName}".
${depthInstructions}

Negocio del Usuario:
${user.settings.productDescription}

Historial Reciente del Grupo (Contexto de Mercado):
${contextHistory || "Sin contexto previo reciente."}

Memoria Histórica del Grupo (Tendencias):
${memoryContext}

Mensaje ACTUAL a Analizar (del grupo "${groupName}"):
"${message}"

Instrucciones Tácticas (V4):
1. Analiza el mensaje actual.
2. Usa la "Memoria Histórica" para ajustar la urgencia.
3. ${capabilities.canAnalyzeHiddenSignals ? 'Detecta "Señales Invisibles": Micro-cambios de lenguaje, tono emocional, urgencia oculta.' : 'Ignora señales sutiles, enfócate en lo explícito.'}
4. Predice la "Ventana de Oportunidad".
5. Genera inteligencia de acción.

Responde SOLO en JSON con la estructura definida.
`;

        const responseSchema: any = {
            type: Type.OBJECT,
            properties: {
                analysis: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        intentType: { type: Type.STRING, enum: ['SEARCH', 'COMPARISON', 'QUESTION', 'URGENT'] },
                        reasoning: { type: Type.STRING },
                        suggestedAction: { type: Type.STRING }
                    },
                    required: ['score', 'intentType', 'reasoning']
                },
                marketContext: {
                    type: Type.OBJECT,
                    properties: {
                        momentum: { type: Type.STRING, enum: ['ACCELERATING', 'STABLE', 'COOLING'] },
                        sentiment: { type: Type.STRING, enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'TENSE'] },
                        activeTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                        noiseLevel: { type: Type.NUMBER }
                    }
                },
                predictedWindow: {
                    type: Type.OBJECT,
                    properties: {
                        confidenceScore: { type: Type.NUMBER },
                        urgencyLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                        delayRisk: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
                        reasoning: { type: Type.STRING }
                    }
                },
                hiddenSignals: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, enum: ['MICRO_LANGUAGE', 'EMOTIONAL_SHIFT', 'SILENCE_PATTERN', 'CONVERGENCE'] },
                            description: { type: Type.STRING },
                            intensity: { type: Type.NUMBER }
                        }
                    }
                },
                actionIntelligence: {
                    type: Type.OBJECT,
                    properties: {
                        suggestedEntryType: { type: Type.STRING, enum: ['DIRECT', 'CONSULTATIVE', 'PRIVATE', 'WAIT'] },
                        communicationFraming: { type: Type.STRING },
                        spamRiskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
                        recommendedWaitTimeSeconds: { type: Type.NUMBER }
                    }
                }
            },
            required: ['analysis', 'predictedWindow']
        };

        const ai = new GoogleGenAI({ apiKey: user.settings.geminiApiKey });

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema
                }
            });

            const jsonText = response.text;
            if (!jsonText) return null;
            return JSON.parse(jsonText);

        } catch (e) {
            return null;
        }
    }
}

export const radarService = new RadarService();
