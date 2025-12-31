

export enum LeadStatus {
  COLD = 'Frío',
  WARM = 'Tibio',
  HOT = 'Caliente',
  PERSONAL = 'Personal'
}

export enum View {
  CHATS = 'MENSAJES',
  DASHBOARD = 'MÉTRICAS',
  CONNECTION = 'CONEXIÓN',
  SETTINGS = 'CONFIGURACIÓN',
  SANDBOX = 'SIMULADOR',
  ADMIN_GLOBAL = 'DASHBOARD_GLOBAL', // Renombrado para claridad
  AUDIT_MODE = 'AUDIT_MODE'
}

export enum ConnectionStatus {
  DISCONNECTED = 'Desconectado',
  GENERATING_QR = 'Generando QR',
  AWAITING_SCAN = 'Esperando escaneo',
  CONNECTED = 'Conectado',
  RESETTING = 'Reseteando',
}

export enum PromptArchetype {
  CONSULTATIVE = 'VENTA_CONSULTIVA',
  DIRECT_CLOSER = 'CIERRE_DIRECTO',
  SUPPORT = 'SOPORTE_TECNICO',
  EMPATHIC = 'RELACIONAL_EMPATICO',
  AGRESSIVE = 'CIERRE_AGRESIVO',
  ACADEMIC = 'INFORMATIVO_DETALLADO',
  CUSTOM = 'CUSTOM'
}

export type SystemState = 'ACTIVE' | 'PAUSED' | 'LIMITED' | 'SUSPENDED';

export type IntendedUse = 
  | 'HIGH_TICKET_AGENCY' 
  | 'REAL_ESTATE' 
  | 'ECOMMERCE_SUPPORT' 
  | 'DIGITAL_LAUNCHES' 
  | 'PROFESSIONAL_SERVICES'
  | 'OTHER'
  | 'VENTAS_CONSULTIVAS'
  | 'SOPORTE'
  | 'OTRO';

export type PlanType = 'starter' | 'pro';
export type PlanStatus = 'active' | 'expired' | 'suspended' | 'trial';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'owner' | 'elite_bot'; // Added elite_bot
  timestamp: Date | string; 
}

export interface InternalNote {
  id: string;
  note: string;
  author: 'AI' | 'HUMAN';
  timestamp: string | Date;
}

export interface Conversation {
  id: string;
  leadName: string;
  leadIdentifier: string;
  status: LeadStatus;
  messages: Message[];
  isBotActive: boolean;
  lastActivity?: Date | string;
  isMuted?: boolean;
  tags: string[];
  internalNotes: InternalNote[];
  isAiSignalsEnabled: boolean;
  firstMessageAt?: Date | string;
  escalatedAt?: Date | string;
  suggestedReplies?: string[];
}

export interface BotSettings {
  productName: string;
  productDescription: string;
  priceText: string;
  freeTrialDays: number;
  ctaLink: string;
  proxyUrl?: string;
  geminiApiKey?: string;
  isActive: boolean;
  disabledMessage: string;
  archetype: PromptArchetype;
  toneValue: number;
  rhythmValue: number;
  intensityValue: number;
  isWizardCompleted: boolean; // Added for wizard state
  pwaEnabled: boolean;
  pushEnabled: boolean;
  audioEnabled: boolean;
  ttsEnabled: boolean;
  ignoredJids: string[];
}

// Renamed User to Client and expanded with SaaS fields
export interface User {
  id: string; // client_id
  username: string; 
  business_name: string;
  whatsapp_number: string;
  password?: string;
  recoveryKey?: string;
  role: 'admin' | 'client' | 'super_admin';
  
  plan_type: PlanType;
  plan_status: PlanStatus;
  billing_start_date: string;
  billing_end_date: string;
  
  settings: BotSettings;
  conversations: Record<string, Conversation>;
  
  governance: {
    systemState: SystemState;
    riskScore: number;
    accountFlags: string[];
    updatedAt: string;
    auditLogs: { timestamp: string; adminId: string; action: string }[];
    humanDeviationScore: number;
  };
  
  trial_qualified_leads_count?: number;
  isSuspended?: boolean; 
  last_activity_at?: string;
  created_at: string;
  internalNotes?: string;
}

export interface LogEntry {
  _id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  userId?: string;
  username?: string;
  metadata?: Record<string, any>;
}

export interface DashboardMetrics {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  totalMessages: number;
  conversionRate: number;
  revenueEstimated: number;
  avgEscalationTimeMinutes: number;
  activeSessions: number;
  humanDeviationScore: number;
}

export interface GlobalDashboardMetrics {
  totalClients: number;
  mrr: number;
  onlineNodes: number;
  globalLeads: number;
  hotLeads: number;
  atRiskAccounts: number;
  planDistribution: { pro: number; starter: number };
  expiringSoon: User[];
  topClients: { username: string; businessName: string; leadCount: number }[];
}


export interface GlobalMetrics {
    activeVendors: number;
    onlineNodes: number;
    globalLeads: number;
    hotLeadsTotal: number;
    aiRequestsTotal: number;
    riskAccountsCount: number;
}

export interface GlobalTelemetry {
    totalVendors: number;
    activeNodes: number;
    totalSignalsProcessed: number;
    activeHotLeads: number;
    systemUptime: string;
    riskAccounts: number;
}

export interface Testimonial {
  _id: string;
  userId: string;
  name: string;
  location: string;
  text: string;
  createdAt: string;
}

export interface SystemSettings {
    supportWhatsappNumber: string;
}