
import { db } from '../database.js';
import { Campaign, CampaignStatus, WhatsAppGroup, SocketEvents } from '../types.js';
import { logService } from './logService.js';
import { isSessionConnected, sendMessage, fetchUserGroups } from '../whatsapp/index.js';
import { capabilityResolver } from './capabilityResolver.js'; 
import { redis } from '../redis.js'; 
import { campaignQueue } from '../infrastructure/queues.js'; 
import { socketService } from './socketService.js'; // NEW: Import SocketService

// CONSTANTS FOR LOCAL ARCHITECTURE
const MAX_CONCURRENT_GLOBAL_CAMPAIGNS = 5; 
const LAG_THRESHOLD_MS = 200; 

class CampaignService {
    private isRunning = false;
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    
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

    private checkSystemLoad(): boolean {
        const now = Date.now();
        const delta = now - this.lastTickTime;
        const drift = delta - 10000;
        this.lastTickTime = now;

        if (drift > LAG_THRESHOLD_MS) {
            logService.warn(`[WATCHDOG] 🐢 LAG DETECTADO: ${drift}ms. El nodo está sobrecargado. Saltando ciclo.`, 'SYSTEM');
            return true; 
        }
        return false; 
    }

    public async forceCheck() {
        logService.info('⚡ [CAMPAIGN] Ejecución forzada manual solicitada.', 'SYSTEM');
        await this.processPendingCampaigns();
    }

    public async forceExecuteCampaign(campaignId: string, userId: string, force: boolean = false) {
        const campaign = await db.getCampaign(campaignId);
        if (!campaign) throw new Error("Campaña no encontrada");
        if (campaign.userId !== userId) throw new Error("Acceso denegado");

        // Validate state
        if (campaign.status === 'PAUSED') {
            throw new Error("La campaña está pausada. Actívala antes de forzar su ejecución.");
        }
        if (campaign.status === 'COMPLETED' && campaign.schedule.type === 'ONCE') {
            throw new Error("Esta campaña puntual ya ha sido completada.");
        }

        // Check if already actively executing (fail-fast to prevent queue flooding)
        const isRedisLocked = await redis.exists(`campaign:lock:${campaign.id}`).catch(() => 0);
        if (isRedisLocked) {
            return { message: "La campaña ya se encuentra en ejecución activa.", alreadyRunning: true };
        }

        logService.warn(`[CAMPAIGN] ⚡ ENCOLANDO CAMPAÑA ${force ? '(FORZADA)' : ''}: ${campaign.name}`, userId);
        
        await campaignQueue.add('force-execute', {
            campaignId,
            userId,
            force: true
        }, {
            priority: 1 // High priority
        });
        
        return { message: "Campaña encolada para ejecución inmediata." };
    }

    /**
     * Releases execution lock in both Redis and MongoDB.
     */
    public async releaseLock(campaignId: string): Promise<void> {
        try {
            await redis.del(`campaign:lock:${campaignId}`).catch(() => {});
            await db.releaseCampaignLock(campaignId).catch(() => {});
        } catch (e: any) {
            logService.warn(`[CAMPAIGN] Error al liberar lock de ${campaignId}: ${e?.message}`);
        }
    }

