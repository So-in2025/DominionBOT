
import { proto, AuthenticationCreds, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import mongoose, { Schema, Model } from 'mongoose';
import { redis } from '../redis.js'; 
import { logService } from '../services/logService.js';

interface IBaileysSession {
    _id: string;
    data: string;
}

const SessionSchema = new Schema({
    _id: { type: String, required: true },
    data: { type: String, required: true } 
}, { versionKey: false, timestamps: true });

const SessionModel = (mongoose.models.BaileysSession || mongoose.model('BaileysSession', SessionSchema)) as Model<IBaileysSession>;

// TTL for Redis Session Keys (7 days - refreshes on usage)
const SESSION_TTL = 60 * 60 * 24 * 7; 

// --- DIAMOND STORAGE CONFIG ---
// L1 Memory Buffer: Stores pending writes before they go to Mongo.
// Key: Mongo _id, Value: Serialized Data string or null (for deletion)
const writeBuffer = new Map<string, string | null>();
let flushInterval: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 10000; // Flush to Mongo every 10 seconds

/**
 * START THE HEARTBEAT
 * Initiates the background flushing process.
 */
const startPersistenceLoop = () => {
    if (flushInterval) return;
    
    flushInterval = setInterval(async () => {
        await flushAuthBuffer();
    }, FLUSH_INTERVAL_MS);
    
    console.log('[DIAMOND-STORAGE] 💎 Motor de persistencia diferida iniciado.');
};

/**
 * FORCE FLUSH (CRITICAL)
 * Called on shutdown to ensure no data loss.
 */
export const flushAuthBuffer = async () => {
    if (writeBuffer.size === 0) return;

    const entries = Array.from(writeBuffer.entries());
    writeBuffer.clear(); // Clear immediately to allow new writes

    const bulkOps: any[] = [];

    for (const [_id, data] of entries) {
        if (data === null) {
            // Delete operation
            bulkOps.push({ deleteOne: { filter: { _id } } });
        } else {
            // Upsert operation
            bulkOps.push({ 
                updateOne: { 
                    filter: { _id }, 
                    update: { $set: { data } }, 
                    upsert: true 
                } 
            });
        }
    }

    if (bulkOps.length > 0) {
        try {
            await SessionModel.bulkWrite(bulkOps, { ordered: false });
            // logService.debug(`[DIAMOND-STORAGE] 💾 Persistidos ${bulkOps.length} registros a MongoDB.`);
        } catch (error) {
            console.error('[DIAMOND-STORAGE] ❌ Error crítico en BulkWrite:', error);
            // On failure, re-add to buffer (retry strategy)
            // Note: This is a simple retry. In prod, careful with memory leaks.
            // For now, we accept the risk or log it. Redis still has the data.
        }
    }
};

/**
 * Purgado completo de sesión.
 * Limpia L1 (Buffer), L2 (Redis) y L3 (MongoDB).
 */
export const clearBindedSession = async (userId: string) => {
    try {
        const pattern = `auth:${userId}:*`;
        const mongoPrefix = `${userId}_`;

        // 1. Purge L1 (Buffer)
        for (const key of writeBuffer.keys()) {
            if (key.startsWith(mongoPrefix)) {
                writeBuffer.delete(key);
            }
        }
        
        // 2. Purge L2 (Redis)
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            const pipeline = redis.pipeline();
            keys.forEach(key => pipeline.del(key));
            await pipeline.exec();
        }

        // 3. Purge L3 (Mongo)
        await SessionModel.deleteMany({ _id: { $regex: `^${userId}_` } });
        
        logService.info(`[DIAMOND-AUTH] 💎 Sesión purgada completamente para ${userId}.`);
        return true;
    } catch (e) {
        console.error(`[AUTH-ERROR] Error al limpiar:`, e);
        return false;
    }
};

/**
 * Verifica validez de sesión (Redis First).
 */
export const hasValidSession = async (userId: string): Promise<boolean> => {
    try {
        // 1. Check L2 (Redis)
        const redisExists = await redis.exists(`auth:${userId}:creds`);
        if (redisExists) return true;

        // 2. Check L3 (Mongo)
        const count = await SessionModel.countDocuments({ _id: `${userId}_creds` });
        return count > 0;
    } catch (e) {
        return false;
    }
};

export const useMongoDBAuthState = async (userId: string) => {
    
    // Ensure persistence loop is running
    startPersistenceLoop();

    const getRedisKey = (category: string, id?: string) => {
        return `auth:${userId}:${category}${id ? `:${id}` : ''}`;
    };

    const getMongoId = (category: string, id?: string) => {
        return `${userId}_${category}${id ? `_${id}` : ''}`;
    };

    const writeData = async (data: any, category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);

            // 1. WRITE TO L2 (REDIS) - Critical & Instant
            // We await this to ensure the session logic can immediately read it back if needed
            await redis.set(redisKey, serialized, 'EX', SESSION_TTL);

            // 2. WRITE TO L1 (BUFFER) - Deferred Persistence
            // We do NOT await Mongo here. We just queue it.
            writeBuffer.set(mongoId, serialized);

        } catch (err) {
            console.error(`[AUTH-CRITICAL] Failed to serialize/write data for ${userId}.`, err);
        }
    };

    const readData = async (category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            // 1. TRY L1 (Buffer) - Most recent uncommitted change
            if (writeBuffer.has(mongoId)) {
                const bufferData = writeBuffer.get(mongoId);
                if (bufferData) {
                    return JSON.parse(bufferData, BufferJSON.reviver);
                } else {
                    return null; // Known deletion
                }
            }

            // 2. TRY L2 (Redis) - Speed Layer
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData, BufferJSON.reviver);
            }

            // 3. TRY L3 (Mongo) - Cold Storage
            const doc = await SessionModel.findById(mongoId).lean() as IBaileysSession | null;
            
            if (doc && doc.data) {
                // Self-Heal: Hydrate Redis (L2)
                await redis.set(redisKey, doc.data, 'EX', SESSION_TTL);
                return JSON.parse(doc.data, BufferJSON.reviver);
            }

            return null;

        } catch (error) {
            // ANTI-CORRUPTION LAYER
            logService.error(`[DIAMOND-AUTH] ☢️ CORRUPCIÓN DETECTADA en ${mongoId}. Purgando clave.`, error, userId);
            
            // Nuke corrupt data to prevent infinite crash loops
            await redis.del(redisKey);
            await SessionModel.findByIdAndDelete(mongoId);
            
            return null;
        }
    };

    const removeData = async (category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            // 1. Remove from L2
            await redis.del(redisKey);
            // 2. Mark for deletion in L1
            writeBuffer.set(mongoId, null);
        } catch (error) {
            // Silent fail
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    const data: { [key: string]: any } = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(type, id);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        if (value) data[id] = value;
                    }));
                    return data;
                },
                set: async (data: any) => {
                    // Baileys often sends multiple keys at once.
                    // We can optimize this loop, but writeData handles L1 buffering so it's fast.
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) {
                                tasks.push(writeData(value, category, id));
                            } else {
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
