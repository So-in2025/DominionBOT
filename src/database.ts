
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
import { User, BotSettings, LeadStatus, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse } from './types.js';
import { v4 as uuidv4 } from 'uuid';

const UserSchema = new Schema({
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    recoveryKey: { type: String }, 
    intendedUse: { type: String, default: 'HIGH_TICKET_AGENCY' },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: String, default: null },
    role: { type: String, enum: ['super_admin', 'admin', 'client'], default: 'client' },
    settings: {
        productName: { type: String, default: 'Mi Producto' },
        productDescription: { type: String, default: 'Breve descripción...' },
        priceText: { type: String, default: 'Consultar' },
        ctaLink: { type: String, default: '#' },
        isActive: { type: Boolean, default: true },
        geminiApiKey: String,
        proxyUrl: { type: String, default: '' },
        archetype: { type: String, default: PromptArchetype.CONSULTATIVE },
        toneValue: { type: Number, default: 3 },
        rhythmValue: { type: Number, default: 3 },
        intensityValue: { type: Number, default: 3 }
    },
    conversations: { type: Map, of: Object, default: {} },
    governance: {
        systemState: { type: String, enum: ['ACTIVE', 'WARNING', 'LIMITED', 'SUSPENDED'], default: 'ACTIVE' },
        riskScore: { type: Number, default: 0 },
        updatedAt: { type: String, default: () => new Date().toISOString() },
        auditLogs: { type: Array, default: [] },
        accountFlags: { type: Array, default: [] }
    },
    planType: { type: String, enum: ['TRIAL', 'STARTER', 'ENTERPRISE'], default: 'TRIAL' }
});

const UserModel = (mongoose.models.SaaSUser || mongoose.model('SaaSUser', UserSchema)) as Model<any>;

class Database {
  private cache: Record<string, User> = {};
  private isInitialized = false;

  isReady() {
      return this.isInitialized;
  }

  async init() {
      if (this.isInitialized) return;
      try {
          // CONEXIÓN LOCAL POR DEFECTO
          const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dominion_local';
          
          await mongoose.connect(mongoUri);
          console.log("✅ Conectado a MongoDB Local.");
          
          const users = await UserModel.find({});
          users.forEach((doc: any) => {
              this.cache[doc.id] = doc.toObject() as unknown as User;
          });
          this.isInitialized = true;
          
          // Crear super admin si no existe
          if (!Object.values(this.cache).find(u => u.username === 'master')) {
              await this.createUser('master', 'dominion2024', 'super_admin', 'OTHER');
              console.log("👑 Admin creado: master / dominion2024");
          }
      } catch (e) { 
          console.error("❌ ERROR CRÍTICO DE MONGO DB:", e); 
          console.error("-> Asegúrate de que MongoDB Community Server esté instalado y corriendo.");
          setTimeout(() => this.init(), 5000);
      }
  }

  async createUser(username: string, password: string, role: any = 'client', intendedUse: any = 'HIGH_TICKET_AGENCY'): Promise<User | null> {
    if (Object.values(this.cache).some(u => u.username === username)) return null;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();
    const recoveryKey = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const newUser: any = {
        id, username, password: hashedPassword, recoveryKey, role, intendedUse,
        settings: { 
            productName: 'Mi Producto',
            productDescription: '',
            priceText: 'A convenir',
            ctaLink: '',
            isActive: true, 
            proxyUrl: '',
            archetype: PromptArchetype.CONSULTATIVE, 
            toneValue: 3, 
            rhythmValue: 3, 
            intensityValue: 3 
        },
        conversations: {},
        governance: { 
            systemState: 'ACTIVE', 
            riskScore: 0, 
            updatedAt: new Date().toISOString(), 
            auditLogs: [],
            accountFlags: [] 
        },
        planType: 'TRIAL'
    };
    
    this.cache[id] = newUser;
    try {
        await (UserModel as any).create(newUser);
    } catch (err) {
        console.error("Error guardando usuario en disco:", err);
    }
    return newUser;
  }

  async validateUser(username: string, password: string) {
    if (!this.isInitialized) await this.init();

    const user = Object.values(this.cache).find(u => u.username === username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password!);

    if (isValid) {
        const { password: _, ...safe } = user;
        return safe as unknown as User;
    } 
    return null;
  }

  async resetPassword(username: string, recoveryKey: string, newPassword: string) {
      // (Simplificado)
      return false; 
  }

  getAllClients() {
      return Object.values(this.cache)
        .filter(u => u.role === 'client')
        .map(({ password, recoveryKey, ...safeUser }) => safeUser);
  }

  getUser(userId: string): User | undefined {
      return this.cache[userId];
  }

  getUserConversations(userId: string): Conversation[] {
      const user = this.cache[userId];
      return user ? Object.values(user.conversations) : [];
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      const user = this.cache[userId];
      if (user) {
          user.conversations[conversation.id] = conversation;
          await (UserModel as any).updateOne({ id: userId }, { $set: { conversations: user.conversations } });
      }
  }

  async updateUserSettings(userId: string, settings: Partial<BotSettings>) {
      const user = this.cache[userId];
      if (user) {
          user.settings = { ...user.settings, ...settings } as BotSettings;
          await (UserModel as any).updateOne({ id: userId }, { $set: { settings: user.settings } });
          return user.settings;
      }
  }

  getGlobalTelemetry(): GlobalTelemetry {
      return {
          totalVendors: 1,
          activeNodes: 1,
          totalSignalsProcessed: 0,
          activeHotLeads: 0,
          systemUptime: "100% (LOCAL)",
          riskAccounts: 0
      };
  }

  getGlobalMetrics(): GlobalMetrics {
      return {
          activeVendors: 1,
          onlineNodes: 1,
          globalLeads: 0,
          hotLeadsTotal: 0,
          aiRequestsTotal: 0,
          riskAccountsCount: 0
      };
  }
}

export const db = new Database();
