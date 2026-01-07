
import { Redis } from 'ioredis';
import { REDIS_URL } from './env.js';
import { logService } from './services/logService.js';

let redisClient: Redis;

try {
    redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
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
        console.log(`✅ [REDIS] Iron Memory Online (${REDIS_URL.split('@')[1] || 'localhost'})`);
    });

    redisClient.on('error', (err) => {
        // Suppress initial connection errors to avoid console spam if Redis isn't running in dev
        if (process.env.NODE_ENV !== 'development' || !err.message.includes('ECONNREFUSED')) {
            logService.error('[REDIS] Error de conexión', err);
        } else {
            console.warn('[REDIS] ⚠️ No conectado. Asegúrate de que Redis esté corriendo en ' + REDIS_URL);
        }
    });

} catch (error: any) {
    console.error("CRITICAL: Failed to initialize Redis client", error);
    // Fallback mock to prevent crash if redis is missing (degraded mode)
    redisClient = new Redis({ lazyConnect: true }); 
}

export const redis = redisClient;
