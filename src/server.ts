
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
// FIX: Restored .js extensions required by NodeNext module resolution for local files
import * as apiController from './controllers/apiController.js';
import { authenticateToken } from './middleware/auth.js';
import { socketService } from './services/socketService.js';
import { PORT } from './env.js';
import { campaignQueue } from './infrastructure/queues.js';

// @ts-ignore - Bypass TS resolution for bull-board in NodeNext
import { createBullBoard } from '@bull-board/api';
// @ts-ignore - Bypass TS resolution for bull-board in NodeNext
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
// @ts-ignore - Bypass TS resolution for bull-board in NodeNext
import { ExpressAdapter } from '@bull-board/express';

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '10mb' }) as any); // Increase limit for images

const httpServer = createServer(app);
socketService.init(httpServer);

// BullMQ Dashboard for diagnostics
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(campaignQueue)],
  serverAdapter: serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter() as any);


// API Routes
app.get('/api/metrics', authenticateToken, apiController.handleGetMetrics);
app.get('/api/campaigns', authenticateToken, apiController.handleGetCampaigns);
app.post('/api/campaigns', authenticateToken, apiController.handleCreateCampaign);
app.put('/api/campaigns/:id', authenticateToken, apiController.handleUpdateCampaign);
app.delete('/api/campaigns/all', authenticateToken, apiController.handleDeleteAllCampaigns); 
app.delete('/api/campaigns/:id', authenticateToken, apiController.handleDeleteCampaign);
app.post('/api/campaigns/:id/execute', authenticateToken, apiController.handleForceExecuteCampaign); 
app.get('/api/whatsapp/groups', authenticateToken, apiController.handleGetWhatsAppGroups);
app.post('/api/ai/generate-campaign-prompt', authenticateToken, apiController.handleGenerateCampaignPrompt);


// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`BullMQ Dashboard available at http://localhost:${PORT}/admin/queues`);
});
