
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

let hasLoggedOfflineWarning = false;

const handleQueueError = (queueName: string, err: any) => {
    const isConnError = err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED' || err?.message?.includes('ENOTFOUND') || err?.message?.includes('ECONNREFUSED');
    if (isConnError) {
        if (!hasLoggedOfflineWarning) {
            hasLoggedOfflineWarning = true;
            logService.warn(`[QUEUE] Redis no disponible (${err.code || 'ECONN'}). Las colas BullMQ operan en modo pausado hasta que Redis esté en línea.`);
        }
        return;
    }
    logService.error(`[QUEUE] Error en cola de ${queueName}`, err);
};

campaignQueue.on('error', (err) => {
    handleQueueError('campañas', err);
});

aiProcessingQueue.on('error', (err) => {
    handleQueueError('IA', err);
});

logService.info('[HYDRA] 🐍 Colas de trabajo inicializadas (BullMQ).');

export async function closeQueues(): Promise<void> {
    logService.info('[QUEUE] Cerrando colas BullMQ...');
    try {
        await Promise.all([
            campaignQueue.close().catch(() => {}),
            aiProcessingQueue.close().catch(() => {})
        ]);
        logService.info('[QUEUE] Colas BullMQ cerradas.');
    } catch (e: any) {
        logService.error('[QUEUE] Error cerrando colas', e);
    }
}
