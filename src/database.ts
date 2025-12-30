
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
        productDescription: { type: String, default: 'Breve descripción de tu oferta...' },
        priceText: { type: String, default: 'Consultar' },
        ctaLink: { type: String, default: '#' },
        isActive: { type: Boolean, default: true },
        geminiApiKey: String,
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
          const mongoUri = process.env.MONGO_URI;
          if (mongoUri) {
              await mongoose.connect(mongoUri);
              console.log("Connected to MongoDB Atlas");
          }
          
          const users = await UserModel.find({});
          users.forEach((doc: any) => {
              this.cache[doc.id] = doc.toObject() as unknown as User;
          });
          this.isInitialized = true;
          
          if (!Object.values(this.cache).find(u => u.username === 'master')) {
              await this.createUser('master', 'dominion2024', 'super_admin', 'OTHER');
              console.log("Super Admin node provisioned: master / dominion2024");
          }
      } catch (e) { 
          console.error("DB INIT ERROR:", e); 
          // Intentar reinit en 5s si falla
          setTimeout(() => this.init(), 5000);
      }
  }

  async createUser(username: string, password: string, role: any = 'client', intendedUse: any = 'HIGH_TICKET_AGENCY'): Promise<User | null> {
    if (Object.values(this.cache).some(u => u.username === username)) return null;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();
    const recoveryKey = Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const newUser: any = {
        id, username, password: hashedPassword, recoveryKey, role, intendedUse,
        settings: { 
            productName: 'Mi Producto',
            productDescription: '',
            priceText: 'A convenir',
            ctaLink: '',
            isActive: true, 
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
        console.error("Error creating user in MongoDB:", err);
    }
    return newUser;
  }

  async validateUser(username: string, password: string) {
    // Si la cache no está lista, esperar un poco o intentar refrescar
    if (!this.isInitialized) await this.init();

    const user = Object.values(this.cache).find(u => u.username === username);
    if (!user) return null;

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        throw new Error(`Cuenta bloqueada temporalmente. Intente después de ${new Date(user.lockedUntil).toLocaleTimeString()}.`);
    }

    const isValid = await bcrypt.compare(password, user.password!);

    if (isValid) {
        user.loginAttempts = 0;
        user.lockedUntil = null;
        await (UserModel as any).updateOne({ id: user.id }, { $set: { loginAttempts: 0, lockedUntil: null } });
        
        const { password: _, ...safe } = user;
        return safe as unknown as User;
    } else {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        let update: any = { loginAttempts: user.loginAttempts };
        
        if (user.loginAttempts >= 5) {
            const lockout = new Date(Date.now() + 15 * 60000).toISOString();
            user.lockedUntil = lockout;
            update.lockedUntil = lockout;
        }
        
        await (UserModel as any).updateOne({ id: user.id }, { $set: update });
        return null;
    }
  }

  async resetPassword(username: string, recoveryKey: string, newPassword: string) {
      const user = Object.values(this.cache).find(u => u.username === username);
      if (user && user.recoveryKey === recoveryKey) {
          const hashedPassword = await bcrypt.hash(newPassword, 10);
          user.password = hashedPassword;
          user.loginAttempts = 0;
          user.lockedUntil = null;
          await (UserModel as any).updateOne({ id: user.id }, { $set: { password: hashedPassword, loginAttempts: 0, lockedUntil: null } });
          return true;
      }
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

  async updateGovernance(userId: string, governance: any) {
      const user = this.cache[userId];
      if (user) {
          user.governance = { ...user.governance, ...governance };
          await (UserModel as any).updateOne({ id: userId }, { $set: { governance: user.governance } });
          return user.governance;
      }
  }

  getGlobalTelemetry(): GlobalTelemetry {
      const clients = Object.values(this.cache).filter(u => u.role === 'client');
      let totalSignals = 0;
      let hotLeads = 0;

      clients.forEach(c => {
          const convs = Object.values(c.conversations || {}) as any[];
          totalSignals += convs.length;
          hotLeads += convs.filter((cv: any) => cv.status === LeadStatus.HOT).length;
      });

      return {
          totalVendors: clients.length,
          activeNodes: clients.filter(c => c.settings.isActive && c.governance.systemState === 'ACTIVE').length,
          totalSignalsProcessed: totalSignals,
          activeHotLeads: hotLeads,
          systemUptime: "99.98%",
          riskAccounts: clients.filter(c => c.governance.riskScore > 50).length
      };
  }

  getGlobalMetrics(): GlobalMetrics {
      const telemetry = this.getGlobalTelemetry();
      return {
          activeVendors: telemetry.totalVendors,
          onlineNodes: telemetry.activeNodes,
          globalLeads: telemetry.totalSignalsProcessed,
          hotLeadsTotal: telemetry.activeHotLeads,
          aiRequestsTotal: telemetry.totalSignalsProcessed,
          riskAccountsCount: telemetry.riskAccounts
      };
  }
}

export const db = new Database();
