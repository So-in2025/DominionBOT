
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
import { User, BotSettings, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse, LogEntry, Testimonial, SystemSettings } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { MONGO_URI } from './env.js';
import { clearBindedSession } from './whatsapp/mongoAuth.js'; // Import Session cleaner
import { logService } from './services/logService.js'; // Import logService

const LogSchema = new Schema({
    timestamp: { type: String, required: true, index: true },
    level: { type: String, required: true },
    message: { type: String, required: true },
    userId: { type: String, index: true },
    username: { type: String },
    metadata: { type: Object }
});

const TestimonialSchema = new Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    location: { type: String, required: true },
    text: { type: String, required: true },
}, { timestamps: true });

const SystemSettingsSchema = new Schema({
    id: { type: String, default: 'global', unique: true },
    supportWhatsappNumber: { type: String, default: '' } // Default to empty to detect unconfigured state
});

const UserSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    business_name: { type: String },
    whatsapp_number: { type: String },
    password: { type: String, required: true },
    recoveryKey: { type: String }, 
    role: { type: String, enum: ['super_admin', 'admin', 'client'], default: 'client' },
    
    plan_type: { type: String, enum: ['starter', 'pro'], default: 'starter' },
    plan_status: { type: String, enum: ['active', 'expired', 'suspended', 'trial'], default: 'active' },
    billing_start_date: { type: String, default: () => new Date().toISOString() },
    billing_end_date: { type: String, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    trial_qualified_leads_count: { type: Number, default: 0 },
    
    created_at: { type: String, default: () => new Date().toISOString() },
    last_activity_at: { type: String },
    
    settings: {
        productName: { type: String, default: 'Mi Producto' },
        productDescription: { type: String, default: 'Breve descripción...' },
        priceText: { type: String, default: 'Consultar' },
        ctaLink: { type: String, default: '#' },
        isActive: { type: Boolean, default: true },
        proxyUrl: { type: String, default: '' },
        geminiApiKey: { type: String, default: '' },
        archetype: { type: String, default: PromptArchetype.CONSULTATIVE },
        toneValue: { type: Number, default: 3 },
        rhythmValue: { type: Number, default: 3 },
        intensityValue: { type: Number, default: 3 },
        isWizardCompleted: { type: Boolean, default: false }, // Added for wizard state
        ignoredJids: { type: Array, default: [] }
    },
    conversations: { type: Map, of: Object, default: {} },
    governance: {
        systemState: { type: String, enum: ['ACTIVE', 'WARNING', 'LIMITED', 'SUSPENDED'], default: 'ACTIVE' },
        riskScore: { type: Number, default: 0 },
        updatedAt: { type: String, default: () => new Date().toISOString() },
        auditLogs: { type: Array, default: [] },
        accountFlags: { type: Array, default: [] },
        humanDeviationScore: { type: Number, default: 0 }
    },
}, { minimize: false, timestamps: true });

const UserModel = (mongoose.models.SaaSUser || mongoose.model('SaaSUser', UserSchema)) as Model<any>;
const LogModel = (mongoose.models.LogEntry || mongoose.model('LogEntry', LogSchema)) as Model<LogEntry>;
const TestimonialModel = (mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema)) as Model<Testimonial>;
const SystemSettingsModel = (mongoose.models.SystemSettings || mongoose.model('SystemSettings', SystemSettingsSchema)) as Model<any>;

// --- Test Bot Specifics (Duplicated for clarity) ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net';
// --- END Test Bot Specifics ---

class Database {
  private isInitialized = false;

  isReady() {
      return this.isInitialized && mongoose.connection.readyState === 1;
  }

  async init() {
      if (this.isInitialized) return;
      try {
          console.log("⏳ [DB] Conectando a MongoDB...");
          await mongoose.connect(MONGO_URI, { 
              serverSelectionTimeoutMS: 5000,
              maxPoolSize: 10
          });
          this.isInitialized = true;
          console.log("✅ [DB] Conexión establecida.");
      } catch (e) {
          console.error("❌ [DB] ERROR FATAL DE CONEXIÓN:", e);
          throw e; 
      }
  }

