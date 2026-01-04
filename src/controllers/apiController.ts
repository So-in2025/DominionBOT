import { Buffer } from 'buffer';
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid, fetchUserGroups, ELITE_BOT_JID, ELITE_BOT_NAME, DOMINION_NETWORK_JID } from '../whatsapp/client.js'; 
import { conversationService } from '../services/conversationService.js';
import { Message, LeadStatus, User, Conversation, SimulationScenario, EvaluationResult, Campaign, RadarSignal, InternalNote, SimulationRun, RadarSettings, IntentSignal, ConnectionOpportunity, NetworkProfile, PermissionStatus, WhatsAppGroup, ConnectionStatus } from '../types.js'; 
import { db, sanitizeKey } from '../database.js'; 
import { logService } from '../services/logService.js';
import { campaignService } from '../services/campaignService.js'; 
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { radarService } from '../services/radarService.js';
import { Request as ExpressRequest, Response } from 'express';
import { createHash } from 'crypto'; 
import { generateContentWithFallback } from '../services/geminiService.js';
import { Type } from "@google/genai";
import { normalizeJid } from '../utils/jidUtils.js';

interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends ExpressRequest<P, ResBody, ReqBody, ReqQuery> {
    user: { id: string; username: string; role: string; };
    body: ReqBody;
    params: P;
    query: ReqQuery;
}

const getClientUser = (req: AuthenticatedRequest) => ({ id: req.user.id, username: req.user.username });

