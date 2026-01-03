
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
    // FIX: Added 'force' parameter to the method signature.
    public async forceExecuteCampaign(campaignId: string, userId: string, force: boolean = false) {
        if (this.processingCampaignIds.has(campaignId)) {
            throw new Error("⚠️ La campaña ya se está ejecutando. Espera a que termine.");
        }

        const campaign = await db.getCampaign(campaignId);
        if (!campaign) throw new Error("Campaña no encontrada");
        if (campaign.userId !== userId) throw new Error("Acceso denegado");

        logService.warn(`[CAMPAIGN] ⚡ EJECUTANDO CAMPAÑA ${force ? '(FORZADA)' : ''}: ${campaign.name}`, userId);
        
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

                // 🛡️ SAFETY LAYER 2: DB Double Check (Prevent Ghost Runs)
                // Re-fetch campaign to ensure 'lastRunAt' hasn't changed since the query started
                const freshCampaign = await db.getCampaign(campaign.id);
                if (!freshCampaign) continue;

                if (freshCampaign.stats.lastRunAt) {
                    const lastRunDate = new Date(freshCampaign.stats.lastRunAt).toDateString();
                    const todayDate = new Date().toDateString();
                    if (lastRunDate === todayDate && freshCampaign.schedule.type !== 'ONCE') {
                        logService.warn(`[CAMPAIGN-SKIP] Omitiendo ${freshCampaign.name}. Ya ejecutada hoy (DB Check).`, freshCampaign.userId);
                        continue;
                    }
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
                this.executeCampaignBatch(campaign, false).catch(e => {
                    console.error(`[CAMPAIGN-CRASH]`, e);
                    this.processingCampaignIds.delete(campaign.id); // Release lock on crash
                });
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

        // 🛡️ PRE-LOCK STRATEGY (CRITICAL FOR SLEEP SAFETY)
        // Mark as "Run Today" BEFORE sending messages.
        // If server crashes mid-batch, it will NOT retry today. Better safe than spam.
        const preLockNextRun = this.calculateNextRun(campaign);
        await db.updateCampaign(campaign.id, {
            stats: {
                ...campaign.stats,
                lastRunAt: new Date().toISOString(), // TIMESTAMPED NOW
                nextRunAt: preLockNextRun // PUSHED TO FUTURE IMMEDIATELY
            },
            // If ONCE, mark as completed immediately to prevent pickup
            status: campaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
        });
        logService.debug(`[CAMPAIGN-LOCK] 🔒 Campaña bloqueada en DB para evitar duplicados.`);

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

            // 5. Update Campaign Stats (Counts only, times were pre-locked)
            // We fetch the latest campaign state again just to be safe about the ID, 
            // but we only update the counters.
            const finalCampaignState = await db.getCampaign(campaign.id);
            if(finalCampaignState) {
                const updates: Partial<Campaign> = {
                    stats: {
                        ...finalCampaignState.stats,
                        totalSent: (finalCampaignState.stats?.totalSent || 0) + sentCount,
                        totalFailed: (finalCampaignState.stats?.totalFailed || 0) + failedCount,
                        // DO NOT UPDATE lastRunAt or nextRunAt HERE. 
                        // They were set at the start to ensure safety.
                    }
                };
                await db.updateCampaign(campaign.id, updates);
            }
            
            logService.info(`[CAMPAIGN] ✅ Campaña ${campaign.name} finalizada. Enviados: ${sentCount}.`, campaign.userId);

        } catch(err) {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        } finally {
            // CRITICAL: ALWAYS RELEASE THE LOCK WHEN DONE
            this.processingCampaignIds.delete(campaign.id);
            logService.debug(`[CAMPAIGN-LOCK] Liberado candado para: ${campaign.name}`);
        }
    }

    /**
     * SMART NEXT RUN CALCULATOR v2
     * Corrects the logic error where campaigns triggered immediately if StartDate was today,
     * ignoring the actual day of week requested.
     */
    public calculateNextRun(campaign: Campaign): string {
        const nowArg = this.getArgentinaDate();
        const type = campaign.schedule.type;

        // --- ONCE: Simple logic ---
        if (type === 'ONCE') {
            // If it's ONCE, strictly follow the startDate + time provided.
            if (!campaign.schedule.startDate) return ''; 
            
            const [hour, minute] = (campaign.schedule.time || "09:00").split(':').map(Number);
            const targetDate = new Date(campaign.schedule.startDate); // StartDate string from UI
            
            // Fix timezone offset issues from UI string to local object
            // Create a date object in ARG time with the specific components
            const scheduledRun = new Date(nowArg);
            scheduledRun.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
            scheduledRun.setHours(hour, minute, 0, 0);

            // If the time has passed, it shouldn't run again if it was 'ONCE'. 
            // But if it's being created now for the past, maybe run immediately? 
            // Logic: If scheduled for past, it won't run.
            return this.convertToUTC(scheduledRun);
        }

        // --- RECURRING (DAILY / WEEKLY) ---
        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);
        
        // 1. Determine the baseline start date. 
        // It must be at least the user-provided startDate, OR "now" if startDate is old.
        const uiStartDate = new Date(campaign.schedule.startDate || nowArg.toISOString());
        
        // Align baseline to ARG timezone components
        let baseline = new Date(nowArg);
        baseline.setFullYear(uiStartDate.getFullYear(), uiStartDate.getMonth(), uiStartDate.getDate());
        baseline.setHours(targetHour, targetMinute, 0, 0);

        // If the user picked a date in the past relative to "now", bring baseline to "now".
        // But keep the time component.
        if (baseline < nowArg) {
            // If the time for today has passed, move baseline to tomorrow?
            // Actually, let the loop find the next valid slot.
            // Reset baseline to "Today at TargetTime"
            baseline = new Date(nowArg);
            baseline.setHours(targetHour, targetMinute, 0, 0);
        }

        // 2. Find the first valid slot starting from baseline
        let nextDate = new Date(baseline);
        let validDateFound = false;

        // Search up to 14 days ahead to be safe
        for (let i = 0; i < 14; i++) {
            // Check if this date is valid (in future AND correct day of week)
            const isFuture = nextDate > nowArg;
            
            let isCorrectDay = true;
            if (type === 'WEEKLY' && campaign.schedule.daysOfWeek && campaign.schedule.daysOfWeek.length > 0) {
                isCorrectDay = campaign.schedule.daysOfWeek.includes(nextDate.getDay());
            }

            if (isFuture && isCorrectDay) {
                validDateFound = true;
                break;
            }

            // Move to next day
            nextDate.setDate(nextDate.getDate() + 1);
            // Ensure time is preserved (DST safety)
            nextDate.setHours(targetHour, targetMinute, 0, 0);
        }

        if (!validDateFound) {
            // Fallback: Just add 24h to now to prevent infinite loops or immediate firing
            const safeFallback = new Date(nowArg);
            safeFallback.setDate(safeFallback.getDate() + 1);
            return this.convertToUTC(safeFallback);
        }

        return this.convertToUTC(nextDate);
    }

    private convertToUTC(argDate: Date): string {
        const year = argDate.getFullYear();
        const month = argDate.getMonth();
        const day = argDate.getDate();
        const hour = argDate.getHours();
        const min = argDate.getMinutes();
        
        // Argentina is UTC-3. Add 3 hours to get UTC.
        // NOTE: This assumes the input argDate object represents Local ARG Time values
        return new Date(Date.UTC(year, month, day, hour + 3, min, 0)).toISOString();
    }
}

export const campaignService = new CampaignService();
