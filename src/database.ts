
import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { User, BotSettings, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse, LogEntry, Testimonial, SystemSettings, Campaign, RadarSignal, RadarSettings, GroupMarketMemory, DepthBoost, DepthLog, IntentSignal, ConnectionOpportunity, NetworkProfile, PermissionStatus } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { MONGO_URI } from './env.js';
import { clearBindedSession } from './whatsapp/mongoAuth.js';

// --- NEW SCHEMAS FOR RESILIENCE ---
const ModelCooldownSchema = new Schema({
    modelName: { type: String, required: true, unique: true },
    cooldownUntil: { type: Number, required: true }
});

const NetworkProfileSchema = new Schema({
    networkEnabled: { type: Boolean, default: false },
    categoriesOfInterest: { type: [String], default: [] },
    contributionScore: { type: Number, default: 0 },
    receptionScore: { type: Number, default: 0 },
    lastActivity: { type: String }
}, { _id: false });

const LogSchema = new Schema({
    timestamp: { type: String, required: true },
    level: { type: String, required: true },
    message: { type: String, required: true },
    userId: { type: String },
    username: { type: String },
    metadata: { type: Schema.Types.Mixed }
});

const TestimonialSchema = new Schema({
    userId: { type: String, required: true },
    name: { type: String },
    location: { type: String },
    text: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
});

const SystemSettingsSchema = new Schema({
    id: { type: String, required: true, unique: true },
    supportWhatsappNumber: { type: String, default: '' },
    logLevel: { type: String, default: 'INFO' },
    dominionNetworkJid: { type: String, default: '5491110000000@s.whatsapp.net' },
    isOutboundKillSwitchActive: { type: Boolean, default: false },
    dolarBlueRate: { type: Number, default: 1450 },
    planStandardPriceUSD: { type: Number, default: 19 },
    planSniperPriceUSD: { type: Number, default: 39 },
    planNeuroBoostPriceUSD: { type: Number, default: 5 },
    planStandardDescription: { type: String, default: 'El punto de entrada para automatizar tu WhatsApp. Filtra consultas, responde al instante y califica la intención de compra para que no pierdas ventas por demora.' },
    planSniperDescription: { type: String, default: 'La experiencia Dominion completa. Diseñado para ventas de alto valor donde cada detalle importa. Entiende el matiz de la conversación y asiste en el cierre.' },
    planNeuroBoostDescription: { type: String, default: 'Potencia cognitiva bajo demanda para momentos críticos. Activa la máxima capacidad de razonamiento para lanzamientos o campañas de alta intensidad.' },
});

const CampaignSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    message: { type: String, required: true },
    imageUrl: { type: String },
    groups: { type: [String], default: [] },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ABORTED'], default: 'DRAFT' }, 
    schedule: {
        type: { type: String, enum: ['ONCE', 'DAILY', 'WEEKLY'], default: 'ONCE' },
        startDate: { type: String },
        time: { type: String },
        daysOfWeek: { type: [Number] }
    },
    config: {
        minDelaySec: { type: Number, default: 30 },
        maxDelaySec: { type: Number, default: 60 },
        operatingWindow: {
            startHour: { type: Number },
            endHour: { type: Number }
        },
        useSpintax: { type: Boolean, default: true }
    },
    stats: {
        totalSent: { type: Number, default: 0 },
        totalFailed: { type: Number, default: 0 },
        lastRunAt: { type: String },
        nextRunAt: { type: String }
    },
    createdAt: { type: String, default: () => new Date().toISOString() }
});

const RadarSignalSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    groupJid: { type: String, required: true },
    groupName: { type: String },
    senderJid: { type: String, required: true },
    senderName: { type: String },
    messageContent: { type: String, required: true },
    timestamp: { type: String, required: true },
    analysis: {
        score: { type: Number },
        category: { type: String },
        intentType: { type: String },
        reasoning: { type: String },
        suggestedAction: { type: String }
    },
    marketContext: { type: Schema.Types.Mixed },
    predictedWindow: { type: Schema.Types.Mixed },
    hiddenSignals: { type: [Schema.Types.Mixed] },
    actionIntelligence: { type: Schema.Types.Mixed },
    strategicScore: { type: Number },
    status: { type: String, enum: ['NEW', 'ACTED', 'DISMISSED'], default: 'NEW' }
});

