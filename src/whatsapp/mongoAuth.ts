
import { proto, AuthenticationCreds, initAuthCreds, BufferJSON, SignalDataTypeMap } from '@whiskeysockets/baileys';
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

/**
 * Purgado completo de sesión (Optimizado con SCAN).
 * ARREGLO CRÍTICO: Usa 'scanStream' en lugar de 'keys' para evitar el error "too many keys" y el bloqueo del servidor.
 */
export const clearBindedSession = async (userId: string) => {
    if (!userId) {
        console.error('[AUTH-ERROR] Intento de limpiar sesión con userId undefined.');
        return false;
    }

    try {
        const pattern = `auth:${userId}:*`;
        
        // 1. Purge Redis (L2) usando SCAN para evitar bloqueo del Event Loop
        const stream = redis.scanStream({ match: pattern, count: 100 });
        const pipeline = redis.pipeline();
        
        stream.on('data', (keys) => {
            if (keys.length) {
                keys.forEach((key: string) => pipeline.del(key));
            }
        });

        await new Promise((resolve, reject) => {
            stream.on('end', () => resolve(true));
            stream.on('error', (err) => reject(err));
        });

        // Ejecutar borrado en lote si hay llaves pendientes
        await pipeline.exec();

        // 2. Purge Mongo (L3)
        await SessionModel.deleteMany({ _id: { $regex: `^${userId}_` } });
        
        logService.info(`[AUTH] 🧹 Sesión limpiada y saneada para ${userId}.`);
        return true;
    } catch (e) {
        console.error(`[AUTH-ERROR] Error al limpiar sesión:`, e);
        return false;
    }
};

/**
 * Verifica validez de sesión.
 */
export const hasValidSession = async (userId: string): Promise<boolean> => {
    try {
        const redisExists = await redis.exists(`auth:${userId}:creds`);
        if (redisExists) return true;
        
        // Fallback check Mongo
        const count = await SessionModel.countDocuments({ _id: `${userId}_creds` });
        return count > 0;
    } catch (e) {
        return false;
    }
};

export const useMongoDBAuthState = async (userId: string) => {
    
    const getRedisKey = (category: string, id?: string) => {
        return `auth:${userId}:${category}${id ? `:${id}` : ''}`;
    };

    const getMongoId = (category: string, id?: string) => {
        return `${userId}_${category}${id ? `_${id}` : ''}`;
    };

    // --- ZERO LATENCY WRITE STRATEGY (Write-Through) ---
    const writeData = async (data: any, category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);

            // 1. CRITICAL: Synchronous Write to Redis.
            await redis.set(redisKey, serialized, 'EX', SESSION_TTL);

            // 2. BACKGROUND: Backup to MongoDB.
            SessionModel.updateOne(
                { _id: mongoId },
                { $set: { data: serialized } },
                { upsert: true }
            ).catch(err => {
                // console.warn(`[AUTH-WARN] Fallo backup Mongo para ${mongoId}`, err.message);
            });

        } catch (err) {
            console.error(`[AUTH-CRITICAL] ❌ Fallo escritura Redis para ${userId}.`, err);
            throw err;
        }
    };

    const readData = async (category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            // 1. Try Redis (Fastest & Most Up-to-date)
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData, BufferJSON.reviver);
            }

            // 2. Fallback Mongo (Cold Start / Redis Eviction)
            const doc = await SessionModel.findById(mongoId).lean() as IBaileysSession | null;
            if (doc && doc.data) {
                // Self-Heal: Hydrate Redis immediately
                await redis.set(redisKey, doc.data, 'EX', SESSION_TTL);
                return JSON.parse(doc.data, BufferJSON.reviver);
            }

            return null;
        } catch (error) {
            return null;
        }
    };

    const removeData = async (category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);
        try {
            await redis.del(redisKey);
            SessionModel.deleteOne({ _id: mongoId }).exec().catch(() => {});
        } catch (error) {
            // Silent fail
        }
    };

    // Load initial creds
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
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
};
