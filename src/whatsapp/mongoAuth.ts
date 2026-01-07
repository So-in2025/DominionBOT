
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
 * Purgado completo de sesión.
 */
export const clearBindedSession = async (userId: string) => {
    try {
        const pattern = `auth:${userId}:*`;
        const mongoPrefix = `${userId}_`;
        
        // 1. Purge Redis (L2)
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            const pipeline = redis.pipeline();
            keys.forEach(key => pipeline.del(key));
            await pipeline.exec();
        }

        // 2. Purge Mongo (L3)
        await SessionModel.deleteMany({ _id: { $regex: `^${userId}_` } });
        
        logService.info(`[AUTH] 🧹 Sesión limpiada completamente para ${userId}.`);
        return true;
    } catch (e) {
        console.error(`[AUTH-ERROR] Error al limpiar:`, e);
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
    // Clave del éxito: Escribimos en Redis y ESPERAMOS (await) la confirmación.
    // Esto garantiza que Baileys no avance hasta que la llave esté segura en la memoria persistente.
    const writeData = async (data: any, category: string, id?: string) => {
        const redisKey = getRedisKey(category, id);
        const mongoId = getMongoId(category, id);

        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);

            // 1. CRITICAL: Synchronous Write to Redis.
            // Si Redis falla, lanzamos error para detener el proceso y no corromper el estado lógico.
            await redis.set(redisKey, serialized, 'EX', SESSION_TTL);

            // 2. BACKGROUND: Backup to MongoDB.
            // "Fire and Forget". Si Mongo es lento, no frenamos el chat. Redis es la verdad.
            SessionModel.updateOne(
                { _id: mongoId },
                { $set: { data: serialized } },
                { upsert: true }
            ).catch(err => {
                // Solo logueamos advertencia, no rompemos el flujo si Mongo tiene lag.
                // console.warn(`[AUTH-WARN] Fallo backup Mongo para ${mongoId}`, err.message);
            });

        } catch (err) {
            console.error(`[AUTH-CRITICAL] ❌ Fallo escritura Redis para ${userId}.`, err);
            throw err; // Detener Baileys para proteger la integridad criptográfica
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
            // Si falla la lectura, devolvemos null para que Baileys regenere si es posible,
            // o falle controladamente.
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
            // Silent fail is acceptable for deletes
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
                    // Procesamiento atómico de llaves
                    // Usamos Promise.all para paralelizar escrituras a Redis pero esperar a todas.
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
                    // EL BLOQUEO: Esperamos que Redis confirme TODO antes de decirle a Baileys "OK"
                    await Promise.all(tasks);
                }
            }
        },
        // Guardado de credenciales principales (Identity Key, etc)
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
};