const GroupMarketMemorySchema = new Schema({
    groupJid: { type: String, required: true, unique: true },
    lastUpdated: { type: String },
    avgResponseTime: { type: Number, default: 0 },
    successfulWindows: { type: Number, default: 0 },
    sentimentHistory: { type: [String], default: [] }
});

const DepthBoostSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    depthDelta: { type: Number, required: true },
    reason: { type: String },
    startsAt: { type: String, required: true },
    endsAt: { type: String, required: true },
    createdBy: { type: String }
});

const DepthLogSchema = new Schema({
    timestamp: { type: String, required: true },
    userId: { type: String, required: true },
    eventType: { type: String, required: true },
    details: { type: Schema.Types.Mixed }
});

const IntentSignalSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    prospectJid: { type: String, required: true },
    prospectName: { type: String },
    prospectIdentifierHash: { type: String, required: true },
    intentCategories: { type: [String], default: [] },
    intentDescription: { type: String },
    signalScore: { type: Number },
    contributedAt: { type: String, required: true }
});

const ConnectionOpportunitySchema = new Schema({
    id: { type: String, required: true, unique: true },
    contributedByUserId: { type: String, required: true },
    receivedByUserId: { type: String, required: true },
    intentSignalId: { type: String, required: true },
    prospectOriginalJid: { type: String },
    prospectName: { type: String },
    intentCategories: { type: [String], default: [] },
    intentDescription: { type: String },
    opportunityScore: { type: Number },
    permissionStatus: { type: String, enum: ['PENDING', 'GRANTED', 'DENIED', 'NOT_REQUESTED'], default: 'NOT_REQUESTED' },
    requestedAt: { type: String },
    respondedAt: { type: String },
    connectionMadeAt: { type: String },
    createdAt: { type: String, required: true }
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
        ticketValue: { type: Number, default: 0 }, 
        ctaLink: { type: String, default: '#' },
        isActive: { type: Boolean, default: true },
        proxyUrl: { type: String, default: '' },
        geminiApiKey: { type: String, default: '' },
        archetype: { type: String, default: PromptArchetype.CONSULTATIVE },
        toneValue: { type: Number, default: 3 },
        rhythmValue: { type: Number, default: 3 },
        intensityValue: { type: Number, default: 3 },
        isWizardCompleted: { type: Boolean, default: false }, 
        ignoredJids: { type: [String], default: [] },
        isNetworkEnabled: { type: Boolean, default: false },
        isAutonomousClosing: { type: Boolean, default: false }, // NEW: Autonomous Guard
        useAdvancedModel: { type: Boolean, default: false }, // Modular Architecture
        neuralConfig: { type: Schema.Types.Mixed },
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
        auditLogs: { type: [Schema.Types.Mixed], default: [] },
        accountFlags: { type: [String], default: [] },
        humanDeviationScore: { type: Number, default: 0 }
    },
    simulationLab: {
        experiments: { type: [Schema.Types.Mixed], default: [] },
        aggregatedScore: { type: Number, default: 0 },
        topFailurePatterns: { type: Schema.Types.Mixed, default: {} },
        customScript: { type: [String], default: [] } 
    },
    networkProfile: { type: NetworkProfileSchema, default: {} }, 
}, { minimize: false, timestamps: true });

