

// 1. CARGA DE ENTORNO CRÍTICA
import { JWT_SECRET, PORT } from './env.js';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { optionalAuthenticateToken } from './middleware/optionalAuth.js';
import { logService } from './services/logService.js';
import { ttsService } from './services/ttsService.js'; // Importar el nuevo servicio
import { campaignService } from './services/campaignService.js'; // Init scheduler
import { connectToWhatsApp, getSessionStatus } from './whatsapp/client.js'; // Import connectToWhatsApp AND getSessionStatus
import { ConnectionStatus } from './types.js'; // Import ConnectionStatus

// --- CRASH PREVENTION: Global Error Handlers ---
(process as any).on('uncaughtException', (err: any) => {
    console.error('🔥 [CRITICAL] Uncaught Exception:', err);
    logService.error('UNCAUGHT EXCEPTION - SERVER KEPT ALIVE', err);
    // No salimos del proceso para mantener el servidor vivo ante fallos de Baileys
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('🔥 [CRITICAL] Unhandled Rejection:', reason);
    // Detectar error 428 específico de Baileys para no llenar el log
    if (reason?.output?.statusCode === 428 || reason?.message === 'Connection Closed') {
        logService.warn('WhatsApp Session Conflict (428) detected in background. Session needs reset.');
    } else {
        logService.error('UNHANDLED REJECTION - SERVER KEPT ALIVE', reason);
    }
});
// -----------------------------------------------

// --- SEED DATA: TESTIMONIOS PERSISTENTES ---
const SEED_TESTIMONIALS = [
    { name: "Marcos López", location: "Mendoza", text: "Bueno, parece que soy el primero en comentar. La verdad entré medio de curioso y no entendía nada al principio, pero después de usarlo un poco me acomodó bastante el WhatsApp." },
    { name: "Sofía Romano", location: "Buenos Aires", text: "No suelo comentar estas cosas, pero hasta ahora viene funcionando bien. Se nota que está pensado para ventas posta." },
    { name: "Javier Torres", location: "Córdoba", text: "Antes era responder mensajes todo el día sin parar. Ahora por lo menos está más ordenado. Eso ya vale la pena." },
    { name: "Valentina Giménez", location: "Rosario", text: "Me gustó que no sea complicado como otros bots que probé. Acá fue conectar y listo." },
    { name: "Lucas Herrera", location: "San Luis", text: "La verdad me ahorró bastante desgaste. Antes terminaba el día quemado." },
    { name: "Camila Fernandez", location: "Mendoza", text: "Buen precio para lo que hace. Pensé que iba a ser más caro." },
    { name: "Mateo Diaz", location: "Buenos Aires", text: "No es magia, pero ayuda mucho a filtrar. Para mí cumple." },
    { name: "Lucía Martinez", location: "Córdoba", text: "Todavía lo estoy probando, pero por ahora viene prolijo." },
    { name: "Agustín Cruz", location: "Rosario", text: "Pasé de contestar cualquier cosa a responder solo lo importante. Con eso ya estoy conforme." },
    { name: "Abril Morales", location: "San Luis", text: "Me sorprendió que no suene a bot." },
    { name: "Bautista Ríos", location: "Mendoza", text: "Venía de putear bastante con WhatsApp todos los días. Ahora eso bajó bastante." },
    { name: "Mía Castillo", location: "Buenos Aires", text: "Se nota que está pensado para comerciantes y no para programadores." },
    { name: "Tomás Vega", location: "Córdoba", text: "Probé otros sistemas y siempre algo fallaba. Este por ahora se mantiene estable." },
    { name: "Isabella Pardo", location: "Rosario", text: "Me gustó que no invade ni molesta a los clientes." },
    { name: "Felipe Muñoz", location: "San Luis", text: "No esperaba mucho y me terminó sorprendiendo." },
    { name: "Martina Flores", location: "Mendoza", text: "Lo estoy usando hace unos días y la experiencia viene siendo buena." },
    { name: "Santino Rivas", location: "Buenos Aires", text: "Simple, directo y sin vueltas. Eso suma." },
    { name: "Victoria Medina", location: "Córdoba", text: "Se agradece algo así para laburar más tranquilo." },
    { "Benjamín Castro": "Después de varios días usándolo, lo seguiría usando sin dudas." },
    { "Emilia Ponce": "Ojalá lo sigan mejorando, pero la base está muy bien." },
];

const app = express();

// --- NEW: Smart API Request Logger ---
const IGNORED_API_PATHS = ['/api/status', '/api/conversations', '/api/campaigns', '/api/radar/activity', '/api/radar/signals'];
app.use((req, res, next) => {
    if (req.url.startsWith('/api') && !IGNORED_API_PATHS.some(path => req.url.startsWith(path))) {
        logService.debug(`[API] ${req.method} ${req.url}`);
    }
    next();
});
// ------------------------------------

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
    res.json(updated);
});