export const handleGetStatus = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        const status = getSessionStatus(id);
        res.json(status);
    } catch (e: any) {
        logService.error('Error fetching status', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleConnect = async (req: AuthenticatedRequest<any, any, { phoneNumber: string }>, res: any) => {
    try {
        const { id } = req.user;
        const { phoneNumber } = req.body;
        await connectToWhatsApp(id, phoneNumber);
        res.status(200).json({ message: 'Conexión iniciada.' });
    } catch (e: any) {
        logService.error('Error initiating connection', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleDisconnect = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        await disconnectWhatsApp(id);
        res.status(200).json({ message: 'Desconectado.' });
    } catch (e: any) {
        logService.error('Error disconnecting', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleSendMessage = async (req: AuthenticatedRequest<any, any, { to: string; text: string; imageUrl?: string }>, res: any) => {
    try {
        const { id } = req.user;
        const { to, text, imageUrl } = req.body;
        const canonicalJid = normalizeJid(to); // BLOQUE 1
        if (!canonicalJid) {
            return res.status(400).json({ message: 'JID inválido.' });
        }

        // AJUSTE DE SEGURIDAD: Filtro defensivo para no enviar mensajes directos a grupos o canales
        if (canonicalJid.endsWith('@g.us') || canonicalJid.endsWith('@newsletter')) {
            return res.status(400).json({ message: 'No se permite enviar mensajes a grupos o canales por esta vía.' });
        }

        const sentMsg = await sendMessage(id, canonicalJid, text, imageUrl);

        // Save message to conversation with the real ID from WhatsApp to ensure idempotency
        if (sentMsg && sentMsg.key.id) {
            // AJUSTE MENOR #1: Fallback defensivo para timestamp
            const msgTimestamp = sentMsg.messageTimestamp 
                ? new Date(Number(sentMsg.messageTimestamp) * 1000).toISOString() 
                : new Date().toISOString();

            await conversationService.addMessage(id, canonicalJid, { 
                id: sentMsg.key.id, 
                text, 
                sender: 'owner', 
                timestamp: msgTimestamp
            });
        }
        
        res.status(200).json({ message: 'Mensaje enviado.' });
    } catch (e: any) {
        logService.error('Error sending message', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateConversation = async (req: AuthenticatedRequest<any, any, { id: string; updates: Partial<Conversation> }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: conversationId, updates } = req.body;
        const canonicalJid = normalizeJid(conversationId); // BLOQUE 1
        if (!canonicalJid) return res.status(400).json({ message: 'ID de conversación inválido' });
        
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        
        const safeConvoId = sanitizeKey(canonicalJid);
        // BLOQUE 4: Acceso Determinístico
        const conversation: Conversation | undefined = user.conversations[safeConvoId] || user.conversations[canonicalJid];

        if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });

        const updatedConversation = { ...conversation, ...updates };
        await db.saveUserConversation(userId, updatedConversation);
        res.status(200).json({ message: 'Conversación actualizada.', conversation: updatedConversation });
    } catch (e: any) {
        logService.error('Error updating conversation', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleDeleteConversation = async (req: AuthenticatedRequest<{ id: string }, any, { blacklist: boolean }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: jid } = req.params;
        const canonicalJid = normalizeJid(jid); // BLOQUE 1
        if (!canonicalJid) return res.status(400).json({ message: 'ID de conversación inválido' });
        
        const { blacklist } = req.body;

        // Perform physical removal
        await db.removeUserConversation(userId, canonicalJid);

        if (blacklist) {
            const user = await db.getUser(userId);
            if (user) {
                const number = canonicalJid.split('@')[0];
                const currentIgnored = user.settings.ignoredJids || [];
                if (!currentIgnored.includes(number)) {
                    await db.updateUserSettings(userId, { ignoredJids: [...currentIgnored, number] });
                }
            }
        }

        logService.audit(`Conversación eliminada: ${canonicalJid}${blacklist ? ' (y bloqueada)' : ''}`, userId, req.user.username);
        res.status(200).json({ message: 'Conversación eliminada.' });
    } catch (e: any) {
        logService.error('Error deleting conversation', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleForceAiRun = async (req: AuthenticatedRequest<any, any, { id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: conversationId } = req.body;
        const canonicalJid = normalizeJid(conversationId); // BLOQUE 1
        if (!canonicalJid) return res.status(400).json({ message: 'ID de conversación inválido' });

        await processAiResponseForJid(userId, canonicalJid, true);
        res.status(200).json({ message: 'Ejecución de IA forzada.' });
    } catch (e: any) {
        logService.error('Error forcing AI run', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetConversations = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        const since = req.query.since as string | undefined; // Get the timestamp
        const conversations = await conversationService.getConversations(id, since);
        res.json(conversations);
    } catch (e: any) {
        logService.error('Error fetching conversations', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetTestimonials = async (req: AuthenticatedRequest, res: any) => {
    try {
        const testimonials = await db.getTestimonials();
        const now = new Date();
        const visibleTestimonials = testimonials.filter(t => new Date(t.createdAt) <= now);

        visibleTestimonials.sort((a, b) => {
            if (a.userId === 'system_seed' && b.userId !== 'system_seed') return -1;
            if (b.userId === 'system_seed' && a.userId !== 'system_seed') return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        res.json(visibleTestimonials);
    } catch (e: any) {
        logService.error('Error getting testimonials', e);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handlePostTestimonial = async (req: AuthenticatedRequest<any, any, { name: string; text: string }>, res: any) => {
    try {
        const { id, username } = req.user;
        const { name, text } = req.body;
        const newTestimonial = await db.createTestimonial(id, name, text);
        logService.audit(`Nuevo testimonio de: ${username}`, id, username);
        res.status(201).json(newTestimonial);
    } catch (e: any) {
        logService.error('Error posting testimonial', e, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioDir = path.resolve(__dirname, '..', '..', 'public', 'audio');

export const handleGetTtsAudio = async (req: any, res: any) => {
    try {
        const { eventName } = req.params;
        const audioPath = path.join(audioDir, `${eventName}.mp3`);

        if (fs.existsSync(audioPath)) {
            res.sendFile(audioPath, {
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Cache-Control': 'public, max-age=31536000' 
                }
            });
        } else {
            logService.warn(`[TTS-API] Audio no encontrado para el evento: ${eventName}`, (req as any).user?.id);
            res.status(404).json({ message: 'Audio no encontrado.' });
        }
    } catch (e: any) {
        logService.error('Error retrieving TTS audio', e, (req as any).user?.id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleStartClientTestBot = async (req: AuthenticatedRequest<any, any, { scenario?: SimulationScenario }>, res: any) => {
    const { id: userId } = req.user;
    const { scenario } = req.body; 

    try {
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        
        const safeJid = sanitizeKey(ELITE_BOT_JID);
        if (user.conversations && user.conversations[safeJid]) {
            delete user.conversations[safeJid];
            await db.updateUser(userId, { conversations: user.conversations });
        } else if (user.conversations && user.conversations[ELITE_BOT_JID]) {
            delete user.conversations[ELITE_BOT_JID];
            await db.updateUser(userId, { conversations: user.conversations });
        }
        
        const cleanConversation: Conversation = {
            id: ELITE_BOT_JID,
            leadIdentifier: ELITE_BOT_JID.split('@')[0],
            leadName: ELITE_BOT_NAME,
            status: LeadStatus.COLD,
            messages: [], 
            isBotActive: true,
            isMuted: false,
            isTestBotConversation: true,
            tags: [],
            internalNotes: [],
            isAiSignalsEnabled: true,
            lastActivity: new Date().toISOString()
        };
        await db.saveUserConversation(userId, cleanConversation);

        let TEST_SCRIPT_CLIENT = [
            "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
            "¿Podrías explicarme un poco más sobre el plan PRO?",
            "¿Cuál es el costo mensual?",
            "¿Ofrecen alguna garantía o prueba?",
            "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?",
        ];

        // --- ELITE++ LOGIC ---
        if (scenario === 'STANDARD_FLOW' && user.simulationLab?.customScript && user.simulationLab.customScript.length > 0) {
            TEST_SCRIPT_CLIENT = user.simulationLab.customScript;
            logService.info(`[SIMULATOR] Usando script personalizado para ${user.username}`, userId);
        } else if (scenario === 'PRICE_OBJECTION') {
            TEST_SCRIPT_CLIENT = [
                "Hola, ¿me interesa. ¿Cuánto cuesta?",
                "Me parece un poco caro, ¿hay descuentos?",
                "No sé si puedo invertir eso ahora mismo."
            ];
        } else if (scenario === 'COMPETITOR_COMPARISON') {
            TEST_SCRIPT_CLIENT = [
                "Hola, ¿en qué se diferencian de X Competidor?",
                "Vi que Y Competidor ofrece más por menos, ¿es cierto?",
                "¿Por qué debería elegirlos a ustedes en lugar de a la competencia?"
            ];
        } else if (scenario === 'GHOSTING_RISK') {
            TEST_SCRIPT_CLIENT = [
                "Ok.",
                "Hmm...",
                "Lo pensaré."
            ];
        } else if (scenario === 'CONFUSED_BUYER') {
            TEST_SCRIPT_CLIENT = [
                "Qué es un bot?",
                "Mi primo tiene un negocio, ¿le sirve?",
                "¿Me podrías resumir todo en una palabra?"
            ];
        }


        (async () => {
            for (const messageText of TEST_SCRIPT_CLIENT) {
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    timestamp: new Date().toISOString()
                };
                await conversationService.addMessage(userId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);
                await processAiResponseForJid(userId, ELITE_BOT_JID, true); 
                await new Promise(resolve => setTimeout(resolve, 3500 + Math.random() * 2000)); 
            }
            if (scenario) {
                const userAfterTest = await db.getUser(userId);
                if (userAfterTest) {
                    const finalConversation = userAfterTest.conversations[safeJid];
                    if (finalConversation) {
                        const now = new Date();
                        const evaluation: EvaluationResult = {
                            score: finalConversation.status === LeadStatus.HOT ? 100 : (finalConversation.status === LeadStatus.WARM ? 70 : 30),
                            outcome: finalConversation.status === LeadStatus.HOT ? 'SUCCESS' : (finalConversation.status === LeadStatus.WARM ? 'NEUTRAL' : 'FAILURE'),
                            detectedFailurePattern: finalConversation.status !== LeadStatus.HOT ? `Lead no escalado: ${finalConversation.status}` : undefined,
                            insights: ["Evaluación automática basada en estado final."]
                        };

                        const currentSettings = userAfterTest.settings;
                        const brainVersionSnapshot = {
                            archetype: currentSettings.archetype,
                            tone: currentSettings.toneValue
                        };

                        const run: SimulationRun = {
                            id: uuidv4(),
                            timestamp: now.toISOString(),
                            scenario: scenario as SimulationScenario,
                            brainVersionSnapshot,
                            durationSeconds: 0, 
                            evaluation,
                        };
                        const updatedLab = {
                            ...userAfterTest.simulationLab,
                            experiments: [...(userAfterTest.simulationLab?.experiments || []), run]
                        };
                        
                        const allExperiments = updatedLab.experiments;
                        const totalScore = allExperiments.reduce((sum, exp) => sum + exp.evaluation.score, 0);
                        updatedLab.aggregatedScore = allExperiments.length > 0 ? Math.round(totalScore / allExperiments.length) : 0;

                        const failurePatternCounts: Record<string, number> = {};
                        for (const exp of allExperiments) {
                            if (exp.evaluation.outcome === 'FAILURE' && exp.evaluation.detectedFailurePattern) {
                                failurePatternCounts[exp.evaluation.detectedFailurePattern] = (failurePatternCounts[exp.evaluation.detectedFailurePattern] || 0) + 1;
                            }
                        }
                        updatedLab.topFailurePatterns = failurePatternCounts;

                        await db.updateUser(userId, { simulationLab: updatedLab });
                    }
                }
            }
        })().catch(error => {
            logService.error(`Error in client test bot script for ${userId}`, error, userId);
        });

        res.status(200).json({ message: 'Secuencia de prueba iniciada en background.' });

    } catch (e: any) {
        logService.error('Error starting client test bot', e, userId);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error interno del servidor al iniciar la prueba.' });
        }
    }
};

export const handleStopClientTestBot = async (req: AuthenticatedRequest<any, any, { userId: string }>, res: any) => {
    const { id: userId } = req.user;
    logService.info(`[TEST-BOT] Stop signal received for client test bot: ${userId}`, userId);
    res.status(200).json({ message: 'Señal de detención procesada.' });
};

export const handleClearClientTestBotConversation = async (req: AuthenticatedRequest<any, any, { userId: string }>, res: any) => {
    const { id: userId } = req.user;
    
    try {
        const user = await db.getUser(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const safeJid = sanitizeKey(ELITE_BOT_JID);
        if (user.conversations && user.conversations[safeJid]) {
            delete user.conversations[safeJid];
            await db.updateUser(userId, { conversations: user.conversations });
            logService.audit(`Conversación de bot élite eliminada para cliente: ${user.username}`, userId, user.username, { targetUserId: userId });
        } else if (user.conversations && user.conversations[ELITE_BOT_JID]) {
             delete user.conversations[ELITE_BOT_JID];
             await db.updateUser(userId, { conversations: user.conversations });
        } 

        res.status(200).json({ message: 'Conversación de prueba de bot élite eliminada.' });

    } catch (error: any) {
        logService.error(`Error al limpiar la conversación del bot élite para ${userId}`, error, userId, req.user?.username);
        res.status(500).json({ message: 'Error interno del servidor al limpiar la conversación.' });
    }
};

export const handleGetCampaigns = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const campaigns = await db.getCampaigns(userId);
        res.json(campaigns);
    } catch (error: any) {
        logService.error('Error fetching campaigns', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetWhatsAppGroups = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        
        // AJUSTE MENOR #3: Validar estado de sesión antes de intentar fetch
        const status = getSessionStatus(userId);
        if (status.status !== ConnectionStatus.CONNECTED) {
            return res.json([]); // Retornar vacío sin error si no está conectado
        }

        const groups: WhatsAppGroup[] = await fetchUserGroups(userId);
        res.json(groups);
    } catch (error: any) {
        logService.error('Error fetching WhatsApp groups', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleCreateCampaign = async (req: AuthenticatedRequest<any, any, Omit<Campaign, 'id' | 'userId' | 'createdAt' | 'stats'>>, res: any) => {
    try {
        const { id: userId } = req.user;
        const campaignData: Campaign = { ...req.body, id: uuidv4(), userId, createdAt: new Date().toISOString(), stats: { totalSent: 0, totalFailed: 0 } } as Campaign;
        campaignData.stats.nextRunAt = campaignService.calculateNextRun(campaignData);
        const newCampaign = await db.createCampaign(campaignData);
        logService.audit(`Campaña creada: ${newCampaign.name}`, userId, req.user.username);
        res.status(201).json(newCampaign);
    } catch (error: any) {
        logService.error('Error creating campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateCampaign = async (req: AuthenticatedRequest<{ id: string }, any, Partial<Campaign>>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: campaignId } = req.params;
        const updates: Partial<Campaign> = req.body;

        if (updates.schedule?.type || updates.schedule?.time || updates.schedule?.daysOfWeek || updates.schedule?.startDate) {
            const existingCampaign = await db.getCampaign(campaignId);
            if (existingCampaign) {
                const updatedCampaignData = { ...existingCampaign, ...updates } as Campaign;
                updates['stats.nextRunAt'] = campaignService.calculateNextRun(updatedCampaignData);
                if (existingCampaign.status === 'PAUSED' && updates['stats.nextRunAt']) {
                    updates.status = 'ACTIVE';
                }
            }
        }
        
        const updatedCampaign = await db.updateCampaign(campaignId, updates);
        if (!updatedCampaign) {
            return res.status(404).json({ message: 'Campaña no encontrada.' });
        }
        logService.audit(`Campaña actualizada: ${updatedCampaign.name}`, userId, req.user.username, { campaignId, updates });
        res.status(200).json(updatedCampaign);
    } catch (error: any) {
        logService.error('Error updating campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleDeleteCampaign = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: campaignId } = req.params;
        const success = await db.deleteCampaign(campaignId);
        if (!success) {
            return res.status(404).json({ message: 'Campaña no encontrada.' });
        }
        logService.audit(`Campaña eliminada: ${campaignId}`, userId, req.user.username);
        res.status(200).json({ message: 'Campaña eliminada.' });
    } catch (error: any) {
        logService.error('Error deleting campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleForceExecuteCampaign = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: campaignId } = req.params;
        const result = await campaignService.forceExecuteCampaign(campaignId, userId, true);
        res.status(200).json(result);
    } catch (error: any) {
        logService.error('Error forcing campaign execution', error, getClientUser(req).id);
        res.status(500).json({ message: error.message || 'Error interno del servidor.' });
    }
};

export const handleGetRadarSignals = async (req: AuthenticatedRequest<any, any, any, { history?: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { history } = req.query;
        const signals = await db.getRadarSignals(userId, history ? 200 : 50); 
        res.json(signals);
    } catch (error: any) {
        logService.error('Error fetching radar signals', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetRadarSettings = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const settings = await db.getRadarSettings(userId);
        res.json(settings);
    } catch (error: any) {
        logService.error('Error fetching radar settings', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateRadarSettings = async (req: AuthenticatedRequest<any, any, Partial<RadarSettings>>, res: any) => {
    try {
        const { id: userId } = req.user;
        const updates: Partial<RadarSettings> = req.body;
        const updatedSettings = await db.updateRadarSettings(userId, updates);
        logService.audit(`Radar settings updated`, userId, req.user.username, { updates });
        res.status(200).json(updatedSettings);
    } catch (error: any) {
        logService.error('Error updating radar settings', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleDismissRadarSignal = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: signalId } = req.params;
        await db.updateRadarSignalStatus(signalId, 'DISMISSED');
        logService.audit(`Radar signal dismissed: ${signalId}`, userId, req.user.username);
        res.status(200).json({ message: 'Señal descartada.' });
    } catch (error: any) {
        logService.error('Error dismissing radar signal', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleConvertRadarSignal = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { id: signalId } = req.params;
        
        const signal = await db.getRadarSignal(signalId);
        if (!signal) return res.status(404).json({ message: 'Señal no encontrada.' });

        const canonicalJid = normalizeJid(signal.senderJid); // BLOQUE 1
        if (!canonicalJid) return res.status(400).json({ message: 'Sender JID inválido' });

        // AJUSTE #2: Acceso determinístico O(1) usando sanitizeKey
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const safeKey = sanitizeKey(canonicalJid);
        const existingConversation = user.conversations?.[safeKey] || user.conversations?.[canonicalJid];
        
        if (!existingConversation) {
             const newConversation: Conversation = {
                id: canonicalJid,
                leadIdentifier: canonicalJid.split('@')[0],
                leadName: signal.senderName || 'Lead de Radar',
                status: LeadStatus.WARM, 
                messages: [{ 
                    id: uuidv4(), 
                    text: signal.messageContent, 
                    sender: 'user', 
                    timestamp: signal.timestamp
                }],
                isBotActive: true,
                isMuted: false,
                tags: ['RADAR_CONVERTED', ...(signal.analysis.category ? [signal.analysis.category] : [])],
                internalNotes: [{ 
                    id: uuidv4(), 
                    note: `Convertido de Radar. Score: ${signal.strategicScore || signal.analysis.score}. Razón: ${signal.analysis.reasoning}`, 
                    author: 'AI', 
                    timestamp: new Date().toISOString()
                }],
                isAiSignalsEnabled: true,
                firstMessageAt: signal.timestamp,
                lastActivity: new Date().toISOString(),
             };
             await db.saveUserConversation(userId, newConversation);
        } else {
            // AJUSTE MENOR #5: Preservar categorías de Radar al actualizar
            const signalCategories = signal.analysis.category ? [signal.analysis.category] : [];
            const updatedTags = [...new Set([...(existingConversation.tags || []), 'RADAR_CONVERTED', ...signalCategories])];
            await db.saveUserConversation(userId, { ...existingConversation, tags: updatedTags });
        }

        await db.updateRadarSignalStatus(signalId, 'ACTED');
        logService.audit(`Radar signal converted to lead: ${signalId}`, userId, req.user.username);
        res.status(200).json({ message: 'Señal convertida a Lead.' });

    } catch (error: any) {
        logService.error('Error converting radar signal', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleSimulateRadarSignal = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const mockGroupJid = '120363040004245902@g.us';
        const mockGroupName = 'Grupo de Prueba Dominion';
        const mockSenderJid = `5492611234567@s.whatsapp.net`;
        const mockSenderName = 'Cliente Simulador';
        const mockMessageContent = 'Alguien preguntó: ¿Este servicio es compatible con mi Shopify?';

        await radarService.processGroupMessage(userId, mockGroupJid, mockGroupName, mockSenderJid, mockSenderName, mockMessageContent);

        logService.audit(`Radar signal simulated for user`, userId, req.user.username, { message: mockMessageContent });
        res.status(200).json({ message: 'Señal de Radar simulada y procesada.' });
    } catch (error: any) {
        logService.error('Error simulating radar signal', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetRadarActivityLogs = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const logs = await db.getRadarTraceLogs(userId, 50); 
        res.json(logs);
    } catch (error: any) {
        logService.error('Error fetching radar activity logs', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleCreateIntentSignal = async (req: AuthenticatedRequest<any, any, { conversationId: string }>, res: any) => {
    const { id: userId } = req.user;
    const { conversationId } = req.body;
    const canonicalJid = normalizeJid(conversationId); // BLOQUE 1
    if (!canonicalJid) return res.status(400).json({ message: 'JID inválido' });

    try {
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        // BLOQUE 4: Acceso Determinístico
        const conversation = user.conversations[sanitizeKey(canonicalJid)] || user.conversations[canonicalJid];
        if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });
        if (conversation.status !== LeadStatus.HOT) return res.status(400).json({ message: 'Solo se pueden compartir leads CALIENTES.' });

        const intentDescription = `El prospecto "${conversation.leadName}" mostró alto interés en los servicios de "${user.settings.productName}". Su última interacción sugiere que está listo para comprar.`;
        const intentCategories = [`${user.settings.productName} Interes`]; 
        const signalScore = 90; 

        const prospectIdentifierHash = createHash('sha256').update(conversation.leadIdentifier).digest('hex');

        const signal: IntentSignal = {
            id: uuidv4(),
            userId,
            prospectJid: conversation.id,
            prospectName: conversation.leadName,
            prospectIdentifierHash,
            intentCategories,
            intentDescription,
            signalScore,
            contributedAt: new Date().toISOString(),
        };

        const newSignal = await db.createIntentSignal(signal);
        
        await db.updateNetworkProfile(userId, { contributionScore: (user.networkProfile?.contributionScore || 0) + 1 });

        logService.audit(`Intent Signal contributed: ${newSignal.id}`, userId, req.user.username, { signal });
        res.status(201).json(newSignal);
    } catch (error: any) {
        logService.error('Error contributing intent signal', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetIntentSignals = async (req: AuthenticatedRequest, res: any) => {
    const { id: userId } = req.user;
    try {
        const signals = await db.getUserIntentSignals(userId);
        res.json(signals);
    } catch (error: any) {
        logService.error('Error fetching intent signals', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetConnectionOpportunities = async (req: AuthenticatedRequest, res: any) => {
    const { id: userId } = req.user;
    try {
        const user = await db.getUser(userId);
        if (!user || !user.networkProfile?.networkEnabled) return res.json([]);

        const categoriesOfInterest = user.networkProfile.categoriesOfInterest || [];
        const contributedSignals = await db.getUserIntentSignals(userId);
        const contributedHashes = contributedSignals.map(s => s.prospectIdentifierHash);

        const potentialSignals = await db.findPotentialConnectionOpportunities(userId, categoriesOfInterest, contributedHashes);

        const opportunities: ConnectionOpportunity[] = [];
        for (const signal of potentialSignals) {
            const existingOpportunity = (await db.getConnectionOpportunities(userId)).find(o => o.intentSignalId === signal.id);
            if (!existingOpportunity) {
                const opportunity: ConnectionOpportunity = {
                    id: uuidv4(),
                    contributedByUserId: signal.userId,
                    receivedByUserId: userId,
                    intentSignalId: signal.id,
                    prospectOriginalJid: '', 
                    prospectName: '',       
                    intentCategories: signal.intentCategories,
                    intentDescription: signal.intentDescription,
                    opportunityScore: signal.signalScore,
                    permissionStatus: 'NOT_REQUESTED', 
                    createdAt: new Date().toISOString(),
                };
                const newOpp = await db.createConnectionOpportunity(opportunity);
                opportunities.push(newOpp);
            } else {
                opportunities.push(existingOpportunity);
            }
        }
        res.json(opportunities);
    } catch (error: any) {
        logService.error('Error fetching connection opportunities', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleRequestPermission = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    const { id: userId } = req.user;
    const { id: opportunityId } = req.params;

    try {
        const opportunity = await db.getConnectionOpportunity(opportunityId);
        if (!opportunity || opportunity.receivedByUserId !== userId) return res.status(404).json({ message: 'Oportunidad no encontrada o acceso denegado.' });
        if (opportunity.permissionStatus !== 'NOT_REQUESTED') return res.status(400).json({ message: 'El permiso ya fue solicitado o concedido.' }); 

        const originalSignal = await db.getIntentSignal(opportunity.intentSignalId);
        if (!originalSignal) return res.status(404).json({ message: 'Señal original no encontrada.' });

        const permissionMessage = `¡Hola! Te contactamos desde la Red Dominion. Hemos detectado un interés en *${opportunity.intentDescription}* que podría ser muy relevante para ti. Un negocio en nuestra red cree que podría ayudarte.\n\n¿Nos autorizas a compartir tu contacto (${originalSignal.prospectName}) con ellos para que puedan presentarte su propuesta? Responde *SÍ* para aceptar, o *NO* para declinar.`;
        
        await sendMessage(DOMINION_NETWORK_JID, originalSignal.prospectJid, permissionMessage); 

        await db.updateConnectionOpportunity(opportunityId, {
            permissionStatus: 'PENDING', 
            requestedAt: new Date().toISOString()
        });

        logService.audit(`Permission requested for opportunity: ${opportunityId}`, userId, req.user.username);
        res.status(200).json({ message: 'Solicitud de permiso enviada.' });
    } catch (error: any) {
        logService.error('Error requesting permission', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleRevealContact = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    const { id: userId } = req.user;
    const { id: opportunityId } = req.params;

    try {
        const opportunity = await db.getConnectionOpportunity(opportunityId);
        if (!opportunity || opportunity.receivedByUserId !== userId) return res.status(404).json({ message: 'Oportunidad no encontrada o acceso denegado.' });
        if (opportunity.permissionStatus !== 'GRANTED') return res.status(400).json({ message: 'El permiso no ha sido otorgado aún.' }); 

        const originalSignal = await db.getIntentSignal(opportunity.intentSignalId);
        if (!originalSignal) return res.status(404).json({ message: 'Señal original no encontrada.' });

        await db.updateConnectionOpportunity(opportunityId, {
            prospectOriginalJid: originalSignal.prospectJid,
            prospectName: originalSignal.prospectName,
            connectionMadeAt: new Date().toISOString()
        });
        
        const currentNetworkProfile = await db.getNetworkProfile(userId);
        await db.updateNetworkProfile(userId, { receptionScore: (currentNetworkProfile?.receptionScore || 0) + 1 });

        logService.audit(`Contact revealed for opportunity: ${opportunityId}`, userId, req.user.username);
        res.status(200).json({ prospectOriginalJid: originalSignal.prospectJid, prospectName: originalSignal.prospectName, message: 'Contacto revelado.' });
    } catch (error: any) {
        logService.error('Error revealing contact', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetNetworkProfile = async (req: AuthenticatedRequest, res: any) => {
    const { id: userId } = req.user;
    try {
        const profile = await db.getNetworkProfile(userId);
        res.json(profile || { networkEnabled: false, categoriesOfInterest: [], contributionScore: 0, receptionScore: 0 });
    } catch (error: any) {
        logService.error('Error fetching network profile', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateNetworkProfile = async (req: AuthenticatedRequest<any, any, Partial<NetworkProfile>>, res: any) => {
    const { id: userId } = req.user;
    const updates: Partial<NetworkProfile> = req.body;
    try {
        const updatedProfile = await db.updateNetworkProfile(userId, updates);
        logService.audit(`Network profile updated`, userId, req.user.username, { updates });
        res.status(200).json(updatedProfile);
    } catch (error: any) {
        logService.error('Error updating network profile', error, userId, req.user.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleVerifyApiKey = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const user = await db.getUser(userId);
        const apiKey = user?.settings.geminiApiKey;

        if (!apiKey) {
            return res.status(400).json({ message: "API Key no configurada." });
        }

        await generateContentWithFallback({ 
            apiKey: apiKey,
            prompt: 'ping'
        });

        res.status(200).json({ message: "API Key válida." });
    } catch (error: any) {
        logService.error('Error verificando API key', error, getClientUser(req).id);
        res.status(400).json({ message: error.message || "API Key inválida o error de red." });
    }
};

export const handleAnalyzeWebsite = async (req: AuthenticatedRequest<any, any, { websiteUrl: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { websiteUrl } = req.body;
        const user = await db.getUser(userId);
        const apiKey = user?.settings.geminiApiKey;

        if (!apiKey) {
            return res.status(400).json({ message: "API Key no configurada." });
        }

        const prompt = `
            Analiza el sitio web: ${websiteUrl}
            TU OBJETIVO: Configurar la "Personalidad de Venta" de una IA.
            Redacta en PRIMERA PERSONA.
            ESTRUCTURA REQUERIDA:
            1. ROL Y OFERTA: "Soy el especialista en [Rubro]. Mi meta es vender [Productos principales]..."
            2. PRECIOS Y PLANES: Lista los precios exactos encontrados (ej: "$180.000 ARS"). Si no hay, di "A cotizar".
            3. GANCHO COMERCIAL: 2 o 3 frases cortas sobre por qué elegirnos (Valor Único).
            4. CLIENTE OBJETIVO: A quién le estoy vendiendo.
          `;
        
        const response = await generateContentWithFallback({
            apiKey: apiKey,
            prompt: prompt,
            tools: [{ googleSearch: {} }]
        });
        
        res.status(200).json({ text: response.text });

    } catch (error: any) {
        logService.error('Error en /api/ai/analyze-website', error, getClientUser(req).id);
        res.status(500).json({ message: error.message || 'Error interno del servidor.' });
    }
};

export const handleExecuteNeuralPath = async (req: AuthenticatedRequest<any, any, { identity: any; context: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { identity, context } = req.body;
        const user = await db.getUser(userId);
        const apiKey = user?.settings.geminiApiKey;

        if (!apiKey) {
            return res.status(400).json({ message: "API Key no configurada." });
        }

        const prompt = `
            ACTÚA COMO: Consultor de Negocios de Élite.
            INPUT DEL USUARIO:
            Nombre Negocio: "${identity.name}"
            Web: "${identity.website}"
            Contexto/Descripción: "${context}"
            TU TAREA:
            Genera la configuración estratégica completa para un Chatbot de Ventas (Dominion Bot).
            FORMATO JSON REQUERIDO:
            {
                "mission": "...", "idealCustomer": "...", "detailedDescription": "...",
                "priceText": "...", "objections": [{ "objection": "...", "response": "..." }],
                "rules": "...", "archetype": "..." 
            }
          `;

        const response = await generateContentWithFallback({
            apiKey: apiKey,
            prompt,
            responseSchema: { type: Type.OBJECT }
        });
        
        res.status(200).json({ text: response.text });
        
    } catch (error: any) {
        logService.error('Error en /api/ai/execute-neural-path', error, getClientUser(req).id);
        if ((error as any).response && (error as any).response.text) {
             res.status(500).json({ message: error.message, text: (error as any).response.text });
        } else {
             res.status(500).json({ message: error.message || 'Error interno del servidor.' });
        }
    }
};

export const handleGenerateCampaignPrompt = async (req: AuthenticatedRequest<any, any, { message: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { message } = req.body;
        const user = await db.getUser(userId);
        const apiKey = user?.settings.geminiApiKey;

        if (!apiKey) {
            return res.status(400).json({ message: "API Key no configurada." });
        }
        
        const prompt = `
Actúa como un director de arte y experto en marketing visual. Basado en el siguiente texto de una campaña de WhatsApp, crea un prompt detallado para un generador de imágenes de IA.
Texto: "${message}"
`;
        const response = await generateContentWithFallback({
            apiKey: apiKey,
            prompt: prompt
        });

        res.status(200).json({ text: response.text });

    } catch (error: any) {
        logService.error('Error en /api/ai/generate-campaign-prompt', error, getClientUser(req).id);
        res.status(500).json({ message: error.message || 'Error interno del servidor.' });
    }
};