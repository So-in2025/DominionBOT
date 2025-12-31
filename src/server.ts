
// 1. CARGA DE ENTORNO CRÍTICA
import { JWT_SECRET, PORT } from './env.js';

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { generateBotResponse } from './services/aiService.js'; 

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

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    next();
});

app.use(express.json({ limit: '10mb' }) as any);

// ==========================================
// API ROUTES
// ==========================================

app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    try {
        const user = await db.validateUser(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ token, role: user.role });
        }
        await new Promise(r => setTimeout(r, 1000));
        res.status(401).json({ message: 'Credenciales inválidas.' });
    } catch (e: any) {
        res.status(500).json({ message: "Error interno." });
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, 'client', intendedUse);
        if (!newUser) return res.status(400).json({ message: 'El usuario ya existe.' });
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, role: newUser.role, recoveryKey: newUser.recoveryKey });
    } catch (e) {
        res.status(500).json({ message: 'Error interno.' });
    }
});

// SYSTEM RESET (SUPER ADMIN ONLY)
app.post('/api/admin/system/reset', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Acceso denegado' });
    const success = await db.dangerouslyResetDatabase();
    if (success) {
        res.json({ message: 'Sistema reseteado correctamente.' });
    } else {
        res.status(500).json({ message: 'Error al resetear base de datos.' });
    }
});

app.get('/api/settings', authenticateToken, async (req: any, res: any) => {
    const user = await db.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user.settings || {});
});

app.post('/api/settings', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const updated = await db.updateUserSettings(userId, req.body);
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

app.get('/api/admin/metrics', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(await db.getGlobalMetrics());
});

app.get('/api/admin/users', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(await db.getAllClients());
});

import { 
    handleSse, handleConnect, handleDisconnect, handleSendMessage, handleUpdateConversation, handleGetStatus, handleGetConversations 
} from './controllers/apiController.js';

app.get('/api/sse', handleSse);
app.get('/api/status', authenticateToken, handleGetStatus); 
app.post('/api/connect', authenticateToken, handleConnect);
app.get('/api/disconnect', authenticateToken, handleDisconnect);
app.post('/api/send', authenticateToken, handleSendMessage);
app.post('/api/conversation/update', authenticateToken, handleUpdateConversation);
app.get('/api/conversations', authenticateToken, handleGetConversations);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'DOMINION_ONLINE', database: db.isReady() ? 'CONNECTED' : 'CONNECTING' });
});

app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}`);
    try {
        await db.init();
    } catch(e) {}
});
