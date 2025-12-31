import { proto, AuthenticationCreds, AuthenticationState, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import mongoose, { Schema, Model } from 'mongoose';

// Schema robusto para almacenar las llaves de sesión
const SessionSchema = new Schema({
    _id: { type: String, required: true },
    data: { type: String, required: true } // Almacenamos como String (JSON serializado con BufferJSON)
}, { versionKey: false, timestamps: true });

// Fix: explicitly cast to Model<any> to avoid typing conflicts that cause "not callable" or argument errors
const SessionModel = (mongoose.models.BaileysSession || mongoose.model('BaileysSession', SessionSchema)) as Model<any>;

/**
 * Limpia todos los registros de sesión de un usuario específico.
 * Es vital para corregir errores de conexión 405.
 */
export const clearBindedSession = async (userId: string) => {
    try {
        // Buscamos cualquier ID que empiece con el userId seguido de un guión bajo
        // Fix: Typing error resolved by casting SessionModel to Model<any>
        const result = await SessionModel.deleteMany({ _id: new RegExp(`^${userId}_`) });
        console.log(`[AUTH-CLEAN] Purga completada para ${userId}. Documentos eliminados: ${result.deletedCount}`);
        return result.deletedCount > 0;
    } catch (e) {
        console.error(`[AUTH-ERROR] Fallo al limpiar sesión de ${userId}:`, e);
        return false;
    }
};

export const useMongoDBAuthState = async (userId: string) => {
    const writeData = async (data: any, id: string) => {
        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);
            // Fix: findByIdAndUpdate now correctly recognized as a callable method
            await SessionModel.findByIdAndUpdate(id, { data: serialized }, { upsert: true });
        } catch (err) {
            console.error(`[AUTH-WRITE-ERR] ID: ${id}`, err);
        }
    };

    const readData = async (id: string) => {
        try {
            // Fix: findById now correctly recognized as a callable method
            const doc = await SessionModel.findById(id).lean();
            if (doc && doc.data) {
                return JSON.parse(doc.data, BufferJSON.reviver);
            }
        } catch (err) {
            console.error(`[AUTH-READ-ERR] ID: ${id}`, err);
        }
        return null;
    };

    const removeData = async (id: string) => {
        try {
            // Fix: findByIdAndDelete now correctly recognized as a callable method
            await SessionModel.findByIdAndDelete(id);
        } catch (err) {
            console.error(`[AUTH-DEL-ERR] ID: ${id}`, err);
        }
    };

    // Inicializar credenciales o cargar existentes
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
