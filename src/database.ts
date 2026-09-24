import mongoose, { Schema, Document, Model } from 'mongoose';
import { User, Campaign, Conversation, LogEntry, SystemSettings, RadarSignal, IntentSignal, ConnectionOpportunity, NetworkProfile, Testimonial, DepthBoost } from './types.js';
import { MONGO_URI, IS_PRODUCTION } from './env.js';
import { v4 as uuidv4 } from 'uuid';
import { logService } from './services/logService.js';

// Desactivar buffer commands para evitar cuelgues de 10 segundos cuando Mongo no está conectado
mongoose.set('bufferCommands', false);

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

const UserSchema = new Schema({}, { strict: false });
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

// --- DEFAULT SETTINGS CONSTANTS ---
const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
    supportWhatsappNumber: '549234589',
    logLevel: 'INFO',
    dolarBlueRate: 1450,
    planStandardPriceUSD: 19,
    planSniperPriceUSD: 39,
    planNeuroBoostPriceUSD: 5,
    planStandardTitle: 'Protocolo Standard',
    planSniperTitle: 'Protocolo Sniper',
    planNeuroBoostTitle: 'Inyección de Potencia',
    planStandardDescription: 'El punto de entrada para automatizar tu WhatsApp. Filtra consultas, responde al instante y califica la intención de compra.',
    planSniperDescription: 'La experiencia Dominion completa. Diseñado para ventas de alto valor donde cada detalle importa.',
    planNeuroBoostDescription: 'Potencia cognitiva bajo demanda para momentos críticos. Activa la máxima capacidad de razonamiento.'
};

export const FALLBACK_TESTIMONIALS: Testimonial[] = [
    { _id: 'seed-1' as any, userId: 'system_seed', name: "Martín R.", location: "Buenos Aires", text: "Increíble cómo filtra los curiosos. Mi equipo de ventas ahora solo habla con gente que tiene la tarjeta en la mano.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-2' as any, userId: 'system_seed', name: "Sofía L.", location: "Mendoza", text: "La configuración fue súper fácil. En 10 minutos tenía el bot respondiendo como si fuera yo. El modo 'Sniper' es una locura.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-3' as any, userId: 'system_seed', name: "Carlos G.", location: "Córdoba", text: "Estaba perdiendo el 40% de las ventas por no responder rápido. Dominion se pagó solo en la primera semana.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-4' as any, userId: 'system_seed', name: "Agencia Boost", location: "Rosario", text: "Usamos el Neuro-Boost para un lanzamiento y manejó 500 chats sin transpirar. Una bestia.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-5' as any, userId: 'system_seed', name: "Julián M.", location: "CABA", text: "Lo mejor es que no parece un bot. Mis clientes piensan que tengo una secretaria 24/7.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-6' as any, userId: 'system_seed', name: "Laura V.", location: "Tucumán", text: "El soporte es excelente y la herramienta es muy intuitiva. Me encanta el panel de métricas.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-7' as any, userId: 'system_seed', name: "Esteban K.", location: "Neuquén", text: "Soy inmobiliario y esto me salvó la vida. Filtra a los que solo quieren ver fotos y me pasa a los inversores reales.", isVisible: true, createdAt: new Date().toISOString() },
    { _id: 'seed-8' as any, userId: 'system_seed', name: "TechSolutions", location: "Remote", text: "Integramos el Radar con nuestro CRM y ahora captamos leads de grupos de Facebook y WhatsApp automáticamente.", isVisible: true, createdAt: new Date().toISOString() }
];

class Database {
    public connectionPromise: Promise<void> | null = null;
    private isConnecting: boolean = false;

