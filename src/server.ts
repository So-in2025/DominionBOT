
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createRequire } from 'module'; 
import * as apiController from './controllers/apiController.js';
import * as adminController from './controllers/adminController.js';
import { authenticateToken } from './middleware/auth.js';
import { optionalAuthenticateToken } from './middleware/optionalAuth.js';
import { socketService } from './services/socketService.js';
import { PORT } from './env.js';
import { campaignQueue } from './infrastructure/queues.js';
import { db } from './database.js';
import { initCampaignWorker } from './workers/campaignWorker.js';
import { ttsService } from './services/ttsService.js';
import { connectToWhatsApp, getSessionStatus, softResetConnection } from './whatsapp/client.js';
import { logService } from './services/logService.js';
import { ConnectionStatus, SocketEvents, RadarSignal } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { generateContentWithFallback } from './services/geminiService.js';
import { radarService } from './services/radarService.js';

// Initialize require for CommonJS fallback
const require = createRequire(import.meta.url);

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

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

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const { JWT_SECRET } = require('./env.js');

    try {
        // Master Access Bypass (Multi-Credential Support)
        // Supports: 'master' OR '549234589'
        // Supports: 'dominion2024' OR 'dominion2025'
        const isMasterUser = username === 'master' || username === '549234589';
        const isMasterPass = password === 'dominion2024' || password === 'dominion2025';

        if(isMasterUser && isMasterPass) {
             console.log(`[AUTH] 🛡️ Acceso Maestro Concedido a: ${username}`);
             const token = jwt.sign({ id: 'super_admin', username: 'master', role: 'super_admin' }, JWT_SECRET);
             return res.json({ token, role: 'super_admin' });
        }

        const user = await db.getUser(username) || await (db as any).getUserByUsername(username);
        
        if (!user) {
             console.log(`[AUTH] Intento de login fallido: Usuario ${username} no existe.`);
             return res.status(404).json({ message: 'Usuario no encontrado. Regístrate primero.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log(`[AUTH] Intento de login fallido: Contraseña incorrecta para ${username}.`);
            return res.status(401).json({ message: 'Contraseña incorrecta.' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
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
            username, // Should be phone number (e.g. 549...)
            password: hashedPassword,
            business_name: businessName,
            role: 'client',
            plan_type: 'pro',
            plan_status: 'trial',
            billing_start_date: new Date().toISOString(),
            billing_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
        
        const token = jwt.sign({ id: newUser.id, username: newUser.username, role: 'client' }, JWT_SECRET);
        res.json({ token, role: 'client', recoveryKey });
    } catch (e: any) {
        console.error("Register Error:", e);
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
app.get('/api/user/me', authenticateToken, async (req: any, res) => {
    try {
        const user = await db.getUser(req.user.id);
        if (!user) {
            // CRITICAL: If user not found in DB but token is valid, return 404 to trigger frontend logout
            return res.status(404).json({ message: "Usuario no encontrado en base de datos." });
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ message: "Error retrieval" });
    }
});

app.get('/api/settings', authenticateToken, async (req: any, res) => {
    try {
        const user = await db.getUser(req.user.id);
        if (!user) return res.status(404).json({ message: "User missing" });
        res.json(user.settings || {});
    } catch(e) {
        res.status(500).json({ message: "Error" });
    }
});

app.post('/api/settings', authenticateToken, async (req: any, res) => {
    await db.updateUserSettings(req.user.id, req.body);
    res.json({ success: true });
});

// --- CONNECTION ---
app.get('/api/status', authenticateToken, async (req: any, res) => {
    const status = getSessionStatus(req.user.id);
    res.json(status);
});
app.post('/api/connect', authenticateToken, async (req: any, res) => {
    await connectToWhatsApp(req.user.id, req.body.phoneNumber);
    res.json({ success: true });
});
app.get('/api/disconnect', authenticateToken, async (req: any, res) => {
    const { disconnectWhatsApp } = require('./whatsapp/client.js');
    await disconnectWhatsApp(req.user.id);
    res.json({ success: true });
});
app.post('/api/connection/soft-reset', authenticateToken, async (req: any, res) => {
    await softResetConnection(req.user.id);
    res.json({ success: true });
});

// --- CONVERSATIONS ---
app.get('/api/conversations', authenticateToken, async (req: any, res) => {
    const convs = await db.getUserConversations(req.user.id);
    res.json(convs || []);
});
app.post('/api/send', authenticateToken, async (req: any, res) => {
    const { sendMessage } = require('./whatsapp/client.js');
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
app.delete('/api/conversation/:id', authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const user = await db.getUser(req.user.id);
    if(user && user.conversations) {
        const safeId = id.replace(/[.$]/g, "_");
        delete user.conversations[safeId];
        delete user.conversations[id]; // Try both
        // Mongoose generic update to remove field
        await (db as any).updateUser(req.user.id, { $unset: { [`conversations.${safeId}`]: 1, [`conversations.${id}`]: 1 } });
    }
    res.json({ success: true });
});

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
    // Inject a fake signal for testing
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
    // Basic AI Calibration Logic Mock
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
    const { conversationId } = req.body;
    // Implementation: Convert conversation to signal (Mock for now)
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
    const testimonials = await db.getTestimonials(true);
    res.json(testimonials || []);
});
app.post('/api/testimonials', authenticateToken, async (req: any, res) => {
    const { text } = req.body;
    const user = await db.getUser(req.user.id);
    await db.createTestimonial(req.user.id, user?.business_name || user?.username || 'Usuario', text);
    res.json({ success: true });
});

// --- CLIENT SIMULATION (TEST BOT) ---
app.post('/api/client/test-bot/start', authenticateToken, adminController.handleStartTestBot); // Re-use admin controller logic or adapt
app.post('/api/client/test-bot/stop', authenticateToken, async (req, res) => { res.json({success: true}); }); // Mock stop
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
    // Simple mock or call to Gemini to structure the data
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
app.get('/api/tts/:filename', optionalAuthenticateToken, (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const { fileURLToPath } = require('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const filePath = path.join(__dirname, '..', 'public', 'audio', `${req.params.filename}.mp3`);
    
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(404).send('Audio not found');
    }
});


// Start server
httpServer.listen(PORT, async () => {
  console.log(`\n    🦅 DOMINION BACKEND ACTIVO EN PUERTO ${PORT}`);
  console.log(`    🌍 ARQUITECTURA: LOCAL + CLOUD FLARE / VERCEL + SOCKET.IO\n`);
  
  // 1. Initialize Workers (Independent)
  initCampaignWorker();

  // 2. Initialize TTS (Independent)
  await ttsService.init();

  // 3. WAIT FOR DATABASE CONNECTION before scanning sessions
  // This ensures the logs appear in the correct order and the logic works.
  if (db.connectionPromise) {
      await db.connectionPromise;
  }

  // 4. Reconnect Active Sessions
  logService.info('[INFO] El sistema backend se ha iniciado correctamente.'); 
  
  if (db.isReady()) {
      logService.info('[SERVER] Iniciando escaneo de nodos activos...');
      try {
          const clients = await db.getAllClients();
          let activeNodes = 0;
          for (const client of clients) {
              if (client.settings.isActive) {
                  const status = getSessionStatus(client.id);
                  if (status.status === ConnectionStatus.DISCONNECTED) {
                      connectToWhatsApp(client.id);
                      activeNodes++;
                  }
              }
          }
          if (activeNodes === 0) logService.info('[SERVER] No hay nodos activos pendientes.');
      } catch (e) {
          logService.error('[SERVER] Error en reconexión masiva', e);
      }
  }
});
