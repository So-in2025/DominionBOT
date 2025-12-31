
import bcrypt from 'bcrypt';
import mongoose, { Schema, Model } from 'mongoose';
import { User, BotSettings, PromptArchetype, GlobalMetrics, GlobalTelemetry, Conversation, IntendedUse } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { MONGO_URI } from './env.js';

const UserSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true }, // Index for performance
    username: { type: String, required: true, unique: true, index: true },
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
        intensityValue: { type: Number, default: 3 },
        freeTrialDays: { type: Number, default: 0 },
        isWizardCompleted: { type: Boolean, default: false },
        pwaEnabled: { type: Boolean, default: false },
        pushEnabled: { type: Boolean, default: false },
        audioEnabled: { type: Boolean, default: false },
        ttsEnabled: { type: Boolean, default: false }
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
    planType: { type: String, enum: ['TRIAL', 'STARTER', 'ENTERPRISE'], default: 'TRIAL' }
}, { minimize: false }); // Ensure empty objects are saved

const UserModel = (mongoose.models.SaaSUser || mongoose.model('SaaSUser', UserSchema)) as Model<any>;

class Database {
  private isInitialized = false;

  isReady() {
      return this.isInitialized && mongoose.connection.readyState === 1;
  }

  // Stateless: No cache size, query DB count
  async getCacheSize() {
      if (!this.isReady()) return 0;
      return await UserModel.countDocuments();
  }

  async init() {
      if (this.isInitialized) return;
      
      if (!MONGO_URI || MONGO_URI.includes('dominion-local')) {
          console.warn("⚠️ [DB] Usando URI Local o por defecto. Para producción real, configure MONGO_URI en .env");
      }

      try {
          console.log("⏳ [DB] Conectando a MongoDB...");
          // Opciones optimizadas para producción
          await mongoose.connect(MONGO_URI, { 
              serverSelectionTimeoutMS: 5000,
              maxPoolSize: 10 // Limitar conexiones concurrentes por instancia
          });
          this.isInitialized = true;
          console.log("✅ [DB] Conexión establecida.");
      } catch (e) {
          console.error("❌ [DB] ERROR FATAL DE CONEXIÓN:", e);
          // En producción, si falla la DB, el proceso debe reiniciarse o fallar ruidosamente
          throw e; 
      }
  }

  async createUser(username: string, password: string, role: any = 'client', intendedUse: any = 'HIGH_TICKET_AGENCY'): Promise<User | null> {
    // Check direct in DB
    const existing = await UserModel.findOne({ username });
    if (existing) return null;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();
    const recoveryKey = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    console.log(`[DB] Creating user ${username} with ID ${id}`);

    const newUserPayload: any = {
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
    
    try {
        await UserModel.create(newUserPayload);
        console.log(`✅ [DB] Usuario persistido: ${username}`);
        return newUserPayload;
    } catch (err) {
        console.error("[DB] Error creando usuario:", err);
        return null;
    }
  }

  async validateUser(username: string, password: string) {
    if (!this.isInitialized) await this.init();

    // God Mode Bypass (Mantener solo si es estrictamente necesario para depuración, idealmente borrar en prod)
    if (username === 'master' && password === 'dominion2024') {
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

  // Helper para God Mode
  private getGodModeUser(): User {
      return {
        id: 'master-god-node',
        username: 'master',
        role: 'super_admin',
        intendedUse: 'OTHER',
        settings: { isActive: true, productName: 'Dominion Master', archetype: PromptArchetype.CONSULTATIVE } as any,
        conversations: {},
        governance: { systemState: 'ACTIVE', riskScore: 0 } as any,
        planType: 'ENTERPRISE'
      } as User;
  }

  async getAllClients() {
      // Proyección para no traer passwords ni conversaciones pesadas
      const docs = await UserModel.find({ role: 'client' }, { password: 0, conversations: 0, recoveryKey: 0 }).lean();
      return docs;
  }

  // Ahora devuelve User | null de forma asíncrona
  // OJO: Esto rompe la firma síncrona anterior, hay que actualizar las llamadas.
  async getUser(userId: string): Promise<User | null> {
      if (userId === 'master-god-node') return this.getGodModeUser();
      
      const doc = await UserModel.findOne({ id: userId });
      return doc ? doc.toObject() : null;
  }

  // Método síncrono eliminado. Usar getUserConversations Async
  async getUserConversations(userId: string): Promise<Conversation[]> {
      const user = await this.getUser(userId);
      return user && user.conversations ? Object.values(user.conversations) : [];
  }

  async saveUserConversation(userId: string, conversation: Conversation) {
      // Uso de operador $set con notación de punto para actualizar solo ESTA conversación
      // Esto es mucho más eficiente que reescribir todo el objeto de conversaciones
      const updateKey = `conversations.${conversation.id}`;
      await UserModel.updateOne({ id: userId }, { $set: { [updateKey]: conversation } });
  }

  async updateUserSettings(userId: string, settings: Partial<BotSettings>) {
      // Actualización atómica de settings
      // Construimos el objeto de update para respetar nested fields
      const updatePayload: any = {};
      for (const [key, value] of Object.entries(settings)) {
          updatePayload[`settings.${key}`] = value;
      }
      
      const result = await UserModel.findOneAndUpdate(
          { id: userId }, 
          { $set: updatePayload }, 
          { new: true } // Return updated doc
      );
      return result?.settings;
  }

  async getGlobalMetrics(): Promise<GlobalMetrics> {
      const activeVendors = await UserModel.countDocuments({ role: 'client' });
      // Métricas reales requerirían agregaciones complejas, por ahora mockeamos algunas basándonos en counts reales
      return {
          activeVendors,
          onlineNodes: 1, // En arquitectura distribuida esto vendría de Redis
          globalLeads: 0, // Implementar conteo real si es necesario
          hotLeadsTotal: 0,
          aiRequestsTotal: 0,
          riskAccountsCount: await UserModel.countDocuments({ 'governance.riskScore': { $gt: 50 } })
      };
  }
}

export const db = new Database();
