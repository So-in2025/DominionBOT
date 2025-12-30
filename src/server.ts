
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { db } from './database';
import { authenticateToken } from './middleware/auth';

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dominion-god-secret-2024';

app.use(cors());
app.use(express.json());

// Auth Routes
app.post('/api/login', async (req: any, res: any) => {
    const { username, password } = req.body;
    const user = await db.validateUser(username, password);
    if (user) {
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, role: user.role });
    }
    res.status(401).json({ message: 'Credenciales inválidas o acceso no autorizado.' });
});

app.post('/api/register', async (req: any, res: any) => {
    const { username, password, geminiApiKey, intendedUse } = req.body;
    try {
        const newUser = await db.createUser(username, password, 'client');
        if (!newUser) return res.status(400).json({ message: 'El identificador ya existe.' });
        
        // Inicializar settings con la API Key proporcionada
        if (geminiApiKey) {
            await db.updateUserSettings(newUser.id, { geminiApiKey });
        }
        
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, role: newUser.role });
    } catch (e) {
        res.status(500).json({ message: 'Error interno al inicializar nodo.' });
    }
});

// User Context Routes
app.get('/api/settings', authenticateToken, async (req: any, res: any) => {
    const user = db.getUser(req.user.id);
    res.json(user?.settings || {});
});

// Super Admin Governance
app.get('/api/admin/metrics', authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(db.getGlobalMetrics());
});

app.get('/api/admin/users', authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    res.json(db.getAllClients());
});

app.post('/api/admin/update-governance', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'super_admin') return res.status(403).end();
    const { userId, governance } = req.body;
    const updated = await db.updateGovernance(userId, governance);
    res.json(updated);
});

// Health Check for Render
app.get('/api/health', (req, res) => res.status(200).send('Dominion Core Online'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    console.log(`🦅 DOMINION CORE v2.7.6 ONLINE ON PORT ${PORT}`);
    await db.init();
});
