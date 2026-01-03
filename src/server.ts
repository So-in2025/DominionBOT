
// ... (imports remain the same)
import { JWT_SECRET, PORT } from './env.js';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { optionalAuthenticateToken } from './middleware/optionalAuth.js';
import { logService } from './services/logService.js';
import { ttsService } from './services/ttsService.js'; 
import { campaignService } from './services/campaignService.js'; 
import { connectToWhatsApp, getSessionStatus } from './whatsapp/client.js'; 
import { ConnectionStatus } from './types.js'; 
import { v4 as uuidv4 } from 'uuid'; 
import { regenerateSimulationScript } from './services/aiService.js'; 
import { ngrokService } from './services/ngrokService.js'; // NEW IMPORT

// ... (Global Error Handlers remain same)
(process as any).on('uncaughtException', (err: any) => {
    console.error('🔥 [CRITICAL] Uncaught Exception:', err);
    logService.error('UNCAUGHT EXCEPTION - SERVER KEPT ALIVE', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('🔥 [CRITICAL] Unhandled Rejection:', reason);
    if (reason?.output?.statusCode === 428 || reason?.message === 'Connection Closed') {
        logService.warn('WhatsApp Session Conflict (428) detected in background. Session needs reset.');
    } else {
        logService.error('UNHANDLED REJECTION - SERVER KEPT ALIVE', reason);
    }
});

// ... (SEED DATA remains same)
const SEED_TESTIMONIALS = [
    { name: "Marcos López", location: "Mendoza", text: "Bueno, parece que soy el primero en comentar. La verdad entré medio de curioso y no entendía nada al principio, pero después de usarlo un poco me acomodó bastante el WhatsApp." },
    { name: "Emilia Ponce", location: "Rosario", text: "Ojalá lo sigan mejorando, pero la base está muy bien." },
];

const app = express();

// ... (Middleware setup remains same)
const IGNORED_API_PATHS = ['/api/status', '/api/conversations', '/api/campaigns', '/api/radar/activity', '/api/radar/signals'];
app.use((req, res, next) => {
    if (req.url.startsWith('/api') && !IGNORED_API_PATHS.some(path => req.url.startsWith(path))) {
        logService.debug(`[API] ${req.method} ${req.url}`);
    }
    next();
});

app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'ngrok-skip-browser-warning', 'Accept'],
    credentials: true,
    maxAge: 86400
}) as any);

app.use(express.json({ limit: '10mb' }) as any);

// ==========================================
// API ROUTES
// ==========================================

// ... (login/register/user routes remain same)
app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    try {
        const user = await db.validateUser(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
            logService.info('Inicio de sesión exitoso', user.id, username);
            return res.json({ token, role: user.role });
        }
        await new Promise(r => setTimeout(r, 1000));
        logService.warn('Intento de login fallido', undefined, username);
        res.status(401).json({ message: 'Algun dato parece incorrecto, revisa e intenta nuevamente.' });
    } catch (e: any) {
        logService.error('Error interno en login', e, undefined, username);
        res.status(500).json({ message: "Error interno." });
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, businessName, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, businessName, 'client', intendedUse);
        if (!newUser) {
            logService.warn('Intento de registro de usuario existente', undefined, username);
            return res.status(400).json({ message: 'El número de WhatsApp ya está registrado.' });
        }
        const token = jwt.sign({ id: newUser.id, role: newUser.role, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
        logService.audit('Nuevo cliente registrado', newUser.id, username);
        res.status(201).json({ token, role: newUser.role, recoveryKey: newUser.recoveryKey });
    } catch (e) {
        logService.error('Error en registro', e, undefined, username);
        res.status(500).json({ message: 'Error interno.' });
    }
});

app.get('/api/user/me', authenticateToken, async (req: any, res: any) => {
    const user = await db.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const { password, ...safeUser } = user;
    res.json(safeUser);
});

app.get('/api/settings', authenticateToken, async (req: any, res: any) => {
    const user = await db.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user.settings || {});
});

// UPDATE THIS ROUTE
app.post('/api/settings', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const updated = await db.updateUserSettings(userId, req.body);
    logService.info('Configuración actualizada', userId, req.user.username);
    
    // FIRE AND FORGET: Regenerate Simulation Script
    regenerateSimulationScript(userId).catch(err => {
        logService.error('Background script generation failed', err, userId);
    });

    res.json(updated);
});

app.get('/api/metrics', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const user = await db.getUser(userId);
    if (!user) return res.status(404).end();
    
    const convs = Object.values(user.conversations || {});
    const hot = convs.filter((c: any) => c.status === 'Caliente').length;
    
    const campaigns = await db.getCampaigns(userId);
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
    const totalCampaignMessages = campaigns.reduce((acc, curr) => acc + (curr.stats?.totalSent || 0), 0);

    const ticketValue = user.settings?.ticketValue || 0;
    const revenueEstimated = hot * ticketValue;

    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: convs.filter((c: any) => c.status === 'Tibio').length,
        coldLeads: convs.filter((c: any) => c.status === 'Frío').length,
        totalMessages: 0, 
        conversionRate: convs.length > 0 ? Math.round((hot / convs.length) * 100) : 0,
        revenueEstimated,
        avgEscalationTimeMinutes: 0,
        activeSessions: 1,
        humanDeviationScore: user.governance.humanDeviationScore || 0,
        campaignsActive: activeCampaigns,
        campaignMessagesSent: totalCampaignMessages
    });
});

