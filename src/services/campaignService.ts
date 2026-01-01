
import { db } from '../database.js';
import { Campaign, CampaignStatus } from '../types.js';
import { logService } from './logService.js';
import { getSocket, sendMessage } from '../whatsapp/client.js';

class CampaignService {
    private isRunning = false;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.initScheduler();
    }

    private initScheduler() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('🚀 [CAMPAIGN-SCHEDULER] Motor de Campañas Iniciado.');
        
        // Heartbeat: Check every 60 seconds
        this.checkInterval = setInterval(() => this.processPendingCampaigns(), 60000);
    }

    private async processPendingCampaigns() {
        try {
            const pendingCampaigns = await db.getPendingCampaigns();
            if (pendingCampaigns.length > 0) {
                console.log(`[CAMPAIGN-SCHEDULER] Encontradas ${pendingCampaigns.length} campañas para ejecutar.`);
            }

            for (const campaign of pendingCampaigns) {
                this.executeCampaignBatch(campaign);
            }
        } catch (error) {
            console.error('[CAMPAIGN-SCHEDULER] Error en ciclo de reloj:', error);
        }
    }

    private async executeCampaignBatch(campaign: Campaign) {
        const socket = getSocket(campaign.userId);
        
        if (!socket?.user) {
            logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario ${campaign.userId} desconectado.`, campaign.userId);
            return;
        }

        logService.info(`[CAMPAIGN] Iniciando ejecución de campaña: ${campaign.name}`, campaign.userId);

        const groups = campaign.groups;
        let sentCount = 0;
        let failedCount = 0;

        // "Fire and Forget" approach for the batch to not block the main thread logic too much,
        // but using async/await with delays inside to respect rate limits.
        // We update the campaign stats at the end.
        
        // This runs asynchronously from the main scheduler loop
        (async () => {
            for (const groupId of groups) {
                try {
                    // 1. Anti-Ban Jitter Delay
                    const delay = Math.floor(Math.random() * (campaign.config.maxDelaySec - campaign.config.minDelaySec + 1) + campaign.config.minDelaySec) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // 2. Send Message
                    await sendMessage(campaign.userId, groupId, campaign.message);
                    sentCount++;
                    console.log(`[CAMPAIGN] Enviado a ${groupId} (Delay: ${delay}ms)`);

                } catch (error) {
                    console.error(`[CAMPAIGN] Fallo envío a ${groupId}`, error);
                    failedCount++;
                }
            }

            // 3. Update Campaign State after batch
            const updates: Partial<Campaign> = {
                stats: {
                    totalSent: (campaign.stats?.totalSent || 0) + sentCount,
                    totalFailed: (campaign.stats?.totalFailed || 0) + failedCount,
                    lastRunAt: new Date().toISOString(),
                    // Calculate next run based on schedule
                    nextRunAt: this.calculateNextRun(campaign)
                },
                // If ONCE, mark as completed
                status: campaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
            };

            await db.updateCampaign(campaign.id, updates);
            logService.info(`[CAMPAIGN] Campaña ${campaign.name} finalizada. Enviados: ${sentCount}, Fallidos: ${failedCount}`, campaign.userId);

        })().catch(err => {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        });
    }

    private calculateNextRun(campaign: Campaign): string {
        const now = new Date();
        
        if (campaign.schedule.type === 'ONCE') {
            return ''; // No next run
        }

        // Basic daily/weekly logic fallback
        // Ideally we parse HH:MM and Days
        const next = new Date(now);
        
        if (campaign.schedule.type === 'DAILY') {
            next.setDate(next.getDate() + 1);
        } else if (campaign.schedule.type === 'WEEKLY') {
            next.setDate(next.getDate() + 7);
        }

        // Set time if provided (simple implementation)
        if (campaign.schedule.time) {
            const [hours, minutes] = campaign.schedule.time.split(':').map(Number);
            next.setHours(hours, minutes, 0, 0);
        }

        return next.toISOString();
    }
}

export const campaignService = new CampaignService();
