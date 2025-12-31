
import { proto, AuthenticationCreds, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import mongoose, { Schema, Model } from 'mongoose';

interface IBaileysSession {
    _id: string;
    data: string;
}

const SessionSchema = new Schema({
    _id: { type: String, required: true },
    data: { type: String, required: true } 
}, { versionKey: false, timestamps: true });

const SessionModel = (mongoose.models.BaileysSession || mongoose.model('BaileysSession', SessionSchema)) as Model<IBaileysSession>;

/**
 * Purgado completo de sesión. 
 * Se usa para resetear el estado y permitir una vinculación limpia.
 */
export const clearBindedSession = async (userId: string) => {
    try {
        // Buscamos cualquier registro que empiece con el ID del usuario
        const result = await SessionModel.deleteMany({ _id: { $regex: `^${userId}_` } });
        console.log(`[AUTH-CLEAN] Sesión purgada para ${userId}.`);
        return true;
    } catch (e) {
        console.error(`[AUTH-ERROR] Error al limpiar:`, e);
        return false;
    }
};

export const useMongoDBAuthState = async (userId: string) => {
    const writeData = async (data: any, id: string) => {
        try {
            const serialized = JSON.stringify(data, BufferJSON.replacer);
            await SessionModel.findByIdAndUpdate(id, { data: serialized }, { upsert: true });
        } catch (err) {
            console.error(`[AUTH-WRITE-ERR]`, err);
        }
    };

    const readData = async (id: string) => {
        try {
            const doc = await SessionModel.findById(id).lean() as IBaileysSession | null;
            if (doc && doc.data) {
                return JSON.parse(doc.data, BufferJSON.reviver);
            }
        } catch (error) {}
        return null;
    };

    const removeData = async (id: string) => {
        try {
            await SessionModel.findByIdAndDelete(id);
        } catch (error) {}
    };

    const credsKey = `${userId}_creds`;
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
