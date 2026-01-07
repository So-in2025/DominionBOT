
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
    public connectionPromise: Promise<void> | null = null;

    constructor() {
        if(MONGO_URI) {
            console.log('⏳ [DB] Conectando a MongoDB...');
            this.connectionPromise = mongoose.connect(MONGO_URI)
                .then(() => {
                    console.log('✅ [DB] Conexión establecida a la base de datos.');
                })
                .catch(err => {
                    console.error("❌ [DB] Error crítico de conexión:", err);
                });
        }
    }

    isReady() { return mongoose.connection.readyState === 1; }

    // --- Campaign Methods ---
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
    
    // --- User Methods ---
    async getUser(id: string): Promise<User | null> { 
        // 1. Try finding by ID (UUID)
        let user = await UserModel.findOne({ id }).lean() as unknown as User | null; 
        
        // 2. Fallback: Try finding by Username (Phone Number) if ID lookup fails
        if (!user) {
            user = await UserModel.findOne({ username: id }).lean() as unknown as User | null;
        }
        return user;
    }

    async getUserByUsername(username: string): Promise<User | null> {
        return await UserModel.findOne({ username }).lean() as unknown as User | null;
    }

    async createUser(userData: any): Promise<User> {
        const newUser = new UserModel(userData);
        await newUser.save();
        return newUser.toObject() as unknown as User;
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
        return (data || {}) as unknown as SystemSettings; 
    }
    
    async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings | null> {
        return await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: updates }, { new: true, upsert: true }).lean() as unknown as SystemSettings | null;
    }
    
    async resetSystem() {
        if (MONGO_URI && MONGO_URI.includes('cluster0')) { // Safety check: only on prod cluster if explicit
             // In a real scenario, be very careful. For this app:
             await Promise.all([
                 CampaignModel.deleteMany({}),
                 LogModel.deleteMany({}),
                 RadarSignalModel.deleteMany({}),
                 IntentSignalModel.deleteMany({}),
                 ConnectionOpportunityModel.deleteMany({}),
                 UserModel.updateMany({}, { $set: { conversations: {} } }) // Clear conversations but keep users
             ]);
        }
    }
    
    // --- RADAR METHODS ---
    async getRadarSettings(userId: string) { 
        const user = await this.getUser(userId);
        return user?.radar || { isEnabled: false, monitoredGroups: [], keywordsInclude: [], keywordsExclude: [] };
    }
    
    async updateRadarSettings(userId: string, settings: any) {
        return UserModel.updateOne({ id: userId }, { $set: { radar: settings } });
    }

    async createRadarSignal(signal: RadarSignal) { return RadarSignalModel.create(signal); }
    
    async getUserRadarSignals(userId: string, limit: number = 50): Promise<RadarSignal[]> {
        return RadarSignalModel.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean() as unknown as RadarSignal[];
    }

    async getRecentGroupSignals(groupJid: string, limit: number) { return RadarSignalModel.find({ groupJid }).sort({ timestamp: -1 }).limit(limit).lean() as unknown as RadarSignal[]; }
    
    async dismissRadarSignal(id: string) {
        return RadarSignalModel.updateOne({ id }, { $set: { status: 'DISMISSED' } });
    }

    // --- DEPTH ENGINE ---
    async createDepthBoost(boost: DepthBoost) { return DepthBoostModel.create(boost); }
    async getActiveDepthBoosts(userId: string) { return DepthBoostModel.find({ userId, endsAt: { $gt: new Date().toISOString() } }).lean() as unknown as DepthBoost[]; }
    async logDepthEvent(userId: string, event: string, details: any) { /* Implementation optional for now */ }
    
    // --- NETWORK METHODS ---
    async getNetworkStats() {
        const totalSignals = await IntentSignalModel.countDocuments();
        const totalOpportunities = await ConnectionOpportunityModel.countDocuments();
        return { totalSignals, totalOpportunities };
    }
    async getRecentNetworkActivity(limit: number = 10) {
        return ConnectionOpportunityModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    }
    
    async createIntentSignal(signal: IntentSignal) { return IntentSignalModel.create(signal); }
    async createConnectionOpportunity(opp: ConnectionOpportunity) { return ConnectionOpportunityModel.create(opp); }
    
    async getUserIntentSignals(userId: string) {
        return IntentSignalModel.find({ userId }).sort({ contributedAt: -1 }).lean() as unknown as IntentSignal[];
    }
    
    async getUserOpportunities(userId: string) {
        return ConnectionOpportunityModel.find({ receivedByUserId: userId }).sort({ createdAt: -1 }).lean() as unknown as ConnectionOpportunity[];
    }
    
    async getOpportunity(id: string) {
        return ConnectionOpportunityModel.findOne({ id }).lean() as unknown as ConnectionOpportunity | null;
    }
    
    async updateOpportunity(id: string, updates: Partial<ConnectionOpportunity>) {
        return ConnectionOpportunityModel.findOneAndUpdate({ id }, { $set: updates }, { new: true });
    }

    // --- TESTIMONIALS ---
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