// --- MODELS ---
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
const ModelCooldownModel = (mongoose.models.ModelCooldown || mongoose.model('ModelCooldown', ModelCooldownSchema)) as Model<any>;


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
              maxPoolSize: 20 // Optimized for higher concurrency (100+ clients)
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
        billing_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), 
        trial_qualified_leads_count: 0,
        is_founder: true, 
        depthLevel: 1, 
        created_at: new Date().toISOString(),
        settings: { 
            productName: businessName,
            productDescription: '',
            priceText: 'A convenir',
            ticketValue: 0, 
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
            isNetworkEnabled: false, 
            isAutonomousClosing: false, // Default OFF
            useAdvancedModel: false
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
        simulationLab: { experiments: [], aggregatedScore: 0, topFailurePatterns: {}, customScript: [] },
        networkProfile: { 
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

  async removeUserConversation(userId: string, jid: string) {
      const safeId = sanitizeKey(jid);
      const updateKey = `conversations.${safeId}`;
      // PHYSICAL DELETE: Use $unset to completely remove the conversation object from the map
      await UserModel.updateOne(
          { id: userId },
          { $unset: { [updateKey]: "" } }
      );
  }

  // NEW: BATCH SAVE
  async saveUserConversationsBatch(userId: string, conversations: Record<string, Conversation>) {
      const updatePayload: any = {};
      for (const [key, convo] of Object.entries(conversations)) {
          updatePayload[`conversations.${key}`] = convo;
      }
      updatePayload.last_activity_at = new Date().toISOString();
      
      await UserModel.updateOne(
          { id: userId }, 
          { $set: updatePayload }
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
  
  // --- PERSISTENT COOLDOWNS ---
  async setModelCooldown(modelName: string, cooldownUntil: number) {
      await ModelCooldownModel.findOneAndUpdate(
          { modelName }, 
          { cooldownUntil }, 
          { upsert: true }
      );
  }

  async getModelCooldown(modelName: string): Promise<number | null> {
      const doc = await ModelCooldownModel.findOne({ modelName }).lean();
      // FIX: Cast document to any to access cooldownUntil property
      return doc ? (doc as any).cooldownUntil : null;
  }

  // ... (rest of methods)
  async createLog(logEntry: Partial<LogEntry>) {
      await LogModel.create(logEntry);
  }

  async getLogs(limit = 100) {
      return await LogModel.find().sort({ timestamp: -1 }).limit(limit).lean();
  }

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
      if (!this.isReady()) return { activeVendors: 0, onlineNodes: 0, totalSignalsProcessed: 0, activeHotLeads: 0, aiRequestsTotal: 0, riskAccountsCount: 0 }; 
      const activeVendors = await UserModel.countDocuments({ role: 'client' });
      const totalSignalsProcessed = await IntentSignalModel.countDocuments();
      const activeHotLeads = await UserModel.aggregate([
          { $match: { 'conversations.$*.status': 'Caliente' } },
          { $count: 'hotLeads' }
      ]).then(res => res[0]?.hotLeads || 0);

      return {
          activeVendors,
          onlineNodes: 1, 
          totalSignalsProcessed,
          activeHotLeads,
          aiRequestsTotal: 0, 
          riskAccountsCount: await UserModel.countDocuments({ 'governance.riskScore': { $gt: 50 } })
      };
  }
  
  async createTestimonial(userId: string, name: string, text: string): Promise<Testimonial> {
      const newTestimonial = await TestimonialModel.create({
          userId,
          name,
          location: 'Mendoza', 
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
      const defaults: SystemSettings = { 
          supportWhatsappNumber: '', logLevel: 'INFO', dominionNetworkJid: '5491110000000@s.whatsapp.net', isOutboundKillSwitchActive: false,
          dolarBlueRate: 1450, planStandardPriceUSD: 19, planSniperPriceUSD: 39, planNeuroBoostPriceUSD: 5,
          planStandardDescription: 'El punto de entrada para automatizar tu WhatsApp. Filtra consultas, responde al instante y califica la intención de compra para que no pierdas ventas por demora.',
          planSniperDescription: 'La experiencia Dominion completa. Diseñado para ventas de alto valor donde cada detalle importa. Entiende el matiz de la conversación y asiste en el cierre.',
          planNeuroBoostDescription: 'Potencia cognitiva bajo demanda para momentos críticos. Activa la máxima capacidad de razonamiento para lanzamientos o campañas de alta intensidad.'
      };
      if (!doc) {
          const newSettings = await SystemSettingsModel.create({ id: 'global', ...defaults });
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
      return await CampaignModel.find({
          status: 'ACTIVE',
          'stats.nextRunAt': { $lte: now }
      }).lean();
  }

  async getRadarSettings(userId: string): Promise<RadarSettings> {
      const user = await this.getUser(userId);
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

  async findPotentialConnectionOpportunities(
      receivedByUserId: string, 
      categoriesOfInterest: string[], 
      excludeJidHashes: string[] = [] 
  ): Promise<IntentSignal[]> {
      if (categoriesOfInterest.length === 0) return [];
      
      const now = new Date();
      now.setDate(now.getDate() - 7); 

      return await IntentSignalModel.find({
          userId: { $ne: receivedByUserId },
          prospectIdentifierHash: { $nin: excludeJidHashes }, 
          intentCategories: { $in: categoriesOfInterest },
          signalScore: { $gte: 70 }, 
          contributedAt: { $gte: now.toISOString() }
      }).sort({ signalScore: -1, contributedAt: -1 }).limit(20).lean(); 
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
