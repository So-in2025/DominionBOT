
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
// import { sseService } from './services/sseService.js'; // Removed SSE service import

const app = express();

app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
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
    const convs = Object.values(user.conversations || {});
    const hot = convs.filter((c: any) => c.status === 'Caliente').length;
    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: convs.filter((c: any) => c.status === 'Tibio').length,
        coldLeads: convs.filter((c: any) => c.status === 'Frío').length,
        totalMessages: 0,
        conversionRate: convs.length > 0 ? Math.round((hot / convs.length) * 100) : 0,
        revenueEstimated: hot * 150,
        avgEscalationTimeMinutes: 0,
        activeSessions: 1,
        humanDeviationScore: user.governance.humanDeviationScore || 0
    });
});

import { 
    handleConnect, handleDisconnect, handleSendMessage, handleUpdateConversation, handleGetStatus, handleGetConversations, handleGetTestimonials, handlePostTestimonial, handleGetTtsAudio, handleStartClientTestBot, handleClearClientTestBotConversation
} from './controllers/apiController.js';
import { handleGetAllClients, handleUpdateClient, handleRenewClient, handleGetLogs, handleGetDashboardMetrics, handleActivateClient, handleGetSystemSettings, handleUpdateSystemSettings, handleDeleteClient, handleStartTestBot, handleClearTestBotConversation } from './controllers/adminController.js';

// Standard Client Routes
app.get('/api/status', authenticateToken, handleGetStatus); 
app.post('/api/connect', authenticateToken, handleConnect);
app.get('/api/disconnect', authenticateToken, handleDisconnect);
app.post('/api/send', authenticateToken, handleSendMessage);
app.post('/api/conversation/update', authenticateToken, handleUpdateConversation);
app.get('/api/conversations', authenticateToken, handleGetConversations);

// Client Test Bot Routes
app.post('/api/client/test-bot/start', authenticateToken, handleStartClientTestBot);
app.post('/api/client/test-bot/clear', authenticateToken, handleClearClientTestBotConversation);

// Public/Shared Routes
app.get('/api/system/settings', authenticateToken, handleGetSystemSettings); // Clients need this for support number

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

adminRouter.post('/system/reset', async (req: any, res: any) => {
    logService.audit('HARD RESET DEL SISTEMA INICIADO', req.user.id, req.user.username);
    const success = await db.dangerouslyResetDatabase();
    if (success) res.json({ message: 'Sistema reseteado.' });
    else res.status(500).json({ message: 'Error al resetear.' });
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
    console.warn(`[SERVER-404-FALLBACK] Request fell through to global HTML 404 handler: ${req.method} ${req.originalUrl}`);
    logService.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, req.user?.id, req.user?.username);
    res.status(404).send('Página no encontrada.'); // Still send HTML for non-API paths for clarity
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
        await ttsService.init(); // Inicializar el servicio TTS para pre-generar audios
    } catch(e) {
        logService.error('Fallo crítico al inicializar la base de datos o el servicio TTS', e);
    }
});
