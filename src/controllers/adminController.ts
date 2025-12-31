
import { Request, Response } from 'express';
import { db } from '../database.js';
import { logService } from '../services/logService.js';
// FIX: Import ConnectionStatus enum for type-safe comparisons.
import { ConnectionStatus, User, SystemSettings, Message, LeadStatus } from '../types.js';
import { getSessionStatus, processAiResponseForJid } from '../whatsapp/client.js'; // Import processAiResponseForJid
import { conversationService } from '../services/conversationService.js'; // Import conversationService

const getAdminUser = (req: any) => ({ id: req.user.id, username: req.user.username });

// --- Test Bot Specifics ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net'; // Consistent JID for the elite test bot
const ELITE_BOT_NAME = 'Dominion Elite Test Bot';

const TEST_SCRIPT = [
    "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
    "¿Podrías explicarme un poco más sobre el plan PRO?",
    "¿Cuál es el costo mensual?",
    "¿Ofrecen alguna garantía o prueba?",
    "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?",
];

export const handleGetDashboardMetrics = async (req: any, res: any) => {
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

        const planDistribution = clients.reduce((acc, client) => {
            if (client.plan_status === 'active') {
                acc[client.plan_type]++;
            }
            return acc;
        }, { pro: 0, starter: 0 });

        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const expiringSoon = clients.filter(c => c.plan_status === 'active' && new Date(c.billing_end_date) <= sevenDaysFromNow);
        
        const allConversations = clients.flatMap(c => Object.values(c.conversations || {}));

        const topClients = clients.map(c => ({
            username: c.username,
            businessName: c.business_name,
            leadCount: Object.keys(c.conversations || {}).length
        })).sort((a, b) => b.leadCount - a.leadCount).slice(0, 5);

        const metrics = {
            totalClients: clients.length,
            mrr,
            // FIX: The type of getSessionStatus's return value was not being inferred correctly.
            // Using `as any` to bypass the faulty type checking for this specific call.
            onlineNodes: clients.filter(c => (getSessionStatus(c.id) as any).status === ConnectionStatus.CONNECTED).length,
            globalLeads: allConversations.length,
            // FIX: Cast `c` to `any` to resolve TypeScript error. Type inference fails because `allConversations` is an array of untyped objects from the database.
            hotLeads: allConversations.filter((c: any) => c.status === 'Caliente').length,
            atRiskAccounts: clients.filter(c => c.plan_status !== 'active').length,
            planDistribution,
            expiringSoon,
            topClients
        };

        res.json(metrics);
    } catch (error: any) {
        logService.error('Error al obtener métricas del dashboard global', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetAllClients = async (req: any, res: any) => {
    try {
        const clients = await db.getAllClients();
        res.json(clients);
    } catch (error: any) {
        logService.error('Error al obtener todos los clientes', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleUpdateClient = async (req: any, res: any) => {
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

export const handleDeleteClient = async (req: any, res: any) => {
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

export const handleActivateClient = async (req: any, res: any) => {
    const { id } = req.params;
    const admin = getAdminUser(req);
    try {
        const client = await db.getUser(id);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }
        
        const newStartDate = new Date();
        const newEndDate = new Date();
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

export const handleRenewClient = async (req: any, res: any) => {
    const { id } = req.params;
    const admin = getAdminUser(req);
    try {
        const client = await db.getUser(id);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }
        
        const newEndDate = new Date();
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

export const handleGetLogs = async (req: any, res: any) => {
    try {
        const logs = await db.getLogs(200); // Get last 200 logs
        res.json(logs);
    } catch (error: any) {
        logService.error('Error al obtener logs del sistema', error, getAdminUser(req).id, getAdminUser(req).username);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const handleGetSystemSettings = async (req: any, res: any) => {
    try {
        const settings = await db.getSystemSettings();
        res.json(settings);
    } catch (error: any) {
        logService.error('Error al obtener configuración del sistema', error);
        res.status(500).json({ message: 'Error interno.' });
    }
};

export const handleUpdateSystemSettings = async (req: any, res: any) => {
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

/**
 * Inicia una secuencia de mensajes de prueba desde el "bot de pruebas" hacia el bot de un cliente objetivo.
 */
export const handleStartTestBot = async (req: any, res: any) => {
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

        // 1. Asegurarse de que el bot del cliente esté activo
        if (!targetUser.settings.isActive) {
            targetUser.settings.isActive = true;
            await db.updateUserSettings(targetUserId, { isActive: true });
            logService.audit(`Bot del cliente ${targetUser.username} activado para prueba.`, admin.id, admin.username, { targetUserId });
        }
        // 2. Opcional: Resetear el contador de leads calificados para un test limpio
        await db.updateUser(targetUserId, { trial_qualified_leads_count: 0 });

        // Responder al cliente inmediatamente para que el frontend pueda iniciar el polling
        res.status(200).json({ message: 'Secuencia de prueba de bot élite iniciada en background.' });

        // 3. Iniciar la secuencia de mensajes de prueba en segundo plano
        (async () => {
            logService.audit(`Iniciando prueba de bot élite para cliente: ${targetUser.username} en background`, admin.id, admin.username, { targetUserId });

            for (const messageText of TEST_SCRIPT) {
                // Añadir el mensaje del bot élite como si fuera un usuario al chat del cliente
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    timestamp: new Date() 
                };
                await conversationService.addMessage(targetUserId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);

                // Trigger el procesamiento de la IA del cliente objetivo inmediatamente (sin debounce)
                await processAiResponseForJid(targetUserId, ELITE_BOT_JID);

                // Pequeña pausa para simular una conversación
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            logService.audit(`Prueba de bot élite finalizada para cliente: ${targetUser.username} en background`, admin.id, admin.username, { targetUserId });
        })().catch(error => {
            logService.error(`Error en la secuencia de prueba del bot élite en background para ${targetUserId}`, error, admin.id, admin.username);
        });

    } catch (error: any) {
        logService.error(`Error al iniciar la prueba del bot élite para ${targetUserId}`, error, admin.id, admin.username);
        // Si el error ocurre antes de enviar la respuesta HTTP, lo manejamos aquí.
        // Si ya se envió la respuesta, este catch manejará los errores asíncronos en segundo plano.
        if (!res.headersSent) { // Check if response has already been sent
            res.status(500).json({ message: 'Error interno del servidor al iniciar la prueba.' });
        }
    }
};

/**
 * Elimina la conversación del "bot de pruebas" para un cliente objetivo.
 */
export const handleClearTestBotConversation = async (req: any, res: any) => {
    const { targetUserId } = req.body;
    const admin = getAdminUser(req);

    if (!targetUserId) {
        return res.status(400).json({ message: 'Se requiere un targetUserId para limpiar la conversación de prueba.' });
    }

    try {
        const user = await db.getUser(targetUserId);
        if (!user) {
            return res.status(404).json({ message: 'Cliente objetivo no encontrado.' });
        }

        if (user.conversations && user.conversations[ELITE_BOT_JID]) {
            delete user.conversations[ELITE_BOT_JID];
            await db.updateUser(targetUserId, { conversations: user.conversations });
            logService.audit(`Conversación de bot élite eliminada para cliente: ${user.username}`, admin.id, admin.username, { targetUserId });
        } else {
            logService.info(`No se encontró conversación de bot élite para eliminar en cliente: ${user.username}`, admin.id, admin.username, { targetUserId });
        }

        res.status(200).json({ message: 'Conversación de prueba de bot élite eliminada.' });

    } catch (error: any) {
        logService.error(`Error al limpiar la conversación del bot élite para ${targetUserId}`, error, admin.id, admin.username);
        res.status(500).json({ message: 'Error interno del servidor al limpiar la conversación.' });
    }
};
