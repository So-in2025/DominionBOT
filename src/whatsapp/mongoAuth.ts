import { proto, AuthenticationCreds, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import mongoose, { Schema, Model } from 'mongoose';

/**
 * Interfaz para definir la estructura de la sesión en MongoDB
 * Previene errores de "Property 'data' does not exist" durante el build.
 */
interface IBaileysSession {
    _id: string;
    data: string;
}

const SessionSchema = new Schema({
    _id: { type: String, required: true },
    data: { type: String, required: true } 
}, { versionKey: false, timestamps: true });

// Casteo explícito del modelo para evitar ambigüedad en los métodos de búsqueda
const SessionModel = (mongoose.models.BaileysSession || mongoose.model('BaileysSession', SessionSchema)) as Model<IBaileysSession>;

/**
 * Limpia todos los registros de sesión de un usuario específico.
 * Vital para resolver el error 405 (Connection Failure).
 */
export const clearBindedSession = async (userId: string) => {
    try {
        const result = await SessionModel.deleteMany({ _id: new RegExp(`^${userId}_`) });
        console.log(`[AUTH-CLEAN] Purga completada para ${userId}. Documentos eliminados: ${result.deletedCount}`);
        return (result.deletedCount ?? 0) > 0;
    } catch (e) {
        console.error(`[AUTH-ERROR] Fallo al limpiar sesión de ${userId}:`, e);
        return false;
    }
};

export const useMongoDBAuthState = async (userId: string) => {
    const writeData = async (data: any, id: string) => {
        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);
            // findByIdAndUpdate con upsert: true para manejar inserción/actualización atómica
            await SessionModel.findByIdAndUpdate(id, { data: serialized }, { upsert: true });
        } catch (err) {
            console.error(`[AUTH-WRITE-ERR] ID: ${id}`, err);
        }
    };

    const readData = async (id: string) => {
        try {
            // Casting explícito a la interfaz para asegurar acceso a 'data'
            const doc = await SessionModel.findById(id).lean() as IBaileysSession | null;
            if (doc && doc.data) {
                return JSON.parse(doc.data, BufferJSON.reviver);
            }
        } catch (error) {
            console.error(`[AUTH-READ-ERR] ID: ${id}`, error);
        }
        return null;
    };

    const removeData = async (id: string) => {
        try {
            await SessionModel.findByIdAndDelete(id);
        } catch (error) {
            console.error(`[AUTH-DEL-ERR] ID: ${id}`, error);
        }
    };

    // Inicializar credenciales o cargar existentes desde la DB
    const credsKey = `${userId}_creds_me`;
    const existingCreds = await readData(credsKey);
    const creds: AuthenticationCreds = existingCreds || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    const data: { [key: string]: any } = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${userId}_${type}_${id}`);
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
                            const key = `${userId}_${category}_${id}`;
                            if (value) tasks.push(writeData(value, key));
                            else tasks.push(removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, credsKey)
    };
};
