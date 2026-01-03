
import { db } from '../database.js';
import { Campaign, CampaignStatus, WhatsAppGroup } from '../types.js';
import { logService } from './logService.js';
import { getSocket, sendMessage, fetchUserGroups } from '../whatsapp/client.js';
import { capabilityResolver } from './capabilityResolver.js'; 

// CONSTANTS FOR LOCAL ARCHITECTURE
const MAX_CONCURRENT_GLOBAL_CAMPAIGNS = 2; // LIMIT: Only 2 active campaigns system-wide to preserve Residential IP signature.
const LAG_THRESHOLD_MS = 200; // If event loop lags more than 200ms, pause operations.

class CampaignService {
    private isRunning = false;
    // FIX: Replace NodeJS.Timeout with ReturnType<typeof setInterval> to avoid global namespace issues.
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    // LOCKING MECHANISM: Prevent duplicate execution of the same campaign
    private processingCampaignIds = new Set<string>();
    
    // HARDWARE WATCHDOG STATE
    private lastTickTime: number = 0;

    constructor() {
        this.initScheduler();
    }

    private initScheduler() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTickTime = Date.now();
        
        logService.info('🚀 [CAMPAIGN-SCHEDULER] Motor de Campañas Iniciado (Frecuencia: 10s).');
        
