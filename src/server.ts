
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
import { ngrokService } from './services/ngrokService.js'; 

// --- ACTIVE RESILIENCE PROTOCOL ---
// MANEJO DE ERRORES CRÍTICOS PARA EVITAR QUE EL SERVIDOR SE CAIGA

(process as any).on('uncaughtException', (err: any) => {
    const msg = err?.message || '';
    
    // IGNORE COMMON CRYPTO NOISE
    if (msg.includes('Bad MAC') || msg.includes('Decryption failed') || msg.includes('Key used already')) {
        // Do not log stack trace for these, they are protocol noise
        // logService.warn('🛡️ [AUTO-HEALING] Protocol error ignored to maintain uptime.');
        return; 
    }

    console.error('🔥 [CRITICAL] Uncaught Exception:', err);
    logService.error('UNCAUGHT EXCEPTION - SERVER KEPT ALIVE', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    const msg = reason?.toString() || '';

    // IGNORE COMMON NOISE
    if (msg.includes('Bad MAC') || msg.includes('Decryption failed') || msg.includes('No session found') || msg.includes('Connection Closed') || msg.includes('503') || msg.includes('428')) {
        return; 
    }

    // 428 is Precondition Required, usually means session mismatch, client auto-handles it.
    if (reason?.output?.statusCode === 428) {
        return;
    }

    console.error('🔥 [CRITICAL] Unhandled Rejection:', reason);
    logService.error('UNHANDLED REJECTION - SERVER KEPT ALIVE', reason);
});

// ... (SEED DATA)
const SEED_TESTIMONIALS = [
    { name: "Marcos López", location: "Mendoza", text: "Bueno, parece que soy el primero en comentar. La verdad entré medio de curioso y no entendía nada al principio, pero después de usarlo un poco me acomodó bastante el WhatsApp." },
    { name: "Emilia Ponce", location: "Rosario", text: "Ojalá lo sigan mejorando, pero la base está muy bien." },
    { name: "Julián V.", location: "Córdoba", text: "Implementamos esto hace 2 semanas. El filtro de clientes funciona." },
    { name: "Sofía M.", location: "Buenos Aires", text: "Muy buena herramienta para filtrar curiosos." },
    { name: "Carlos D.", location: "Mendoza", text: "La IA responde rápido, eso es clave." }
];

const app = express();

const IGNORED_API_PATHS = ['/api/status', '/api/conversations', '/api/campaigns', '/api/radar/activity', '/api/radar/signals'];
app.use((req, res, next) => {
    if (req.url.startsWith('/api') && !IGNORED_API_PATHS.some(path => req.url.startsWith(path))) {
        logService.debug(`[API] ${req.method} ${req.url}`);
    }
    next();
});

// STANDARD CORS MIDDLEWARE
const corsOptions = {
    origin: true, 
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, ngrok-skip-browser-warning',
    credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Aumentar límite de payload para imágenes base64
app.use(express.json({ limit: '50mb' }) as any);

// ==========================================
// API ROUTES
// ==========================================

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

app.post('/api/settings', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const updated = await db.updateUserSettings(userId, req.body);
    logService.info('Configuración actualizada', userId, req.user.username);
    
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

// Standard Client Routes
app.get('/api/status', authenticateToken, apiController.handleGetStatus); 
app.post('/api/connect', authenticateToken, apiController.handleConnect);
app.post('/api/connection/soft-reset', authenticateToken, apiController.handleSoftReset); // NEW ROUTE
app.get('/api/disconnect', authenticateToken, apiController.handleDisconnect);
app.post('/api/send', authenticateToken, apiController.handleSendMessage);
app.post('/api/conversation/update', authenticateToken, apiController.handleUpdateConversation);
app.delete('/api/conversation/:id', authenticateToken, apiController.handleDeleteConversation); 
app.post('/api/conversation/force-run', authenticateToken, apiController.handleForceAiRun); 
app.get('/api/conversations', authenticateToken, apiController.handleGetConversations);

// Client Test Bot Routes
app.post('/api/client/test-bot/start', authenticateToken, apiController.handleStartClientTestBot);
app.post('/api/client/test-bot/stop', authenticateToken, apiController.handleStopClientTestBot); 
app.post('/api/client/test-bot/clear', authenticateToken, apiController.handleClearClientTestBotConversation);

// AI Proxy Routes
app.post('/api/ai/verify-key', authenticateToken, apiController.handleVerifyApiKey);
app.post('/api/ai/analyze-website', authenticateToken, apiController.handleAnalyzeWebsite);
app.post('/api/ai/execute-neural-path', authenticateToken, apiController.handleExecuteNeuralPath);
app.post('/api/ai/generate-campaign-prompt', authenticateToken, apiController.handleGenerateCampaignPrompt);

// Campaign Routes
app.get('/api/campaigns', authenticateToken, apiController.handleGetCampaigns);
app.post('/api/campaigns', authenticateToken, apiController.handleCreateCampaign);
app.put('/api/campaigns/:id', authenticateToken, apiController.handleUpdateCampaign);
app.delete('/api/campaigns/:id', authenticateToken, apiController.handleDeleteCampaign);
app.post('/api/campaigns/:id/execute', authenticateToken, apiController.handleForceExecuteCampaign); 
app.get('/api/whatsapp/groups', authenticateToken, apiController.handleGetWhatsAppGroups);

// Radar Routes
app.get('/api/radar/signals', authenticateToken, apiController.handleGetRadarSignals);
app.get('/api/radar/settings', authenticateToken, apiController.handleGetRadarSettings);
app.post('/api/radar/settings', authenticateToken, apiController.handleUpdateRadarSettings);
app.post('/api/radar/calibrate', authenticateToken, apiController.handleRadarAutoCalibration); 
app.post('/api/radar/signals/:id/dismiss', authenticateToken, apiController.handleDismissRadarSignal);
app.post('/api/radar/signals/:id/convert', authenticateToken, apiController.handleConvertRadarSignal); 
app.post('/api/radar/simulate', authenticateToken, apiController.handleSimulateRadarSignal); 
app.get('/api/radar/activity', authenticateToken, apiController.handleGetRadarActivityLogs); 

// Network Routes
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
adminRouter.get('/system/settings', adminController.handleGetSystemSettings);
adminRouter.put('/system/settings', adminController.handleUpdateSystemSettings);
adminRouter.post('/test-bot/start', adminController.handleStartTestBot);
adminRouter.post('/test-bot/clear', adminController.handleClearTestBotConversation);
adminRouter.post('/depth/update', adminController.handleUpdateDepthLevel);
adminRouter.post('/depth/boost', adminController.handleApplyDepthBoost);
adminRouter.get('/network/overview', adminController.handleGetNetworkOverview);

// TESTIMONIAL MANAGEMENT ROUTES
adminRouter.get('/testimonials', adminController.handleAdminGetTestimonials);
adminRouter.post('/testimonials', adminController.handleAdminCreateTestimonial);
adminRouter.put('/testimonials/:id', adminController.handleAdminUpdateTestimonial);
adminRouter.delete('/testimonials/:id', adminController.handleAdminDeleteTestimonial);

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

app.use('/api', (req: any, res) => {
    logService.warn(`Ruta de API no encontrada: ${req.method} ${req.originalUrl}`, req.user?.id, req.user?.username);
    res.status(404).json({ message: 'Ruta de API no encontrada.' });
});

app.use((req: any, res) => {
    res.status(404).send('Página no encontrada.'); 
});

app.use((err: any, req: any, res: any, next: any) => {
    // Only log real errors, not protocol noise
    if (!err?.message?.includes('Bad MAC')) {
        logService.error('Error no manejado en Express', err, req.user?.id, req.user?.username, { path: req.path, method: req.method });
    }
    res.status(err.status || 500).json({
        message: err.message || 'Error interno del servidor.',
        error: process.env.NODE_ENV === 'development' ? err : {} 
    });
});

// START SERVER
const server = app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`\x1b[33m%s\x1b[0m`, `\n    🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}\n`);
    try {
        await db.init();
        logService.info('El sistema backend se ha iniciado correctamente.');
        
        ngrokService.startAutoDetection();

        const seedCount = await db.countSeedTestimonials();
        if (seedCount === 0) {
            logService.info('[SERVER] No se detectaron testimonios de sistema ("system_seed"). Iniciando inyección MANUAL...');
            const seededData = SEED_TESTIMONIALS.map((t, index) => {
                const isVisible = index < 3; 
                return {
                    userId: 'system_seed',
                    name: (t as {name: string, location: string, text: string}).name || Object.keys(t)[0], 
                    location: (t as {name: string, location: string, text: string}).location || '', 
                    text: (t as {name: string, location: string, text: string}).text || Object.values(t)[0],
                    createdAt: new Date().toISOString(), 
                    updatedAt: new Date().toISOString(),
                    isVisible: isVisible 
                };
            });
            try {
                await db.seedTestimonials(seededData.map(data => ({ ...data, _id: data.userId === 'system_seed' ? `seed_${uuidv4()}` : undefined })));
                logService.info(`[SERVER] ✅ Inyección exitosa: ${seededData.filter(d => d.isVisible).length} visibles, ${seededData.filter(d => !d.isVisible).length} ocultos.`);
            } catch (err) {
                logService.error('[SERVER] ❌ Error crítico inyectando testimonios:', err);
            }
        }

        await ttsService.init(); 

        logService.info('[SERVER] Iniciando reconexión automática de nodos de WhatsApp...');
        const clients = await db.getAllClients();
        for (const client of clients) {
            const isActivePlan = client.plan_status === 'active' || client.plan_status === 'trial';
            
            const hasNumber = client.whatsapp_number && client.whatsapp_number.length > 8;
            const hasUsernameNumber = !hasNumber && client.username && client.username.startsWith('549') && client.username.length > 8;
            const shouldReconnect = hasNumber || hasUsernameNumber;
            
            if (isActivePlan && shouldReconnect) {
                logService.info(`[SERVER] 🔄 Intentando recuperar sesión para: ${client.username}`, client.id);
                
                if (!client.settings.isActive) {
                     logService.info(`[SERVER] Auto-reactivando bot para ${client.username}.`, client.id);
                     await db.updateUserSettings(client.id, { isActive: true });
                }
                
                connectToWhatsApp(client.id).catch(err => {
                    logService.error(`[SERVER] Falló la reconexión inicial para el cliente ${client.username}`, err, client.id);
                });
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }
        logService.info('[SERVER] Proceso de reconexión de nodos completado.');

        // ZOMBIE KICKER: Revisa sesiones muertas cada 5 min
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

// AUMENTAR TIMEOUTS PARA EVITAR 502 BAD GATEWAY EN CLOUDFLARE
server.keepAliveTimeout = 65000; 
server.headersTimeout = 66000;
