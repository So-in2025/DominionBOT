
import { Request, Response } from 'express';
import { db } from '../database.js';
import { logService } from '../services/logService.js';
import { User, LeadStatus, Campaign, WhatsAppGroup } from '../types.js';
import { campaignService } from '../services/campaignService.js';
import { fetchUserGroups } from '../whatsapp/client.js';
import { v4 as uuidv4 } from 'uuid';
import { generateContentWithFallback } from '../services/geminiService.js';

// FIX: Explicitly add body, params, and query to fix type inheritance issues.
export interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user: { id: string; username: string; role: string; };
    body: ReqBody;
    params: P;
    query: ReqQuery;
}

const getClientUser = (req: AuthenticatedRequest) => req.user;

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
export const handleGetMetrics = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        // FIX: Double casting (as unknown as User) to force TS to accept Mongoose lean doc as User interface
        const user = await db.getUser(userId) as unknown as User;
        if (!user) return res.status(404).json({ message: "User not found" });

        const conversations = await db.getUserConversations(userId);
        const campaigns = await db.getCampaigns(userId);

        const totalLeads = conversations.length;
        const hotLeads = conversations.filter(c => c.status === LeadStatus.HOT).length;
        const warmLeads = conversations.filter(c => c.status === LeadStatus.WARM).length;
        const coldLeads = conversations.filter(c => c.status === LeadStatus.COLD).length;
        const totalMessages = conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0);
        
        const conversionRate = totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0;
        const revenueEstimated = hotLeads * (user.settings.ticketValue || 0);
        
        const campaignsActive = campaigns.filter(c => c.status === 'ACTIVE').length;
        const campaignMessagesSent = campaigns.reduce((sum, c) => sum + (c.stats.totalSent || 0), 0);

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
            humanDeviationScore: user.governance?.humanDeviationScore || 0,
            campaignsActive,
            campaignMessagesSent
        });

    } catch (error: any) {
        logService.error('Error fetching dashboard metrics', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
export const handleGetCampaigns = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const campaigns = await db.getCampaigns(userId);
        res.json(campaigns);
    } catch (error: any) {
        logService.error('Error fetching campaigns', error, getClientUser(req).id);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
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

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
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

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
export const handleGetWhatsAppGroups = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const groups: WhatsAppGroup[] = await fetchUserGroups(userId);
        res.json(groups.sort((a,b) => (a.subject || '').localeCompare(b.subject || '')));
    } catch(e: any) {
        logService.error('Error fetching whatsapp groups', e, getClientUser(req).id);
        res.status(500).json({ message: e.message });
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

// FIX: Changed res type to 'any' to resolve type conflicts, matching other handlers.
export const handleGenerateCampaignPrompt = async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id: userId } = getClientUser(req);
        const { message } = req.body;
        // FIX: Double casting (as unknown as User)
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
