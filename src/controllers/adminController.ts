import { Request, Response } from 'express';
import { db } from '../database.js';
import { logService } from '../services/logService.js';
// FIX: Import ConnectionStatus enum for type-safe comparisons.
import { ConnectionStatus, User } from '../types.js';
import { getSessionStatus } from '../whatsapp/client.js';

const getAdminUser = (req: any) => ({ id: req.user.id, username: req.user.username });

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