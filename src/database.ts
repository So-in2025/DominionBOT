
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
// FIX: Import LogLevel to use in SystemSettings defaults
import { User, BotSettings, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse, LogEntry, Testimonial, SystemSettings, Campaign, RadarSignal, RadarSettings, GroupMarketMemory, DepthBoost, DepthLog, LogLevel, IntentSignal, ConnectionOpportunity, NetworkProfile, PermissionStatus } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { MONGO_URI } from './env.js';
import { clearBindedSession } from './whatsapp/mongoAuth.js'; 

const LogSchema = new Schema({
    timestamp: { type: String, required: true, index: true },
    level: { type: String, required: true },
    message: { type: String, required: true },
    userId: { type: String, index: true },
    username: { type: String },
    metadata: { type: Object }
});

// DEPTH ENGINE SCHEMAS
const DepthBoostSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    depthDelta: { type: Number, required: true },
    reason: { type: String },
    startsAt: { type: String, required: true },
    endsAt: { type: String, required: true },
    createdBy: { type: String }
});

const DepthLogSchema = new Schema({
    timestamp: { type: String, required: true },
    userId: { type: String, index: true },
    eventType: { type: String, required: true },
    details: { type: Object }
}, { expires: 60 * 60 * 24 * 30 }); // Auto-expire after 30 days

const TestimonialSchema = new Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: false }, // Made optional
    location: { type: String, required: false }, // Made optional
    text: { type: String, required: true },
}, { timestamps: true });

const SystemSettingsSchema = new Schema({
    id: { type: String, default: 'global', unique: true },
    supportWhatsappNumber: { type: String, default: '' },
    // FIX: Add logLevel to schema to persist this setting
    logLevel: { type: String, default: 'INFO' },
    dominionNetworkJid: { type: String, default: '5491110000000@s.whatsapp.net' } // NEW: Default Network JID
});

const RadarSignalSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    groupJid: { type: String, required: true },
    groupName: { type: String },
    senderJid: { type: String, required: true },
    senderName: { type: String },
    messageContent: { type: String },
    timestamp: { type: String },
    
    // Core (v3)
    analysis: {
        score: { type: Number },
        category: { type: String },
        intentType: { type: String, enum: ['SEARCH', 'COMPARISON', 'QUESTION', 'URGENT'] },
        reasoning: { type: String },
        suggestedAction: { type: String }
    },

    // Predictive (v4)
    strategicScore: { type: Number, default: 0 },
    marketContext: {
        momentum: String,
        sentiment: String,
        activeTopics: [String],
        noiseLevel: Number
    },
    predictedWindow: {
        confidenceScore: Number,
        urgencyLevel: String,
        delayRisk: String,
        reasoning: String
    },
    hiddenSignals: [{
        type: { type: String }, 
        description: String,
        intensity: Number
    }],
    actionIntelligence: {
        suggestedEntryType: String,
        communicationFraming: String,
        spamRiskLevel: String,
        recommendedWaitTimeSeconds: Number
    },

    status: { type: String, enum: ['NEW', 'ACTED', 'DISMISSED'], default: 'NEW' }
}, { timestamps: true });

const GroupMarketMemorySchema = new Schema({
    groupJid: { type: String, required: true, unique: true },
    lastUpdated: { type: String },
    avgResponseTime: { type: Number, default: 0 },
    successfulWindows: { type: Number, default: 0 },
    sentimentHistory: { type: [String], default: [] }
});

const CampaignSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true }, // Index for fast retrieval by user
    name: { type: String, required: true },
    message: { type: String, required: true },
    imageUrl: { type: String }, // NEW: Image Support
    groups: { type: [String], default: [] },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'], default: 'DRAFT', index: true }, // Index for scheduler
    schedule: {
        type: { type: String, enum: ['ONCE', 'DAILY', 'WEEKLY'], default: 'ONCE' },
        startDate: { type: String },
        time: { type: String }, // "HH:MM"
        daysOfWeek: { type: [Number] }
    },
    config: {
        minDelaySec: { type: Number, default: 10 },
        maxDelaySec: { type: Number, default: 30 }
    },
    stats: {
        totalSent: { type: Number, default: 0 },
        totalFailed: { type: Number, default: 0 },
        lastRunAt: { type: String },
        nextRunAt: { type: String, index: true } // Index for scheduler
    }
}, { timestamps: true });

