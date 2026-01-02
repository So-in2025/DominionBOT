
import { Request, Response } from 'express';
import { db, sanitizeKey } from '../database.js'; // Import sanitizeKey
import { logService } from '../services/logService.js';
// FIX: Import ConnectionStatus enum for type-safe comparisons.
import { ConnectionStatus, User, SystemSettings, Message, LeadStatus, Conversation } from '../types.js';
import { getSessionStatus, processAiResponseForJid, ELITE_BOT_JID, ELITE_BOT_NAME } from '../whatsapp/client.js'; // IMPORTED CONSTANTS HERE
import { conversationService } from '../services/conversationService.js'; // Import conversationService
import { v4 as uuidv4 } from 'uuid'; // Need uuid for Boosts
// FIX: Import express default to access Request and Response types.
import express from 'express';

// Define a custom Request type to include the 'user' property added by authentication middleware
// FIX: Changed interface to type using intersection for better type resolution
type AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> = express.Request<P, ResBody, ReqBody, ReqQuery> & {
    user: { id: string; username: string; role: string; };
};

const getAdminUser = (req: AuthenticatedRequest) => ({ id: req.user.id, username: req.user.username });

const TEST_SCRIPT = [
    "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
    "¿Podrías explicarme un poco más sobre el plan PRO?",
    "¿Cuál es el costo mensual?",
    "¿Ofrecen alguna garantía o prueba?",
    "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?",
];

