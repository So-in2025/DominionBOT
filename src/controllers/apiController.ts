
import { Request, Response } from 'express';
import { db } from '../database.js';
import { logService } from '../services/logService.js';
import { User, LeadStatus, Campaign, WhatsAppGroup } from '../types.js';
import { campaignService } from '../services/campaignService.js';
import { fetchUserGroups } from '../whatsapp/client.js';
import { v4 as uuidv4 } from 'uuid';
import { generateContentWithFallback } from '../services/geminiService.js';
import { sanitizeKey } from '../database.js'; // Ensure imported

// FIX: Explicitly add body, params, and query to fix type inheritance issues.
export interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user: { id: string; username: string; role: string; };
    body: ReqBody;
    params: P;
    query: ReqQuery;
}

const getClientUser = (req: AuthenticatedRequest) => req.user;

// --- FALLBACK USER GENERATOR (Anti-Crash) ---
const getFallbackUser = (userId: string, username: string): User => ({
    id: userId,
    username: username,
    business_name: 'Usuario (Recuperado)',
    whatsapp_number: username,
    role: 'client',
    plan_type: 'pro', // Default to PRO to avoid blocking UI during recovery
    plan_status: 'active',
    billing_start_date: new Date().toISOString(),
    billing_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    depthLevel: 1,
    settings: {
        productName: 'Mi Negocio',
        productDescription: '',
        priceText: '',
        ticketValue: 0,
        freeTrialDays: 7,
        ctaLink: '',
        isActive: true,
        disabledMessage: '',
        archetype: 'VENTA_CONSULTIVA' as any,
        toneValue: 3,
        rhythmValue: 3,
        intensityValue: 3,
        isWizardCompleted: false,
        pwaEnabled: false,
        pushEnabled: false,
        audioEnabled: false,
        ttsEnabled: false,
        ignoredJids: [],
        isNetworkEnabled: false,
        isAutonomousClosing: false
    },
    conversations: {},
    governance: {
        systemState: 'ACTIVE',
        riskScore: 0,
        accountFlags: [],
        updatedAt: new Date().toISOString(),
        auditLogs: [],
        humanDeviationScore: 100
    },
    created_at: new Date().toISOString()
});

export const handleGetMetrics = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId, username } = getClientUser(req);
        
        let user = await db.getUser(userId) as unknown as User;
        
        // CRITICAL FALLBACK: If DB fails or user is missing, return a mock user structure so UI loads
        if (!user) {
            logService.warn(`[API] User ${userId} not found in DB. Returning fallback metrics.`, userId);
            user = getFallbackUser(userId, username);
        }

        const conversations = await db.getUserConversations(userId) || [];
        const campaigns = await db.getCampaigns(userId) || [];

        const totalLeads = conversations.length;
        const hotLeads = conversations.filter(c => c.status === LeadStatus.HOT).length;
        const warmLeads = conversations.filter(c => c.status === LeadStatus.WARM).length;
        const coldLeads = conversations.filter(c => c.status === LeadStatus.COLD).length;
        const totalMessages = conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0);
        
        const conversionRate = totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0;
        const revenueEstimated = hotLeads * (user.settings?.ticketValue || 100); 
        
        const campaignsActive = campaigns.filter(c => c.status === 'ACTIVE').length;
        const campaignMessagesSent = campaigns.reduce((sum, c) => sum + (c.stats?.totalSent || 0), 0);

        res.json({
            totalLeads,
            hotLeads,
            warmLeads,
            coldLeads,
            totalMessages,
            conversionRate,
            revenueEstimated,
            avgEscalationTimeMinutes: 0, 
            activeSessions: 1, 
            humanDeviationScore: user.governance?.humanDeviationScore || 98,
            campaignsActive,
            campaignMessagesSent
        });

    } catch (error: any) {
        logService.error('Error fetching dashboard metrics', error, getClientUser(req).id);
        // SAFETY NET: Never return 500 for metrics, return zeros to keep dashboard alive
        res.json({
            totalLeads: 0, hotLeads: 0, warmLeads: 0, coldLeads: 0,
            totalMessages: 0, conversionRate: 0, revenueEstimated: 0,
            activeSessions: 0, humanDeviationScore: 0, campaignsActive: 0, campaignMessagesSent: 0
        });
    }
};

export const handleGetCampaigns = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const campaigns = await db.getCampaigns(userId);
        res.json(campaigns || []); // Ensure array
    } catch (error: any) {
        logService.error('Error fetching campaigns', error, getClientUser(req).id);
        // Fallback to empty array
        res.json([]);
    }
};