app.get('/api/metrics', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const user = await db.getUser(userId);
    if (!user) return res.status(404).end();
    
    // Conversation Metrics
    const convs = Object.values(user.conversations || {});
    const hot = convs.filter((c: any) => c.status === 'Caliente').length;
    
    // Campaign Metrics Integration
    const campaigns = await db.getCampaigns(userId);
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
    const totalCampaignMessages = campaigns.reduce((acc, curr) => acc + (curr.stats?.totalSent || 0), 0);

    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: convs.filter((c: any) => c.status === 'Tibio').length,
        coldLeads: convs.filter((c: any) => c.status === 'Frío').length,
        totalMessages: 0, // Placeholder for inbound messages count if tracked later
        conversionRate: convs.length > 0 ? Math.round((hot / convs.length) * 100) : 0,
        revenueEstimated: hot * 150,
        avgEscalationTimeMinutes: 0,
        activeSessions: 1,
        humanDeviationScore: user.governance.humanDeviationScore || 0,
        // New Campaign Data
        campaignsActive: activeCampaigns,
        campaignMessagesSent: totalCampaignMessages
    });
});

// Fix: Import all API controller functions that are used in this file.
import { 
    handleConnect, handleDisconnect, handleSendMessage, handleUpdateConversation, handleGetStatus, handleGetConversations, handleGetTestimonials, handlePostTestimonial, handleGetTtsAudio, handleStartClientTestBot, handleClearClientTestBotConversation, handleForceAiRun, handleStopClientTestBot,
    handleGetCampaigns, handleCreateCampaign, handleUpdateCampaign, handleDeleteCampaign, handleGetWhatsAppGroups, handleForceExecuteCampaign, 
    handleGetRadarSignals, handleGetRadarSettings, handleUpdateRadarSettings, handleDismissRadarSignal, handleConvertRadarSignal, handleSimulateRadarSignal, handleGetRadarActivityLogs
} from './controllers/apiController.js';
import { handleGetAllClients, handleUpdateClient, handleRenewClient, handleGetLogs, handleGetDashboardMetrics, handleActivateClient, handleGetSystemSettings, handleUpdateSystemSettings, handleDeleteClient, handleStartTestBot, handleClearTestBotConversation, handleUpdateDepthLevel, handleApplyDepthBoost } from './controllers/adminController.js';

// Standard Client Routes
app.get('/api/status', authenticateToken, handleGetStatus); 
app.post('/api/connect', authenticateToken, handleConnect);
app.get('/api/disconnect', authenticateToken, handleDisconnect);
app.post('/api/send', authenticateToken, handleSendMessage);
app.post('/api/conversation/update', authenticateToken, handleUpdateConversation);
app.post('/api/conversation/force-run', authenticateToken, handleForceAiRun); // NEW ROUTE
app.get('/api/conversations', authenticateToken, handleGetConversations);

// Client Test Bot Routes
app.post('/api/client/test-bot/start', authenticateToken, handleStartClientTestBot);
app.post('/api/client/test-bot/stop', authenticateToken, handleStopClientTestBot); // NEW ROUTE
app.post('/api/client/test-bot/clear', authenticateToken, handleClearClientTestBotConversation);

// Campaign Routes (NEW)
app.get('/api/campaigns', authenticateToken, handleGetCampaigns);
app.post('/api/campaigns', authenticateToken, handleCreateCampaign);
app.put('/api/campaigns/:id', authenticateToken, handleUpdateCampaign);
app.delete('/api/campaigns/:id', authenticateToken, handleDeleteCampaign);
app.post('/api/campaigns/:id/execute', authenticateToken, handleForceExecuteCampaign); // NEW FORCE EXECUTE ROUTE
app.get('/api/whatsapp/groups', authenticateToken, handleGetWhatsAppGroups);

// Radar Routes (NEW RADAR 3.0)
app.get('/api/radar/signals', authenticateToken, handleGetRadarSignals);
app.get('/api/radar/settings', authenticateToken, handleGetRadarSettings);
app.post('/api/radar/settings', authenticateToken, handleUpdateRadarSettings);
app.post('/api/radar/signals/:id/dismiss', authenticateToken, handleDismissRadarSignal);
app.post('/api/radar/signals/:id/convert', authenticateToken, handleConvertRadarSignal); // BRIDGE TO LEAD
app.post('/api/radar/simulate', authenticateToken, handleSimulateRadarSignal); // NEW SIMULATION ROUTE
app.get('/api/radar/activity', authenticateToken, handleGetRadarActivityLogs); // NEW ACTIVITY LOG

// Public/Shared Routes
// MODIFIED: Make system settings public so Landing Page can get Support Number
app.get('/api/system/settings', handleGetSystemSettings); 

// Testimonial Routes
app.get('/api/testimonials', handleGetTestimonials);
app.post('/api/testimonials', authenticateToken, handlePostTestimonial);

// TTS Pre-generated Audio Route
app.get('/api/tts/:eventName', optionalAuthenticateToken, handleGetTtsAudio);

// Super Admin Routes
const adminRouter = express.Router();
adminRouter.use(authenticateToken, (req: any, res, next) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Acceso denegado.' });
    next();
});

