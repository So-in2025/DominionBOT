
import { Queue } from 'bullmq';
import { redis } from '../redis.js';
import { logService } from '../services/logService.js';

export const campaignQueue = new Queue('campaign-execution', {
    connection: redis as any,
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
    connection: redis as any,
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
