
import { Worker, Job } from 'bullmq';
import { redis } from '../redis.js';
import { logService } from '../services/logService.js';
import { campaignService } from '../services/campaignService.js';
import { db } from '../database.js';

// Singleton worker instance to prevent accidental duplicate workers across imports
let campaignWorkerInstance: Worker | null = null;

// The Worker is the "consumer" that takes jobs from Redis and executes them.
export const initCampaignWorker = (): Worker => {
    if (campaignWorkerInstance) {
        logService.debug('[WORKER] Worker de campañas ya inicializado. Reutilizando instancia singleton.');
        return campaignWorkerInstance;
    }

    const worker = new Worker('campaign-execution', async (job: Job) => {
        const { campaignId, userId, force } = job.data;
        
        logService.debug(`[WORKER] 👷 Procesando Job ${job.id}: Campaña ${campaignId}`, userId);

        try {
            // Re-use the existing logic, but now it runs inside this safe Worker context
            // Note: We access campaignService directly. In a split-process architecture,
            // this would require campaignService to NOT depend on global variables.
            // Since we refactored campaignService to use Redis locks in Phase 1, we are safe!
            
            // Fetch campaign to ensure it exists and is valid
            const campaign = await db.getCampaign(campaignId);
            if (!campaign) {
                logService.warn(`[WORKER] Campaña ${campaignId} no encontrada. Abortando.`, userId);
                return;
            }

            // Status check: Skip processing if user paused or aborted
            if (campaign.status === 'PAUSED' || campaign.status === 'ABORTED') {
                logService.info(`[WORKER] Campaña ${campaignId} está en estado ${campaign.status}. Saltando ejecución del job.`, userId);
                await campaignService.releaseLock(campaignId);
                return;
            }

            // Execute the heavy lifting with jobId passed for lock tracking
            await campaignService.executeCampaignBatch(campaign, force, String(job.id));

        } catch (error: any) {
            logService.error(`[WORKER] Fallo en Job ${job.id}`, error, userId);

            // Separate retriable errors (transient network) from non-retriable (fatal logic/auth)
            const isFatal = error?.message?.includes('Acceso denegado') ||
                            error?.message?.includes('Campaña no encontrada') ||
                            error?.message?.includes('puntual ya ha sido completada');

            if (isFatal) {
                // Do not retry fatal errors
                logService.warn(`[WORKER] Error no reintentable en Job ${job.id}. Cancelando reintentos.`);
                await campaignService.releaseLock(campaignId);
                return;
            }

            throw error; // Throwing triggers BullMQ controlled backoff retry logic
        }

    }, {
        connection: redis as any,
        concurrency: 2, // Allow processing 2 campaigns simultaneously per node
        limiter: {
            max: 10, // Max 10 jobs
            duration: 1000 // per 1 second (Rate Limiting)
        }
    });

    worker.on('completed', (job) => {
        logService.debug(`[WORKER] ✅ Job ${job.id} completado exitosamente.`);
    });

    worker.on('failed', (job, err) => {
        logService.error(`[WORKER] ❌ Job ${job?.id} falló definitivamente: ${err.message}`, err);
    });

    worker.on('error', (err: any) => {
        const isConnError = err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED' || err?.message?.includes('ENOTFOUND') || err?.message?.includes('ECONNREFUSED');
        if (isConnError) {
            return; // Suppress repeated connection noise when Redis is offline
        }
        logService.error('[WORKER] Error en worker', err);
    });

    console.log(`[HYDRA] 🐍 Campaign Worker Online.`);
    campaignWorkerInstance = worker;
    return worker;
};

export async function shutdownCampaignWorker(): Promise<void> {
    if (campaignWorkerInstance) {
        logService.info('[WORKER] Deteniendo Campaign Worker limpiamente...');
        try {
            await campaignWorkerInstance.close();
            campaignWorkerInstance = null;
            logService.info('[WORKER] Campaign Worker cerrado.');
        } catch (e: any) {
            logService.error('[WORKER] Error al cerrar Campaign Worker', e);
        }
    }
}