    // --- ALMACENAMIENTO EN MEMORIA (FALLBACK ROBUSTO PARA DEV / MODO OFFLINE) ---
    private memUsers = new Map<string, User>();
    private memCampaigns = new Map<string, Campaign>();
    private memLogs: LogEntry[] = [];
    private memRadarSignals = new Map<string, RadarSignal>();
    private memIntentSignals = new Map<string, IntentSignal>();
    private memOpportunities = new Map<string, ConnectionOpportunity>();
    private memTestimonials = new Map<string, Testimonial>();
    private memSettings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };
    private memDepthBoosts = new Map<string, DepthBoost>();

    constructor() {
        // Inicializar testimonios en memoria
        FALLBACK_TESTIMONIALS.forEach(t => this.memTestimonials.set(String(t._id || t.name), { ...t }));
        
        if (MONGO_URI) {
            this.connect().catch(() => {});
        }
    }

    public async connect(): Promise<void> {
        if (this.isReady() || this.isConnecting) return;
        this.isConnecting = true;
        console.log('⏳ [DB] Conectando a MongoDB...');
        
        this.connectionPromise = mongoose.connect(MONGO_URI!, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 2
        })
            .then(() => {
                this.isConnecting = false;
                console.log('\x1b[36m✅ [DB] Conexión establecida a la base de datos.\x1b[0m');
            })
            .catch(err => {
                this.isConnecting = false;
                if (IS_PRODUCTION) {
                    console.error("❌ [DB CRITICAL] Error fatal conectando a MongoDB en producción:", err.message);
                    throw err;
                } else {
                    console.error("❌ [DB] Error crítico de conexión a MongoDB. Trabajando en modo degradado/desconectado (Solo dev).", err.message);
                }
            });
        
        await this.connectionPromise.catch(() => {});
    }

    public async close(): Promise<void> {
        try {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close(false);
                console.log('   [DB] Conexión a MongoDB cerrada limpiamente.');
            }
        } catch (e: any) {
            console.error('   [DB] Error al cerrar conexión MongoDB:', e.message);
        }
    }

    isReady() { return mongoose.connection.readyState === 1; }

    // --- Campaign Methods ---
    async getCampaigns(userId: string): Promise<Campaign[]> {
        if (this.isReady()) {
            try {
                return await CampaignModel.find({ userId }).sort({ createdAt: -1 }).lean() as unknown as Campaign[];
            } catch {}
        }
        return Array.from(this.memCampaigns.values())
            .filter(c => c.userId === userId)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    
    async getCampaign(id: string): Promise<Campaign | null> {
        if (this.isReady()) {
            try {
                return await CampaignModel.findOne({ id }).lean() as unknown as Campaign | null;
            } catch {}
        }
        return this.memCampaigns.get(id) || null;
    }

    async createCampaign(campaignData: Campaign): Promise<Campaign> {
        if (this.isReady()) {
            try {
                const newCampaign = new CampaignModel(campaignData);
                await newCampaign.save();
                const obj = newCampaign.toObject() as unknown as Campaign;
                this.memCampaigns.set(obj.id, obj);
                return obj;
            } catch {}
        }
        this.memCampaigns.set(campaignData.id, { ...campaignData });
        return { ...campaignData };
    }

    async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
        if (this.isReady()) {
            try {
                const updated = await CampaignModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean() as unknown as Campaign | null;
                if (updated) this.memCampaigns.set(id, updated);
                return updated;
            } catch {}
        }
        const existing = this.memCampaigns.get(id);
        if (!existing) return null;
        const merged = { ...existing, ...updates };
        this.memCampaigns.set(id, merged);
        return merged;
    }

    async deleteCampaign(id: string): Promise<boolean> {
        if (this.isReady()) {
            try {
                const result = await CampaignModel.deleteOne({ id });
                this.memCampaigns.delete(id);
                return result.deletedCount === 1;
            } catch {}
        }
        const existed = this.memCampaigns.has(id);
        this.memCampaigns.delete(id);
        return existed;
    }

    async deleteAllUserCampaigns(userId: string): Promise<number> {
        let count = 0;
        if (this.isReady()) {
            try {
                const result = await CampaignModel.deleteMany({ userId });
                count = result.deletedCount;
            } catch {}
        }
        for (const [id, c] of this.memCampaigns.entries()) {
            if (c.userId === userId) {
                this.memCampaigns.delete(id);
                count++;
            }
        }
        return count;
    }

    async incrementCampaignStats(id: string, sent: number, failed: number) {
        if (this.isReady()) {
            try {
                await CampaignModel.updateOne({ id }, { $inc: { "stats.totalSent": sent, "stats.totalFailed": failed } });
            } catch {}
        }
        const existing = this.memCampaigns.get(id);
        if (existing) {
            existing.stats = existing.stats || {} as any;
            existing.stats.totalSent = (existing.stats.totalSent || 0) + sent;
            existing.stats.totalFailed = (existing.stats.totalFailed || 0) + failed;
        }
    }

    async acquireCampaignLock(id: string, leaseMs: number = 600000, jobId?: string): Promise<Campaign | null> {
        const now = new Date();
        const nowIso = now.toISOString();
        const expiryIso = new Date(now.getTime() + leaseMs).toISOString();

        if (this.isReady()) {
            try {
                const filter = {
                    id,
                    $or: [
                        { "stats.lockExpiry": { $exists: false } },
                        { "stats.lockExpiry": null },
                        { "stats.lockExpiry": { $lte: nowIso } }
                    ]
                };
                const update = {
                    $set: {
                        "stats.lockedAt": nowIso,
                        "stats.lockExpiry": expiryIso,
                        "stats.currentJobId": jobId || 'direct'
                    }
                };
                return await CampaignModel.findOneAndUpdate(filter, update, { new: true }).lean() as unknown as Campaign | null;
            } catch {}
        }

        const camp = this.memCampaigns.get(id);
        if (!camp) return null;
        if (camp.stats?.lockExpiry && camp.stats.lockExpiry > nowIso) return null;

        camp.stats = {
            ...(camp.stats || {} as any),
            lockedAt: nowIso,
            lockExpiry: expiryIso,
            currentJobId: jobId || 'direct'
        };
        return { ...camp };
    }

    async renewCampaignLock(id: string, leaseMs: number = 600000): Promise<boolean> {
        const expiryIso = new Date(Date.now() + leaseMs).toISOString();
        if (this.isReady()) {
            try {
                const result = await CampaignModel.updateOne(
                    { id, "stats.lockExpiry": { $ne: null } },
                    { $set: { "stats.lockExpiry": expiryIso } }
                );
                return result.modifiedCount === 1;
            } catch {}
        }
        const camp = this.memCampaigns.get(id);
        if (camp && camp.stats?.lockExpiry) {
            camp.stats.lockExpiry = expiryIso;
            return true;
        }
        return false;
    }

    async releaseCampaignLock(id: string): Promise<void> {
        if (this.isReady()) {
            try {
                await CampaignModel.updateOne(
                    { id },
                    {
                        $unset: {
                            "stats.lockedAt": 1,
                            "stats.lockExpiry": 1,
                            "stats.currentJobId": 1
                        }
                    }
                );
            } catch {}
        }
        const camp = this.memCampaigns.get(id);
        if (camp && camp.stats) {
            delete (camp.stats as any).lockedAt;
            delete (camp.stats as any).lockExpiry;
            delete (camp.stats as any).currentJobId;
        }
    }

    async markCampaignGroupSent(id: string, groupId: string): Promise<void> {
        if (this.isReady()) {
            try {
                await CampaignModel.updateOne(
                    { id },
                    {
                        $addToSet: { "stats.sentGroupIds": groupId },
                        $inc: { "stats.totalSent": 1 }
                    }
                );
            } catch {}
        }
        const camp = this.memCampaigns.get(id);
        if (camp) {
            camp.stats = camp.stats || {} as any;
            camp.stats.sentGroupIds = camp.stats.sentGroupIds || [];
            if (!camp.stats.sentGroupIds.includes(groupId)) {
                camp.stats.sentGroupIds.push(groupId);
                camp.stats.totalSent = (camp.stats.totalSent || 0) + 1;
            }
        }
    }

    async markCampaignGroupFailed(id: string): Promise<void> {
        if (this.isReady()) {
            try {
                await CampaignModel.updateOne(
                    { id },
                    { $inc: { "stats.totalFailed": 1 } }
                );
            } catch {}
        }
        const camp = this.memCampaigns.get(id);
        if (camp) {
            camp.stats = camp.stats || {} as any;
            camp.stats.totalFailed = (camp.stats.totalFailed || 0) + 1;
        }
    }

    async resetCampaignSentGroupIds(id: string): Promise<void> {
        if (this.isReady()) {
            try {
                await CampaignModel.updateOne(
                    { id },
                    { $set: { "stats.sentGroupIds": [] } }
                );
            } catch {}
        }
        const camp = this.memCampaigns.get(id);
        if (camp && camp.stats) {
            camp.stats.sentGroupIds = [];
        }
    }
    
    async getPendingCampaigns(): Promise<Campaign[]> {
        const now = new Date().toISOString();
        if (this.isReady()) {
            try {
                return await CampaignModel.find({
                    status: 'ACTIVE',
                    'stats.nextRunAt': { $lte: now }
                }).lean() as unknown as Campaign[];
            } catch {}
        }
        return Array.from(this.memCampaigns.values()).filter(c => 
            c.status === 'ACTIVE' && c.stats?.nextRunAt && c.stats.nextRunAt <= now
        );
    }
    
    // --- User Methods ---
    async getUser(id: string): Promise<User | null> { 
        if (this.isReady()) {
            try {
                let user = await UserModel.findOne({ id }).lean() as unknown as User | null; 
                if (!user) {
                    user = await UserModel.findOne({ username: id }).lean() as unknown as User | null;
                }
                if (user) return user;
            } catch {}
        }
        // In-memory lookup
        if (this.memUsers.has(id)) return this.memUsers.get(id) || null;
        for (const u of this.memUsers.values()) {
            if (u.id === id || u.username === id) return u;
        }
        return null;
    }

    async getUserByUsername(username: string): Promise<User | null> {
        if (this.isReady()) {
            try {
                const u = await UserModel.findOne({ username }).lean() as unknown as User | null;
                if (u) return u;
            } catch {}
        }
        for (const u of this.memUsers.values()) {
            if (u.username === username || u.id === username) return u;
        }
        return null;
    }

    async createUser(userData: any): Promise<User> {
        const userObj: User = { ...userData };
        if (this.isReady()) {
            try {
                const newUser = new UserModel(userData);
                await newUser.save();
                const saved = newUser.toObject() as unknown as User;
                this.memUsers.set(saved.id, saved);
                return saved;
            } catch (err: any) {
                console.warn('[DB] Fallback in-memory for createUser:', err.message);
            }
        }
        this.memUsers.set(userObj.id, userObj);
        return userObj;
    }
    
    async updateUser(id: string, data: any): Promise<User | null> { 
        if (this.isReady()) {
            try {
                const updated = await UserModel.findOneAndUpdate({ id }, { $set: data }, { new: true }).lean() as unknown as User | null; 
                if (updated) {
                    this.memUsers.set(id, updated);
                    return updated;
                }
            } catch {}
        }
        const existing = await this.getUser(id);
        if (!existing) return null;
        const merged = { ...existing, ...data };
        this.memUsers.set(existing.id, merged);
        return merged;
    }

    async rawUpdateUser(id: string, updateQuery: any): Promise<User | null> {
        if (this.isReady()) {
            try {
                const updated = await UserModel.findOneAndUpdate({ id }, updateQuery, { new: true }).lean() as unknown as User | null;
                if (updated) {
                    this.memUsers.set(id, updated);
                    return updated;
                }
            } catch {}
        }
        const existing = await this.getUser(id);
        if (!existing) return null;
        if (updateQuery.$set) Object.assign(existing, updateQuery.$set);
        if (updateQuery.$unset) {
            for (const key of Object.keys(updateQuery.$unset)) {
                delete (existing as any)[key];
            }
        }
        this.memUsers.set(existing.id, existing);
        return existing;
    }
    
    async deleteUser(id: string): Promise<boolean> {
        if (this.isReady()) {
            try {
                const result = await UserModel.deleteOne({ id });
                this.memUsers.delete(id);
                return result.deletedCount === 1;
            } catch {}
        }
        const existed = this.memUsers.has(id);
        this.memUsers.delete(id);
        return existed;
    }

    async updateUserSettings(id: string, settings: any) { 
        if (this.isReady()) {
            try {
                await UserModel.updateOne({ id }, { $set: { settings } });
            } catch {}
        }
        const user = await this.getUser(id);
        if (user) {
            user.settings = { ...(user.settings || {}), ...settings };
            this.memUsers.set(user.id, user);
        }
    }

    async getAllClients(): Promise<User[]> { 
        if (this.isReady()) {
            try {
                return await UserModel.find({ role: 'client' }).lean() as unknown as User[]; 
            } catch {}
        }
        return Array.from(this.memUsers.values()).filter(u => u.role === 'client');
    }

    async saveUserConversation(userId: string, conversation: Conversation) {
        if (this.isReady()) {
            try {
                const key = `conversations.${sanitizeKey(conversation.id)}`;
                await UserModel.updateOne({ id: userId }, { $set: { [key]: conversation, last_activity_at: new Date().toISOString() } });
            } catch {}
        }
        const user = await this.getUser(userId);
        if (user) {
            user.conversations = user.conversations || {};
            user.conversations[conversation.id] = conversation;
            user.last_activity_at = new Date().toISOString();
            this.memUsers.set(user.id, user);
        }
        return null;
    }

    async getUserConversations(userId: string): Promise<Conversation[]> { 
        const user = await this.getUser(userId);
        return user && user.conversations ? Object.values(user.conversations) : [];
    }

    async saveUserConversationsBatch(userId: string, updates: any) {
        if (this.isReady()) {
            try {
                const setOps: any = {};
                for(const [jid, conv] of Object.entries(updates)) {
                    setOps[`conversations.${sanitizeKey(jid)}`] = conv;
                }
                setOps.last_activity_at = new Date().toISOString();
                await UserModel.updateOne({ id: userId }, { $set: setOps });
            } catch {}
        }
        const user = await this.getUser(userId);
        if (user) {
            user.conversations = user.conversations || {};
            for (const [jid, conv] of Object.entries(updates)) {
                user.conversations[jid] = conv as Conversation;
            }
            user.last_activity_at = new Date().toISOString();
            this.memUsers.set(user.id, user);
        }
        return null;
    }

    async createLog(entry: LogEntry) { 
        if (this.isReady()) {
            try {
                return await LogModel.create(entry); 
            } catch {}
        }
        this.memLogs.unshift(entry);
        if (this.memLogs.length > 500) this.memLogs.pop();
        return entry;
    }
    
    async getLogs(limit: number = 100): Promise<LogEntry[]> {
        if (this.isReady()) {
            try {
                return await LogModel.find().sort({ timestamp: -1 }).limit(limit).lean() as unknown as LogEntry[];
            } catch {}
        }
        return this.memLogs.slice(0, limit);
    }
    
    async getSystemSettings(): Promise<SystemSettings> { 
        if (this.isReady()) {
            try {
                const data = await SystemSettingsModel.findOne({ id: 'global' }).lean();
                return { ...DEFAULT_SYSTEM_SETTINGS, ...(data || {}) } as unknown as SystemSettings; 
            } catch {}
        }
        return { ...this.memSettings };
    }
    
    async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings | null> {
        if (this.isReady()) {
            try {
                const updated = await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: updates }, { new: true, upsert: true }).lean() as unknown as SystemSettings | null;
                if (updated) {
                    this.memSettings = { ...DEFAULT_SYSTEM_SETTINGS, ...updated };
                    return this.memSettings;
                }
            } catch {}
        }
        this.memSettings = { ...this.memSettings, ...updates };
        return this.memSettings;
    }
    
    async resetSystem() {
        this.memCampaigns.clear();
        this.memLogs = [];
        this.memRadarSignals.clear();
        this.memIntentSignals.clear();
        this.memOpportunities.clear();
        for (const u of this.memUsers.values()) {
            u.conversations = {};
        }
        if (this.isReady() && MONGO_URI && MONGO_URI.includes('cluster0')) { 
            try {
                await Promise.all([
                    CampaignModel.deleteMany({}),
                    LogModel.deleteMany({}),
                    RadarSignalModel.deleteMany({}),
                    IntentSignalModel.deleteMany({}),
                    ConnectionOpportunityModel.deleteMany({}),
                    UserModel.updateMany({}, { $set: { conversations: {} } }) 
                ]);
            } catch {}
        }
    }
    
    // --- RADAR METHODS ---
    async getRadarSettings(userId: string) { 
        const user = await this.getUser(userId);
        return user?.radar || { isEnabled: false, monitoredGroups: [], keywordsInclude: [], keywordsExclude: [] };
    }
    
    async updateRadarSettings(userId: string, settings: any) {
        if (this.isReady()) {
            try {
                await UserModel.updateOne({ id: userId }, { $set: { radar: settings } });
            } catch {}
        }
        const user = await this.getUser(userId);
        if (user) {
            user.radar = settings;
            this.memUsers.set(user.id, user);
        }
    }

    async createRadarSignal(signal: RadarSignal) { 
        if (this.isReady()) {
            try {
                return await RadarSignalModel.create(signal); 
            } catch {}
        }
        this.memRadarSignals.set(signal.id, signal);
        return signal;
    }
    
    async getUserRadarSignals(userId: string, limit: number = 50): Promise<RadarSignal[]> {
        if (this.isReady()) {
            try {
                return await RadarSignalModel.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean() as unknown as RadarSignal[];
            } catch {}
        }
        return Array.from(this.memRadarSignals.values())
            .filter(s => s.userId === userId)
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
            .slice(0, limit);
    }

    async getRecentGroupSignals(groupJid: string, limit: number) { 
        if (this.isReady()) {
            try {
                return await RadarSignalModel.find({ groupJid }).sort({ timestamp: -1 }).limit(limit).lean() as unknown as RadarSignal[]; 
            } catch {}
        }
        return Array.from(this.memRadarSignals.values())
            .filter(s => s.groupJid === groupJid)
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
            .slice(0, limit);
    }
    
    async dismissRadarSignal(id: string) {
        if (this.isReady()) {
            try {
                return await RadarSignalModel.updateOne({ id }, { $set: { status: 'DISMISSED' } });
            } catch {}
        }
        const s = this.memRadarSignals.get(id);
        if (s) s.status = 'DISMISSED';
    }

    // --- DEPTH ENGINE ---
    async createDepthBoost(boost: DepthBoost) { 
        if (this.isReady()) {
            try {
                return await DepthBoostModel.create(boost); 
            } catch {}
        }
        this.memDepthBoosts.set(boost.id, boost);
        return boost;
    }

    async getActiveDepthBoosts(userId: string) { 
        const now = new Date().toISOString();
        if (this.isReady()) {
            try {
                return await DepthBoostModel.find({ userId, endsAt: { $gt: now } }).lean() as unknown as DepthBoost[]; 
            } catch {}
        }
        return Array.from(this.memDepthBoosts.values()).filter(b => b.userId === userId && b.endsAt > now);
    }

    async logDepthEvent(userId: string, event: string, details: any) { }
    
    // --- NETWORK METHODS ---
    async getNetworkStats() {
        if (this.isReady()) {
            try {
                const totalSignals = await IntentSignalModel.countDocuments();
                const totalOpportunities = await ConnectionOpportunityModel.countDocuments();
                return { totalSignals, totalOpportunities };
            } catch {}
        }
        return { 
            totalSignals: this.memIntentSignals.size, 
            totalOpportunities: this.memOpportunities.size 
        };
    }

    async getRecentNetworkActivity(limit: number = 10) {
        if (this.isReady()) {
            try {
                return await ConnectionOpportunityModel.find().sort({ createdAt: -1 }).limit(limit).lean();
            } catch {}
        }
        return Array.from(this.memOpportunities.values())
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .slice(0, limit);
    }
    
    async createIntentSignal(signal: IntentSignal) { 
        if (this.isReady()) {
            try {
                return await IntentSignalModel.create(signal); 
            } catch {}
        }
        this.memIntentSignals.set(signal.id, signal);
        return signal;
    }

    async createConnectionOpportunity(opp: ConnectionOpportunity) { 
        if (this.isReady()) {
            try {
                return await ConnectionOpportunityModel.create(opp); 
            } catch {}
        }
        this.memOpportunities.set(opp.id, opp);
        return opp;
    }
    
    async getUserIntentSignals(userId: string) {
        if (this.isReady()) {
            try {
                return await IntentSignalModel.find({ userId }).sort({ contributedAt: -1 }).lean() as unknown as IntentSignal[];
            } catch {}
        }
        return Array.from(this.memIntentSignals.values())
            .filter(s => s.userId === userId)
            .sort((a, b) => (b.contributedAt || '').localeCompare(a.contributedAt || ''));
    }
    
    async getUserOpportunities(userId: string) {
        if (this.isReady()) {
            try {
                return await ConnectionOpportunityModel.find({ receivedByUserId: userId }).sort({ createdAt: -1 }).lean() as unknown as ConnectionOpportunity[];
            } catch {}
        }
        return Array.from(this.memOpportunities.values())
            .filter(o => o.receivedByUserId === userId)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    
    async getOpportunity(id: string) {
        if (this.isReady()) {
            try {
                return await ConnectionOpportunityModel.findOne({ id }).lean() as unknown as ConnectionOpportunity | null;
            } catch {}
        }
        return this.memOpportunities.get(id) || null;
    }
    
    async updateOpportunity(id: string, updates: Partial<ConnectionOpportunity>) {
        if (this.isReady()) {
            try {
                return await ConnectionOpportunityModel.findOneAndUpdate({ id }, { $set: updates }, { new: true });
            } catch {}
        }
        const opp = this.memOpportunities.get(id);
        if (!opp) return null;
        const merged = { ...opp, ...updates };
        this.memOpportunities.set(id, merged);
        return merged;
    }

    // --- TESTIMONIALS ---
    async getTestimonials(onlyVisible: boolean = true): Promise<Testimonial[]> {
        if (this.isReady()) {
            try {
                const query = onlyVisible ? { isVisible: true } : {};
                const list = await TestimonialModel.find(query).sort({ createdAt: -1 }).lean() as unknown as Testimonial[];
                if (list && list.length > 0) return list;
            } catch {}
        }
        const list = Array.from(this.memTestimonials.values())
            .filter(t => !onlyVisible || t.isVisible)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return list.length > 0 ? list : FALLBACK_TESTIMONIALS;
    }

    async createTestimonial(userId: string, name: string, text: string, location?: string): Promise<Testimonial> {
        const item: Testimonial = {
            _id: ('test-' + uuidv4()) as any,
            userId,
            name,
            text,
            location,
            isVisible: true,
            createdAt: new Date().toISOString()
        };
        if (this.isReady()) {
            try {
                const newTestimonial = new TestimonialModel(item);
                await newTestimonial.save();
                const saved = newTestimonial.toObject() as unknown as Testimonial;
                this.memTestimonials.set(String(saved._id), saved);
                return saved;
            } catch {}
        }
        this.memTestimonials.set(String(item._id), item);
        return item;
    }

    async updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial | null> {
        if (this.isReady()) {
            try {
                const updated = await TestimonialModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: new Date().toISOString() } }, { new: true }).lean() as unknown as Testimonial | null;
                if (updated) {
                    this.memTestimonials.set(id, updated);
                    return updated;
                }
            } catch {}
        }
        const existing = this.memTestimonials.get(id);
        if (!existing) return null;
        const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        this.memTestimonials.set(id, merged);
        return merged;
    }

    async deleteTestimonial(id: string): Promise<boolean> {
        if (this.isReady()) {
            try {
                const result = await TestimonialModel.findByIdAndDelete(id);
                this.memTestimonials.delete(id);
                return !!result;
            } catch {}
        }
        const existed = this.memTestimonials.has(id);
        this.memTestimonials.delete(id);
        return existed;
    }

    // --- SEEDING ---
    async seedTestimonials() {
        if (!this.isReady()) return;
        try {
            const count = await TestimonialModel.countDocuments();
            if (count > 0) return;

            console.log('🌱 [DB] Sembrando testimonios iniciales...');
            for (const t of FALLBACK_TESTIMONIALS) {
                const testimonial = new TestimonialModel({
                    userId: t.userId || 'system_seed',
                    name: t.name,
                    location: t.location,
                    text: t.text,
                    isVisible: true,
                    createdAt: new Date().toISOString()
                });
                await testimonial.save();
            }
            console.log('✅ [DB] Testimonios sembrados correctamente.');
        } catch (e: any) {
            console.warn('[DB] No se pudieron sembrar los testimonios:', e.message);
        }
    }
}

export const db = new Database();
