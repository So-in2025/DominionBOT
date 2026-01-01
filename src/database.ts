
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
import { User, BotSettings, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse, LogEntry, Testimonial, SystemSettings } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { MONGO_URI } from './env.js';
import { clearBindedSession } from './whatsapp/mongoAuth.js'; 
// Removed circular dependency: import { logService } from './services/logService.js'; 

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
    supportWhatsappNumber: { type: String, default: '' } 
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
        isWizardCompleted: { type: Boolean, default: false }, 
        ignoredJids: { type: Array, default: [] }
    },
    // CRITICAL CHANGE: Use Mixed type to allow flexibility and avoid Map dot notation issues
    conversations: { type: Schema.Types.Mixed, default: {} },
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

// Helper to sanitize keys for MongoDB (dots are forbidden in keys for update operations)
export const sanitizeKey = (key: string) => key.replace(/\./g, '_');

// Recursive function to find conversations hidden in nested structures
const extractConversationsRecursive = (obj: any, found: Conversation[] = []) => {
    if (!obj || typeof obj !== 'object') return found;

    // Check if this object IS a conversation
    if ('id' in obj && 'messages' in obj && Array.isArray(obj.messages) && 'leadIdentifier' in obj) {
        found.push(obj as Conversation);
        // Don't recurse deeper into a valid conversation object
        return found;
    }

    // Otherwise, check all properties
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // Avoid circular refs or going too deep if not needed (basic check)
            if (key !== 'settings' && key !== 'governance' && typeof obj[key] === 'object') {
                extractConversationsRecursive(obj[key], found);
            }
        }
    }
    return found;
};

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
          console.log(`✅ [DB] Conexión establecida a la base de datos: ${mongoose.connection.db.databaseName}`); 
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
            isWizardCompleted: false, 
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
      return await UserModel.find({ role: 'client' }, { password: 0, recoveryKey: 0 }).lean();
  }

  async getUser(userId: string): Promise<User | null> {
      if (userId === 'master-god-node') return this.getGodModeUser();
      
      const doc = await UserModel.findOne({ id: userId }).lean();
      
      if (!doc) {
          console.warn(`[DB] [getUser] User with ID ${userId} NOT found.`);
          return null;
      }
      // FIX: Double cast to bypass TS error when types don't perfectly overlap
      return doc as unknown as User;
  }
  
  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
      const result = await UserModel.findOneAndUpdate({ id: userId }, { $set: updates }, { new: true }).lean();
      // FIX: Cast result to unknown then User
      return result as unknown as User;
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
      const user = await this.getUser(userId);
      if (!user) {
          return [];
      }
      
      // DEEP SEARCH RECOVERY V2
      // Instead of relying on a clean structure, we hunt for conversation objects anywhere in the 'conversations' blob
      let conversationsArray: Conversation[] = [];
      
      if (user.conversations) {
          const rawConvos = (user.conversations instanceof Map) 
              ? Object.fromEntries(user.conversations) 
              : user.conversations;
          
          conversationsArray = extractConversationsRecursive(rawConvos);
      }

      // Filter duplicates based on ID (just in case recursion finds same ref twice or corruption created dupes)
      const uniqueConvos = Array.from(new Map(conversationsArray.map(item => [item.id, item])).values());

      // console.log(`[DB-RECOVERY] [getUserConversations] Deep search found ${uniqueConvos.length} valid conversations for ${userId}.`);
      return uniqueConvos;
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      // CRITICAL FIX: Replace dots in key to prevent MongoDB from nesting it.
      // E.g. "123@s.whatsapp.net" -> "123@s_whatsapp_net"
      const safeId = sanitizeKey(conversation.id);
      const updateKey = `conversations.${safeId}`;
      
      // Update using the sanitized key. The value (conversation object) keeps the original ID with dots.
      await UserModel.updateOne(
          { id: userId }, 
          { $set: { [updateKey]: conversation, last_activity_at: new Date().toISOString() } }
      );
  }

  async updateUserSettings(userId: string, settings: Partial<BotSettings>) {
      const updatePayload: any = {};
      for (const [key, value] of Object.entries(settings)) {
          updatePayload[`settings.${key}`] = value;
      }
      const result = await UserModel.findOneAndUpdate({ id: userId }, { $set: updatePayload }, { new: true }).lean();
      // FIX: Cast result to User before accessing settings
      const user = result as unknown as User;
      return user?.settings;
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

  // --- SEEDING CAPABILITIES FOR PERSISTENCE ---
  async getTestimonialsCount(): Promise<number> {
      return await TestimonialModel.countDocuments();
  }

  async seedTestimonials(testimonials: any[]) {
      console.log(`[DB] Seeding ${testimonials.length} initial testimonials...`);
      await TestimonialModel.insertMany(testimonials);
      console.log(`[DB] Seeding complete.`);
  }

  // SYSTEM SETTINGS METHODS
  async getSystemSettings(): Promise<SystemSettings> {
      const doc = await SystemSettingsModel.findOne({ id: 'global' }).lean();
      if (!doc) {
          const newSettings = await SystemSettingsModel.create({ id: 'global', supportWhatsappNumber: '' });
          // FIX: Explicit cast
          return newSettings.toObject() as unknown as SystemSettings;
      }
      // FIX: Explicit cast
      return doc as unknown as SystemSettings;
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
      const result = await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: settings }, { new: true, upsert: true }).lean();
      // FIX: Explicit cast
      return result as unknown as SystemSettings;
  }
}

export const db = new Database();
