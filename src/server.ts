
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { generateBotResponse } from './services/aiService.js'; 

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';

// 1. LOGGER
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} | IP: ${req.ip}`);
    next();
});

// 2. CORS - Permisivo para aceptar peticiones desde Vercel
const corsOptions = {
    origin: '*', // Acepta conexiones desde tu Vercel y Ngrok
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'ngrok-skip-browser-warning'],
    credentials: true
};

app.use(cors(corsOptions) as any);
app.options('*', cors(corsOptions) as any);

app.use(express.json() as any);

// ==========================================
// API ROUTES
// ==========================================

app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    try {
        const user = await db.validateUser(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
            return res.json({ token, role: user.role });
        }
        await new Promise(r => setTimeout(r, 500));
        res.status(401).json({ message: 'Credenciales inválidas.' });
    } catch (e: any) {
        res.status(403).json({ message: e.message });
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, 'client', intendedUse);
        if (!newUser) return res.status(400).json({ message: 'El usuario ya existe.' });
        
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ token, role: newUser.role, recoveryKey: newUser.recoveryKey });
    } catch (e) {
        res.status(500).json({ message: 'Error interno.' });
    }
});

app.get('/api/settings', authenticateToken, async (req: any, res: any) => {
    const user = db.getUser(req.user.id);
    res.json(user?.settings || {});
});

app.post('/api/settings/simulate', authenticateToken, async (req: any, res: any) => {
    const userId = req.user.id;
    const proposedSettings = req.body; 
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const testCases = Object.values(user.conversations || {})
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

app.get('/api/metrics', authenticateToken, (req: any, res: any) => {
    const userId = req.user.id;
    const user = db.getUser(userId);
    if (!user) return res.status(404).end();

    const convs = Object.values(user.conversations || {});
    const hot = convs.filter((c: any) => c.status === 'Caliente').length;
    const warm = convs.filter((c: any) => c.status === 'Tibio').length;
    const cold = convs.filter((c: any) => c.status === 'Frío').length;
    
    // Métricas simplificadas para evitar errores de cálculo
    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: warm,
        coldLeads: cold,
        totalMessages: 0,
        conversionRate: 0,
        revenueEstimated: hot * 100, 
        avgEscalationTimeMinutes: 0,
        activeSessions: 1,
        humanDeviationScore: 0
    });
});

app.get('/api/admin/metrics', authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(db.getGlobalMetrics());
});

app.get('/api/admin/users', authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(db.getAllClients());
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
    res.status(200).json({ status: 'DOMINION_LOCAL_HOST_ONLINE', dbStatus });
});

// Inicio del servidor
const PORT = 3001; // Puerto fijo para evitar conflictos con Vite (5173)
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`=================================================`);
    console.log(`🦅 DOMINION BACKEND (LOCAL) ACTIVO EN PUERTO ${PORT}`);
    console.log(`-------------------------------------------------`);
    console.log(`1. Frontend: Gestionado por Vercel`);
    console.log(`2. Backend: http://localhost:${PORT}`);
    console.log(`3. Base de Datos: Local (MongoDB)`);
    console.log(`=================================================`);
    
    try {
        await db.init();
    } catch(e) {
        console.error("DB Init Error:", e);
    }
});