// Create Compound Index for Scheduler Efficiency
CampaignSchema.index({ status: 1, 'stats.nextRunAt': 1 });

// --- NEW NETWORK SCHEMAS ---
const IntentSignalSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    prospectJid: { type: String, required: true }, // Original JID
    prospectName: { type: String, required: true },
    prospectIdentifierHash: { type: String, required: true, index: true }, // For matching privacy
    intentCategories: { type: [String], default: [], index: true },
    intentDescription: { type: String, required: true },
    signalScore: { type: Number, required: true },
    contributedAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

const ConnectionOpportunitySchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    contributedByUserId: { type: String, required: true, index: true },
    receivedByUserId: { type: String, required: true, index: true },
    intentSignalId: { type: String, required: true, index: true },
    prospectOriginalJid: { type: String }, // Only revealed after consent
    prospectName: { type: String }, // Only revealed after consent
    intentCategories: { type: [String], default: [] },
    intentDescription: { type: String },
    opportunityScore: { type: Number, default: 0 },
    permissionStatus: { type: String, enum: ['PENDING', 'GRANTED', 'DENIED', 'NOT_REQUESTED'], default: 'NOT_REQUESTED' },
    requestedAt: { type: String },
    respondedAt: { type: String },
    connectionMadeAt: { type: String },
    createdAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

const NetworkProfileSchema = new Schema({
    networkEnabled: { type: Boolean, default: false },
    categoriesOfInterest: { type: [String], default: [] },
    contributionScore: { type: Number, default: 0 },
    receptionScore: { type: Number, default: 0 },
    lastActivity: { type: String, default: () => new Date().toISOString() },
}, { _id: false }); // No separate _id, embedded in User

const UserSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    business_name: { type: String },
    whatsapp_number: { type: String },
    password: { type: String, required: true },
    recoveryKey: { type: String }, 
    role: { type: String, enum: ['super_admin', 'admin', 'client'], default: 'client' },
    
    plan_type: { type: String, enum: ['starter', 'pro'], default: 'starter' },
    plan_status: { type: String, enum: ['active', 'expired', 'suspended', 'trial'], default: 'active', index: true },
    billing_start_date: { type: String, default: () => new Date().toISOString() },
    billing_end_date: { type: String, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    trial_qualified_leads_count: { type: Number, default: 0 },
    
    is_founder: { type: Boolean, default: false },

    // NEW: Depth Level
    depthLevel: { type: Number, default: 1 },

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
        ignoredJids: { type: Array, default: [] },
        isNetworkEnabled: { type: Boolean, default: false }, // NEW: Default to false
    },
    radar: {
        isEnabled: { type: Boolean, default: false },
        monitoredGroups: { type: [String], default: [] },
        keywordsInclude: { type: [String], default: [] },
        keywordsExclude: { type: [String], default: [] },
        // NEW CALIBRATION DATA
        calibration: {
            opportunityDefinition: { type: String, default: '' },
            noiseDefinition: { type: String, default: '' },
            sensitivity: { type: Number, default: 5 }
        }
    },
    conversations: { type: Schema.Types.Mixed, default: {} },
    governance: {
        systemState: { type: String, enum: ['ACTIVE', 'WARNING', 'LIMITED', 'SUSPENDED'], default: 'ACTIVE' },
        riskScore: { type: Number, default: 0 },
        updatedAt: { type: String, default: () => new Date().toISOString() },
        auditLogs: { type: Array, default: [] },
        accountFlags: { type: Array, default: [] },
        humanDeviationScore: { type: Number, default: 0 }
    },
    simulationLab: {
        experiments: { type: Array, default: [] },
        aggregatedScore: { type: Number, default: 0 },
        topFailurePatterns: { type: Object, default: {} }
    },
    networkProfile: { type: NetworkProfileSchema, default: {} }, // NEW: Embedded Network Profile
}, { minimize: false, timestamps: true });

