
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createRequire } from 'module'; 
import path from 'path';
import fs from 'fs'; 
import * as apiController from './controllers/apiController.js';
import * as adminController from './controllers/adminController.js';
import { authenticateToken } from './middleware/auth.js';
import { optionalAuthenticateToken } from './middleware/optionalAuth.js';
import { socketService } from './services/socketService.js';
import { PORT, IS_PRODUCTION } from './env.js';
import { campaignQueue, closeQueues } from './infrastructure/queues.js';
import { db, sanitizeKey } from './database.js'; // Import sanitizeKey here
import { initCampaignWorker, shutdownCampaignWorker } from './workers/campaignWorker.js';
import { ttsService } from './services/ttsService.js';
import {
    connectToWhatsApp,
    getSessionStatus,
    softResetConnection,
    purgeSession,
    disconnectWhatsApp,
    activeSessions,
    waMetrics,
    sendMessage,
    shutdownAllWhatsAppSessions,
    whatsAppProvider
} from './whatsapp/index.js';
import { hasValidSession } from './whatsapp/mongoAuth.js'; 
import { logService } from './services/logService.js';
import { ConnectionStatus, SocketEvents, RadarSignal } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { generateContentWithFallback } from './services/geminiService.js';
import { radarService } from './services/radarService.js';
import mongoose from 'mongoose';
import { redis, closeRedis, isRedisReady } from './redis.js';

// Initialize require for CommonJS fallback
const require = createRequire(import.meta.url);

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// --- GLOBAL ERROR HANDLERS (THE AIRBAGS) ---
(process as any).on('uncaughtException', (err: any) => {
    console.error('🚨 [CRITICAL] Uncaught Exception:', err);
    logService.error('[SYSTEM] Uncaught Exception (Server kept alive)', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('🚨 [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
    logService.error('[SYSTEM] Unhandled Rejection (Server kept alive)', reason as any);
});

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '10mb' }) as any);

const httpServer = createServer(app);
socketService.init(httpServer);

// BullMQ Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(campaignQueue)],
  serverAdapter: serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter() as any);

