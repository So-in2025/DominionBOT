import { Buffer } from 'buffer';
// FIX: Import connectToWhatsApp, disconnectWhatsApp, sendMessage as they are now exported.
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid, fetchUserGroups } from '../whatsapp/client.js'; // Import fetchUserGroups
import { conversationService } from '../services/conversationService.js';
// FIX: Added InternalNote to the import list.
// FIX: Added SimulationRun and RadarSettings to the import list for type safety.
import { Message, LeadStatus, User, Conversation, SimulationScenario, EvaluationResult, Campaign, RadarSignal, InternalNote, SimulationRun, RadarSettings } from '../types.js';
import { db, sanitizeKey } from '../database.js'; // Import sanitizeKey
import { logService } from '../services/logService.js';
import { campaignService } from '../services/campaignService.js'; // IMPORT CAMPAIGN SERVICE
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
// FIX: Import radarService for use in handleSimulateRadarSignal.
import { radarService } from '../services/radarService.js';
// FIX: Import Request and Response directly from 'express' and use them with specific generics.
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

// Shared utility to get user from request
// FIX: Explicitly cast Request to include 'user' property.
const getClientUser = (req: ExpressRequest) => ({ id: (req as any).user.id, username: (req as any).user.username });

// FIX: Added generic types to Request for body, params, and query.
export const handleGetStatus = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id } = (req as any).user;
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
export const handleConnect = async (req: ExpressRequest<any, any, { phoneNumber: string }>, res: ExpressResponse) => {
    try {
        const { id } = (req as any).user;
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
export const handleDisconnect = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id } = (req as any).user;
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
export const handleSendMessage = async (req: ExpressRequest<any, any, { to: string; text: string; imageUrl?: string }>, res: ExpressResponse) => {
    try {
        const { id } = (req as any).user;
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
export const handleUpdateConversation = async (req: ExpressRequest<any, any, { id: string; updates: Partial<Conversation> }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
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
export const handleForceAiRun = async (req: ExpressRequest<any, any, { id: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
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
export const handleGetConversations = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id } = (req as any).user;
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
export const handleGetTestimonials = async (req: ExpressRequest, res: ExpressResponse) => {
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
export const handlePostTestimonial = async (req: ExpressRequest<any, any, { name: string; text: string }>, res: ExpressResponse) => {
    try {
        const { id, username } = (req as any).user;
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
export const handleGetTtsAudio = async (req: ExpressRequest<{ eventName: string }>, res: ExpressResponse) => {
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
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
const ELITE_BOT_NAME = 'Simulador Neural';

// FIX: Added generic types to Request for body, params, and query.
export const handleStartClientTestBot = async (req: ExpressRequest<any, any, { scenario?: SimulationScenario }>, res: ExpressResponse) => {
    const { id: userId } = (req as any).user;
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
export const handleStopClientTestBot = async (req: ExpressRequest<any, any, { userId: string }>, res: ExpressResponse) => {
    const { id: userId } = (req as any).user;
    // In a real scenario, you'd have a mechanism to stop the background process.
    // For now, we just acknowledge the request and rely on process cleanup.
    logService.info(`[TEST-BOT] Stop signal received for client test bot: ${userId}`, userId);
    // FIX: Ensure res.status is called correctly.
    res.status(200).json({ message: 'Señal de detención procesada.' });
};

// FIX: Added generic types to Request for body, params, and query.
export const handleClearClientTestBotConversation = async (req: ExpressRequest<any, any, { userId: string }>, res: ExpressResponse) => {
    const { id: userId } = (req as any).user;
    try {
        const user = await db.getUser(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const safeJid = sanitizeKey(ELITE_BOT_JID);
        if (user.conversations && user.conversations[safeJid]) {
            delete user.conversations[safeJid];
            await db.updateUser(userId, { conversations: user.conversations });
        } else if (user.conversations && user.conversations[ELITE_BOT_JID]) {
            delete user.conversations[ELITE_BOT_JID];
            await db.updateUser(userId, { conversations: user.conversations });
        }
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Conversación de prueba eliminada.' });
    } catch (e: any) {
        logService.error('Error clearing client test bot conversation', e, userId);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor al limpiar la conversación.' });
    }
};

// --- CAMPAIGN ROUTES ---
// FIX: Added generic types to Request for body, params, and query.
export const handleGetCampaigns = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure res.json is called correctly.
        const campaigns = await db.getCampaigns(userId);
        res.json(campaigns);
    } catch (e: any) {
        logService.error('Error fetching campaigns', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleCreateCampaign = async (req: ExpressRequest<any, any, Campaign>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.body is accessed correctly.
        const newCampaignData: Campaign = { 
            id: uuidv4(), 
            userId, 
            createdAt: new Date().toISOString(), 
            stats: { totalSent: 0, totalFailed: 0, nextRunAt: new Date().toISOString() }, // Default nextRunAt to now for immediate scheduling
            ...req.body 
        };

        // If 'ONCE' campaign, schedule for 'now' if not specified for immediate run
        if (newCampaignData.schedule.type === 'ONCE' && !newCampaignData.schedule.startDate) {
             // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
            newCampaignData.schedule.startDate = new Date(Date.now()).toISOString();
        }

        // Calculate initial nextRunAt based on schedule
        // FIX: Use the public wrapper method for calculateNextRun.
        newCampaignData.stats.nextRunAt = campaignService.calculateNextRun(newCampaignData);


        const newCampaign = await db.createCampaign(newCampaignData);
        // FIX: Ensure res.status is called correctly.
        res.status(201).json(newCampaign);
    } catch (e: any) {
        logService.error('Error creating campaign', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleUpdateCampaign = async (req: ExpressRequest<{ id: string }, any, Partial<Campaign>>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.params and req.body are accessed correctly.
        const { id: campaignId } = req.params;
        const updates: Partial<Campaign> = req.body;

        const existingCampaign = await db.getCampaign(campaignId);
        if (!existingCampaign || existingCampaign.userId !== userId) {
            return res.status(404).json({ message: 'Campaña no encontrada o acceso denegado.' });
        }
        
        const updatedCampaign = { ...existingCampaign, ...updates };

        // Recalculate nextRunAt if schedule or status changed
        if (updates.schedule || updates.status) {
            // FIX: Use the public wrapper method for calculateNextRun.
            updatedCampaign.stats.nextRunAt = campaignService.calculateNextRun(updatedCampaign);
        }

        const result = await db.updateCampaign(campaignId, updatedCampaign);
        // FIX: Ensure res.json is called correctly.
        res.json(result);
    } catch (e: any) {
        logService.error('Error updating campaign', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleDeleteCampaign = async (req: ExpressRequest<{ id: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.params is accessed correctly.
        const { id: campaignId } = req.params;

        const existingCampaign = await db.getCampaign(campaignId);
        if (!existingCampaign || existingCampaign.userId !== userId) {
            return res.status(404).json({ message: 'Campaña no encontrada o acceso denegado.' });
        }

        const success = await db.deleteCampaign(campaignId);
        if (success) {
            // FIX: Ensure res.status is called correctly.
            res.status(200).json({ message: 'Campaña eliminada.' });
        } else {
            // FIX: Ensure res.status is called correctly.
            res.status(500).json({ message: 'Error al eliminar campaña.' });
        }
    } catch (e: any) {
        logService.error('Error deleting campaign', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleGetWhatsAppGroups = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        const groups = await fetchUserGroups(userId);
        // FIX: Ensure res.json is called correctly.
        res.json(groups);
    } catch (e: any) {
        logService.error('Error fetching WhatsApp groups', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleForceExecuteCampaign = async (req: ExpressRequest<{ id: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.params is accessed correctly.
        const { id: campaignId } = req.params;
        const result = await campaignService.forceExecuteCampaign(campaignId, userId, true); // FIX: Add 'force' parameter
        // FIX: Ensure res.status is called correctly.
        res.status(200).json(result);
    } catch (e: any) {
        logService.error('Error forcing campaign execution', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: e.message || 'Error interno del servidor.' });
    }
};

// --- RADAR ROUTES ---
// FIX: Added generic types to Request for body, params, and query.
export const handleGetRadarSignals = async (req: ExpressRequest<any, any, any, { history?: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // Check for history flag in query params
        // FIX: Ensure req.query is accessed correctly.
        const history = req.query.history === 'true'; 
        const signals = await db.getRadarSignals(userId, history ? 100 : 20); // More for history, less for live
        // FIX: Ensure res.json is called correctly.
        res.json(signals);
    } catch (e: any) {
        logService.error('Error fetching radar signals', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleGetRadarSettings = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        const settings = await db.getRadarSettings(userId);
        // FIX: Ensure res.json is called correctly.
        res.json(settings);
    } catch (e: any) {
        logService.error('Error fetching radar settings', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleUpdateRadarSettings = async (req: ExpressRequest<any, any, Partial<RadarSettings>>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.body is accessed correctly.
        const updates: Partial<RadarSettings> = req.body;
        const updatedSettings = await db.updateRadarSettings(userId, updates);
        // FIX: Ensure res.json is called correctly.
        res.json(updatedSettings);
    } catch (e: any) {
        logService.error('Error updating radar settings', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleDismissRadarSignal = async (req: ExpressRequest<{ id: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.params is accessed correctly.
        const { id: signalId } = req.params;
        await db.updateRadarSignalStatus(signalId, 'DISMISSED');
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Señal descartada.' });
    } catch (e: any) {
        logService.error('Error dismissing radar signal', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleConvertRadarSignal = async (req: ExpressRequest<{ id: string }>, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        // FIX: Ensure req.params is accessed correctly.
        const { id: signalId } = req.params;
        
        // FIX: Changed db.createRadarSignal to db.getRadarSignal, assuming it exists after database.ts modification.
        const existingSignal = await db.getRadarSignal(signalId); // Assuming a getRadarSignal method exists or fetching in another way
        
        if (!existingSignal || existingSignal.userId !== userId) {
            return res.status(404).json({ message: 'Señal no encontrada o acceso denegado.' });
        }

        // Simulate CRM lead creation
        const leadName = existingSignal.senderName || existingSignal.senderJid.split('@')[0];
        const leadIdentifier = existingSignal.senderJid;
        
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        const message: Message = { 
            id: uuidv4(), 
            text: `[RADAR] Oportunidad convertida: ${existingSignal.messageContent}`, 
            sender: 'bot', 
            timestamp: new Date(Date.now()) 
        };
        await conversationService.addMessage(userId, leadIdentifier, message, leadName);
        
        await db.updateRadarSignalStatus(signalId, 'ACTED');
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Señal convertida a Lead en CRM (simulado).' });
    } catch (e: any) {
        logService.error('Error converting radar signal', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleSimulateRadarSignal = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        
        const user = await db.getUser(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Create a dummy message that will trigger a signal
        const dummyMessageContent = "Hola, estoy buscando una agencia que me ayude a escalar mis ventas urgentemente. ¿Alguien tiene alguna recomendación de buen servicio?";
        const dummyGroupName = "Grupo de Pruebas Dominion";
        const dummyGroupJid = "120363040336209095@g.us"; // A valid group JID format
        const dummySenderJid = "5491198765432@s.whatsapp.net";
        const dummySenderName = "Cliente Potencial (Simulado)";
        
        // FIX: `radarService` needs to be imported for this function call.
        await radarService.processGroupMessage(userId, dummyGroupJid, dummyGroupName, dummySenderJid, dummySenderName, dummyMessageContent);
        
        // FIX: Ensure res.status is called correctly.
        res.status(200).json({ message: 'Señal de radar simulada inyectada.' });
    } catch (e: any) {
        logService.error('Error simulating radar signal', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Added generic types to Request for body, params, and query.
export const handleGetRadarActivityLogs = async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const { id: userId } = (req as any).user;
        const logs = await db.getRadarTraceLogs(userId); // Get radar-specific logs
        // FIX: Ensure res.json is called correctly.
        res.json(logs);
    } catch (e: any) {
        logService.error('Error fetching radar activity logs', e, getClientUser(req).id);
        // FIX: Ensure res.status is called correctly.
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};