        // Heartbeat: Check every 10 seconds (High Frequency)
        this.checkInterval = setInterval(() => this.processPendingCampaigns(), 10000);
    }

    // WATCHDOG: Check if the system is "gasping"
    private checkSystemLoad(): boolean {
        const now = Date.now();
        const delta = now - this.lastTickTime;
        // Expected delta is ~10000ms. If it's significantly higher, the event loop is blocked.
        const drift = delta - 10000;
        
        this.lastTickTime = now;

        if (drift > LAG_THRESHOLD_MS) {
            logService.warn(`[WATCHDOG] 🐢 LAG DETECTADO: ${drift}ms. El nodo está sobrecargado. Saltando ciclo.`, 'SYSTEM');
            return true; // System is overloaded
        }
        return false; // System is healthy
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

        // GLOBAL GOVERNOR CHECK (Bypass allowed for manual force, but warn)
        if (this.processingCampaignIds.size >= MAX_CONCURRENT_GLOBAL_CAMPAIGNS && !force) {
             throw new Error("⚠️ Tráfico alto en el nodo regional. Intenta en unos minutos.");
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
            // 0. WATCHDOG CHECK
            if (this.checkSystemLoad()) {
                return; // Skip cycle to let CPU recover
            }

            // 0.5 KILL SWITCH CHECK
            const systemSettings = await db.getSystemSettings();
            if (systemSettings.isOutboundKillSwitchActive) {
                // LOG ONLY ONCE per minute to avoid spamming
                if (Date.now() % 60000 < 11000) {
                    logService.warn('[KILL-SWITCH] ☢️ SISTEMA DE SALIDA BLOQUEADO GLOBALMENTE.', 'SYSTEM');
                }
                return;
            }

            // 1. GLOBAL THROTTLE CHECK (The "Traffic Controller")
            // If the local PC is already handling max capacity, do not pick up new jobs.
            // This protects the Residential IP from bursting.
            if (this.processingCampaignIds.size >= MAX_CONCURRENT_GLOBAL_CAMPAIGNS) {
                // Silent return, just wait for next tick
                return;
            }

            const pendingCampaigns = await db.getPendingCampaigns();
            
            if (pendingCampaigns.length > 0) {
                const realPending = pendingCampaigns.filter(c => !this.processingCampaignIds.has(c.id));
                if (realPending.length > 0) {
                    logService.debug(`[CAMPAIGN-HEARTBEAT] Pendientes Reales: ${realPending.length}`);
                }
            }

            for (const campaign of pendingCampaigns) {
                // DOUBLE CHECK INSIDE LOOP (Race condition safety)
                if (this.processingCampaignIds.size >= MAX_CONCURRENT_GLOBAL_CAMPAIGNS) {
                    break; // Stop picking up campaigns for this cycle
                }

                // CRITICAL SAFETY CHECK: Memory Lock
                if (this.processingCampaignIds.has(campaign.id)) {
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
        const preLockNextRun = this.calculateNextRun(campaign);
        await db.updateCampaign(campaign.id, {
            stats: {
                ...campaign.stats,
                lastRunAt: new Date().toISOString(), 
                nextRunAt: preLockNextRun 
            },
            status: campaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
        });
        logService.debug(`[CAMPAIGN-LOCK] 🔒 Campaña bloqueada en DB para evitar duplicados.`);

        try {
            const socket = getSocket(campaign.userId);
            
            if (!socket?.user) {
                logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario desconectado.`, campaign.userId);
                return;
            }

            // 🔍 GOVERNANCE CHECK: Retrieve User Health before firing
            const user = await db.getUser(campaign.userId);
            const isYellowState = user?.governance?.systemState === 'WARNING';
            
            if (isYellowState) {
                logService.warn(`[GOVERNANCE] ⚠️ Usuario en ESTADO AMARILLO. Aplicando penalización de velocidad.`, campaign.userId);
            }

            logService.info(`[CAMPAIGN] 🚀 EJECUTANDO CAMPAÑA ${force ? '(FORZADA)' : ''}: ${campaign.name}`, campaign.userId);

            // 1. Resolve Capabilities for Advanced Jitter
            const capabilities = await capabilityResolver.resolve(campaign.userId);
            const jitterFactor = capabilities.variationDepth / 100; // 0.1 to 1.0

            let groupsMeta: WhatsAppGroup[] = [];
            try {
                groupsMeta = await fetchUserGroups(campaign.userId);
            } catch (e) { 
                logService.warn(`[CAMPAIGN] No se pudieron obtener metadatos de grupos para variables.`, campaign.userId);
            }

            const groups = campaign.groups;
            let sentCount = 0;
            let failedCount = 0;
            let consecutiveFailures = 0; // CIRCUIT BREAKER COUNTER

            for (const groupId of groups) {
                // Double check window inside loop for long batches, UNLESS FORCED
                if (!force && !this.isInOperatingWindow(campaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${campaign.name} por cierre de ventana operativa (ARG).`, campaign.userId);
                    break; 
                }

                // --- CIRCUIT BREAKER (SAFETY FUSE) ---
                if (consecutiveFailures >= 3) {
                    logService.error(`[CAMPAIGN-CIRCUIT-BREAKER] 🛑 CAMPAÑA ABORTADA: ${campaign.name}. 3 fallos consecutivos detectados. Previniendo bloqueo.`, null, campaign.userId);
                    
                    await db.updateCampaign(campaign.id, { status: 'ABORTED' });

                    if (user) {
                        const newGovernance = { 
                            ...user.governance,
                            systemState: 'WARNING', 
                            riskScore: (user.governance.riskScore || 0) + 20, 
                            accountFlags: [...new Set([...(user.governance.accountFlags || []), 'CIRCUIT_BREAKER_TRIP'])]
                        };
                        await db.updateUser(campaign.userId, { governance: newGovernance as any }); 
                        logService.audit(`[GOVERNANCE] 🛡️ Usuario marcado como WARNING por Circuit Breaker.`, campaign.userId, user.username);
                    }

                    break; // EXIT BATCH IMMEDIATELY
                }
                // -------------------------------------

                try {
                    // 2. Anti-Ban Jitter Logic (Stealth Mode)
                    let safeMin = Math.max(30, campaign.config.minDelaySec || 30);
                    let safeMax = Math.max(60, campaign.config.maxDelaySec || 60);

                    if (isYellowState) {
                        safeMin += 30; 
                        safeMax += 45; 
                    }

                    const minDelay = force ? 2 : safeMin;
                    const maxDelay = force ? 5 : safeMax;

                    const baseDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
                    
                    const variance = Math.random() * (2000 * jitterFactor); 
                    const finalDelay = baseDelay + variance;

                    await new Promise(resolve => setTimeout(resolve, finalDelay));

                    let finalMessage = campaign.message;
                    
                    if (campaign.config.useSpintax) {
                        finalMessage = this.processSpintax(finalMessage);
                    }

                    if (finalMessage.includes('{group_name}')) {
                        const gMeta = groupsMeta.find(g => g.id === groupId);
                        const gName = gMeta ? gMeta.subject : "Grupo";
                        finalMessage = finalMessage.replace(/{group_name}/g, gName);
                    }

                    await sendMessage(campaign.userId, groupId, finalMessage, campaign.imageUrl);
                    sentCount++;
                    consecutiveFailures = 0; // RESET FUSE ON SUCCESS
                    logService.debug(`[CAMPAIGN] Enviado a ${groupId} (Delay: ${Math.round(finalDelay)}ms${isYellowState ? ' [PENALTY]' : ''})`);

                } catch (error: any) {
                    // --- INFRASTRUCTURE IMMUNITY PROTOCOL ---
                    // If error is related to local network failure (ISP issues in Mendoza), 
                    // do NOT count it towards Circuit Breaker (reputation damage).
                    const isNetworkError = 
                        error?.message?.includes('ETIMEDOUT') || 
                        error?.message?.includes('ECONNRESET') || 
                        error?.message?.includes('ENOTFOUND') ||
                        error?.message?.includes('Connection Closed');

                    if (isNetworkError) {
                        logService.warn(`[CAMPAIGN] 📉 Fallo de red local (ISP) al enviar a ${groupId}. Ignorando en RiskScore.`, campaign.userId);
                        // Do NOT increment consecutiveFailures
                        failedCount++;
                        // Add extra delay to allow network to recover
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        // Real application error or block
                        logService.error(`[CAMPAIGN] Fallo de envío LÓGICO a ${groupId}`, error, campaign.userId);
                        failedCount++;
                        consecutiveFailures++; // INCREMENT FUSE
                    }
                }
            }

            // 5. Update Campaign Stats
            const finalCampaignState = await db.getCampaign(campaign.id);
            if(finalCampaignState) {
                const updates: Partial<Campaign> = {
                    stats: {
                        ...finalCampaignState.stats,
                        totalSent: (finalCampaignState.stats?.totalSent || 0) + sentCount,
                        totalFailed: (finalCampaignState.stats?.totalFailed || 0) + failedCount,
                    }
                };
                await db.updateCampaign(campaign.id, updates);
            }
            
            logService.info(`[CAMPAIGN] ✅ Campaña ${campaign.name} finalizada. Enviados: ${sentCount}. Fallos: ${failedCount}`, campaign.userId);

        } catch(err) {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        } finally {
            // CRITICAL: ALWAYS RELEASE THE LOCK WHEN DONE
            this.processingCampaignIds.delete(campaign.id);
            logService.debug(`[CAMPAIGN-LOCK] Liberado candado para: ${campaign.name}`);
        }
    }

    /**
     * SMART NEXT RUN CALCULATOR v2 + TIME JITTER
     * Adds random offset to prevent synchronized spikes.
     */
    public calculateNextRun(campaign: Campaign): string {
        const nowArg = this.getArgentinaDate();
        const type = campaign.schedule.type;

        // TIME JITTER: Add random offset between 2 and 15 minutes.
        // This ensures tenants don't sync up on the exact minute.
        const jitterMinutes = Math.floor(Math.random() * 13) + 2; 

        // --- ONCE: Simple logic ---
        if (type === 'ONCE') {
            if (!campaign.schedule.startDate) return ''; 
            
            const [hour, minute] = (campaign.schedule.time || "09:00").split(':').map(Number);
            const targetDate = new Date(campaign.schedule.startDate); 
            
            const scheduledRun = new Date(nowArg);
            scheduledRun.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
            scheduledRun.setHours(hour, minute, 0, 0);

            // Do NOT apply jitter to ONCE campaigns if they are user-triggered for specific time, 
            // BUT for system health, a small offset is good.
            // Let's add it anyway.
            scheduledRun.setMinutes(scheduledRun.getMinutes() + jitterMinutes);

            return this.convertToUTC(scheduledRun);
        }

        // --- RECURRING (DAILY / WEEKLY) ---
        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);
        
        const uiStartDate = new Date(campaign.schedule.startDate || nowArg.toISOString());
        
        let baseline = new Date(nowArg);
        baseline.setFullYear(uiStartDate.getFullYear(), uiStartDate.getMonth(), uiStartDate.getDate());
        baseline.setHours(targetHour, targetMinute, 0, 0);

        if (baseline < nowArg) {
            baseline = new Date(nowArg);
            baseline.setHours(targetHour, targetMinute, 0, 0);
        }

        let nextDate = new Date(baseline);
        let validDateFound = false;

        for (let i = 0; i < 14; i++) {
            const isFuture = nextDate > nowArg;
            
            let isCorrectDay = true;
            if (type === 'WEEKLY' && campaign.schedule.daysOfWeek && campaign.schedule.daysOfWeek.length > 0) {
                isCorrectDay = campaign.schedule.daysOfWeek.includes(nextDate.getDay());
            }

            if (isFuture && isCorrectDay) {
                validDateFound = true;
                break;
            }

            nextDate.setDate(nextDate.getDate() + 1);
            nextDate.setHours(targetHour, targetMinute, 0, 0);
        }

        if (!validDateFound) {
            const safeFallback = new Date(nowArg);
            safeFallback.setDate(safeFallback.getDate() + 1);
            safeFallback.setMinutes(safeFallback.getMinutes() + jitterMinutes);
            return this.convertToUTC(safeFallback);
        }

        // Apply Jitter to recurring schedule
        nextDate.setMinutes(nextDate.getMinutes() + jitterMinutes);

        return this.convertToUTC(nextDate);
    }

    private convertToUTC(argDate: Date): string {
        const year = argDate.getFullYear();
        const month = argDate.getMonth();
        const day = argDate.getDate();
        const hour = argDate.getHours();
        const min = argDate.getMinutes();
        
        return new Date(Date.UTC(year, month, day, hour + 3, min, 0)).toISOString();
    }
}

export const campaignService = new CampaignService();
