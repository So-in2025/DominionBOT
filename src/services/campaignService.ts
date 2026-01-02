
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
        
        console.log('🚀 [CAMPAIGN-SCHEDULER] Motor de Campañas Iniciado (Sincronizado GMT-3).');
        
        // Heartbeat: Check every 60 seconds
        this.checkInterval = setInterval(() => this.processPendingCampaigns(), 60000);
    }

    // Helper: Obtener la hora "real" de Argentina, sin importar dónde esté el servidor (USA, Europa, etc)
    private getArgentinaDate(): Date {
        const now = new Date();
        // Truco: Convertir a string en zona horaria específica y volver a parsear
        // Esto crea un objeto Date donde .getHours() devuelve la hora de Argentina
        const argString = now.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"});
        return new Date(argString);
    }

    private async processPendingCampaigns() {
        try {
            const pendingCampaigns = await db.getPendingCampaigns();
            if (pendingCampaigns.length > 0) {
                // Log discreto para no llenar la consola
                // console.log(`[CAMPAIGN] Procesando ${pendingCampaigns.length} campañas...`);
            }

            for (const campaign of pendingCampaigns) {
                console.log(`[CAMPAIGN-DEBUG] Evaluando campaña "${campaign.name}" (ID: ${campaign.id})`);
                
                // 1. Check Operating Window (Hours)
                if (!this.isInOperatingWindow(campaign)) {
                    console.log(`[CAMPAIGN-DEBUG] Pausada por horario (Ventana cerrada en ARG).`);
                    // Solo loguear esto una vez cada tanto o si es crítico, para no spamear
                    // logService.warn(`[CAMPAIGN] Pausando "${campaign.name}" por horario (Ventana cerrada en ARG).`, campaign.userId);
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
        
        // USAR HORA ARGENTINA
        const nowArg = this.getArgentinaDate();
        const currentHour = nowArg.getHours();
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
            console.log(`[CAMPAIGN-DEBUG] Omitiendo. Socket no encontrado para usuario ${campaign.userId}.`);
            logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario ${campaign.userId} desconectado.`, campaign.userId);
            return;
        }

        logService.info(`[CAMPAIGN] Ejecutando campaña: ${campaign.name}`, campaign.userId);

        // 1. Resolve Capabilities for Advanced Jitter
        const capabilities = await capabilityResolver.resolve(campaign.userId);
        const jitterFactor = capabilities.variationDepth / 100; // 0.1 to 1.0

        // Need Group Metadata for variable replacement {group_name}
        let groupsMeta: WhatsAppGroup[] = [];
        try {
            groupsMeta = await fetchUserGroups(campaign.userId);
        } catch (e) { 
            console.warn(`[CAMPAIGN-DEBUG] No se pudieron obtener metadatos de grupos para variables.`);
        }

        const groups = campaign.groups;
        let sentCount = 0;
        let failedCount = 0;

        (async () => {
            for (const groupId of groups) {
                // Double check window inside loop for long batches
                if (!this.isInOperatingWindow(campaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${campaign.name} por cierre de ventana operativa (ARG).`, campaign.userId);
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
        // Calculations relative to ARGENTINA TIME
        const nowArg = this.getArgentinaDate(); 
        const type = campaign.schedule.type;
        
        if (type === 'ONCE') return ''; 

        // Set target time based on schedule.time
        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);
        
        // Base is tomorrow by default (relative to Argentina Time)
        let nextDateArg = new Date(nowArg);
        nextDateArg.setHours(targetHour, targetMinute, 0, 0);

        if (type === 'DAILY') {
            nextDateArg.setDate(nextDateArg.getDate() + 1);
        } 
        else if (type === 'WEEKLY' && campaign.schedule.daysOfWeek) {
            let found = false;
            for (let i = 1; i <= 7; i++) {
                const potentialDate = new Date(nowArg);
                potentialDate.setDate(potentialDate.getDate() + i);
                const dayIndex = potentialDate.getDay(); // 0-6
                
                if (campaign.schedule.daysOfWeek.includes(dayIndex)) {
                    nextDateArg = potentialDate;
                    nextDateArg.setHours(targetHour, targetMinute, 0, 0);
                    found = true;
                    break;
                }
            }
            if (!found) nextDateArg.setDate(nextDateArg.getDate() + 7);
        }

        // IMPORTANT: Convert Argentina Date back to ISO UTC string for DB storage
        // Since getArgentinaDate() returns a Date object where .getHours() is local ARG time but .toISOString() would shift it again based on Server Locale,
        // we need to be careful.
        // The safest way for the scheduler (which compares against ISO) is to construct the ISO string manually or adjust offset reverse.
        // Assuming we store nextRunAt as ISO.
        
        // If we have "2023-10-28 09:00" in Argentina (-3), that is "2023-10-28 12:00 Z".
        // We need to store "2023-10-28T12:00:00.000Z".
        
        // Reconstruct UTC timestamp from Argentina components
        const year = nextDateArg.getFullYear();
        const month = nextDateArg.getMonth();
        const day = nextDateArg.getDate();
        const hour = nextDateArg.getHours();
        const min = nextDateArg.getMinutes();
        
        // Create UTC date by adding 3 hours to the components (ARG is UTC-3, so UTC is ARG+3)
        // Note: This is a simplification. For production with DST, utilize a library. 
        // Argentina currently does not observe DST, so GMT-3 is stable.
        const utcDate = new Date(Date.UTC(year, month, day, hour + 3, min, 0));
        
        return utcDate.toISOString();
    }
}

export const campaignService = new CampaignService();
