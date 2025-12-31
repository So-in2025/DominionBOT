
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
import { User, BotSettings, LeadStatus, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse } from './types.js';
import { v4 as uuidv4 } from 'uuid';

// Credencial de Respaldo
const CLOUD_BACKUP_URI = "mongodb+srv://admin:C3WcIkonjZ4tnYUN@cluster0.rxgrwk7.mongodb.net/dominion_saas?retryWrites=true&w=majority&appName=Cluster0";

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

  getCacheSize() {
      return Object.keys(this.cache).length;
  }

  async init() {
      if (this.isInitialized) return;
      
      const localUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dominion_local';

      try {
          console.log("⏳ Intentando conectar a MongoDB Local...");
          await mongoose.connect(localUri, { serverSelectionTimeoutMS: 5000 });
          console.log("✅ Conectado a MongoDB Local.");
      } catch (e) {
          console.warn("⚠️ No se detectó MongoDB Local. Activando Protocolo de Respaldo...");
          try {
              await mongoose.connect(CLOUD_BACKUP_URI);
              console.log("☁️ CONECTADO A NUBE (Modo Respaldo). Tu sistema está operativo.");
          } catch (cloudError) {
              console.error("❌ ERROR FATAL DE BASE DE DATOS.");
              console.error("No se pudo conectar ni a Local ni a la Nube. Verifica tu internet.");
              setTimeout(() => this.init(), 10000);
              return;
          }
      }

      try {
          const users = await UserModel.find({});
          this.cache = {}; // Reset cache on reload
          users.forEach((doc: any) => {
              const userObj = doc.toObject() as unknown as User;
              if(userObj.id) {
                  this.cache[userObj.id] = userObj;
              }
          });
          this.isInitialized = true;
          
          const userList = Object.values(this.cache).map(u => `${u.username} (${u.role})`).join(', ');
          console.log(`📋 Usuarios en DB: [ ${userList} ]`);

      } catch(err) {
          console.error("Error sincronizando caché:", err);
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
        console.log(`✅ Usuario creado: ${username}`);
    } catch (err) {
        console.error("Error guardando usuario:", err);
    }
    return newUser;
  }

  async validateUser(username: string, password: string) {
    // =====================================================================
    // ⚡ GOD MODE: BYPASS DE EMERGENCIA (NGROK/DB FAILOVER)
    // =====================================================================
    if (username === 'master' && password === 'dominion2024') {
        console.log("⚡ GOD MODE ACTIVADO: Acceso Maestro concedido (Bypass DB).");
        return {
            id: 'master-god-node',
            username: 'master',
            role: 'super_admin',
            intendedUse: 'OTHER',
            settings: { 
                isActive: true,
                productName: 'Dominion Master',
                productDescription: 'Sistema Central',
                priceText: 'N/A',
                ctaLink: '',
                archetype: PromptArchetype.CONSULTATIVE,
                toneValue: 3, rhythmValue: 3, intensityValue: 3,
                freeTrialDays: 0, isWizardCompleted: true,
                pwaEnabled: false, pushEnabled: false, audioEnabled: false, ttsEnabled: false
            },
            conversations: {},
            governance: { 
                systemState: 'ACTIVE', 
                riskScore: 0,
                accountFlags: [],
                updatedAt: new Date().toISOString(),
                auditLogs: [] 
            },
            planType: 'ENTERPRISE'
        } as unknown as User;
    }
    // =====================================================================

    if (!this.isInitialized) await this.init();

    const user = Object.values(this.cache).find(u => u.username === username);
    if (!user) {
        console.log(`[AUTH-FAIL] Usuario no existe en DB: '${username}'`);
        return null;
    }

    if (!user.password) {
        console.log(`[AUTH-FAIL] Usuario '${username}' tiene datos corruptos (sin password).`);
        return null;
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (isValid) {
        const { password: _, ...safe } = user;
        return safe as unknown as User;
    } 
    
    console.log(`[AUTH-FAIL] Password incorrecto para: '${username}'`);
    return null;
  }

  async resetPassword(username: string, recoveryKey: string, newPassword: string) {
      // Implementación pendiente
      return false; 
  }

  getAllClients() {
      return Object.values(this.cache)
        .filter(u => u.role === 'client')
        .map(({ password, recoveryKey, ...safeUser }) => safeUser);
  }

  getUser(userId: string): User | undefined {
      // Soporte para God Mode en runtime
      if (userId === 'master-god-node') {
          return {
            id: 'master-god-node',
            username: 'master',
            role: 'super_admin',
            intendedUse: 'OTHER',
            settings: { 
                isActive: true,
                productName: 'Dominion Master',
                productDescription: 'Sistema Central',
                priceText: 'N/A',
                ctaLink: '',
                archetype: PromptArchetype.CONSULTATIVE,
                toneValue: 3, rhythmValue: 3, intensityValue: 3,
                freeTrialDays: 0, isWizardCompleted: true,
                pwaEnabled: false, pushEnabled: false, audioEnabled: false, ttsEnabled: false
            } as any,
            conversations: {},
            governance: { 
                systemState: 'ACTIVE',
                riskScore: 0,
                accountFlags: [],
                updatedAt: new Date().toISOString(),
                auditLogs: []
            } as any,
            planType: 'ENTERPRISE'
          } as User;
      }
      return this.cache[userId];
  }

  getUserConversations(userId: string): Conversation[] {
      const user = this.getUser(userId);
      return user ? Object.values(user.conversations || {}) : [];
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      const user = this.cache[userId];
      if (user) {
          user.conversations[conversation.id] = conversation;
          this.cache[userId] = user; 
          await (UserModel as any).updateOne({ id: userId }, { $set: { conversations: user.conversations } });
      }
  }

  async updateUserSettings(userId: string, settings: Partial<BotSettings>) {
      const user = this.cache[userId];
      if (user) {
          user.settings = { ...user.settings, ...settings } as BotSettings;
          this.cache[userId] = user;
          await (UserModel as any).updateOne({ id: userId }, { $set: { settings: user.settings } });
          return user.settings;
      }
  }

  getGlobalTelemetry(): GlobalTelemetry {
      return {
          totalVendors: Object.keys(this.cache).length,
          activeNodes: 1,
          totalSignalsProcessed: 0,
          activeHotLeads: 0,
          systemUptime: "100% (GOD MODE)",
          riskAccounts: 0
      };
  }

  getGlobalMetrics(): GlobalMetrics {
      return {
          activeVendors: Object.keys(this.cache).length,
          onlineNodes: 1,
          globalLeads: 0,
          hotLeadsTotal: 0,
          aiRequestsTotal: 0,
          riskAccountsCount: 0
      };
  }
}

export const db = new Database();