  async dangerouslyResetDatabase() {
      if (!this.isReady()) await this.init();
      try {
          const collections = await mongoose.connection.db.listCollections().toArray();
          for (const collection of collections) {
              if (!collection.name.startsWith('system.')) {
                  await mongoose.connection.db.collection(collection.name).deleteMany({});
              }
          }
          return true;
      } catch (err) { 
          console.error("[DB-RESET-FAIL] Error during database reset:", err);
          return false; 
      }
  }

  async createUser(username: string, password: string, businessName: string, role: any = 'client', intendedUse: any = 'HIGH_TICKET_AGENCY'): Promise<User | null> {
    const existing = await UserModel.findOne({ username });
    if (existing) return null;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();
    const recoveryKey = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const newUserPayload: any = {
        id, username, password: hashedPassword, recoveryKey, role, 
        business_name: businessName,
        whatsapp_number: username,
        plan_type: 'pro', // Start with PRO features
        plan_status: 'trial', // But in a trial state
        billing_start_date: new Date().toISOString(),
        // UPDATE: Trial reduced to 3 days for urgency
        billing_end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), 
        trial_qualified_leads_count: 0,
        created_at: new Date().toISOString(),
        settings: { 
            productName: businessName,
            productDescription: '',
            priceText: 'A convenir',
            ctaLink: '',
            isActive: true, 
            proxyUrl: '',
            geminiApiKey: '',
            archetype: PromptArchetype.CONSULTATIVE, 
            toneValue: 3, 
            rhythmValue: 3, 
            intensityValue: 3,
            isWizardCompleted: false, // Default to false for new users
            ignoredJids: []
        },
        conversations: {},
        governance: { 
            systemState: 'ACTIVE', 
            riskScore: 0, 
            updatedAt: new Date().toISOString(), 
            auditLogs: [],
            accountFlags: [] 
        }
    };
    
