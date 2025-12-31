
// 1. CARGA DE ENTORNO CRÍTICA
import { JWT_SECRET, PORT } from './env.js';

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { generateBotResponse } from './services/aiService.js'; 

const app = express();

// 1. LOGGER DE PRODUCCIÓN (Simple)
app.use((req, res, next) => {
    // Solo loguear endpoints API relevantes para no saturar logs
    if (req.url.startsWith('/api')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | IP: ${req.ip}`);
    }
    next();
});

// 2. CORS - Configurado para soportar preflight y credenciales
const corsOptions = {
    origin: '*', // En producción real, cambiar esto por el dominio del frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'ngrok-skip-browser-warning'],
    credentials: true
};

app.use(cors(corsOptions) as any);
app.options('*', cors(corsOptions) as any);

app.use(express.json({ limit: '10mb' }) as any); // Limite aumentado para cargas útiles grandes

// ==========================================
// API ROUTES
// ==========================================

app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    try {
        const user = await db.validateUser(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            console.log(`[AUTH] Token generado para: ${username}`);
            return res.json({ token, role: user.role });
        }
        // Delay para mitigar ataques de fuerza bruta
        await new Promise(r => setTimeout(r, 1000));
        res.status(401).json({ message: 'Credenciales inválidas.' });
    } catch (e: any) {
        console.error("[AUTH-ERROR]", e);
        res.status(500).json({ message: "Error interno de servidor." });
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, 'client', intendedUse);
        if (!newUser) return res.status(400).json({ message: 'El usuario ya existe.' });
        
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        console.log(`[REGISTER] New user ${username} created.`);
        res.status(201).json({ token, role: newUser.role, recoveryKey: newUser.recoveryKey });
    } catch (e) {
        res.status(500).json({ message: 'Error interno.' });
    }
});

app.get('/api/settings', authenticateToken, async (req: any, res: any) => {
    const user = await db.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user.settings || {});
});

app.post('/api/settings/simulate', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const proposedSettings = req.body; 
    const user = await db.getUser(userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const conversations = Object.values(user.conversations || {});
    // Filtrar conversaciones que tengan mensajes
    const testCases = conversations
        .filter((c: any) => c.messages && c.messages.length > 0)
        .slice(0, 3);

    if (testCases.length === 0) {
        testCases.push({
            leadName: "Cliente Simulado",
            messages: [{ id: 'mock', text: "¿Cuál es el precio y qué incluye?", sender: 'user', timestamp: new Date() }]
        } as any);
    }

    try {
        const results = await Promise.all(testCases.map(async (c: any) => {
            const lastUserMsg = [...c.messages].reverse().find((m: any) => m.sender === 'user');
            if (!lastUserMsg) return null;
            const aiResponse = await generateBotResponse(c.messages, proposedSettings);
            return {
                leadName: c.leadName,
                input: lastUserMsg.text,
                output: aiResponse?.responseText || (aiResponse?.suggestedReplies ? `[SHADOW MODE] Sugerencias: ${aiResponse.suggestedReplies.join(' | ')}` : "(Sin respuesta)"),
                status: aiResponse?.newStatus
            };
        }));
        res.json(results.filter(r => r !== null));
    } catch (error) {
        res.status(500).json({ message: "Error simulación." });
    }
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
    const warm = convs.filter((c: any) => c.status === 'Tibio').length;
    const cold = convs.filter((c: any) => c.status === 'Frío').length;
    
    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: warm,
        coldLeads: cold,
        totalMessages: 0, // Calcular real si es necesario
        conversionRate: convs.length > 0 ? Math.round((hot / convs.length) * 100) : 0,
        revenueEstimated: hot * 150, // Estimación mock
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
    const dbStatus = db.isReady() ? 'CONNECTED' : 'CONNECTING';
    res.status(200).json({ status: 'DOMINION_ONLINE', dbStatus });
});

// Inicio del servidor
app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`=================================================`);
    console.log(`🦅 DOMINION BACKEND (PROD) ACTIVO EN PUERTO ${PORT}`);
    console.log(`-------------------------------------------------`);
    console.log(`1. Database: MongoDB Atlas (Direct Connection)`);
    console.log(`2. Backend: http://0.0.0.0:${PORT}`);
    console.log(`=================================================`);
    
    try {
        await db.init();
        const count = await db.getCacheSize(); // Ahora devuelve count de Mongo
        console.log(`📊 Usuarios registrados en DB: ${count}`);
    } catch(e) {
        console.error("❌ ERROR CRÍTICO AL INICIAR DB:", e);
        process.exit(1); // Fallar rápido en producción si no hay DB
    }
});