adminRouter.get('/dashboard-metrics', handleGetDashboardMetrics);
adminRouter.get('/clients', handleGetAllClients);
adminRouter.put('/clients/:id', handleUpdateClient);
adminRouter.delete('/clients/:id', handleDeleteClient); // New route for deletion
adminRouter.post('/clients/:id/renew', handleRenewClient);
adminRouter.post('/clients/:id/activate', handleActivateClient);
adminRouter.get('/logs', handleGetLogs);
// Admin System Settings
adminRouter.get('/system/settings', handleGetSystemSettings);
adminRouter.put('/system/settings', handleUpdateSystemSettings);

// Admin Test Bot Routes
adminRouter.post('/test-bot/start', handleStartTestBot);
adminRouter.post('/test-bot/clear', handleClearTestBotConversation);

// DEPTH CONTROL ROUTES (NEW)
adminRouter.post('/depth/update', handleUpdateDepthLevel);
adminRouter.post('/depth/boost', handleApplyDepthBoost);

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

// ==========================================
// ERROR HANDLING AND 404 FALLBACKS
// ==========================================

// Catch-all for /api routes not found, ensures JSON response for APIs
app.use('/api', (req: any, res) => {
    logService.warn(`Ruta de API no encontrada: ${req.method} ${req.originalUrl}`, req.user?.id, req.user?.username);
    res.status(404).json({ message: 'Ruta de API no encontrada.' });
});

// Global 404 for non-/api routes (typically caught by frontend's index.html rewrite in Vercel)
app.use((req: any, res) => {
    res.status(404).send('Página no encontrada.'); 
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
    logService.error('Error no manejado en Express', err, req.user?.id, req.user?.username, { path: req.path, method: req.method });
    console.error("DEBUG: Global Express Error:", err); // Log full error in dev
    res.status(err.status || 500).json({
        message: err.message || 'Error interno del servidor.',
        error: process.env.NODE_ENV === 'development' ? err : {} // Only send full error in dev
    });
});


app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}`);
    try {
        await db.init();
        logService.info('El sistema backend se ha iniciado correctamente.');
        
        // --- TESTIMONIALS DRIP SEEDING ---
        // VERIFICACIÓN MEJORADA: Comprobar específicamente los testimonios del sistema
        const seedCount = await db.countSeedTestimonials();
        
        if (seedCount === 0) {
            logService.info('[SERVER] No se detectaron testimonios de sistema ("system_seed"). Iniciando inyección DRIP...');
            
            // DRIP STRATEGY:
            // - Primeros 3: Ya publicados (entre hace 3 días y hoy). Visibles.
            // - Siguientes 17: Programados en el futuro. Ocultos hasta que pase el tiempo.
            
            const seededData = SEED_TESTIMONIALS.map((t, index) => {
                // FIX: Explicitly pass Date.now() to the Date constructor to avoid potential TypeScript errors in strict environments.
                let date = new Date(Date.now());
                
                if (index < 3) {
                    // Histórico: Hace 1-24 horas (VISIBLES YA)
                    const hoursAgo = 20 - (index * 8); 
                    date.setHours(date.getHours() - hoursAgo);
                } else {
                    // Futuro: Goteo cada 24 horas (OCULTOS POR AHORA)
                    const daysInFuture = (index - 2); 
                    date.setDate(date.getDate() + daysInFuture);
                }
                
                return {
                    userId: 'system_seed',
                    // FIX: Ensure object structure matches the Testimonial type expected by db.seedTestimonials
                    // The SEED_TESTIMONIALS array contains objects like { name: "...", location: "...", text: "..." }
                    // The map function was previously handling values from keys, which might not be correct if the keys are names
                    // Changed to directly use properties from the `t` object, assuming it's structured like { name, location, text }
                    name: (t as {name: string, location: string, text: string}).name, 
                    location: (t as {name: string, location: string, text: string}).location, 
                    text: (t as {name: string, location: string, text: string}).text,
                    createdAt: date.toISOString(), 
                    updatedAt: date.toISOString()
                };
            });
            
            try {
                await db.seedTestimonials(seededData);
                logService.info(`[SERVER] ✅ Inyección exitosa: 3 visibles, ${seededData.length - 3} programados.`);
            } catch (err) {
                logService.error('[SERVER] ❌ Error crítico inyectando testimonios:', err);
            }
        } else {
            logService.info(`[SERVER] Testimonios de sistema verificados (${seedCount}). Integridad OK.`);
        }
        // -----------------------------

        await ttsService.init(); 

        // --- NUEVA LÓGICA DE RECONEXIÓN AUTOMÁTICA DE NODOS ---
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
        // --- FIN LÓGICA DE RECONEXIÓN ---

        // --- ZOMBIE KICKER: Protocolo de Resurrección de Sesiones (Cada 5 min) ---
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
        // -------------------------------------------------------------------------

    } catch(e) {
        logService.error('Fallo crítico al inicializar la base de datos o el servicio TTS', e);
    }
});