export const handleGetDashboardMetrics = async (req: AuthenticatedRequest, res: express.Response) => {
    try {
        const clients = await db.getAllClients();
        
        const proPrice = 29; // Nuevo precio del plan Pro
        const starterPrice = 0; // El plan Starter no genera MRR

        const mrr = clients.reduce((acc, client) => {
            if (client.plan_status === 'active') {
                return acc + (client.plan_type === 'pro' ? proPrice : starterPrice);
            }
            return acc;
        }, 0);

        const planDistribution = clients.reduce((acc: { pro: number; starter: number; }, client) => {
            if (client.plan_status === 'active') {
                acc[client.plan_type]++; 
            }
            return acc;
        }, { pro: 0, starter: 0 });

        const sevenDaysFromNow = new Date(Date.now());
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const expiringSoon = clients.filter(c => c.plan_status === 'active' && new Date(c.billing_end_date) <= sevenDaysFromNow);
        
        const allConversations = clients.flatMap(c => Object.values(c.conversations || {}));

        const metrics = {
            totalClients: clients.length,
            mrr,
            // FIX: Removed `as any` cast. `getSessionStatus` returns a type with a `status` property.
            onlineNodes: clients.filter(c => getSessionStatus(c.id).status === ConnectionStatus.CONNECTED).length,
            globalLeads: allConversations.length,
            // FIX: Explicitly cast `c` to `Conversation` to resolve TypeScript error.
            hotLeads: allConversations.filter((c: Conversation) => c.status === LeadStatus.HOT).length,
            atRiskAccounts: clients.filter(c => c.plan_status !== 'active').length,
            planDistribution,
            expiringSoon,
            topClients: [] // Placeholder as topClients logic wasn't fully defined in previous context
        };

        res.json(metrics);
    } catch (error: any) {
        logService.error('Error al obtener métricas del dashboard global', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetAllClients = async (req: AuthenticatedRequest, res: express.Response) => {
    try {
        const clients = await db.getAllClients();
        res.json(clients);
    } catch (error: any) {
        logService.error('Error al obtener todos los clientes', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateClient = async (req: AuthenticatedRequest<{ id: string }, any, Partial<User>>, res: express.Response) => {
    const { id } = req.params;
    const updates: Partial<User> = req.body;
    const admin = getAdminUser(req);

    try {
        const updatedClient = await db.updateUser(id, updates);
        if (!updatedClient) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }
        logService.audit(`Cliente actualizado: ${updatedClient.username}`, admin.id, admin.username, { clientId: id, changes: updates });
        res.json(updatedClient);
    } catch (error: any) {
        logService.error(`Error al actualizar cliente ${id}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleDeleteClient = async (req: AuthenticatedRequest<{ id: string }>, res: express.Response) => {
    const { id } = req.params;
    const admin = getAdminUser(req);

    try {
        const client = await db.getUser(id);
        if (!client) return res.status(404).json({ message: 'Cliente no encontrado.' });

        const success = await db.deleteUser(id);
        if (success) {
            logService.audit(`CLIENTE ELIMINADO: ${client.username}`, admin.id, admin.username, { deletedClientId: id });
            res.json({ message: 'Cliente eliminado correctamente.' });
        } else {
            res.status(500).json({ message: 'No se pudo eliminar al cliente.' });
        }
    } catch (error: any) {
        logService.error(`Error crítico al eliminar cliente ${id}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleActivateClient = async (req: AuthenticatedRequest<{ id: string }>, res: express.Response) => {
    const { id } = req.params;
    const admin = getAdminUser(req);
    try {
        const client = await db.getUser(id);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }
        
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        const newStartDate = new Date(Date.now());
        const newEndDate = new Date(Date.now());
        newEndDate.setDate(newEndDate.getDate() + 30);

        const updates: Partial<User> = {
            plan_status: 'active',
            billing_start_date: newStartDate.toISOString(),
            billing_end_date: newEndDate.toISOString()
        };

        const updatedClient = await db.updateUser(id, updates);
        logService.audit(`Licencia activada por 30 días para: ${client.username}`, admin.id, admin.username, { clientId: id });
        res.json(updatedClient);
    } catch (error: any) {
        logService.error(`Error al activar licencia para ${id}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleRenewClient = async (req: AuthenticatedRequest<{ id: string }>, res: express.Response) => {
    const { id } = req.params;
    const admin = getAdminUser(req);
    try {
        const client = await db.getUser(id);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }
        
        // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
        const newEndDate = new Date(Date.now());
        newEndDate.setDate(newEndDate.getDate() + 30);

        const updates: Partial<User> = {
            plan_status: 'active',
            billing_end_date: newEndDate.toISOString()
        };

        const updatedClient = await db.updateUser(id, updates);
        logService.audit(`Plan renovado por 30 días para: ${client.username}`, admin.id, admin.username, { clientId: id });
        res.json(updatedClient);
    } catch (error: any) {
        logService.error(`Error al renovar plan para ${id}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetLogs = async (req: AuthenticatedRequest, res: express.Response) => {
    try {
        const logs = await db.getLogs(200); // Get last 200 logs
        res.json(logs);
    } catch (error: any) {
        logService.error('Error al obtener logs del sistema', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetSystemSettings = async (req: express.Request, res: express.Response) => {
    try {
        const settings = await db.getSystemSettings();
        res.json(settings);
    } catch (error: any) {
        logService.error('Error al obtener configuración del sistema', error);
        res.status(500).json({ message: 'Error interno.' });
    }
};

export const handleUpdateSystemSettings = async (req: AuthenticatedRequest<any, any, Partial<SystemSettings>>, res: express.Response) => {
    try {
        const admin = getAdminUser(req);
        const updates: Partial<SystemSettings> = req.body;
        const settings = await db.updateSystemSettings(updates);
        logService.audit('Configuración global del sistema actualizada', admin.id, admin.username, { updates });
        res.json(settings);
    } catch (error: any) {
        logService.error('Error al actualizar configuración del sistema', error);
        res.status(500).json({ message: 'Error interno.' });
    }
};

export const handleStartTestBot = async (req: AuthenticatedRequest<any, any, { targetUserId: string }>, res: express.Response) => {
    const { targetUserId } = req.body;
    const admin = getAdminUser(req);

    if (!targetUserId) {
        return res.status(400).json({ message: 'Se requiere un targetUserId para iniciar la prueba.' });
    }

    try {
        let targetUser = await db.getUser(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ message: 'Cliente objetivo no encontrado.' });
        }

        if (!targetUser.settings.isActive) {
            targetUser.settings.isActive = true;
            await db.updateUserSettings(targetUserId, { isActive: true });
            logService.audit(`Bot del cliente ${targetUser.username} activado para prueba.`, admin.id, admin.username, { targetUserId });
        }
        await db.updateUser(targetUserId, { trial_qualified_leads_count: 0 });

        const cleanConversation: Conversation = {
            id: ELITE_BOT_JID,
            leadIdentifier: 'Simulador',
            leadName: ELITE_BOT_NAME,
            status: LeadStatus.COLD,
            messages: [], 
            isBotActive: true,
            isMuted: false,
            isTestBotConversation: true,
            tags: [],
            internalNotes: [],
            isAiSignalsEnabled: true,
            // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
            lastActivity: new Date(Date.now())
        };
        await db.saveUserConversation(targetUserId, cleanConversation);
        
        res.status(200).json({ message: 'Secuencia de prueba de bot élite iniciada en background.' });

        (async () => {
            logService.audit(`Iniciando prueba de bot élite para cliente: ${targetUser.username} en background`, admin.id, admin.username, { targetUserId });

            for (const messageText of TEST_SCRIPT) {
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    timestamp: new Date(Date.now())
                };
                await conversationService.addMessage(targetUserId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);
                await processAiResponseForJid(targetUserId, ELITE_BOT_JID);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            logService.audit(`Prueba de bot élite finalizada para cliente: ${targetUser.username} en background`, admin.id, admin.username, { targetUserId });
        })().catch(error => {
            logService.error(`Error en la secuencia de prueba del bot élite en background para ${targetUserId}`, error, admin.id, admin.username);
        });

    } catch (error: any) {
        logService.error(`Error al iniciar la prueba del bot élite para ${targetUserId}`, error, admin.id, admin.username);
        if (!res.headersSent) res.status(500).json({ message: 'Error al iniciar la prueba.' });
    }
};

// DEPTH CONTROL HANDLERS (NEW)
export const handleUpdateDepthLevel = async (req: AuthenticatedRequest<any, any, { userId: string, depthLevel: number }>, res: express.Response) => {
    const { userId, depthLevel } = req.body;
    const admin = getAdminUser(req);
    try {
        const user = await db.getUser(userId);
        if(!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        await db.updateUser(userId, { depthLevel });
        logService.audit(`Depth Level actualizado a ${depthLevel} para ${user.username}`, admin.id, admin.username, { userId });
        res.json({ message: 'Nivel de profundidad actualizado.' });
    } catch(e: any) {
        logService.error('Error updating depth level', e, admin.id);
        res.status(500).json({ message: 'Error interno' });
    }
};

export const handleApplyDepthBoost = async (req: AuthenticatedRequest<any, any, { userId: string, depthDelta: number, durationHours: number }>, res: express.Response) => {
    const { userId, depthDelta, durationHours } = req.body;
    const admin = getAdminUser(req);
    try {
         const user = await db.getUser(userId);
         if(!user) return res.status(404).json({ message: 'Usuario no encontrado' });

         const now = new Date();
         const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

         const boost = {
             id: uuidv4(),
             userId,
             depthDelta,
             reason: 'Admin Boost',
             startsAt: now.toISOString(),
             endsAt: endsAt.toISOString(),
             createdBy: admin.id
         };

         await db.createDepthBoost(boost);
         logService.audit(`Boost de Profundidad aplicado (+${depthDelta}) para ${user.username}`, admin.id, admin.username, { boost });
         res.json({ message: 'Boost aplicado correctamente.' });

    } catch(e: any) {
        logService.error('Error applying boost', e, admin.id);
        res.status(500).json({ message: 'Error interno' });
    }
};

export const handleClearTestBotConversation = async (req: AuthenticatedRequest<any, any, { targetUserId: string }>, res: express.Response) => {
    const { targetUserId } = req.body;
    const admin = getAdminUser(req);
    
    if (!targetUserId) return res.status(400).json({ message: 'Se requiere targetUserId.' });

    try {
        const user = await db.getUser(targetUserId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const safeJid = sanitizeKey(ELITE_BOT_JID);
        // FIX: Access conversations using the safe key properly in the conditional
        if (user.conversations && (user.conversations[safeJid] || user.conversations[ELITE_BOT_JID])) {
            const conversations = { ...user.conversations };
            delete conversations[safeJid];
            delete conversations[ELITE_BOT_JID];
            await db.updateUser(targetUserId, { conversations });
            logService.audit(`Conversación de bot élite eliminada para cliente: ${user.username}`, admin.id, admin.username, { targetUserId });
        } 

        res.status(200).json({ message: 'Conversación de prueba de bot élite eliminada.' });

    } catch (error: any) {
        logService.error(`Error al limpiar la conversación del bot élite para ${targetUserId}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor al limpiar la conversación.' });
    }
};

// --- ADMIN NETWORK ROUTES ---
export const handleGetNetworkOverview = async (req: AuthenticatedRequest, res: express.Response) => {
    try {
        const stats = await db.getNetworkStats();
        const activity = await db.getRecentNetworkActivity();
        res.json({ stats, activity });
    } catch (error: any) {
        logService.error('Error fetching network overview', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno' });
    }
};