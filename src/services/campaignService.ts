
import { db } from '../database.js';
import { Campaign, CampaignStatus, WhatsAppGroup } from '../types.js';
import { logService } from './logService.js';
import { getSocket, sendMessage, fetchUserGroups } from '../whatsapp/client.js';
import { capabilityResolver } from './capabilityResolver.js'; 

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
                // 1. Check Operating Window (Hours)
                if (!this.isInOperatingWindow(campaign)) {
                    // console.log(`[CAMPAIGN] Pausando ${campaign.name} fuera de ventana operativa.`);
                    continue; 
                }
                
                this.executeCampaignBatch(campaign);
            }
        } catch (error) {
            console.error('[CAMPAIGN-SCHEDULER] Error en ciclo de reloj:', error);
        }
    }

    private isInOperatingWindow(campaign: Campaign): boolean {
        if (!campaign.config.operatingWindow) return true; // Always valid if no window defined
        
        const now = new Date();
        const currentHour = now.getHours();
        const { startHour, endHour } = campaign.config.operatingWindow;

        // Simple check for same-day window (e.g., 09:00 to 18:00)
        if (startHour <= endHour) {
            return currentHour >= startHour && currentHour < endHour;
        } 
        // Cross-day window (e.g., 22:00 to 06:00)
        else {
            return currentHour >= startHour || currentHour < endHour;
        }
    }

    // Helper to process Spintax {A|B|C}
    private processSpintax(text: string): string {
        if (!text) return "";
        return text.replace(/{([^{}]+)}/g, (match, p1) => {
            const options = p1.split('|');
            return options[Math.floor(Math.random() * options.length)];
        });
    }

    private async executeCampaignBatch(campaign: Campaign) {
        const socket = getSocket(campaign.userId);
        
        if (!socket?.user) {
            logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario ${campaign.userId} desconectado.`, campaign.userId);
            return;
        }

        logService.info(`[CAMPAIGN] Iniciando ejecución de campaña: ${campaign.name}`, campaign.userId);

        // 1. Resolve Capabilities for Advanced Jitter
        const capabilities = await capabilityResolver.resolve(campaign.userId);
        const jitterFactor = capabilities.variationDepth / 100; // 0.1 to 1.0

        // Need Group Metadata for variable replacement {group_name}
        let groupsMeta: WhatsAppGroup[] = [];
        try {
            groupsMeta = await fetchUserGroups(campaign.userId);
        } catch (e) { /* Ignore if fails, variables just won't work */ }

        const groups = campaign.groups;
        let sentCount = 0;
        let failedCount = 0;

        (async () => {
            for (const groupId of groups) {
                // Double check window inside loop for long batches
                if (!this.isInOperatingWindow(campaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${campaign.name} por cierre de ventana operativa.`, campaign.userId);
                    break; 
                }

                try {
                    // 2. Anti-Ban Jitter Logic (Depth Augmented)
                    // Base random delay
                    const baseDelay = Math.floor(Math.random() * (campaign.config.maxDelaySec - campaign.config.minDelaySec + 1) + campaign.config.minDelaySec) * 1000;
                    
                    // Humanization Variance
                    const variance = Math.random() * (2000 * jitterFactor); 
                    const finalDelay = baseDelay + variance;

                    await new Promise(resolve => setTimeout(resolve, finalDelay));

                    // 3. Process Content (Spintax & Variables)
                    let finalMessage = campaign.message;
                    
                    // Spintax
                    if (campaign.config.useSpintax) {
                        finalMessage = this.processSpintax(finalMessage);
                    }

                    // Variables
                    if (finalMessage.includes('{group_name}')) {
                        const gMeta = groupsMeta.find(g => g.id === groupId);
                        const gName = gMeta ? gMeta.subject : "Grupo";
                        finalMessage = finalMessage.replace(/{group_name}/g, gName);
                    }

                    // 4. Send
                    await sendMessage(campaign.userId, groupId, finalMessage, campaign.imageUrl);
                    sentCount++;
                    console.log(`[CAMPAIGN] Enviado a ${groupId} (Delay: ${Math.round(finalDelay)}ms)`);

                } catch (error) {
                    console.error(`[CAMPAIGN] Fallo envío a ${groupId}`, error);
                    failedCount++;
                }
            }

            // 5. Update Campaign State after batch
            const nextRun = this.calculateNextRun(campaign);
            const updates: Partial<Campaign> = {
                stats: {
                    totalSent: (campaign.stats?.totalSent || 0) + sentCount,
                    totalFailed: (campaign.stats?.totalFailed || 0) + failedCount,
                    lastRunAt: new Date().toISOString(),
                    nextRunAt: nextRun
                },
                // If ONCE, mark as completed immediately
                status: campaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
            };

            await db.updateCampaign(campaign.id, updates);
            logService.info(`[CAMPAIGN] Campaña ${campaign.name} finalizada. Prox ejecución: ${nextRun || 'N/A'}`, campaign.userId);

        })().catch(err => {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        });
    }

    private calculateNextRun(campaign: Campaign): string {
        const now = new Date();
        const type = campaign.schedule.type;
        
        if (type === 'ONCE') return ''; 

        // Set target time based on schedule.time
        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);
        
        // Base is tomorrow by default
        let nextDate = new Date(now);
        nextDate.setHours(targetHour, targetMinute, 0, 0);

        if (type === 'DAILY') {
            nextDate.setDate(nextDate.getDate() + 1);
        } 
        else if (type === 'WEEKLY' && campaign.schedule.daysOfWeek) {
            // Find the closest next scheduled day
            let found = false;
            // Look ahead up to 7 days
            for (let i = 1; i <= 7; i++) {
                const potentialDate = new Date(now);
                potentialDate.setDate(potentialDate.getDate() + i);
                const dayIndex = potentialDate.getDay(); // 0-6
                
                if (campaign.schedule.daysOfWeek.includes(dayIndex)) {
                    nextDate = potentialDate;
                    nextDate.setHours(targetHour, targetMinute, 0, 0);
                    found = true;
                    break;
                }
            }
            // Fallback if somehow nothing found (shouldn't happen if daysOfWeek not empty)
            if (!found) nextDate.setDate(nextDate.getDate() + 7);
        }

        return nextDate.toISOString();
    }
}

export const campaignService = new CampaignService();
