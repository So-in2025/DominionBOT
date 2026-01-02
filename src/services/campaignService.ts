
import { db } from '../database.js';
import { Campaign, CampaignStatus, WhatsAppGroup } from '../types.js';
import { logService } from './logService.js';
import { getSocket, sendMessage, fetchUserGroups } from '../whatsapp/client.js';
import { capabilityResolver } from './capabilityResolver.js'; 

class CampaignService {
    private isRunning = false;
    // FIX: Replace NodeJS.Timeout with ReturnType<typeof setInterval> to avoid global namespace issues.
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    // LOCKING MECHANISM: Prevent duplicate execution of the same campaign
    private processingCampaignIds = new Set<string>();

    constructor() {
        this.initScheduler();
    }

    private initScheduler() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        logService.info('🚀 [CAMPAIGN-SCHEDULER] Motor de Campañas Iniciado (Frecuencia: 10s).');
        
        // Heartbeat: Check every 10 seconds (High Frequency)
        this.checkInterval = setInterval(() => this.processPendingCampaigns(), 10000);
    }

    // Public method to trigger immediate check from Controller
    public async forceCheck() {
        // Use logService so user sees it in dashboard logs
        logService.info('⚡ [CAMPAIGN] Ejecución forzada manual solicitada.', 'SYSTEM');
        await this.processPendingCampaigns();
    }

    // NEW: Force execute specific campaign ignoring schedule/window
    public async forceExecuteCampaign(campaignId: string, userId: string) {
        if (this.processingCampaignIds.has(campaignId)) {
            throw new Error("⚠️ La campaña ya se está ejecutando. Espera a que termine.");
        }

        const campaign = await db.getCampaign(campaignId);
        if (!campaign) throw new Error("Campaña no encontrada");
        if (campaign.userId !== userId) throw new Error("Acceso denegado");

        logService.warn(`[CAMPAIGN] ⚡ EJECUCIÓN FORZADA MANUAL INICIADA para: ${campaign.name}`, userId);
        
        // LOCK IMMEDIATELY
        this.processingCampaignIds.add(campaignId);

        // Execute immediately with force=true
        this.executeCampaignBatch(campaign, true).catch(e => console.error(e));
        
        return { message: "Campaña disparada manualmente." };
    }

    // Helper: Obtener la hora "real" de Argentina
    private getArgentinaDate(): Date {
        const now = new Date();
        const argString = now.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"});
        return new Date(argString);
    }

    private async processPendingCampaigns() {
        try {
            const pendingCampaigns = await db.getPendingCampaigns();
            
            if (pendingCampaigns.length > 0) {
                // Filter out logs to avoid noise, only log real new attempts
                const realPending = pendingCampaigns.filter(c => !this.processingCampaignIds.has(c.id));
                if (realPending.length > 0) {
                    logService.debug(`[CAMPAIGN-HEARTBEAT] Pendientes Reales: ${realPending.length}`);
                }
            }

            for (const campaign of pendingCampaigns) {
                // CRITICAL SAFETY CHECK: Memory Lock
                if (this.processingCampaignIds.has(campaign.id)) {
                    // Campaign is already running in a parallel thread (long batch). SKIP IT.
                    continue; 
                }

                logService.debug(`[CAMPAIGN-DEBUG] Evaluando campaña "${campaign.name}" (Programada: ${campaign.stats.nextRunAt})`);
                
                // 1. Check Operating Window (Hours)
                if (!this.isInOperatingWindow(campaign)) {
                    // Only log to console to avoid spamming DB logs every 10s
                    logService.debug(`[CAMPAIGN-DEBUG] ⏸️ Pausada por horario (Ventana cerrada en ARG).`);
                    continue; 
                }
                
                // LOCK BEFORE STARTING
                this.processingCampaignIds.add(campaign.id);

                // Ejecutar sin await para no bloquear el loop (Normal execution, force=false)
                this.executeCampaignBatch(campaign, false).catch(e => console.error(e));
            }
        } catch (error) {
            logService.error('[CAMPAIGN-SCHEDULER] Error en ciclo de reloj:', error);
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

    private async executeCampaignBatch(campaign: Campaign, force: boolean = false) {
        // Double check lock safety
        if (!this.processingCampaignIds.has(campaign.id)) {
             this.processingCampaignIds.add(campaign.id);
        }
        
        // --- IDEMPOTENCY LAYER: PREVENT DUPLICATE RUNS ON THE SAME DAY ---
        if (!force && campaign.stats.lastRunAt) {
            const lastRunDate = new Date(campaign.stats.lastRunAt).toDateString();
            const todayDate = new Date().toDateString();

            if (lastRunDate === todayDate && campaign.schedule.type !== 'ONCE') {
                logService.warn(`[CAMPAIGN-SAFETY-NET] 🛡️ Bloqueada ejecución duplicada de "${campaign.name}". Ya se ejecutó hoy.`, campaign.userId);
                
                // Reschedule for next valid day to avoid getting stuck
                const nextRun = this.calculateNextRun(campaign);
                await db.updateCampaign(campaign.id, { stats: { ...campaign.stats, nextRunAt: nextRun } });

                this.processingCampaignIds.delete(campaign.id);
                return; // ABORT EXECUTION
            }
        }
        // --- END IDEMPOTENCY LAYER ---

        try {
            const socket = getSocket(campaign.userId);
            
            if (!socket?.user) {
                logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario desconectado.`, campaign.userId);
                return;
            }

            logService.info(`[CAMPAIGN] 🚀 EJECUTANDO CAMPAÑA ${force ? '(FORZADA)' : ''}: ${campaign.name}`, campaign.userId);

            // 1. Resolve Capabilities for Advanced Jitter
            const capabilities = await capabilityResolver.resolve(campaign.userId);
            const jitterFactor = capabilities.variationDepth / 100; // 0.1 to 1.0

            // Need Group Metadata for variable replacement {group_name}
            let groupsMeta: WhatsAppGroup[] = [];
            try {
                groupsMeta = await fetchUserGroups(campaign.userId);
            } catch (e) { 
                logService.warn(`[CAMPAIGN] No se pudieron obtener metadatos de grupos para variables.`, campaign.userId);
            }

            const groups = campaign.groups;
            let sentCount = 0;
            let failedCount = 0;

            for (const groupId of groups) {
                // Double check window inside loop for long batches, UNLESS FORCED
                if (!force && !this.isInOperatingWindow(campaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${campaign.name} por cierre de ventana operativa (ARG).`, campaign.userId);
                    break; 
                }

                try {
                    // 2. Anti-Ban Jitter Logic (Depth Augmented)
                    // Base random delay
                    // If forced, reduce delay significantly to speed up testing but keep minimal safety
                    const minDelay = force ? 2 : campaign.config.minDelaySec;
                    const maxDelay = force ? 5 : campaign.config.maxDelaySec;

                    const baseDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
                    
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
                    logService.debug(`[CAMPAIGN] Enviado a ${groupId} (Delay: ${Math.round(finalDelay)}ms)`);

                } catch (error) {
                    logService.error(`[CAMPAIGN] Fallo envío a ${groupId}`, error, campaign.userId);
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
            logService.info(`[CAMPAIGN] ✅ Campaña ${campaign.name} finalizada. Enviados: ${sentCount}. Prox: ${nextRun || 'Fin'}`, campaign.userId);

        } catch(err) {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        } finally {
            // CRITICAL: ALWAYS RELEASE THE LOCK WHEN DONE
            this.processingCampaignIds.delete(campaign.id);
            logService.debug(`[CAMPAIGN-LOCK] Liberado candado para: ${campaign.name}`);
        }
    }

    private calculateNextRun(campaign: Campaign): string {
        const nowArg = this.getArgentinaDate();
        const type = campaign.schedule.type;

        if (type === 'ONCE') {
            return ''; // An empty nextRunAt for a ONCE campaign effectively stops it.
        }

        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);

        let nextDate = new Date(nowArg);
        nextDate.setHours(targetHour, targetMinute, 0, 0);

        if (type === 'DAILY') {
            // If the calculated time for today is already in the past, schedule for tomorrow.
            if (nextDate <= nowArg) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
        } else if (type === 'WEEKLY' && campaign.schedule.daysOfWeek && campaign.schedule.daysOfWeek.length > 0) {
            let nextRunFound = false;
            // Loop for up to 7 days to find the next valid day in the future.
            for (let i = 0; i < 8; i++) {
                const potentialNextDate = new Date(nowArg);
                potentialNextDate.setDate(nowArg.getDate() + i);
                potentialNextDate.setHours(targetHour, targetMinute, 0, 0);
                
                // Check if this day is a scheduled day AND if the time is in the future.
                if (campaign.schedule.daysOfWeek.includes(potentialNextDate.getDay()) && potentialNextDate > nowArg) {
                    nextDate = potentialNextDate;
                    nextRunFound = true;
                    break; // Found the next valid run time.
                }
            }

            // Fallback if no date was found (shouldn't happen with correct logic, but safe).
            if (!nextRunFound) {
                nextDate.setDate(nextDate.getDate() + 7);
            }
        }

        const year = nextDate.getFullYear();
        const month = nextDate.getMonth();
        const day = nextDate.getDate();
        const hour = nextDate.getHours();
        const min = nextDate.getMinutes();
        
        // Argentina is UTC-3. We must add 3 hours to the local Argentina time to get the correct UTC time.
        const utcDate = new Date(Date.UTC(year, month, day, hour + 3, min, 0));
        
        return utcDate.toISOString();
    }
}

export const campaignService = new CampaignService();
