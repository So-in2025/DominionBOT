
import { proto, AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import mongoose, { Schema } from 'mongoose';

// Schema to store the session data
const SessionSchema = new Schema({
    _id: String, // sessionId_type_id (e.g. "user123_creds" or "user123_key_sender-key...")
    data: Object // The actual JSON data
}, { strict: false });

// Safely define model to prevent overwrite errors during hot-reload
const SessionModel = mongoose.models.BaileysSession || mongoose.model('BaileysSession', SessionSchema);

export const useMongoDBAuthState = async (collectionName: string) => {
    
    // Helper to read data
    const readData = async (type: string, id: string) => {
        const key = `${collectionName}_${type}_${id}`;
        // Use findOne({ _id: key }) instead of findById for consistent typing
        const doc = await (SessionModel as any).findOne({ _id: key }).exec();
        if (doc && doc.data) {
            return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
        }
        return null;
    };

    // Helper to write data
    const writeData = async (type: string, id: string, data: any) => {
        const key = `${collectionName}_${type}_${id}`;
        const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        // Use findOneAndUpdate for better Mongoose compatibility in this context
        await (SessionModel as any).findOneAndUpdate({ _id: key }, { _id: key, data: serialized }, { upsert: true }).exec();
    };

    // Helper to remove data
    const removeData = async (type: string, id: string) => {
         const key = `${collectionName}_${type}_${id}`;
         // Use findOneAndDelete for consistent behavior
         await (SessionModel as any).findOneAndDelete({ _id: key }).exec();
    };

    const creds: AuthenticationCreds = (await readData('creds', 'me')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    // Use 'any' for the dictionary to bypass strict index signature check TS2537
                    const data: { [key: string]: any } = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(type, id);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        if (value) {
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) {
                                tasks.push(writeData(category, id, value));
                            } else {
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData('creds', 'me', creds);
        }
    };
};