// --- HEALTH & READINESS CHECK ---
app.get('/api/health', async (req, res) => {
    let mongoStatus = 'disconnected';
    if (mongoose.connection.readyState === 1) mongoStatus = 'connected';
    else if (mongoose.connection.readyState === 2) mongoStatus = 'connecting';

    let redisStatus = 'disconnected';
    if (redis.status === 'ready') redisStatus = 'connected';
    else if (redis.status === 'connecting' || redis.status === 'reconnecting') redisStatus = 'connecting';

    // Verify BullMQ connection
    let bullMqStatus = 'disconnected';
    if (redis.status === 'ready') {
        try {
            const pingPromise = redis.ping();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));
            const ping = await Promise.race([pingPromise, timeoutPromise]);
            if (ping === 'PONG') bullMqStatus = 'connected';
        } catch (e) {
            bullMqStatus = 'error';
        }
    }

    // Determine readiness:
    // In production, MongoDB and Redis must be connected to be ready.
    // In development, process is alive ('ok') but ready reports false if storage isn't ready.
    const isReady = mongoStatus === 'connected' && redisStatus === 'connected';
    const httpStatus = IS_PRODUCTION && !isReady ? 503 : 200;

    res.status(httpStatus).json({
        status: isReady ? 'ok' : (IS_PRODUCTION ? 'unready' : 'degraded'),
        liveness: true,
        readiness: isReady,
        environment: IS_PRODUCTION ? 'production' : 'development',
        timestamp: Date.now(),
        uptimeSeconds: process.uptime(),
        infrastructure: {
            mongo: mongoStatus,
            redis: redisStatus,
            bullMQ: bullMqStatus
        },
        whatsapp: {
            provider: whatsAppProvider.id,
            activeSessions: activeSessions.size,
            metrics: {
                lastReceived: waMetrics.lastMessageReceived,
                lastSent: waMetrics.lastMessageSent,
                lastEvent: waMetrics.lastEventReceived,
                totalReceived: waMetrics.messagesProcessed,
                totalSent: waMetrics.messagesSent,
                reconnectionsAttempted: waMetrics.reconnectionsCount
            }
        }
    });
});

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const { JWT_SECRET, MASTER_ADMIN_USER, MASTER_ADMIN_PASSWORD, IS_PRODUCTION } = require('./env.js');

    try {
        const isMasterUser = username === MASTER_ADMIN_USER || username === 'admin' || (!IS_PRODUCTION && (username === 'master' || username === '549234589'));
        const isMasterPass = MASTER_ADMIN_PASSWORD && (password === MASTER_ADMIN_PASSWORD || (!IS_PRODUCTION && (password === 'dominion2024' || password === 'dominion2025')));

        if(isMasterUser && isMasterPass) {
             logService.info(`[AUTH] 🛡️ Acceso Maestro Concedido a: ${username}`);
             const token = jwt.sign({ id: 'super_admin', username: 'master', role: 'super_admin' }, JWT_SECRET, { expiresIn: '7d' });
             return res.json({ token, role: 'super_admin' });
        }

        const user = await db.getUser(username) || await (db as any).getUserByUsername(username);
        
        if (!user) {
             logService.warn(`[AUTH] Intento de login fallido: Usuario ${username} no existe.`);
             return res.status(404).json({ message: 'Usuario no encontrado. Regístrate primero.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            logService.warn(`[AUTH] Intento de login fallido: Contraseña incorrecta para ${username}.`);
            return res.status(401).json({ message: 'Contraseña incorrecta.' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        logService.info(`[AUTH] 🔑 Login Exitoso: ${user.username}`, user.id);
        res.json({ token, role: user.role });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password, businessName, intendedUse } = req.body;
    const bcrypt = require('bcrypt');
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./env.js');
    const { v4: uuidv4 } = require('uuid');

    try {
        const existing = await db.getUser(username);
        if(existing) return res.status(400).json({ message: 'Este usuario ya existe. Intenta acceder.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const recoveryKey = uuidv4().toUpperCase();
        
        const newUser = {
            id: uuidv4(),
            username, 
            password: hashedPassword,
            business_name: businessName,
            role: 'client',
            plan_type: 'pro',
            plan_status: 'trial',
            billing_start_date: new Date().toISOString(),
            billing_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            recoveryKey,
            settings: {
                isActive: false,
                productName: businessName,
                isNetworkEnabled: false,
                ignoredJids: []
            },
            created_at: new Date().toISOString()
        };

        await (db as any).createUser(newUser);
        
        let retries = 5;
        while (retries > 0) {
            const check = await db.getUser(newUser.id);
            if (check) break;
            await new Promise(r => setTimeout(r, 500)); 
            retries--;
        }
        
        const token = jwt.sign({ id: newUser.id, username: newUser.username, role: 'client' }, JWT_SECRET, { expiresIn: '7d' });
        logService.info(`[AUTH] ✨ Nuevo Registro: ${username} (${businessName})`, newUser.id);
        
        res.json({ token, role: 'client', recoveryKey });
    } catch (e: any) {
        console.error("Register Error:", e);
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/auth/reset', async (req, res) => {
    const { username, recoveryKey, newPassword } = req.body;
    const bcrypt = require('bcrypt');

    try {
        const user = await db.getUser(username) || await (db as any).getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        if (!user.recoveryKey || user.recoveryKey.trim().toUpperCase() !== (recoveryKey || '').trim().toUpperCase()) {
            return res.status(400).json({ message: 'Clave de recuperación inválida o expirada.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.updateUser(user.id, { password: hashedPassword });
        logService.info(`[AUTH] 🔄 Contraseña restablecida para ${user.username}`, user.id);

        res.json({ success: true, message: 'Contraseña actualizada con éxito.' });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- ADMIN API ROUTES ---
app.get('/api/admin/dashboard-metrics', authenticateToken, adminController.handleGetDashboardMetrics);
app.get('/api/admin/clients', authenticateToken, adminController.handleGetAllClients);
app.put('/api/admin/clients/:id', authenticateToken, adminController.handleUpdateClient);
app.delete('/api/admin/clients/:id', authenticateToken, adminController.handleDeleteClient);
app.post('/api/admin/clients/:id/activate', authenticateToken, adminController.handleActivateClient);
app.post('/api/admin/clients/:id/renew', authenticateToken, adminController.handleRenewClient);
app.get('/api/admin/logs', authenticateToken, adminController.handleGetLogs);
app.get('/api/admin/system/settings', authenticateToken, adminController.handleGetSystemSettings);
app.put('/api/admin/system/settings', authenticateToken, adminController.handleUpdateSystemSettings);
app.post('/api/admin/system/reset', authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'super_admin') return res.status(403).json({message: 'Forbidden'});
    await db.resetSystem();
    res.json({ success: true });
});
app.post('/api/admin/test-bot/start', authenticateToken, adminController.handleStartTestBot);
app.post('/api/admin/depth/update', authenticateToken, adminController.handleUpdateDepthLevel);

// --- TESTIMONIAL MANAGEMENT (ADMIN) ---
app.get('/api/admin/testimonials', authenticateToken, adminController.handleAdminGetTestimonials);
app.put('/api/admin/testimonials/:id', authenticateToken, adminController.handleAdminUpdateTestimonial);
app.delete('/api/admin/testimonials/:id', authenticateToken, adminController.handleAdminDeleteTestimonial);
app.post('/api/admin/testimonials', authenticateToken, adminController.handleAdminCreateTestimonial);

// --- CLIENT API ROUTES ---
app.get('/api/metrics', authenticateToken, apiController.handleGetMetrics);
app.get('/api/campaigns', authenticateToken, apiController.handleGetCampaigns);
app.post('/api/campaigns', authenticateToken, apiController.handleCreateCampaign);
app.put('/api/campaigns/:id', authenticateToken, apiController.handleUpdateCampaign);
app.delete('/api/campaigns/all', authenticateToken, apiController.handleDeleteAllCampaigns); 
app.delete('/api/campaigns/:id', authenticateToken, apiController.handleDeleteCampaign);
app.post('/api/campaigns/:id/execute', authenticateToken, apiController.handleForceExecuteCampaign); 
app.get('/api/whatsapp/groups', authenticateToken, apiController.handleGetWhatsAppGroups);
app.post('/api/ai/generate-campaign-prompt', authenticateToken, apiController.handleGenerateCampaignPrompt);

// --- SETTINGS & USER ---
app.get('/api/user/me', authenticateToken, apiController.handleGetUser);

app.get('/api/settings', authenticateToken, async (req: any, res) => {
    try {
        if (req.user.role === 'super_admin') return res.json({});
        const user = await db.getUser(req.user.id);
        if (!user) {
             return res.json({ productName: 'Sin Configurar', isActive: false, ignoredJids: [] });
        }
        res.json(user.settings || { productName: 'Sin Configurar', isActive: false, ignoredJids: [] });
    } catch(e) {
        res.json({}); 
    }
});

app.post('/api/settings', authenticateToken, async (req: any, res) => {
    await db.updateUserSettings(req.user.id, req.body);
    res.json({ success: true });
});

// --- CONNECTION ---
app.get('/api/status', authenticateToken, async (req: any, res) => {
    if (req.user.role === 'super_admin') return res.json({ status: ConnectionStatus.CONNECTED });
    const status = getSessionStatus(req.user.id);
    res.json(status);
});

app.post('/api/connect', authenticateToken, async (req: any, res) => {
    logService.info(`[API] 📞 Solicitud de conexión recibida para ${req.user.username}`, req.user.id);
    try {
        await connectToWhatsApp(req.user.id, req.body.phoneNumber, true);
        res.json({ success: true });
    } catch (e: any) {
        logService.error(`[API] Error al invocar connectToWhatsApp`, e, req.user.id);
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/disconnect', authenticateToken, async (req: any, res) => {
    logService.info(`[API] 🔌 Solicitud de desconexión recibida.`, req.user.id);
    await disconnectWhatsApp(req.user.id);
    res.json({ success: true });
});

app.post('/api/connection/soft-reset', authenticateToken, async (req: any, res) => {
    await softResetConnection(req.user.id);
    res.json({ success: true });
});

app.post('/api/connection/purge', authenticateToken, async (req: any, res) => {
    await purgeSession(req.user.id);
    res.json({ success: true });
});

// --- CONVERSATIONS ---
app.get('/api/conversations', authenticateToken, async (req: any, res) => {
    if (req.user.role === 'super_admin') return res.json([]);
    const convs = await db.getUserConversations(req.user.id);
    res.json(convs || []);
});
app.post('/api/send', authenticateToken, async (req: any, res) => {
    try {
        await sendMessage(req.user.id, req.body.to, req.body.text);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});
app.post('/api/conversation/update', authenticateToken, async (req: any, res) => {
    const { id, updates } = req.body;
    const user = await db.getUser(req.user.id);
    if (!user || !user.conversations || !user.conversations[id]) return res.status(404).json({ message: 'Conversation not found' });
    
    const updatedConv = { ...user.conversations[id], ...updates };
    await db.saveUserConversation(req.user.id, updatedConv);
    res.json({ success: true });
});

app.delete('/api/conversation/:id', authenticateToken, apiController.handleDeleteConversation);

// --- RADAR ROUTES ---
app.get('/api/radar/settings', authenticateToken, async (req: any, res) => {
    const settings = await db.getRadarSettings(req.user.id);
    res.json(settings || { isEnabled: false, monitoredGroups: [], keywordsInclude: [], keywordsExclude: [] });
});
app.post('/api/radar/settings', authenticateToken, async (req: any, res) => {
    await db.updateRadarSettings(req.user.id, req.body);
    res.json({ success: true });
});
app.get('/api/radar/signals', authenticateToken, async (req: any, res) => {
    const signals = await db.getUserRadarSignals(req.user.id);
    res.json(signals || []);
});
app.post('/api/radar/signals/:id/dismiss', authenticateToken, async (req: any, res) => {
    await db.dismissRadarSignal(req.params.id);
    res.json({ success: true });
});
app.post('/api/radar/simulate', authenticateToken, async (req: any, res) => {
    const signal: RadarSignal = {
        id: uuidv4(),
        userId: req.user.id,
        groupJid: '123456@g.us',
        groupName: 'Grupo de Compraventa VIP',
        senderJid: '5491112345678@s.whatsapp.net',
        senderName: 'Cliente Simulado',
        messageContent: 'Hola, busco contratar una agencia de marketing urgente. Tengo presupuesto.',
        timestamp: new Date().toISOString(),
        analysis: { score: 95, intentType: 'URGENT', reasoning: 'Simulación de alta prioridad' },
        predictedWindow: { confidenceScore: 90, urgencyLevel: 'CRITICAL', delayRisk: 'HIGH', reasoning: 'Simulado' },
        strategicScore: 95,
        status: 'NEW'
    };
    await db.createRadarSignal(signal);
    socketService.emitToUser(req.user.id, SocketEvents.RADAR_SIGNAL, signal);
    res.json({ success: true });
});
app.post('/api/radar/calibrate', authenticateToken, async (req: any, res) => {
    res.json({ 
        opportunityDefinition: 'Clientes buscando servicios de alto valor con urgencia.',
        noiseDefinition: 'Vendedores, spam, mensajes cortos sin contexto.'
    });
});

// --- NETWORK ROUTES ---
app.get('/api/network/signals', authenticateToken, async (req: any, res) => {
    const signals = await db.getUserIntentSignals(req.user.id);
    res.json(signals || []);
});
app.post('/api/network/signals', authenticateToken, async (req: any, res) => {
    res.json({ success: true, message: "Signal shared" });
});
app.get('/api/network/opportunities', authenticateToken, async (req: any, res) => {
    const opps = await db.getUserOpportunities(req.user.id);
    res.json(opps || []);
});
app.post('/api/network/profile', authenticateToken, async (req: any, res) => {
    const profile = req.body;
    await db.updateUser(req.user.id, { networkProfile: profile });
    res.json(profile);
});
app.get('/api/network/profile', authenticateToken, async (req: any, res) => {
    const user = await db.getUser(req.user.id);
    res.json(user?.networkProfile || { networkEnabled: false, categoriesOfInterest: [], contributionScore: 0, receptionScore: 0 });
});

// --- TESTIMONIALS ---
app.get('/api/testimonials', optionalAuthenticateToken, async (req, res) => {
    try {
        const testimonials = await db.getTestimonials(true);
        res.json(testimonials || []);
    } catch (e: any) {
        res.json([]);
    }
});
app.post('/api/testimonials', authenticateToken, async (req: any, res) => {
    try {
        const { text } = req.body;
        const user = await db.getUser(req.user.id);
        await db.createTestimonial(req.user.id, user?.business_name || user?.username || 'Usuario', text);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Error al procesar testimonio' });
    }
});

// --- CLIENT SIMULATION (TEST BOT) ---
app.post('/api/client/test-bot/start', authenticateToken, adminController.handleStartTestBot); 
app.post('/api/client/test-bot/stop', authenticateToken, async (req, res) => { res.json({success: true}); }); 
app.post('/api/client/test-bot/clear', authenticateToken, adminController.handleClearTestBotConversation);

// --- AI WIZARD & HELPERS ---
app.post('/api/ai/verify-key', authenticateToken, async (req: any, res) => {
    const user = await db.getUser(req.user.id);
    if (!user?.settings.geminiApiKey) return res.status(400).json({ message: 'No Key' });
    try {
        await generateContentWithFallback({ apiKey: user.settings.geminiApiKey, prompt: 'Hello' });
        res.json({ success: true });
    } catch(e) {
        res.status(400).json({ message: 'Invalid Key' });
    }
});
app.post('/api/ai/execute-neural-path', authenticateToken, async (req: any, res) => {
    const { identity, context } = req.body;
    const user = await db.getUser(req.user.id);
    if (!user?.settings.geminiApiKey) return res.status(400).json({ message: 'No API Key' });
    
    const prompt = `
        ACTÚA COMO: Arquitecto de Chatbots Comerciales.
        INPUT:
        Negocio: ${identity.name} (${identity.website})
        Contexto: ${context}
        
        TAREA: Genera una configuración JSON para este negocio.
        FORMATO JSON:
        {
            "mission": "...",
            "idealCustomer": "...",
            "detailedDescription": "...",
            "objections": [{ "id": 1, "objection": "...", "response": "..." }],
            "rules": "...",
            "archetype": "VENTA_CONSULTIVA"
        }
    `;
    try {
        const response = await generateContentWithFallback({ apiKey: user.settings.geminiApiKey, prompt });
        res.json({ text: response.text });
    } catch(e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- SYSTEM & ADMIN ---
app.get('/api/system/settings', async (req, res) => {
    const settings = await db.getSystemSettings();
    res.json(settings);
});

// --- AUDIO/TTS ---
app.get('/api/tts/:filename', optionalAuthenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(process.cwd(), 'public', 'audio', `${filename}.mp3`);
        
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'audio/l16; rate=24000; channels=1');
            return fs.createReadStream(filePath).pipe(res);
        }

        const buffer = await ttsService.getOrGenerate(filename);
        if (buffer) {
            res.setHeader('Content-Type', 'audio/l16; rate=24000; channels=1');
            return res.send(buffer);
        }

        res.status(404).send('Audio not found');
    } catch {
        res.status(404).send('Audio not found');
    }
});

// --- BUNDLE & CLIENT INTEGRATION ---
const distPath = path.join(process.cwd(), 'dist-client');
const hasDistClient = fs.existsSync(distPath);

if (process.env.NODE_ENV !== 'production' || !hasDistClient) {
    console.log('🔮 [VITE] Integrando middleware de desarrollo Vite en Express...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
    });
    app.use(vite.middlewares);
} else {
    console.log('📦 [PRODUCTION] Sirviendo archivos estáticos de React...');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// --- IDEMPOTENT GRACEFUL SHUTDOWN ---
let isShuttingDown = false;

const gracefulShutdown = async (signal?: string) => {
    if (isShuttingDown) {
        console.log('⚠️ [SERVER] Shutdown ya en progreso. Esperando finalización...');
        return;
    }
    isShuttingDown = true;
    console.log(`\n🛑 [SERVER] Deteniendo servidor (Graceful Shutdown por ${signal || 'señal'})...`);

    // 1. Stop accepting new HTTP connections
    try {
        await new Promise<void>((resolve) => {
            httpServer.close((err) => {
                if (err) console.error('   [HTTP] Error cerrando servidor HTTP:', err);
                else console.log('   [HTTP] Servidor HTTP dejó de aceptar peticiones.');
                resolve();
            });
        });
    } catch (e: any) {
        console.error('   [HTTP] Excepción cerrando HTTP server:', e.message);
    }

    // 2. Stop workers (prevent pulling new jobs from BullMQ)
    try {
        await shutdownCampaignWorker();
    } catch (e: any) {
        console.error('   [WORKER] Error al detener Campaign Worker:', e.message);
    }

    // 3. Close BullMQ queues
    try {
        await closeQueues();
    } catch (e: any) {
        console.error('   [QUEUES] Error cerrando colas BullMQ:', e.message);
    }

    // 4. Close WhatsApp active sessions cleanly
    try {
        await shutdownAllWhatsAppSessions();
        console.log('   [WA] Sesiones de WhatsApp desconectadas.');
    } catch (e: any) {
        console.error('   [WA] Error cerrando sesiones de WhatsApp:', e.message);
    }

    // 5. Close Redis connection
    try {
        await closeRedis();
        console.log('   [REDIS] Conexión a Redis cerrada.');
    } catch (e: any) {
        console.error('   [REDIS] Error al cerrar Redis:', e.message);
    }

    // 6. Close MongoDB connection
    try {
        await db.close();
    } catch (e: any) {
        console.error('   [DB] Error al cerrar MongoDB:', e.message);
    }

    console.log('✅ [SERVER] Todos los recursos liberados. Servidor detenido.');
    process.exit(0);
};

(process as any).on('SIGTERM', () => gracefulShutdown('SIGTERM'));
(process as any).on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- DETERMINISTIC STARTUP SEQUENCE ---
// Configuration is already validated in env.ts.
// Next: Connect DB -> Seed DB -> Init Queues/Workers -> Verify Services -> Start HTTP listener
async function startServer() {
    try {
        console.log('🚀 [STARTUP] Inicializando secuencia determinista del backend...');

        // 1. Database Connection
        if (db.connectionPromise) {
            await db.connectionPromise;
        }

        if (IS_PRODUCTION && !db.isReady()) {
            throw new Error('[STARTUP FATAL] MongoDB no está listo en producción. Abortando inicio.');
        }

        // 2. Seed Testimonials (if DB ready)
        if (db.isReady()) {
            await db.seedTestimonials();
        }

        // 3. Initialize Campaign Worker (Singleton)
        initCampaignWorker();

        // 4. TTS Service
        ttsService.init().catch((err) => logService.warn('[TTS] Inicialización diferida:', err));

        // 5. Start HTTP Server
        httpServer.listen(Number(PORT), '0.0.0.0', async () => {
            console.log(`\n    🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}`);
            console.log(`    🌍 ARQUITECTURA: LOCAL + CLOUDFLARE ZERO TRUST + SOCKET.IO`);
            console.log(`    📦 PROVEEDOR WA: [${whatsAppProvider.id}]`);
            console.log(`\x1b[36m    🛡️ COMANDO BLINDADO (Anti-Corte):`);
            console.log(`    cloudflared tunnel --url http://localhost:3001 --protocol http2 --ha-connections 4\x1b[0m`);

            logService.info('[INFO] El sistema backend se ha iniciado correctamente.');

            // 6. Reconnect saved WhatsApp nodes if DB is ready
            if (db.isReady()) {
                logService.info('[SERVER] Iniciando escaneo de nodos activos...');
                try {
                    const clients = await db.getAllClients();
                    let activeNodes = 0;
                    for (const client of clients) {
                        if (client.settings.isActive) {
                            const status = getSessionStatus(client.id);
                            const validSession = await hasValidSession(client.id);

                            if (status.status === ConnectionStatus.DISCONNECTED && validSession) {
                                connectToWhatsApp(client.id);
                                activeNodes++;
                            }
                        }
                    }
                    if (activeNodes === 0) logService.info('[SERVER] No hay nodos activos pendientes.');
                    else logService.info(`[SERVER] Reconectando ${activeNodes} nodos activos.`);
                } catch (e) {
                    logService.error('[SERVER] Error en reconexión masiva', e);
                }
            }
        });

    } catch (fatalErr: any) {
        console.error('🚨 [STARTUP CRITICAL] Fallo en la secuencia de inicio:', fatalErr.message);
        logService.error('[STARTUP CRITICAL] Fallo en la secuencia de inicio', fatalErr);
        if (IS_PRODUCTION) {
            process.exit(1);
        }
    }
}

startServer();