import * as apiController from './controllers/apiController.js';
import * as adminController from './controllers/adminController.js';
import { ELITE_BOT_JID, ELITE_BOT_NAME } from './whatsapp/client.js';


// Standard Client Routes
app.get('/api/status', authenticateToken, apiController.handleGetStatus); 
app.post('/api/connect', authenticateToken, apiController.handleConnect);
app.get('/api/disconnect', authenticateToken, apiController.handleDisconnect);
app.post('/api/send', authenticateToken, apiController.handleSendMessage);
app.post('/api/conversation/update', authenticateToken, apiController.handleUpdateConversation);
app.post('/api/conversation/force-run', authenticateToken, apiController.handleForceAiRun); 
app.get('/api/conversations', authenticateToken, apiController.handleGetConversations);

// Client Test Bot Routes
app.post('/api/client/test-bot/start', authenticateToken, apiController.handleStartClientTestBot);
app.post('/api/client/test-bot/stop', authenticateToken, apiController.handleStopClientTestBot); 
app.post('/api/client/test-bot/clear', authenticateToken, apiController.handleClearClientTestBotConversation);

// Campaign Routes (NEW)
app.get('/api/campaigns', authenticateToken, apiController.handleGetCampaigns);
app.post('/api/campaigns', authenticateToken, apiController.handleCreateCampaign);
app.put('/api/campaigns/:id', authenticateToken, apiController.handleUpdateCampaign);
app.delete('/api/campaigns/:id', authenticateToken, apiController.handleDeleteCampaign);
app.post('/api/campaigns/:id/execute', authenticateToken, apiController.handleForceExecuteCampaign); 
app.get('/api/whatsapp/groups', authenticateToken, apiController.handleGetWhatsAppGroups);

// Radar Routes (NEW RADAR 3.0)
app.get('/api/radar/signals', authenticateToken, apiController.handleGetRadarSignals);
app.get('/api/radar/settings', authenticateToken, apiController.handleGetRadarSettings);
app.post('/api/radar/settings', authenticateToken, apiController.handleUpdateRadarSettings);
app.post('/api/radar/signals/:id/dismiss', authenticateToken, apiController.handleDismissRadarSignal);
app.post('/api/radar/signals/:id/convert', authenticateToken, apiController.handleConvertRadarSignal); 
app.post('/api/radar/simulate', authenticateToken, apiController.handleSimulateRadarSignal); 
app.get('/api/radar/activity', authenticateToken, apiController.handleGetRadarActivityLogs); 

// Network Routes (NEW)
app.post('/api/network/signals', authenticateToken, apiController.handleCreateIntentSignal);
app.get('/api/network/signals', authenticateToken, apiController.handleGetIntentSignals);
app.get('/api/network/opportunities', authenticateToken, apiController.handleGetConnectionOpportunities);
app.post('/api/network/opportunities/:id/request-permission', authenticateToken, apiController.handleRequestPermission);
app.get('/api/network/opportunities/:id/reveal-contact', authenticateToken, apiController.handleRevealContact);
app.get('/api/network/profile', authenticateToken, apiController.handleGetNetworkProfile);
app.post('/api/network/profile', authenticateToken, apiController.handleUpdateNetworkProfile);


// Public/Shared Routes
app.get('/api/system/settings', adminController.handleGetSystemSettings); 

// Testimonial Routes
app.get('/api/testimonials', apiController.handleGetTestimonials);
app.post('/api/testimonials', authenticateToken, apiController.handlePostTestimonial);

// TTS Pre-generated Audio Route
app.get('/api/tts/:eventName', optionalAuthenticateToken, apiController.handleGetTtsAudio);

// Super Admin Routes
const adminRouter = express.Router();
adminRouter.use(authenticateToken, (req: any, res, next) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Acceso denegado.' });
    next();
});

adminRouter.get('/dashboard-metrics', adminController.handleGetDashboardMetrics);
adminRouter.get('/clients', adminController.handleGetAllClients);
adminRouter.put('/clients/:id', adminController.handleUpdateClient);
adminRouter.delete('/clients/:id', adminController.handleDeleteClient); 
adminRouter.post('/clients/:id/renew', adminController.handleRenewClient);
adminRouter.post('/clients/:id/activate', adminController.handleActivateClient);
adminRouter.get('/logs', adminController.handleGetLogs);
// Admin System Settings
adminRouter.get('/system/settings', adminController.handleGetSystemSettings);
adminRouter.put('/system/settings', adminController.handleUpdateSystemSettings);

// Admin Test Bot Routes
adminRouter.post('/test-bot/start', adminController.handleStartTestBot);
adminRouter.post('/test-bot/clear', adminController.handleClearTestBotConversation);

// DEPTH CONTROL ROUTES (NEW)
adminRouter.post('/depth/update', adminController.handleUpdateDepthLevel);
adminRouter.post('/depth/boost', adminController.handleApplyDepthBoost);

