
import { Redis } from 'ioredis';
import { REDIS_URL } from './env.js';
import { logService } from './services/logService.js';

let redisClient: Redis;

try {
    redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy(times) {
            // Limited retries in degraded mode: don't spam the console/network if it's down.
            if (times > 3) return 30000; // 30s if consistently failing
            return times * 2000;
        },
        reconnectOnError(err) {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                return true;
            }
            return false;
        }
    });

    redisClient.on('connect', () => {
        let redisHost = 'localhost';
        try {
            const parsed = new URL(REDIS_URL);
            redisHost = `${parsed.hostname}:${parsed.port || '6379'}`;
        } catch {
            redisHost = REDIS_URL.includes('@') ? REDIS_URL.split('@')[1] : 'configured-host';
        }
        console.log(`\x1b[35m✅ [REDIS] Iron Memory Online (${redisHost})\x1b[0m`);
    });

    redisClient.on('error', (err: any) => {
        // Suppress DNS/Connection errors to avoid console spam when running in degraded mode
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            // Silently fail or log quietly once
        } else {
            logService.error('[REDIS] Error de conexión', err.message || err);
        }
    });

} catch (error: any) {
    console.error("CRITICAL: Failed to initialize Redis client", error);
    // Fallback mock to prevent crash if redis is missing (degraded mode)
    redisClient = new Redis({ lazyConnect: true }); 
}

export const redis = redisClient;

export function isRedisReady(): boolean {
    return redisClient && redisClient.status === 'ready';
}

export async function closeRedis(): Promise<void> {
    if (!redisClient) return;
    try {
        if (redisClient.status !== 'end') {
            await redisClient.quit().catch(() => redisClient.disconnect());
        }
    } catch {
        try { redisClient.disconnect(); } catch {}
    }
}