const UserModel = (mongoose.models.SaaSUser || mongoose.model('SaaSUser', UserSchema)) as Model<any>;
const LogModel = (mongoose.models.LogEntry || mongoose.model('LogEntry', LogSchema)) as Model<LogEntry>;
const TestimonialModel = (mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema)) as Model<Testimonial>;
const SystemSettingsModel = (mongoose.models.SystemSettings || mongoose.model('SystemSettings', SystemSettingsSchema)) as Model<any>;
const CampaignModel = (mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema)) as Model<Campaign>;
const RadarSignalModel = (mongoose.models.RadarSignal || mongoose.model('RadarSignal', RadarSignalSchema)) as Model<RadarSignal>;
const GroupMemoryModel = (mongoose.models.GroupMemory || mongoose.model('GroupMemory', GroupMarketMemorySchema)) as Model<GroupMarketMemory>;
const DepthBoostModel = (mongoose.models.DepthBoost || mongoose.model('DepthBoost', DepthBoostSchema)) as Model<DepthBoost>;
const DepthLogModel = (mongoose.models.DepthLog || mongoose.model('DepthLog', DepthLogSchema)) as Model<DepthLog>;
const IntentSignalModel = (mongoose.models.IntentSignal || mongoose.model('IntentSignal', IntentSignalSchema)) as Model<IntentSignal>;
const ConnectionOpportunityModel = (mongoose.models.ConnectionOpportunity || mongoose.model('ConnectionOpportunity', ConnectionOpportunitySchema)) as Model<ConnectionOpportunity>;


export const sanitizeKey = (key: string) => key.replace(/\./g, '_');