export const handleCreateCampaign = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const campaignData = req.body;
        
        const newCampaign: Campaign = {
            ...campaignData,
            id: uuidv4(),
            userId,
            stats: { totalSent: 0, totalFailed: 0 },
            createdAt: new Date().toISOString(),
        };

        newCampaign.stats.nextRunAt = campaignService.calculateNextRun(newCampaign);

        const created = await db.createCampaign(newCampaign);
        res.status(201).json(created);
    } catch (error: any) {
        logService.error('Error creating campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateCampaign = async (req: AuthenticatedRequest<{ id: string }>, res: any) => {
    try {
        const { id: campaignId } = req.params;
        const { id: userId } = getClientUser(req);
        const campaignData = req.body;

        const existing = await db.getCampaign(campaignId);
        if (!existing || existing.userId !== userId) {
            return res.status(404).json({ message: 'Campaña no encontrada o no autorizada.' });
        }

        const updatedData = { ...existing, ...campaignData };
        updatedData.stats.nextRunAt = campaignService.calculateNextRun(updatedData);

        const updated = await db.updateCampaign(campaignId, updatedData);
        res.json(updated);
    } catch (error: any) {
        logService.error('Error updating campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetWhatsAppGroups = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const groups: WhatsAppGroup[] = await fetchUserGroups(userId);
        res.json(groups.sort((a,b) => (a.subject || '').localeCompare(b.subject || '')));
    } catch(e: any) {
        // Don't crash, just return empty groups
        logService.warn('Error fetching whatsapp groups (non-fatal)', getClientUser(req).id);
        res.json([]);
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

export const handleDeleteAllCampaigns = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = req.user;
        const count = await db.deleteAllUserCampaigns(userId);
        logService.audit(`Purgadas todas las campañas (${count})`, userId, req.user.username);
        res.status(200).json({ message: `Se eliminaron ${count} campañas.` });
    } catch (error: any) {
        logService.error('Error purging campaigns', error, getClientUser(req).id);
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
        logService.error('Error executing campaign', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno.' });
    }
};

export const handleGenerateCampaignPrompt = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const { message } = req.body;
        const user = await db.getUser(userId) as unknown as User;

        if (!user || !user.settings.geminiApiKey) {
            return res.status(400).json({ message: 'API Key de Gemini no configurada.' });
        }

        const prompt = `
            Basado en el siguiente mensaje de campaña de WhatsApp para el negocio "${user.settings.productName}", 
            genera un prompt conciso y evocador para un generador de imágenes de IA (como DALL-E o Midjourney) 
            que cree una imagen visualmente impactante y relevante.

            Mensaje de la Campaña:
            "${message}"

            Output debe ser solo el texto del prompt, en inglés.
        `;

        const response = await generateContentWithFallback({
            apiKey: user.settings.geminiApiKey,
            prompt: prompt,
            systemInstruction: 'Eres un experto en la creación de prompts para IA generativa de imágenes.',
        });

        if (!response || !response.text) {
            throw new Error('La IA no generó una respuesta.');
        }

        res.json({ text: response.text });

    } catch (error: any) {
        logService.error('Error generating AI campaign prompt', error, getClientUser(req).id);
        res.status(500).json({ message: error.message || 'Error interno del servidor.' });
    }
};

// --- SETTINGS & USER ---
export const handleGetUser = async (req: any, res: any) => {
    try {
        if (req.user.role === 'super_admin') {
             return res.json({
                 id: 'super_admin',
                 username: 'master',
                 role: 'super_admin',
                 business_name: 'DOMINION GOD MODE',
                 plan_status: 'active',
                 plan_type: 'pro',
                 billing_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                 settings: { isActive: true, productName: 'Sistema Central' }
             });
        }
        const user = await db.getUser(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado en base de datos." });
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ message: "Error retrieval" });
    }
};

// --- CRITICAL FIX: Safe Conversation Delete ---
export const handleDeleteConversation = async (req: any, res: any) => {
    const { id } = req.params;
    const user = await db.getUser(req.user.id);
    if(user && user.conversations) {
        const safeId = sanitizeKey(id);
        // Utilizar rawUpdateUser para pasar el operador $unset sin que Mongoose lo envuelva en $set
        await db.rawUpdateUser(req.user.id, { $unset: { [`conversations.${safeId}`]: 1, [`conversations.${id}`]: 1 } });
    }
    res.json({ success: true });
};