// Admin Network Overview (NEW)
adminRouter.get('/network/overview', adminController.handleGetNetworkOverview);

adminRouter.post('/system/reset', async (req: any, res, next) => {
    try {
        logService.audit('HARD RESET DEL SISTEMA INICIADO', req.user.id, req.user.username);
        const success = await db.dangerouslyResetDatabase();
        if (success) res.json({ message: 'Sistema reseteado.' });
        else res.status(500).json({ message: 'Error al resetear.' });
    } catch (e) { next(e); }
});

app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'DOMINION_ONLINE', database: db.isReady() ? 'CONNECTED' : 'CONNECTING' });
});

// ... (Error handling and listen remains the same)
app.use('/api', (req: any, res) => {
    logService.warn(`Ruta de API no encontrada: ${req.method} ${req.originalUrl}`, req.user?.id, req.user?.username);
    res.status(404).json({ message: 'Ruta de API no encontrada.' });
});

app.use((req: any, res) => {
    res.status(404).send('Página no encontrada.'); 
});

app.use((err: any, req: any, res: any, next: any) => {
    logService.error('Error no manejado en Express', err, req.user?.id, req.user?.username, { path: req.path, method: req.method });
    console.error("DEBUG: Global Express Error:", err); 
    res.status(err.status || 500).json({
        message: err.message || 'Error interno del servidor.',
        error: process.env.NODE_ENV === 'development' ? err : {} 
    });
});


app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}`);
    try {
        await db.init();
        logService.info('El sistema backend se ha iniciado correctamente.');
        
        // START NGROK AUTO-DETECTION
        ngrokService.startAutoDetection();

        // ... (Testimonial seeding and TTS init logic remains the same)
        const seedCount = await db.countSeedTestimonials();
        if (seedCount === 0) {
            logService.info('[SERVER] No se detectaron testimonios de sistema ("system_seed"). Iniciando inyección DRIP...');
            const seededData = SEED_TESTIMONIALS.map((t, index) => {
                let date = new Date(Date.now());
                if (index < 3) {
                    const hoursAgo = 20 - (index * 8); 
                    date.setHours(date.getHours() - hoursAgo);
                } else {
                    const daysInFuture = (index - 2); 
                    date.setDate(date.getDate() + daysInFuture);
                }
                return {
                    userId: 'system_seed',
                    name: (t as {name: string, location: string, text: string}).name || Object.keys(t)[0], 
                    location: (t as {name: string, location: string, text: string}).location || '', 
                    text: (t as {name: string, location: string, text: string}).text || Object.values(t)[0],
                    createdAt: date.toISOString(), 
                    updatedAt: date.toISOString()
                };
            });
            try {
                await db.seedTestimonials(seededData.map(data => ({ ...data, _id: data.userId === 'system_seed' ? `seed_${uuidv4()}` : undefined })));
                logService.info(`[SERVER] ✅ Inyección exitosa: 3 visibles, ${seededData.length - 3} programados.`);
            } catch (err) {
                logService.error('[SERVER] ❌ Error crítico inyectando testimonios:', err);
            }
        } else {
            logService.info(`[SERVER] Testimonios de sistema verificados (${seedCount}). Integridad OK.`);
        }

        await ttsService.init(); 

        logService.info('[SERVER] Iniciando reconexión automática de nodos de WhatsApp...');
        const clients = await db.getAllClients();
        for (const client of clients) {
            const isActivePlan = client.plan_status === 'active' || client.plan_status === 'trial';
            if (isActivePlan && client.settings.isActive) {
                logService.info(`[SERVER] Intentando reconectar nodo para el cliente: ${client.username} (ID: ${client.id})`, client.id);
                connectToWhatsApp(client.id).catch(err => {
                    logService.error(`[SERVER] Falló la reconexión inicial para el cliente ${client.username}`, err, client.id);
                });
                await new Promise(resolve => setTimeout(resolve, 500)); 
            } else {
                logService.info(`[SERVER] No se reconectará el nodo para el cliente: ${client.username} (plan_status: ${client.plan_status}, bot activo: ${client.settings.isActive})`, client.id);
            }
        }
        logService.info('[SERVER] Proceso de reconexión de nodos iniciado para todos los clientes elegibles.');

        setInterval(async () => {
            const allClients = await db.getAllClients();
            for (const client of allClients) {
                const isActivePlan = client.plan_status === 'active' || client.plan_status === 'trial';
                if (isActivePlan && client.settings.isActive) {
                    const status = getSessionStatus(client.id);
                    if (status.status === ConnectionStatus.DISCONNECTED) {
                        logService.warn(`[ZOMBIE-KICKER] 🧟 Reviviendo sesión muerta para ${client.username}`, client.id);
                        connectToWhatsApp(client.id).catch(e => logService.error(`[ZOMBIE-KICKER] Falló resurrección para ${client.username}`, e, client.id));
                    }
                }
            }
        }, 5 * 60 * 1000); 

    } catch(e) {
        logService.error('Fallo crítico al inicializar la base de datos o el servicio TTS', e);
    }
});
