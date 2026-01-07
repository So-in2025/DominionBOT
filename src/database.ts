
import mongoose, { Schema, Document, Model } from 'mongoose';
import { User, Campaign, Conversation, LogEntry, SystemSettings, RadarSignal, IntentSignal, ConnectionOpportunity, NetworkProfile, Testimonial, DepthBoost } from './types.js';
import { MONGO_URI } from './env.js';
import { v4 as uuidv4 } from 'uuid';

export function sanitizeKey(key: string) { return key.replace(/[.$]/g, "_"); }

// --- SCHEMAS ---

const CampaignSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: String,
    name: String,
    message: String,
    imageUrl: String,
    groups: [String],
    status: String,
    schedule: Schema.Types.Mixed,
    config: Schema.Types.Mixed,
    stats: Schema.Types.Mixed,
    createdAt: String
});

const UserSchema = new Schema({}, { strict: false }); // Keep flexible for now
const ConversationSchema = new Schema({}, { strict: false });
const LogSchema = new Schema({ timestamp: String }, { strict: false });
const SystemSettingsSchema = new Schema({}, { strict: false });
const RadarSignalSchema = new Schema({ id: String }, { strict: false });
const IntentSignalSchema = new Schema({ id: String }, { strict: false });
const ConnectionOpportunitySchema = new Schema({ id: String }, { strict: false });
const TestimonialSchema = new Schema({ id: String }, { strict: false });
const DepthBoostSchema = new Schema({ id: String }, { strict: false });

// --- MODELS ---
const CampaignModel = (mongoose.models.Campaign || mongoose.model<any>('Campaign', CampaignSchema)) as Model<any>;
const UserModel = (mongoose.models.User || mongoose.model<any>('User', UserSchema)) as Model<any>;
const LogModel = (mongoose.models.Log || mongoose.model<any>('Log', LogSchema)) as Model<any>;
const SystemSettingsModel = (mongoose.models.SystemSettings || mongoose.model<any>('SystemSettings', SystemSettingsSchema)) as Model<any>;
const RadarSignalModel = (mongoose.models.RadarSignal || mongoose.model<any>('RadarSignal', RadarSignalSchema)) as Model<any>;
const IntentSignalModel = (mongoose.models.IntentSignal || mongoose.model<any>('IntentSignal', IntentSignalSchema)) as Model<any>;
const ConnectionOpportunityModel = (mongoose.models.ConnectionOpportunity || mongoose.model<any>('ConnectionOpportunity', ConnectionOpportunitySchema)) as Model<any>;
const TestimonialModel = (mongoose.models.Testimonial || mongoose.model<any>('Testimonial', TestimonialSchema)) as Model<any>;
const DepthBoostModel = (mongoose.models.DepthBoost || mongoose.model<any>('DepthBoost', DepthBoostSchema)) as Model<any>;

class Database {
    constructor() {
        if(MONGO_URI) mongoose.connect(MONGO_URI).then(() => console.log('MongoDB Connected')).catch(err => console.error("Mongo Error", err));
    }

    isReady() { return mongoose.connection.readyState === 1; }

    // --- Campaign Methods (Full Implementation) ---
    async getCampaigns(userId: string): Promise<Campaign[]> {
        return await CampaignModel.find({ userId }).sort({ createdAt: -1 }).lean() as unknown as Campaign[];
    }
    
    async getCampaign(id: string): Promise<Campaign | null> {
        return await CampaignModel.findOne({ id }).lean() as unknown as Campaign | null;
    }

    async createCampaign(campaignData: Campaign): Promise<Campaign> {
        const newCampaign = new CampaignModel(campaignData);
        await newCampaign.save();
        return newCampaign.toObject() as unknown as Campaign;
    }

