
import { Queue } from 'bullmq';
import { REDIS_URL } from '../env.js';
import { logService } from '../services/logService.js';

// Configuration for Redis connection (BullMQ needs parsed connection options)
// We extract host/port from REDIS_URL or pass the URL directly if supported.
const connection = {
    url: REDIS_URL
};

export const campaignQueue = new Queue('campaign-execution', {
    connection: {
        url: REDIS_URL
    },
    defaultJobOptions: {
        attempts: 3, // Retry failed campaigns 3 times
        backoff: {
            type: 'exponential',
            delay: 5000, // Wait 5s, then 10s, then 20s...
        },
        removeOnComplete: 100, // Keep last 100 completed jobs in Redis
        removeOnFail: 500 // Keep last 500 failed jobs for debugging
    }
});

export const aiProcessingQueue = new Queue('ai-processing', {
    connection: {
        url: REDIS_URL
    },
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 50
    }
});

campaignQueue.on('error', (err) => {
    logService.error('[QUEUE] Error en cola de campañas', err);
});

logService.info('[HYDRA] 🐍 Colas de trabajo inicializadas (BullMQ).');
