
import mongoose, { Schema, Document, Model } from 'mongoose';
import { User, Campaign, Conversation, LogEntry, SystemSettings, RadarSignal, IntentSignal, ConnectionOpportunity, NetworkProfile, Testimonial, DepthBoost } from './types.js';
import { MONGO_URI } from './env.js';
import { v4 as uuidv4 } from 'uuid';
import { logService } from './services/logService.js';

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

// --- DEFAULT SETTINGS CONSTANTS ---
const DEFAULT_SYSTEM_SETTINGS: Partial<SystemSettings> = {
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

class Database {
    public connectionPromise: Promise<void> | null = null;

    constructor() {
        if(MONGO_URI) {
            console.log('⏳ [DB] Conectando a MongoDB...');
            this.connectionPromise = mongoose.connect(MONGO_URI)
                .then(() => {
                    console.log('\x1b[36m✅ [DB] Conexión establecida a la base de datos.\x1b[0m');
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
        // Standard Update: Wraps data in $set to prevent overwriting entire document
        return UserModel.findOneAndUpdate({ id }, { $set: data }, { new: true }).lean() as unknown as User | null; 
    }

    // NEW: Raw Update for advanced operations like $unset, $push, etc.
    // FIXES: "The dollar ($) prefixed field '$unset' in '$unset' is not allowed"
    async rawUpdateUser(id: string, updateQuery: any): Promise<User | null> {
        return UserModel.findOneAndUpdate({ id }, updateQuery, { new: true }).lean() as unknown as User | null;
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
        // Merge defaults with stored data to ensure all fields exist
        return { ...DEFAULT_SYSTEM_SETTINGS, ...(data || {}) } as unknown as SystemSettings; 
    }
    
    async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings | null> {
        return await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: updates }, { new: true, upsert: true }).lean() as unknown as SystemSettings | null;
    }
    
    async resetSystem() {
        if (MONGO_URI && MONGO_URI.includes('cluster0')) { 
             await Promise.all([
                 CampaignModel.deleteMany({}),
                 LogModel.deleteMany({}),
                 RadarSignalModel.deleteMany({}),
                 IntentSignalModel.deleteMany({}),
                 ConnectionOpportunityModel.deleteMany({}),
                 UserModel.updateMany({}, { $set: { conversations: {} } }) 
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

    // --- SEEDING ---
    async seedTestimonials() {
        const count = await TestimonialModel.countDocuments();
        if (count > 0) return; // Already seeded

        const SEED_DATA = [
            { name: "Martín R.", location: "Buenos Aires", text: "Increíble cómo filtra los curiosos. Mi equipo de ventas ahora solo habla con gente que tiene la tarjeta en la mano." },
            { name: "Sofía L.", location: "Mendoza", text: "La configuración fue súper fácil. En 10 minutos tenía el bot respondiendo como si fuera yo. El modo 'Sniper' es una locura." },
            { name: "Carlos G.", location: "Córdoba", text: "Estaba perdiendo el 40% de las ventas por no responder rápido. Dominion se pagó solo en la primera semana." },
            { name: "Agencia Boost", location: "Rosario", text: "Usamos el Neuro-Boost para un lanzamiento y manejó 500 chats sin transpirar. Una bestia." },
            { name: "Julián M.", location: "CABA", text: "Lo mejor es que no parece un bot. Mis clientes piensan que tengo una secretaria 24/7." },
            { name: "Laura V.", location: "Tucumán", text: "El soporte es excelente y la herramienta es muy intuitiva. Me encanta el panel de métricas." },
            { name: "Esteban K.", location: "Neuquén", text: "Soy inmobiliario y esto me salvó la vida. Filtra a los que solo quieren ver fotos y me pasa a los inversores reales." },
            { name: "TechSolutions", location: "Remote", text: "Integramos el Radar con nuestro CRM y ahora captamos leads de grupos de Facebook y WhatsApp automáticamente." },
            { name: "VentasClick", location: "La Plata", text: "La función de campañas es muy segura. Mandamos ofertas a 1000 clientes y cero bloqueos." },
            { name: "Roberto F.", location: "San Juan", text: "Simple, potente y efectivo. No tiene vueltas raras. Hace lo que dice que hace." },
            { name: "Ana P.", location: "Mar del Plata", text: "Me gusta que mis datos no se usen para entrenar IA de otros. La privacidad es clave para mi negocio." },
            { name: "Diego S.", location: "Santa Fe", text: "El sistema de 'Shadow Mode' es brillante. La IA hace el trabajo sucio y yo entro solo a cobrar." },
            { name: "Mariana T.", location: "Salta", text: "Probé muchos bots, pero este es el único que entiende el contexto y no responde pavadas." },
            { name: "Lucas R.", location: "Bariloche", text: "Excelente herramienta para temporada alta. Gestionó todos los alquileres mientras yo estaba esquiando." },
            { name: "GlobalTraders", location: "CABA", text: "El análisis de sentimiento del Radar nos da una ventaja competitiva enorme. Sabemos cuándo el mercado está caliente." },
            { name: "Patricia N.", location: "Jujuy", text: "Muy recomendado para emprendedores que están solos y no pueden estar todo el día con el celular." },
            { name: "Fernando A.", location: "San Luis", text: "La inversión es mínima comparada con lo que facturamos extra gracias a la velocidad de respuesta." },
            { name: "Grupo Fenix", location: "Mendoza", text: "La red colaborativa es una gran idea. Hemos intercambiado leads de muy buena calidad." },
            { name: "Clara B.", location: "Entre Ríos", text: "Interfaz súper limpia y fácil de usar. Me siento como en una película de ciencia ficción." },
            { name: "Gonzalo D.", location: "Corrientes", text: "Si vendes servicios high-ticket, necesitas esto. No hay excusa para seguir contestando a mano." }
        ];

        console.log('🌱 [DB] Sembrando testimonios iniciales...');
        for (const t of SEED_DATA) {
            const testimonial = new TestimonialModel({
                userId: 'system_seed',
                name: t.name,
                location: t.location,
                text: t.text,
                isVisible: false, // Hidden by default, Admin must enable
                createdAt: new Date().toISOString()
            });
            await testimonial.save();
        }
        console.log('✅ [DB] 20 Testimonios sembrados correctamente.');
    }
}

export const db = new Database();