const extractConversationsRecursive = (obj: any, found: Conversation[] = []) => {
    if (!obj || typeof obj !== 'object') return found;
    if ('id' in obj && 'messages' in obj && Array.isArray(obj.messages) && 'leadIdentifier' in obj) {
        found.push(obj as Conversation);
        return found;
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
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
        plan_type: 'pro',
        plan_status: 'trial', 
        billing_start_date: new Date(Date.now()).toISOString(),
        billing_end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), 
        trial_qualified_leads_count: 0,
        is_founder: true, // NEW: Mark new users as founders
        depthLevel: 1, // Default depth
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
            ignoredJids: [],
            isNetworkEnabled: false, // NEW: Default to false
        },
        radar: { isEnabled: false, monitoredGroups: [], keywordsInclude: [], keywordsExclude: [] },
        conversations: {},
        governance: { 
            systemState: 'ACTIVE', 
            riskScore: 0, 
            updatedAt: new Date().toISOString(), 
            auditLogs: [],
            accountFlags: [] 
        },
        simulationLab: { experiments: [], aggregatedScore: 0, topFailurePatterns: {} },
        networkProfile: { // NEW: Default network profile
            networkEnabled: false,
            categoriesOfInterest: [],
            contributionScore: 0,
            receptionScore: 0,
            lastActivity: new Date().toISOString(),
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
    if (username === '549234589' && password === 'dominion2024') {
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
        username: '549234589',
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
      if (!doc) return null;
      return doc as unknown as User;
  }
  
  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
      const result = await UserModel.findOneAndUpdate({ id: userId }, { $set: updates }, { new: true }).lean();
      return result as unknown as User;
  }

  async deleteUser(userId: string): Promise<boolean> {
      try {
          const result = await UserModel.deleteOne({ id: userId });
          if (result.deletedCount === 1) {
              await clearBindedSession(userId); 
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
      if (!user) return [];
      let conversationsArray: Conversation[] = [];
      if (user.conversations) {
          const rawConvos = (user.conversations instanceof Map) 
              ? Object.fromEntries(user.conversations) 
              : user.conversations;
          conversationsArray = extractConversationsRecursive(rawConvos);
      }
      const uniqueConvos = Array.from(new Map(conversationsArray.map(item => [item.id, item])).values());
      return uniqueConvos;
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      const safeId = sanitizeKey(conversation.id);
      const updateKey = `conversations.${safeId}`;
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
      const user = result as unknown as User;
      return user?.settings;
  }
  
  async createLog(logEntry: Partial<LogEntry>) {
      await LogModel.create(logEntry);
  }

  async getLogs(limit = 100) {
      return await LogModel.find().sort({ timestamp: -1 }).limit(limit).lean();
  }

  // NEW: Get Radar Traces for User
  async getRadarTraceLogs(userId: string, limit = 20) {
      return await LogModel.find({ 
          userId, 
          message: { $regex: /\[RADAR-TRACE\]/ } 
      })
      .sort({ timestamp: -1 }) // Newest first
      .limit(limit)
      .lean();
  }

  async getGlobalMetrics(): Promise<GlobalMetrics> {
      if (!this.isReady()) return { activeVendors: 0, onlineNodes: 0, totalSignalsProcessed: 0, activeHotLeads: 0, aiRequestsTotal: 0, riskAccountsCount: 0 }; // FIX: Updated default values for new metrics
      const activeVendors = await UserModel.countDocuments({ role: 'client' });
      // FIX: Add logic to calculate totalSignalsProcessed and activeHotLeads from the DB
      const totalSignalsProcessed = await IntentSignalModel.countDocuments();
      const activeHotLeads = await UserModel.aggregate([
          { $match: { 'conversations.$*.status': 'Caliente' } },
          { $count: 'hotLeads' }
      ]).then(res => res[0]?.hotLeads || 0);

      return {
          activeVendors,
          onlineNodes: 1, // Placeholder for now
          totalSignalsProcessed,
          activeHotLeads,
          aiRequestsTotal: 0, // Placeholder
          riskAccountsCount: await UserModel.countDocuments({ 'governance.riskScore': { $gt: 50 } })
      };
  }
  
  async createTestimonial(userId: string, name: string, text: string): Promise<Testimonial> {
      const newTestimonial = await TestimonialModel.create({
          userId,
          name,
          location: 'Mendoza', // Default for new user posts
          text
      });
      return newTestimonial.toObject();
  }

  async getTestimonial(testimonialId: string): Promise<Testimonial | null> {
      return await TestimonialModel.findById(testimonialId).lean();
  }

  async getTestimonials(): Promise<Testimonial[]> {
      return await TestimonialModel.find().sort({ createdAt: -1 }).lean();
  }

  async getTestimonialsCount(): Promise<number> {
      return await TestimonialModel.countDocuments();
  }

  async countSeedTestimonials(): Promise<number> {
      return await TestimonialModel.countDocuments({ userId: 'system_seed' });
  }

  async clearTestimonials() {
      await TestimonialModel.deleteMany({}); 
  }

  async seedTestimonials(testimonials: Testimonial[]) {
      await TestimonialModel.insertMany(testimonials);
  }

  async getSystemSettings(): Promise<SystemSettings> {
      const doc = await SystemSettingsModel.findOne({ id: 'global' }).lean();
      // FIX: Added dominionNetworkJid to defaults
      const defaults: SystemSettings = { supportWhatsappNumber: '', logLevel: 'INFO', dominionNetworkJid: '5491110000000@s.whatsapp.net' };
      if (!doc) {
          const newSettings = await SystemSettingsModel.create({ id: 'global', dominionNetworkJid: defaults.dominionNetworkJid }); // Ensure default is set for new creation
          return { ...defaults, ...newSettings.toObject() };
      }
      return { ...defaults, ...doc };
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
      const result = await SystemSettingsModel.findOneAndUpdate({ id: 'global' }, { $set: settings }, { new: true, upsert: true }).lean();
      return result as unknown as SystemSettings;
  }

  async getCampaigns(userId: string): Promise<Campaign[]> {
      return await CampaignModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async getCampaign(id: string): Promise<Campaign | null> {
      return await CampaignModel.findOne({ id }).lean();
  }

  async createCampaign(campaign: Campaign): Promise<Campaign> {
      const newCampaign = await CampaignModel.create(campaign);
      return newCampaign.toObject();
  }

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
      return await CampaignModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }

  async deleteCampaign(id: string): Promise<boolean> {
      const result = await CampaignModel.deleteOne({ id });
      return result.deletedCount === 1;
  }

  async getPendingCampaigns(): Promise<Campaign[]> {
      const now = new Date().toISOString();
      // Use .lean() for faster reads and use the compound index
      return await CampaignModel.find({
          status: 'ACTIVE',
          'stats.nextRunAt': { $lte: now }
      }).lean();
  }

  async getRadarSettings(userId: string): Promise<RadarSettings> {
      const user = await this.getUser(userId);
      // FIX: Initialize calibration property in default object
      return user?.radar || { isEnabled: false, monitoredGroups: [], keywordsInclude: [], keywordsExclude: [], calibration: { opportunityDefinition: '', noiseDefinition: '', sensitivity: 5 } };
  }

  async updateRadarSettings(userId: string, settings: Partial<RadarSettings>): Promise<RadarSettings | undefined> {
      const user = await this.getUser(userId);
      if (!user) return undefined;
      
      const newRadar = { ...user.radar, ...settings };
      if (!newRadar.monitoredGroups) newRadar.monitoredGroups = [];
      
      await UserModel.updateOne({ id: userId }, { $set: { radar: newRadar } });
      return newRadar as RadarSettings;
  }

  // FIX: Added getRadarSignal method for retrieving a single radar signal.
  async getRadarSignal(id: string): Promise<RadarSignal | null> {
      return await RadarSignalModel.findOne({ id }).lean();
  }

  async createRadarSignal(signal: RadarSignal): Promise<RadarSignal> {
      const newSignal = await RadarSignalModel.create(signal);
      return newSignal.toObject();
  }

  async getRadarSignals(userId: string, limit = 50): Promise<RadarSignal[]> {
      return await RadarSignalModel.find({ userId, status: { $ne: 'DISMISSED' } })
          .sort({ strategicScore: -1, 'analysis.score': -1, createdAt: -1 })
          .limit(limit)
          .lean();
  }

  async getRecentGroupSignals(groupJid: string, limit = 5): Promise<RadarSignal[]> {
      return await RadarSignalModel.find({ groupJid })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
  }

  async updateRadarSignalStatus(signalId: string, status: 'NEW' | 'ACTED' | 'DISMISSED'): Promise<void> {
      await RadarSignalModel.findOneAndUpdate({ id: signalId }, { status });
  }

  async getGroupMemory(groupJid: string): Promise<GroupMarketMemory | null> {
      return await GroupMemoryModel.findOne({ groupJid }).lean();
  }

  async updateGroupMemory(groupJid: string, updates: Partial<GroupMarketMemory>): Promise<void> {
      await GroupMemoryModel.findOneAndUpdate(
          { groupJid }, 
          { $set: updates }, 
          { upsert: true, new: true }
      );
  }

  // --- DEPTH ENGINE METHODS ---
  
  async createDepthBoost(boost: DepthBoost): Promise<DepthBoost> {
      const newBoost = await DepthBoostModel.create(boost);
      return newBoost.toObject();
  }

  async getActiveDepthBoosts(userId: string): Promise<DepthBoost[]> {
      const now = new Date().toISOString();
      return await DepthBoostModel.find({
          userId,
          startsAt: { $lte: now },
          endsAt: { $gte: now }
      }).lean();
  }

  async logDepthEvent(userId: string, eventType: string, details: any): Promise<void> {
      await DepthLogModel.create({
          timestamp: new Date().toISOString(),
          userId,
          eventType,
          details
      });
  }

  // --- NEW NETWORK METHODS ---
  async createIntentSignal(signal: IntentSignal): Promise<IntentSignal> {
      const newSignal = await IntentSignalModel.create(signal);
      return newSignal.toObject();
  }

  async getUserIntentSignals(userId: string): Promise<IntentSignal[]> {
      return await IntentSignalModel.find({ userId }).sort({ contributedAt: -1 }).lean();
  }

  async createConnectionOpportunity(opportunity: ConnectionOpportunity): Promise<ConnectionOpportunity> {
      const newOpportunity = await ConnectionOpportunityModel.create(opportunity);
      return newOpportunity.toObject();
  }

  // For a user, find potential opportunities from other users' signals
  async findPotentialConnectionOpportunities(
      receivedByUserId: string, 
      categoriesOfInterest: string[], 
      excludeJidHashes: string[] = [] // Ensure not to match with own contributed signals
  ): Promise<IntentSignal[]> {
      if (categoriesOfInterest.length === 0) return [];
      
      const now = new Date();
      now.setDate(now.getDate() - 7); // Only consider signals from the last 7 days

      // Find signals contributed by *other* users, that match categories of interest, 
      // and haven't been acted upon by this user yet
      return await IntentSignalModel.find({
          userId: { $ne: receivedByUserId },
          prospectIdentifierHash: { $nin: excludeJidHashes }, // Exclude signals already seen/acted upon by this user
          intentCategories: { $in: categoriesOfInterest },
          signalScore: { $gte: 70 }, // Only high-quality signals
          contributedAt: { $gte: now.toISOString() }
      }).sort({ signalScore: -1, contributedAt: -1 }).limit(20).lean(); // Limit to 20 potential matches
  }

  async getConnectionOpportunities(receivedByUserId: string): Promise<ConnectionOpportunity[]> {
      return await ConnectionOpportunityModel.find({ receivedByUserId }).sort({ createdAt: -1 }).lean();
  }

  async getConnectionOpportunity(id: string): Promise<ConnectionOpportunity | null> {
      return await ConnectionOpportunityModel.findOne({ id }).lean();
  }

  async updateConnectionOpportunity(id: string, updates: Partial<ConnectionOpportunity>): Promise<ConnectionOpportunity | null> {
      return await ConnectionOpportunityModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }

  async getNetworkProfile(userId: string): Promise<NetworkProfile | null> {
      const user = await UserModel.findOne({ id: userId }).select('networkProfile').lean();
      return (user as any)?.networkProfile || null;
  }

  async updateNetworkProfile(userId: string, updates: Partial<NetworkProfile>): Promise<NetworkProfile | null> {
      const result = await UserModel.findOneAndUpdate(
          { id: userId },
          { $set: { networkProfile: updates } },
          { new: true, upsert: true }
      ).select('networkProfile').lean();
      return (result as any)?.networkProfile || null;
  }

  async getIntentSignal(id: string): Promise<IntentSignal | null> {
      return await IntentSignalModel.findOne({ id }).lean();
  }

  // --- ADMIN NETWORK METHODS ---
  async getNetworkStats() {
      const activeNodes = await UserModel.countDocuments({ 'networkProfile.networkEnabled': true });
      const totalSignals = await IntentSignalModel.countDocuments();
      const totalOpportunities = await ConnectionOpportunityModel.countDocuments();
      const successfulConnections = await ConnectionOpportunityModel.countDocuments({ permissionStatus: 'GRANTED' });
      
      return { activeNodes, totalSignals, totalOpportunities, successfulConnections };
  }

  async getRecentNetworkActivity(limit = 20) {
      const signals = await IntentSignalModel.find().sort({ contributedAt: -1 }).limit(limit).lean();
      const opportunities = await ConnectionOpportunityModel.find().sort({ createdAt: -1 }).limit(limit).lean();
      return { signals, opportunities };
  }
}

export const db = new Database();