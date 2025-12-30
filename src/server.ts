
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { authenticateToken } from './middleware/auth.js';
import { generateBotResponse } from './services/aiService.js'; 

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dominion-god-secret-2024';

// 1. LOGGER DE TRÁFICO MEJORADO
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | IP: ${req.ip}`);
    next();
});

// 2. CORS BLINDADO
// Permitimos preflight (OPTIONS) explícitamente antes de cualquier ruta
const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
    credentials: true
};

app.use(cors(corsOptions) as any);
app.options('*', cors(corsOptions) as any); // <--- ESTO ES CRÍTICO PARA EL LOGIN

app.use(express.json() as any);

// Auth Routes
app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    try {
        const user = await db.validateUser(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ token, role: user.role });
        }
        // Pequeño delay para mitigar fuerza bruta sin bloquear UI
        await new Promise(r => setTimeout(r, 500));
        res.status(401).json({ message: 'Credenciales inválidas o nodo no autorizado.' });
    } catch (e: any) {
        console.error("Login Error:", e);
        res.status(403).json({ message: e.message });
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, 'client', intendedUse);
        if (!newUser) return res.status(400).json({ message: 'El identificador ya está en uso por otro nodo.' });
        
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, role: newUser.role, recoveryKey: newUser.recoveryKey });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ message: 'Fallo crítico al inicializar infraestructura.' });
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
                output: aiResponse?.responseText || (aiResponse?.suggestedReplies ? `[SHADOW MODE] Sugerencias: ${aiResponse.suggestedReplies.join(' | ')}` : "(Sin respuesta generada)"),
                status: aiResponse?.newStatus
            };
        }));

        res.json(results.filter(r => r !== null));
    } catch (error) {
        console.error("Error en simulación:", error);
        res.status(500).json({ message: "Error en el motor de simulación." });
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

    const totalMessages = convs.reduce((acc, c: any) => acc + c.messages.length, 0);
    const ownerMessages = convs.reduce((acc, c: any) => acc + c.messages.filter((m: any) => m.sender === 'owner').length, 0);
    
    // Cálculo real de desviación: (Mensajes manuales / Mensajes totales) * 100
    // Si el usuario interviene el 100% de las veces, es 100%. Si solo mira, es 0%.
    const deviationScore = totalMessages > 0 ? Math.round((ownerMessages / totalMessages) * 100) : 0;

    res.json({
        totalLeads: convs.length,
        hotLeads: hot,
        warmLeads: warm,
        coldLeads: cold,
        totalMessages: totalMessages,
        conversionRate: convs.length > 0 ? Math.round((hot / convs.length) * 100) : 0,
        revenueEstimated: hot * 500, 
        avgEscalationTimeMinutes: 5,
        activeSessions: 1,
        humanDeviationScore: deviationScore // DATO REAL
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

// Api Controllers
import { 
    handleSse, 
    handleConnect, 
    handleDisconnect, 
    handleSendMessage, 
    handleUpdateConversation, 
    handleGetStatus,
    handleGetConversations // <--- IMPORTADO
} from './controllers/apiController.js';

app.get('/api/sse', handleSse);
app.get('/api/status', authenticateToken, handleGetStatus); 
app.post('/api/connect', authenticateToken, handleConnect);
app.get('/api/disconnect', authenticateToken, handleDisconnect);
app.post('/api/send', authenticateToken, handleSendMessage);
app.post('/api/conversation/update', authenticateToken, handleUpdateConversation);
app.get('/api/conversations', authenticateToken, handleGetConversations); // <--- RUTA AGREGADA

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    // Si la DB no está lista, aún respondemos OK pero con status diferente para depuración
    const dbStatus = db.isReady() ? 'CONNECTED' : 'CONNECTING';
    res.status(200).json({ 
        status: 'DOMINION_ONLINE', 
        dbStatus,
        timestamp: Date.now(), 
        uptime: process.uptime() 
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    console.log(`🦅 DOMINION CORE v2.8.0 ONLINE ON PORT ${PORT}`);
    console.log(`WAITING FOR MONGO DB...`);
    try {
        await db.init();
        console.log(`MONGO DB READY. SYSTEM FULLY OPERATIONAL.`);
    } catch(e) {
        console.error("DB Warmup Warning:", e);
    }
});