    private async processPendingCampaigns() {
        if (!db.isReady()) return;

        try {
            if (this.checkSystemLoad()) return;

            const systemSettings = await db.getSystemSettings();
            if (systemSettings.isOutboundKillSwitchActive) {
                if (Date.now() % 60000 < 11000) {
                    logService.warn('[KILL-SWITCH] ☢️ SISTEMA DE SALIDA BLOQUEADO GLOBALMENTE.', 'SYSTEM');
                }
                return;
            }

            const pendingCampaigns = await db.getPendingCampaigns();
            
            for (const campaign of pendingCampaigns) {
                // Must be strictly ACTIVE to run on schedule
                if (campaign.status !== 'ACTIVE') continue;

                // Check Redis lock
                const isLocked = await redis.exists(`campaign:lock:${campaign.id}`).catch(() => 0);
                if (isLocked) continue;

                const freshCampaign = await db.getCampaign(campaign.id);
                if (!freshCampaign || freshCampaign.status !== 'ACTIVE') continue;

                // Check MongoDB lease lock to prevent multi-node / multi-worker double queueing
                if (freshCampaign.stats.lockExpiry && new Date(freshCampaign.stats.lockExpiry) > new Date()) {
                    continue;
                }

                if (freshCampaign.stats.lastRunAt) {
                    const lastRunDate = new Date(freshCampaign.stats.lastRunAt).toDateString();
                    const todayDate = new Date().toDateString();
                    if (lastRunDate === todayDate && freshCampaign.schedule.type !== 'ONCE') {
                        continue;
                    }
                }

                if (!this.isInOperatingWindow(campaign)) {
                    continue; 
                }
                
                logService.info(`[SCHEDULER] 🕒 Encolando campaña programada: ${campaign.name}`, campaign.userId);
                
                // Set short-term queue lock
                await redis.set(`campaign:lock:${campaign.id}`, 'QUEUED', 'EX', 60).catch(() => {});
                
                await campaignQueue.add('scheduled-execute', {
                    campaignId: campaign.id,
                    userId: campaign.userId,
                    force: false
                });
            }
        } catch (error) {
            logService.error('[CAMPAIGN-SCHEDULER] Error en ciclo de reloj:', error);
        }
    }

    private isInOperatingWindow(campaign: Campaign): boolean {
        if (!campaign.config.operatingWindow) return true; 
        const now = new Date();
        const currentHour = now.getHours(); 
        const { startHour, endHour } = campaign.config.operatingWindow;
        if (startHour <= endHour) {
            return currentHour >= startHour && currentHour < endHour;
        } else {
            return currentHour >= startHour || currentHour < endHour;
        }
    }

    private processSpintax(text: string): string {
        if (!text) return "";
        return text.replace(/{([^{}]+)}/g, (match, p1) => {
            const options = p1.split('|');
            return options[Math.floor(Math.random() * options.length)];
        });
    }

