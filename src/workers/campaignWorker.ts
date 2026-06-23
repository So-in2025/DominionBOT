
import { Worker, Job } from 'bullmq';
import { REDIS_URL } from '../env.js';
import { logService } from '../services/logService.js';
import { campaignService } from '../services/campaignService.js';
import { db } from '../database.js';

// Configuration for Redis connection (BullMQ needs parsed connection options)
const parseRedisUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname,
            port: parseInt(parsed.port || '6379'),
            password: parsed.password || undefined,
            username: parsed.username || undefined,
            tls: parsed.protocol === 'rediss:' ? {} : undefined
        };
    } catch (e) {
        return {
            host: '127.0.0.1',
            port: 6379
        };
    }
};

const redisOptions = parseRedisUrl(REDIS_URL);

// The Worker is the "consumer" that takes jobs from Redis and executes them.
export const initCampaignWorker = () => {
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

            // Execute the heavy lifting
            await campaignService.executeCampaignBatch(campaign, force);

        } catch (error) {
            logService.error(`[WORKER] Fallo en Job ${job.id}`, error, userId);
            throw error; // Throwing triggers BullMQ retry logic
        }

    }, {
        connection: redisOptions,
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

    console.log(`[HYDRA] 🐍 Campaign Worker Online.`);
    return worker;
};