    async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
        return await CampaignModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean() as unknown as Campaign | null;
    }

    async deleteCampaign(id: string): Promise<boolean> {
        const result = await CampaignModel.deleteOne({ id });
        return result.deletedCount === 1;
    }

    async deleteAllUserCampaigns(userId: string): Promise<number> {
        const result = await CampaignModel.deleteMany({ userId });
        return result.deletedCount;
    }

    async incrementCampaignStats(id: string, sent: number, failed: number) {
        await CampaignModel.updateOne({ id }, { $inc: { "stats.totalSent": sent, "stats.totalFailed": failed } });
    }
    
    async getPendingCampaigns(): Promise<Campaign[]> {
        const now = new Date().toISOString();
        return await CampaignModel.find({
            status: 'ACTIVE',
            'stats.nextRunAt': { $lte: now }
        }).lean() as unknown as Campaign[];
    }
    
    // --- Other Methods (Stubs/Full) ---
    async getUser(id: string): Promise<User | null> { 
        return UserModel.findOne({ id }).lean() as unknown as User | null; 
    }
    
    async updateUser(id: string, data: any): Promise<User | null> { 
        return UserModel.findOneAndUpdate({ id }, { $set: data }, { new: true }).lean() as unknown as User | null; 
    }
    
    async deleteUser(id: string): Promise<boolean> {
        const result = await UserModel.deleteOne({ id });
        return result.deletedCount === 1;
    }
    async updateUserSettings(id: string, settings: any) { return UserModel.updateOne({ id }, { $set: { settings } }); }
    async getAllClients(): Promise<User[]> { 
        return UserModel.find({ role: 'client' }).lean() as unknown as User[]; 
    }

    async saveUserConversation(userId: string, conversation: Conversation) {
        const key = `conversations.${sanitizeKey(conversation.id)}`;
        return UserModel.updateOne({ id: userId }, { $set: { [key]: conversation, last_activity_at: new Date().toISOString() } });
    }
    async getUserConversations(userId: string): Promise<Conversation[]> { 
        const user = await this.getUser(userId);
        return user && user.conversations ? Object.values(user.conversations) : [];
    }
    async saveUserConversationsBatch(userId: string, updates: any) {
        const setOps: any = {};
        for(const [jid, conv] of Object.entries(updates)) {
            setOps[`conversations.${sanitizeKey(jid)}`] = conv;
        }
        setOps.last_activity_at = new Date().toISOString();
        return UserModel.updateOne({ id: userId }, { $set: setOps });
    }

    async createLog(entry: LogEntry) { return LogModel.create(entry); }
    
    async getLogs(limit: number = 100): Promise<LogEntry[]> {
        return await LogModel.find().sort({ timestamp: -1 }).limit(limit).lean() as unknown as LogEntry[];
    }
    
    async getSystemSettings(): Promise<SystemSettings> { 
        const data = await SystemSettingsModel.findOne({ id: 'global' }).lean();
        // FIX: Return a default object cast as SystemSettings to avoid 'Property does not exist on type {}' error
        return (data || {}) as unknown as SystemSettings; 
    }
    
    async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings | null> {
        return await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: updates }, { new: true, upsert: true }).lean() as unknown as SystemSettings | null;
    }
    
    async getRadarSettings(userId: string) { 
        const user = await this.getUser(userId);
        return user?.radar || { isEnabled: false, monitoredGroups: [] };
    }
    async createRadarSignal(signal: RadarSignal) { return RadarSignalModel.create(signal); }
    async getRecentGroupSignals(groupJid: string, limit: number) { return RadarSignalModel.find({ groupJid }).sort({ timestamp: -1 }).limit(limit).lean() as unknown as RadarSignal[]; }
    
    async createDepthBoost(boost: DepthBoost) { return DepthBoostModel.create(boost); }
    async getActiveDepthBoosts(userId: string) { return DepthBoostModel.find({ userId, endsAt: { $gt: new Date().toISOString() } }).lean() as unknown as DepthBoost[]; }
    async logDepthEvent(userId: string, event: string, details: any) { /* implementation */ }
    
    // FIX: Added missing network stats methods.
    async getNetworkStats() {
        const totalSignals = await IntentSignalModel.countDocuments();
        const totalOpportunities = await ConnectionOpportunityModel.countDocuments();
        return { totalSignals, totalOpportunities };
    }
    async getRecentNetworkActivity(limit: number = 10) {
        return ConnectionOpportunityModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    }

    // FIX: Added missing testimonial methods.
    async getTestimonials(onlyVisible: boolean = true): Promise<Testimonial[]> {
        const query = onlyVisible ? { isVisible: true } : {};
        return await TestimonialModel.find(query).sort({ createdAt: -1 }).lean() as unknown as Testimonial[];
    }
    async createTestimonial(userId: string, name: string, text: string, location?: string): Promise<Testimonial> {
        const newTestimonial = new TestimonialModel({
            userId,
            name,
            text,
            location,
            isVisible: false,
            createdAt: new Date().toISOString()
        });
        await newTestimonial.save();
        return newTestimonial.toObject() as unknown as Testimonial;
    }
    async updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial | null> {
        return await TestimonialModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: new Date().toISOString() } }, { new: true }).lean() as unknown as Testimonial | null;
    }
    async deleteTestimonial(id: string): Promise<boolean> {
        const result = await TestimonialModel.findByIdAndDelete(id);
        return !!result;
    }
}

export const db = new Database();
