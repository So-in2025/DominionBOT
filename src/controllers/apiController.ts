
import { Buffer } from 'buffer';
// FIX: Import connectToWhatsApp, disconnectWhatsApp, sendMessage as they are now exported.
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid, fetchUserGroups, ELITE_BOT_JID, ELITE_BOT_NAME, DOMINION_NETWORK_JID } from '../whatsapp/client.js'; // Import fetchUserGroups, ELITE_BOT_NAME, and DOMINION_NETWORK_JID
import { conversationService } from '../services/conversationService.js';
// FIX: Added InternalNote to the import list.
// FIX: Added SimulationRun and RadarSettings to the import list for type safety.
import { Message, LeadStatus, User, Conversation, SimulationScenario, EvaluationResult, Campaign, RadarSignal, InternalNote, SimulationRun, RadarSettings, IntentSignal, ConnectionOpportunity, NetworkProfile, PermissionStatus, WhatsAppGroup } from '../types.js'; // NEW: Import Network types
import { db, sanitizeKey } from '../database.js'; // Import sanitizeKey
import { logService } from '../services/logService.js';
import { campaignService } from '../services/campaignService.js'; // IMPORT CAMPAIGN SERVICE
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
// FIX: Import radarService for use in handleSimulateRadarSignal.
import { radarService } from '../services/radarService.js';
// FIX: Import Request and Response from express directly and alias them to avoid conflicts with global DOM types.
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { createHash } from 'crypto'; // For hashing JIDs


// Constants for Elite Bot - NOW IMPORTED FROM WHATSAPP CLIENT
// const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
// const ELITE_BOT_NAME = 'Simulador Neural';
// const DOMINION_NETWORK_JID = '5491110000000@s.whatsapp.net';

// Define a custom Request type to include the 'user' property added by authentication middleware
// FIX: Changed to interface extending ExpressRequest for better type resolution of body, params, query
// FIX: Explicitly include body, params, query to resolve type errors where ExpressRequest base might be missing them
interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends ExpressRequest {
    user: { id: string; username: string; role: string; };
    body: ReqBody;
    params: P;
    query: ReqQuery;
}

// Shared utility to get user from request
// FIX: Explicitly cast Request to include 'user' property.
const getClientUser = (req: AuthenticatedRequest) => ({ id: req.user.id, username: req.user.username });

