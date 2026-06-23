
import { Redis } from 'ioredis';
import { REDIS_URL } from './env.js';
import { logService } from './services/logService.js';

let redisClient: Redis;

try {
    redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy(times) {
            // Limited retries in degraded mode: don't spam the console if it's down.
            if (times > 10) return 60000; // 1 minute if consistently failing
            const delay = Math.min(times * 1000, 5000);
            return delay;
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
        console.log(`\x1b[35m✅ [REDIS] Iron Memory Online (${REDIS_URL.split('@')[1] || 'localhost'})\x1b[0m`);
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