    try {
        await UserModel.create(newUserPayload);
        return newUserPayload;
    } catch (err) {
        return null;
    }
  }

  async validateUser(username: string, password: string) {
    if (!this.isInitialized) await this.init();
    
    if (username === '234589' && password === 'dominion2024') {
        return this.getGodModeUser();
    }

    const userDoc = await UserModel.findOne({ username });
    if (!userDoc) return null;
    
    const user = userDoc.toObject();
    const isValid = await bcrypt.compare(password, user.password);
    
    if (isValid) {
        const { password: _, ...safe } = user;
        return safe as unknown as User;
    } 
    return null;
  }

  private getGodModeUser(): User {
      return {
        id: 'master-god-node',
        username: '234589',
        role: 'super_admin',
        plan_type: 'pro',
        plan_status: 'active',
        business_name: 'God Panel',
      } as User;
  }

  async getAllClients() {
      // FIX: Removed `conversations: 0` to ensure conversation data is fetched for dashboard metrics.
      return await UserModel.find({ role: 'client' }, { password: 0, recoveryKey: 0 }).lean();
  }

  async getUser(userId: string): Promise<User | null> {
      if (userId === 'master-god-node') return this.getGodModeUser();
      logService.info(`[DB] [getUser] Attempting to find user with ID: ${userId}`, userId);
      const doc = await UserModel.findOne({ id: userId });
      if (!doc) {
          logService.warn(`[DB] [getUser] User with ID ${userId} NOT found.`, userId);
          return null;
      }
      logService.info(`[DB] [getUser] User with ID ${userId} FOUND. Username: ${doc.username}, Role: ${doc.role}`, userId);
      // Log the conversations map directly from the Mongoose document before converting to plain object
      logService.info(`[DB] [getUser] Raw conversations from DB for ${userId}: ${JSON.stringify(doc.conversations).substring(0, 500)}...`, userId);
      
      // NEW LOG: Explicitly check Elite Bot conversation flags from DB
      if (doc.conversations && doc.conversations[ELITE_BOT_JID]) {
          logService.info(`[DB] [getUser] Elite Bot convo for ${userId} from DB: isTestBotConversation=${doc.conversations[ELITE_BOT_JID].isTestBotConversation}, isMuted=${doc.conversations[ELITE_BOT_JID].isMuted}, isBotActive=${doc.conversations[ELITE_BOT_JID].isBotActive}, status=${doc.conversations[ELITE_BOT_JID].status}`, userId);
      }

      return doc.toObject();
  }
  
  async updateUser(userId: string, updates: Partial<User>) {
      const result = await UserModel.findOneAndUpdate({ id: userId }, { $set: updates }, { new: true });
      return result;
  }

  async deleteUser(userId: string): Promise<boolean> {
      try {
          const result = await UserModel.deleteOne({ id: userId });
          if (result.deletedCount === 1) {
              await clearBindedSession(userId); // Limpiar sesión de WhatsApp asociada
              return true;
          }
          return false;
      } catch (e) {
          console.error(`[DB-DELETE-FAIL] Error deleting user ${userId}:`, e);
          return false;
      }
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
      logService.info(`[DB] [getUserConversations] Fetching conversations for userId: ${userId}`, userId);
      const user = await this.getUser(userId);
      if (!user) {
          logService.warn(`[DB] [getUserConversations] User ${userId} not found, returning empty conversations.`, userId);
          return [];
      }
      logService.info(`[DB] [getUserConversations] User ${userId} retrieved. Conversations Map keys: ${Object.keys(user.conversations || {}).join(', ')}`, userId);
      const conversationsArray = user.conversations ? Object.values(user.conversations) : [];
      logService.info(`[DB] [getUserConversations] Returning ${conversationsArray.length} conversations for ${userId}.`, userId);
      return conversationsArray;
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      const updateKey = `conversations.${conversation.id}`;
      logService.info(`[DB] [saveUserConversation] Saving conversation for userId: ${userId}, updateKey: ${updateKey}. Conversation: ${JSON.stringify(conversation).substring(0, 500)}...`, userId);
      const result = await UserModel.updateOne({ id: userId }, { $set: { [updateKey]: conversation, last_activity_at: new Date().toISOString() } });
      logService.info(`[DB] [saveUserConversation] Update result for ${userId}: matchedCount=${result.matchedCount}, modifiedCount=${result.modifiedCount}.`, userId);
      // Removed SSE event as it was previously commented out.
  }

  async updateUserSettings(userId: string, settings: Partial<BotSettings>) {
      const updatePayload: any = {};
      for (const [key, value] of Object.entries(settings)) {
          updatePayload[`settings.${key}`] = value;
      }
      const result = await UserModel.findOneAndUpdate({ id: userId }, { $set: updatePayload }, { new: true });
      return result?.settings;
  }
  
  // LOGGING METHODS
  async createLog(logEntry: Partial<LogEntry>) {
      await LogModel.create(logEntry);
  }

  async getLogs(limit = 100) {
      return await LogModel.find().sort({ timestamp: -1 }).limit(limit).lean();
  }

  async getGlobalMetrics(): Promise<GlobalMetrics> {
      if (!this.isReady()) return { activeVendors: 0, onlineNodes: 0, globalLeads: 0, hotLeadsTotal: 0, aiRequestsTotal: 0, riskAccountsCount: 0 };
      const activeVendors = await UserModel.countDocuments({ role: 'client' });
      return {
          activeVendors,
          onlineNodes: 1,
          globalLeads: 0,
          hotLeadsTotal: 0,
          aiRequestsTotal: 0,
          riskAccountsCount: await UserModel.countDocuments({ 'governance.riskScore': { $gt: 50 } })
      };
  }
  
  // TESTIMONIAL METHODS
  async createTestimonial(userId: string, name: string, text: string): Promise<Testimonial> {
      const newTestimonial = await TestimonialModel.create({
          userId,
          name,
          location: 'Mendoza',
          text
      });
      return newTestimonial.toObject();
  }

  async getTestimonials(): Promise<Testimonial[]> {
      return await TestimonialModel.find().sort({ createdAt: -1 }).lean();
  }

  // SYSTEM SETTINGS METHODS
  async getSystemSettings(): Promise<SystemSettings> {
      const doc = await SystemSettingsModel.findOne({ id: 'global' });
      if (!doc) {
          // Create default if not exists
          const newSettings = await SystemSettingsModel.create({ id: 'global', supportWhatsappNumber: '' });
          return newSettings.toObject();
      }
      return doc.toObject();
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
      const result = await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: settings }, { new: true, upsert: true });
      return result.toObject();
  }
}

export const db = new Database();