    /**
     * PUBLIC BUT INTERNAL: Called by Worker
     */
    public async executeCampaignBatch(campaign: Campaign, force: boolean = false, jobId?: string) {
        // --- 1. DUAL ATOMIC LOCKING (Redis NX + MongoDB Lease Lock) ---
        // Prevents dual execution even if Redis restarts, multiple workers trigger, or network partitions occur.
        let redisLockAcquired = false;
        try {
            const res = await redis.set(`campaign:lock:${campaign.id}`, 'LOCKED', 'EX', 600, 'NX');
            redisLockAcquired = (res === 'OK');
        } catch (e) {
            // If Redis is offline or degraded, fallback safely to MongoDB atomic lock
            redisLockAcquired = true;
        }

        if (!redisLockAcquired) {
             logService.warn(`[CAMPAIGN] Skipping ${campaign.name}, already executing in Redis.`, campaign.userId);
             return;
        }

        // Persistent MongoDB atomic lock with lease (10 minutes)
        const lockedCampaign = await db.acquireCampaignLock(campaign.id, 600000, jobId);
        if (!lockedCampaign && db.isReady()) {
            logService.warn(`[CAMPAIGN] Skipping ${campaign.name}, already locked in DB lease.`, campaign.userId);
            await redis.del(`campaign:lock:${campaign.id}`).catch(() => {});
            return;
        }

        // Refresh campaign state from locked document or DB
        const currentCampaign = lockedCampaign || await db.getCampaign(campaign.id) || campaign;

        // Check if campaign was paused or aborted while queued
        if (currentCampaign.status === 'PAUSED' || currentCampaign.status === 'ABORTED') {
            logService.warn(`[CAMPAIGN] Campaña "${currentCampaign.name}" está ${currentCampaign.status}. Abortando ejecución del batch.`, currentCampaign.userId);
            await this.releaseLock(currentCampaign.id);
            return;
        }

        // --- 2. IDEMPOTENCY LAYER ---
        if (!force && currentCampaign.stats.lastRunAt) {
            const lastRunDate = new Date(currentCampaign.stats.lastRunAt).toDateString();
            const todayDate = new Date().toDateString();

            if (lastRunDate === todayDate && currentCampaign.schedule.type !== 'ONCE') {
                logService.warn(`[CAMPAIGN-SAFETY-NET] 🛡️ Bloqueada ejecución duplicada de "${currentCampaign.name}".`, currentCampaign.userId);
                const nextRun = this.calculateNextRun(currentCampaign);
                await db.updateCampaign(currentCampaign.id, { stats: { ...currentCampaign.stats, nextRunAt: nextRun } });
                await this.releaseLock(currentCampaign.id);
                return;
            }
        }

        const preLockNextRun = this.calculateNextRun(currentCampaign);
        
        // UPDATE RUN STATS & SET ACTIVE STATUS (Preserves atomic stats fields)
        await db.updateCampaign(currentCampaign.id, {
            stats: {
                ...currentCampaign.stats,
                lastRunAt: new Date().toISOString(), 
                nextRunAt: preLockNextRun 
            },
            status: currentCampaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
        });
        
        // REAL-TIME UPDATE: Notify client that campaign started
        const startedCampaign = await db.getCampaign(currentCampaign.id);
        if (startedCampaign) socketService.emitToUser(currentCampaign.userId, SocketEvents.CAMPAIGN_UPDATE, startedCampaign);

        try {
            if (!isSessionConnected(currentCampaign.userId)) {
                logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${currentCampaign.name}. Usuario desconectado.`, currentCampaign.userId);
                return;
            }

            const user = await db.getUser(currentCampaign.userId);
            const isYellowState = user?.governance?.systemState === 'WARNING';
            
            if (isYellowState) {
                logService.warn(`[GOVERNANCE] ⚠️ Usuario en ESTADO AMARILLO. Aplicando penalización de velocidad.`, currentCampaign.userId);
            }

            logService.info(`[CAMPAIGN] 🚀 EJECUTANDO BATCH: ${currentCampaign.name}`, currentCampaign.userId);

            const capabilities = await capabilityResolver.resolve(currentCampaign.userId);
            const jitterFactor = capabilities.variationDepth / 100; 

            let groupsMeta: WhatsAppGroup[] = [];
            try {
                groupsMeta = await fetchUserGroups(currentCampaign.userId);
            } catch (e) { 
                logService.warn(`[CAMPAIGN] No se pudieron obtener metadatos de grupos.`, currentCampaign.userId);
            }

            const groups = currentCampaign.groups;
            // Existing successfully sent targets in current execution window (Idempotency)
            const alreadySentGroups = new Set<string>(currentCampaign.stats?.sentGroupIds || []);
            let sentCount = 0;
            let failedCount = 0;
            let consecutiveFailures = 0; 

            for (const groupId of groups) {
                // Check if user paused or cancelled campaign mid-run
                const liveCheck = await db.getCampaign(currentCampaign.id);
                if (liveCheck && (liveCheck.status === 'PAUSED' || liveCheck.status === 'ABORTED')) {
                    logService.info(`[CAMPAIGN] Batch de ${currentCampaign.name} detenido por cambio de estado a ${liveCheck.status}.`, currentCampaign.userId);
                    break;
                }

                // Renew locks (Lease pattern to prevent lock expiration during slow batches)
                await redis.expire(`campaign:lock:${currentCampaign.id}`, 600).catch(() => {});
                await db.renewCampaignLock(currentCampaign.id, 600000).catch(() => {});

                // Idempotency: Skip groups already successfully sent in this batch/retry
                if (alreadySentGroups.has(groupId)) {
                    logService.debug(`[CAMPAIGN-IDEMPOTENCY] Destinatario ${groupId} ya fue procesado en este lote. Saltando.`, currentCampaign.userId);
                    continue;
                }

                if (!force && !this.isInOperatingWindow(currentCampaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${currentCampaign.name} por cierre de ventana operativa.`, currentCampaign.userId);
                    break; 
                }

                if (consecutiveFailures >= 3) {
                    logService.error(`[CAMPAIGN-CIRCUIT-BREAKER] 🛑 CAMPAÑA ABORTADA: ${currentCampaign.name}. 3 fallos consecutivos.`, null, currentCampaign.userId);
                    await db.updateCampaign(currentCampaign.id, { status: 'ABORTED' });
                    break; 
                }

                try {
                    let safeMin = Math.max(30, currentCampaign.config.minDelaySec || 30);
                    let safeMax = Math.max(60, currentCampaign.config.maxDelaySec || 60);

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

                    let finalMessage = currentCampaign.message;
                    if (currentCampaign.config.useSpintax) finalMessage = this.processSpintax(finalMessage);
                    if (finalMessage.includes('{group_name}')) {
                        const gMeta = groupsMeta.find(g => g.id === groupId);
                        const gName = gMeta ? gMeta.subject : "Grupo";
                        finalMessage = finalMessage.replace(/{group_name}/g, gName);
                    }

                    await sendMessage(currentCampaign.userId, groupId, finalMessage, currentCampaign.imageUrl);
                    
                    // Mark group atomically sent for idempotency
                    await db.markCampaignGroupSent(currentCampaign.id, groupId);
                    alreadySentGroups.add(groupId);
                    sentCount++;
                    consecutiveFailures = 0; 

                } catch (error: any) {
                    const isNetworkError = error?.message?.includes('ETIMEDOUT') || error?.message?.includes('Connection Closed');

                    if (isNetworkError) {
                        logService.warn(`[CAMPAIGN] 📉 Fallo de red local al enviar a ${groupId}.`, currentCampaign.userId);
                        await db.markCampaignGroupFailed(currentCampaign.id);
                        failedCount++;
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        logService.error(`[CAMPAIGN] Fallo de envío LÓGICO a ${groupId}`, error, currentCampaign.userId);
                        await db.markCampaignGroupFailed(currentCampaign.id);
                        failedCount++;
                        consecutiveFailures++; 
                    }
                }
            }

