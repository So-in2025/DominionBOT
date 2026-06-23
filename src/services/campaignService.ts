
import { db } from '../database.js';
import { Campaign, CampaignStatus, WhatsAppGroup, SocketEvents } from '../types.js';
import { logService } from './logService.js';
import { getSocket, sendMessage, fetchUserGroups } from '../whatsapp/client.js';
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
                const isLocked = await redis.exists(`campaign:lock:${campaign.id}`);
                if (isLocked) continue;

                const freshCampaign = await db.getCampaign(campaign.id);
                if (!freshCampaign) continue;

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
                
                await campaignQueue.add('scheduled-execute', {
                    campaignId: campaign.id,
                    userId: campaign.userId,
                    force: false
                });

                await redis.set(`campaign:lock:${campaign.id}`, 'QUEUED', 'EX', 60);
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
    public async executeCampaignBatch(campaign: Campaign, force: boolean = false) {
        // --- IRON MEMORY LOCKING ---
        const lockAcquired = await redis.set(`campaign:lock:${campaign.id}`, 'LOCKED', 'EX', 600, 'NX');
        
        if (!lockAcquired) {
             logService.warn(`[CAMPAIGN] Skipping ${campaign.name}, already executing.`, campaign.userId);
             return;
        }
        
        // --- IDEMPOTENCY LAYER ---
        if (!force && campaign.stats.lastRunAt) {
            const lastRunDate = new Date(campaign.stats.lastRunAt).toDateString();
            const todayDate = new Date().toDateString();

            if (lastRunDate === todayDate && campaign.schedule.type !== 'ONCE') {
                logService.warn(`[CAMPAIGN-SAFETY-NET] 🛡️ Bloqueada ejecución duplicada de "${campaign.name}".`, campaign.userId);
                const nextRun = this.calculateNextRun(campaign);
                await db.updateCampaign(campaign.id, { stats: { ...campaign.stats, nextRunAt: nextRun } });
                await redis.del(`campaign:lock:${campaign.id}`);
                return;
            }
        }

        const preLockNextRun = this.calculateNextRun(campaign);
        
        // UPDATE STATUS TO ACTIVE
        await db.updateCampaign(campaign.id, {
            stats: {
                ...campaign.stats,
                lastRunAt: new Date().toISOString(), 
                nextRunAt: preLockNextRun 
            },
            status: campaign.schedule.type === 'ONCE' ? 'COMPLETED' : 'ACTIVE'
        });
        
        // 🔥 REAL-TIME UPDATE: Notify client that campaign started
        const startedCampaign = await db.getCampaign(campaign.id);
        if(startedCampaign) socketService.emitToUser(campaign.userId, SocketEvents.CAMPAIGN_UPDATE, startedCampaign);

        try {
            const socket = getSocket(campaign.userId);
            
            if (!socket?.user) {
                logService.warn(`[CAMPAIGN] Omitiendo ejecución para ${campaign.name}. Usuario desconectado.`, campaign.userId);
                return;
            }

            const user = await db.getUser(campaign.userId);
            const isYellowState = user?.governance?.systemState === 'WARNING';
            
            if (isYellowState) {
                logService.warn(`[GOVERNANCE] ⚠️ Usuario en ESTADO AMARILLO. Aplicando penalización de velocidad.`, campaign.userId);
            }

            logService.info(`[CAMPAIGN] 🚀 EJECUTANDO BATCH: ${campaign.name}`, campaign.userId);

            const capabilities = await capabilityResolver.resolve(campaign.userId);
            const jitterFactor = capabilities.variationDepth / 100; 

            let groupsMeta: WhatsAppGroup[] = [];
            try {
                groupsMeta = await fetchUserGroups(campaign.userId);
            } catch (e) { 
                logService.warn(`[CAMPAIGN] No se pudieron obtener metadatos de grupos.`, campaign.userId);
            }

            const groups = campaign.groups;
            let sentCount = 0;
            let failedCount = 0;
            let consecutiveFailures = 0; 

            for (const groupId of groups) {
                await redis.expire(`campaign:lock:${campaign.id}`, 600);

                if (!force && !this.isInOperatingWindow(campaign)) {
                    logService.info(`[CAMPAIGN] Pausando batch de ${campaign.name} por cierre de ventana operativa.`, campaign.userId);
                    break; 
                }

                if (consecutiveFailures >= 3) {
                    logService.error(`[CAMPAIGN-CIRCUIT-BREAKER] 🛑 CAMPAÑA ABORTADA: ${campaign.name}. 3 fallos consecutivos.`, null, campaign.userId);
                    await db.updateCampaign(campaign.id, { status: 'ABORTED' });
                    break; 
                }

                try {
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
                    if (campaign.config.useSpintax) finalMessage = this.processSpintax(finalMessage);
                    if (finalMessage.includes('{group_name}')) {
                        const gMeta = groupsMeta.find(g => g.id === groupId);
                        const gName = gMeta ? gMeta.subject : "Grupo";
                        finalMessage = finalMessage.replace(/{group_name}/g, gName);
                    }

                    await sendMessage(campaign.userId, groupId, finalMessage, campaign.imageUrl);
                    sentCount++;
                    consecutiveFailures = 0; 

                } catch (error: any) {
                    const isNetworkError = error?.message?.includes('ETIMEDOUT') || error?.message?.includes('Connection Closed');

                    if (isNetworkError) {
                        logService.warn(`[CAMPAIGN] 📉 Fallo de red local.`, campaign.userId);
                        failedCount++;
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        logService.error(`[CAMPAIGN] Fallo de envío LÓGICO a ${groupId}`, error, campaign.userId);
                        failedCount++;
                        consecutiveFailures++; 
                    }
                }
            }

            await db.incrementCampaignStats(campaign.id, sentCount, failedCount);
            
            // 🔥 REAL-TIME UPDATE: Notify client of completion stats
            const updatedCampaign = await db.getCampaign(campaign.id);
            if(updatedCampaign) socketService.emitToUser(campaign.userId, SocketEvents.CAMPAIGN_UPDATE, updatedCampaign);

            logService.info(`[CAMPAIGN] ✅ Campaña ${campaign.name} finalizada (Enviados: ${sentCount}).`, campaign.userId);

        } catch(err) {
            logService.error(`[CAMPAIGN] Error crítico ejecutando batch de ${campaign.name}`, err, campaign.userId);
        } finally {
            await redis.del(`campaign:lock:${campaign.id}`);
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