// FIX: Added generic types to Request for body, params, and query.
// FIX: Changed res type to 'any' to bypass 'Property does not exist on Response' errors
export const handleGetStatus = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        const status = getSessionStatus(id);
        // FIX: Ensure res.json is called correctly.
        res.json(status);
    } catch (e: any) {
        logService.error('Error fetching status', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleConnect = async (req: AuthenticatedRequest<any, any, { phoneNumber: string }>, res: any) => {
    try {
        const { id } = req.user;
        // FIX: Ensure req.body is accessed correctly.
        const { phoneNumber } = req.body;
        await connectToWhatsApp(id, phoneNumber);
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Conexión iniciada.' });
    } catch (e: any) {
        logService.error('Error initiating connection', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleDisconnect = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        await disconnectWhatsApp(id);
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Desconectado.' });
    } catch (e: any) {
        logService.error('Error disconnecting', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleSendMessage = async (req: AuthenticatedRequest<any, any, { to: string; text: string; imageUrl?: string }>, res: any) => {
    try {
        const { id } = req.user;
        // FIX: Ensure req.body is accessed correctly.
        const { to, text, imageUrl } = req.body;
        await sendMessage(id, to, text, imageUrl);
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        await conversationService.addMessage(id, to, { id: uuidv4(), text, sender: 'owner', timestamp: new Date(Date.now()) });
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Mensaje enviado.' });
    } catch (e: any) {
        logService.error('Error sending message', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleUpdateConversation = async (req: AuthenticatedRequest<any, any, { id: string; updates: Partial<Conversation> }>, res: any) => {
    try {
        const { id: userId } = req.user;
        // FIX: Ensure req.body is accessed correctly.
        const { id: conversationId, updates } = req.body;
        
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        
        const safeConvoId = sanitizeKey(conversationId);
        const conversation: Conversation | undefined = user.conversations[safeConvoId];

        if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });

        const updatedConversation = { ...conversation, ...updates };
        await db.saveUserConversation(userId, updatedConversation);
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Conversación actualizada.', conversation: updatedConversation });
    } catch (e: any) {
        logService.error('Error updating conversation', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleForceAiRun = async (req: AuthenticatedRequest<any, any, { id: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        // FIX: Ensure req.body is accessed correctly.
        const { id: conversationId } = req.body;
        await processAiResponseForJid(userId, conversationId, true);
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Ejecución de IA forzada.' });
    } catch (e: any) {
        logService.error('Error forcing AI run', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleGetConversations = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.user;
        const conversations = await conversationService.getConversations(id);
        // FIX: Ensure res.json is called correctly.
        res.json(conversations);
    } catch (e: any) {
        logService.error('Error fetching conversations', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleGetTestimonials = async (req: AuthenticatedRequest, res: any) => {
    try {
        const testimonials = await db.getTestimonials();
        // Filtrar y ordenar: solo los que tengan un createdAt anterior o igual a la fecha actual.
        // Y los de system_seed siempre van primero.
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        const now = new Date(Date.now());
        const visibleTestimonials = testimonials.filter(t => new Date(t.createdAt) <= now);

        // Sort: system_seed first, then by createdAt descending
        visibleTestimonials.sort((a, b) => {
            if (a.userId === 'system_seed' && b.userId !== 'system_seed') return -1;
            if (b.userId === 'system_seed' && a.userId !== 'system_seed') return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // FIX: Ensure res.json is called correctly.
        res.json(visibleTestimonials);
    } catch (e: any) {
        logService.error('Error getting testimonials', e);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handlePostTestimonial = async (req: AuthenticatedRequest<any, any, { name: string; text: string }>, res: any) => {
    try {
        const { id, username } = req.user;
        // FIX: Ensure req.body is accessed correctly.
        const { name, text } = req.body;
        const newTestimonial = await db.createTestimonial(id, name, text);
        logService.audit(`Nuevo testimonio de: ${username}`, id, username);
        // FIX: Ensure res.status is called correctly.
        res.status(201).json(newTestimonial);
    } catch (e: any) {
        logService.error('Error posting testimonial', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// --- TTS Audio Handling ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioDir = path.resolve(__dirname, '..', '..', 'public', 'audio');

// FIX: Added generic types to Request for body, params, and query.
// FIX: Use 'any' for req/res to bypass strict type checks failing on 'params'
export const handleGetTtsAudio = async (req: any, res: any) => {
    try {
        // FIX: Ensure req.params is accessed correctly.
        const { eventName } = req.params;
        const audioPath = path.join(audioDir, `${eventName}.mp3`);

        if (fs.existsSync(audioPath)) {
            // logService.debug(`[TTS-API] Servicing audio: ${eventName}`, (req as any).user?.id); // Optional, for debug verbosity
            // FIX: Ensure res.sendFile is called correctly.
            res.sendFile(audioPath, {
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
                }
            });
        } else {
            logService.warn(`[TTS-API] Audio no encontrado para el evento: ${eventName}`, (req as any).user?.id);
            // FIX: Ensure res.status is called correctly.
            res.status(404).json({ message: 'Audio no encontrado.' });
        }
    } catch (e: any) {
        logService.error('Error retrieving TTS audio', e, (req as any).user?.id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// --- CLIENT TEST BOT ---
// const ELITE_BOT_JID = '5491112345678@s.whatsapp.net'; // Kept for consistency, actual import happens in client.ts
// const ELITE_BOT_NAME = 'Simulador Neural'; // Kept for consistency, actual import happens in client.ts

// FIX: Added generic types to Request for body, params, and query.
export const handleStartClientTestBot = async (req: AuthenticatedRequest<any, any, { scenario?: SimulationScenario }>, res: any) => {
    const { id: userId } = req.user;
    // FIX: Ensure req.body is accessed correctly.
    const { scenario } = req.body; // Scenario is optional here, mainly for admin

    try {
        // Clear previous test bot conversation for this user first
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
        
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
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
            lastActivity: new Date(Date.now())
        };
        await db.saveUserConversation(userId, cleanConversation);

        // Define a simple test script
        let TEST_SCRIPT_CLIENT = [
            "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
            "¿Podrías explicarme un poco más sobre el plan PRO?",
            "¿Cuál es el costo mensual?",
            "¿Ofrecen alguna garantía o prueba?",
            "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?",
        ];

        if (scenario === 'PRICE_OBJECTION') {
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


        // Execute in background
        (async () => {
            for (const messageText of TEST_SCRIPT_CLIENT) {
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
                    timestamp: new Date(Date.now())
                };
                await conversationService.addMessage(userId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);
                await processAiResponseForJid(userId, ELITE_BOT_JID, true); // Force AI run for test bot
                await new Promise(resolve => setTimeout(resolve, 3500 + Math.random() * 2000)); // Simluate typing delay
            }
            // After script completes, evaluate the run
            if (scenario) {
                const userAfterTest = await db.getUser(userId);
                if (userAfterTest) {
                    const finalConversation = userAfterTest.conversations[safeJid];
                    if (finalConversation) {
                        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
                        const now = new Date(Date.now());
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
                            durationSeconds: 0, // Placeholder
                            evaluation,
                        };
                        const updatedLab = {
                            ...userAfterTest.simulationLab,
                            experiments: [...(userAfterTest.simulationLab?.experiments || []), run]
                        };
                        
                        // Recalculate aggregated score and top failure patterns
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

        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Secuencia de prueba iniciada en background.' });

    } catch (e: any) {
        logService.error('Error starting client test bot', e, userId);
        // FIX: Ensure res.headersSent and res.status are called correctly.
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error interno del servidor al iniciar la prueba.' });
        }
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleStopClientTestBot = async (req: AuthenticatedRequest<any, any, { userId: string }>, res: any) => {
    const { id: userId } = req.user;
    // In a real scenario, you'd have a mechanism to stop the background process.
    // For now, we just acknowledge the request and rely on process cleanup.
    logService.info(`[TEST-BOT] Stop signal received for client test bot: ${userId}`, userId);
    // FIX: Ensure res.status is called correctly.
    res.status(200).json({ message: 'Señal de detención procesada.' });
};

// FIX: Added generic types to Request for body, params, and query.
export const handleClearClientTestBotConversation = async (req: AuthenticatedRequest<any, any, { userId: string }>, res: any) => {
    const { id: userId } = req.user;
    // FIX: Ensure req.body is accessed correctly.
    const { userId: targetUserId } = req.body; // Use targetUserId from body, as this is a client route.
    
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


// --- CAMPAIGN ROUTES ---
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
        const groups: WhatsAppGroup[] = await fetchUserGroups(userId);
        res.json(groups);
    } catch (error: any) {
        logService.error('Error fetching WhatsApp groups', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleCreateCampaign = async (req: AuthenticatedRequest<any, any, Campaign>, res: any) => {
    try {
        const { id: userId } = req.user;
        const campaignData: Campaign = { ...req.body, id: uuidv4(), userId, createdAt: new Date().toISOString(), stats: { totalSent: 0, totalFailed: 0 } };
        // FIX: Calculate initial nextRunAt based on schedule type.
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

        // Recalculate nextRunAt if schedule related fields are updated
        if (updates.schedule?.type || updates.schedule?.time || updates.schedule?.daysOfWeek || updates.schedule?.startDate) {
            const existingCampaign = await db.getCampaign(campaignId);
            if (existingCampaign) {
                const updatedCampaignData = { ...existingCampaign, ...updates } as Campaign;
                updates['stats.nextRunAt'] = campaignService.calculateNextRun(updatedCampaignData);
                // Also set status to ACTIVE if it was paused and nextRunAt is now valid
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

// --- RADAR ROUTES ---
export const handleGetRadarSignals = async (req: AuthenticatedRequest<any, any, any, { history?: string }>, res: any) => {
    try {
        const { id: userId } = req.user;
        const { history } = req.query;
        const signals = await db.getRadarSignals(userId, history ? 200 : 50); // Get more for history view
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

        // Convert to a lead (create/update conversation)
        const existingConversation = (await db.getUserConversations(userId)).find(c => c.id === signal.senderJid);
        if (!existingConversation) {
             const newConversation: Conversation = {
                id: signal.senderJid,
                leadIdentifier: signal.senderJid.split('@')[0],
                leadName: signal.senderName || 'Lead de Radar',
                status: LeadStatus.WARM, // Start as WARM from radar
                messages: [{ 
                    id: uuidv4(), 
                    text: signal.messageContent, 
                    sender: 'user', 
                    timestamp: new Date(signal.timestamp)
                }],
                isBotActive: true,
                isMuted: false,
                tags: ['RADAR_CONVERTED', ...(signal.analysis.category ? [signal.analysis.category] : [])],
                internalNotes: [{ 
                    id: uuidv4(), 
                    note: `Convertido de Radar. Score: ${signal.strategicScore || signal.analysis.score}. Razón: ${signal.analysis.reasoning}`, 
                    author: 'AI', 
                    timestamp: new Date()
                }],
                isAiSignalsEnabled: true,
                firstMessageAt: new Date(signal.timestamp),
                lastActivity: new Date(),
             };
             await db.saveUserConversation(userId, newConversation);
        } else {
            // Update existing conversation if needed (e.g., add tag)
            const updatedTags = [...new Set([...(existingConversation.tags || []), 'RADAR_CONVERTED'])];
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
        // Mock a group and message
        const mockGroupJid = '120363040004245902@g.us';
        const mockGroupName = 'Grupo de Prueba Dominion';
        const mockSenderJid = `5492611234567@s.whatsapp.net`;
        const mockSenderName = 'Cliente Simulador';
        const mockMessageContent = 'Alguien preguntó: ¿Este servicio es compatible con mi Shopify?';

        // Directly call the radar service
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
        const logs = await db.getRadarTraceLogs(userId, 50); // Fetch latest 50 radar trace logs
        res.json(logs);
    } catch (error: any) {
        logService.error('Error fetching radar activity logs', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// --- NETWORK ROUTES ---
export const handleCreateIntentSignal = async (req: AuthenticatedRequest<any, any, { conversationId: string }>, res: any) => {
    const { id: userId } = req.user;
    const { conversationId } = req.body;

    try {
        const user = await db.getUser(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        const conversation = user.conversations[sanitizeKey(conversationId)];
        if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });
        if (conversation.status !== LeadStatus.HOT) return res.status(400).json({ message: 'Solo se pueden compartir leads CALIENTES.' });

        // Generate intent description and categories from conversation (placeholder for AI call)
        // For now, use simple logic
        const intentDescription = `El prospecto "${conversation.leadName}" mostró alto interés en los servicios de "${user.settings.productName}". Su última interacción sugiere que está listo para comprar.`;
        const intentCategories = [`${user.settings.productName} Interes`]; // Placeholder
        const signalScore = 90; // High score for HOT lead

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
        
        // Update user's network profile contribution score
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
        // Prevent matching own signals - get hashes of jids the user has already contributed or converted
        const contributedSignals = await db.getUserIntentSignals(userId);
        const contributedHashes = contributedSignals.map(s => s.prospectIdentifierHash);

        const potentialSignals = await db.findPotentialConnectionOpportunities(userId, categoriesOfInterest, contributedHashes);

        const opportunities: ConnectionOpportunity[] = [];
        for (const signal of potentialSignals) {
            // Check if an opportunity already exists for this signal and user
            const existingOpportunity = (await db.getConnectionOpportunities(userId)).find(o => o.intentSignalId === signal.id);
            if (!existingOpportunity) {
                const opportunity: ConnectionOpportunity = {
                    id: uuidv4(),
                    contributedByUserId: signal.userId,
                    receivedByUserId: userId,
                    intentSignalId: signal.id,
                    prospectOriginalJid: '', // Will be filled upon permission
                    prospectName: '',       // Will be filled upon permission
                    intentCategories: signal.intentCategories,
                    intentDescription: signal.intentDescription,
                    opportunityScore: signal.signalScore,
                    permissionStatus: 'NOT_REQUESTED', // Use string literal
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
        if (opportunity.permissionStatus !== 'NOT_REQUESTED') return res.status(400).json({ message: 'El permiso ya fue solicitado o concedido.' }); // Use string literal

        const originalSignal = await db.getIntentSignal(opportunity.intentSignalId);
        if (!originalSignal) return res.status(404).json({ message: 'Señal original no encontrada.' });

        // Send permission message to prospect via Dominion Network JID (neutral proxy)
        const permissionMessage = `¡Hola! Te contactamos desde la Red Dominion. Hemos detectado un interés en *${opportunity.intentDescription}* que podría ser muy relevante para ti. Un negocio en nuestra red cree que podría ayudarte.\n\n¿Nos autorizas a compartir tu contacto (${originalSignal.prospectName}) con ellos para que puedan presentarte su propuesta? Responde *SÍ* para aceptar, o *NO* para declinar.`;
        
        await sendMessage(DOMINION_NETWORK_JID, originalSignal.prospectJid, permissionMessage); // Use a system-level sender for network messages

        await db.updateConnectionOpportunity(opportunityId, {
            permissionStatus: 'PENDING', // Use string literal
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
        if (opportunity.permissionStatus !== 'GRANTED') return res.status(400).json({ message: 'El permiso no ha sido otorgado aún.' }); // Use string literal

        const originalSignal = await db.getIntentSignal(opportunity.intentSignalId);
        if (!originalSignal) return res.status(404).json({ message: 'Señal original no encontrada.' });

        await db.updateConnectionOpportunity(opportunityId, {
            prospectOriginalJid: originalSignal.prospectJid,
            prospectName: originalSignal.prospectName,
            connectionMadeAt: new Date().toISOString()
        });
        
        // Increment reception score
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