            // If recurring, reset the sentGroupIds tracking array so future runs start fresh
            if (currentCampaign.schedule.type !== 'ONCE') {
                await db.resetCampaignSentGroupIds(currentCampaign.id);
            }
            
            // REAL-TIME UPDATE: Notify client of completion stats
            const updatedCampaign = await db.getCampaign(currentCampaign.id);
            if (updatedCampaign) socketService.emitToUser(currentCampaign.userId, SocketEvents.CAMPAIGN_UPDATE, updatedCampaign);

            logService.info(`[CAMPAIGN] ✅ Campaña ${currentCampaign.name} finalizada (Enviados: ${sentCount}).`, currentCampaign.userId);

        } catch(err) {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${currentCampaign.name}`, err, currentCampaign.userId);
            throw err; // Allow worker to catch and handle retry safely
        } finally {
            await this.releaseLock(currentCampaign.id);
        }
    }

    public calculateNextRun(campaign: Campaign): string | undefined {
        const now = new Date();
        const type = campaign.schedule.type;
        const jitterMinutes = Math.floor(Math.random() * 13) + 2; 

        if (type === 'ONCE') {
            if (!campaign.schedule.startDate) return undefined; 
            const [hour, minute] = (campaign.schedule.time || "09:00").split(':').map(Number);
            const targetDate = new Date(campaign.schedule.startDate); 
            targetDate.setHours(hour, minute, 0, 0);
            targetDate.setMinutes(targetDate.getMinutes() + jitterMinutes);
            return targetDate.toISOString();
        }

        const [targetHour, targetMinute] = (campaign.schedule.time || "09:00").split(':').map(Number);
        
        let checkDate = new Date(campaign.schedule.startDate || now);
        if (checkDate < now) checkDate = new Date(now);
        checkDate.setHours(targetHour, targetMinute, 0, 0);

        if (checkDate < now) checkDate.setDate(checkDate.getDate() + 1);
        
        let validDateFound = false;

        for (let i = 0; i < 14; i++) { 
            const isFuture = checkDate > now;
            let isCorrectDay = true;

            if (type === 'WEEKLY' && campaign.schedule.daysOfWeek && campaign.schedule.daysOfWeek.length > 0) {
                isCorrectDay = campaign.schedule.daysOfWeek.includes(checkDate.getDay());
            }

            if (isFuture && isCorrectDay) {
                validDateFound = true;
                break;
            }

            checkDate.setDate(checkDate.getDate() + 1);
            checkDate.setHours(targetHour, targetMinute, 0, 0);
        }

        if (!validDateFound) {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() + 1);
            fallback.setMinutes(fallback.getMinutes() + jitterMinutes);
            return fallback.toISOString();
        }

        checkDate.setMinutes(checkDate.getMinutes() + jitterMinutes);
        return checkDate.toISOString();
    }
}

export const campaignService = new CampaignService();
