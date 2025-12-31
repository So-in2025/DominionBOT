
export enum LeadStatus {
  COLD = 'Frío',
  WARM = 'Tibio',
  HOT = 'Caliente',
}

export enum View {
  CHATS = 'VENTAS',
  SETTINGS = 'CEREBRO',
  CONNECTION = 'WHATSAPP',
  SANDBOX = 'SIMULADOR',
  DASHBOARD = 'MÉTRICAS',
  ADMIN_GLOBAL = 'ADMIN_GLOBAL',
  AUDIT_MODE = 'AUDIT_MODE'
}

export enum ConnectionStatus {
  DISCONNECTED = 'Desconectado',
  GENERATING_QR = 'Generando QR',
  AWAITING_SCAN = 'Esperando escaneo',
  CONNECTED = 'Conectado',
}

export enum PromptArchetype {
  CONSULTATIVE = 'CONSULTATIVE',
  DIRECT_CLOSER = 'DIRECT_CLOSER',
  SUPPORT = 'SUPPORT',
  CUSTOM = 'CUSTOM'
}

export type SystemState = 'ACTIVE' | 'PAUSED' | 'LIMITED' | 'SUSPENDED';

// Fix: Updating IntendedUse to include the correct operational strategies used in the UI and ensure compatibility with backend expectations
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

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'owner';
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
}

export interface BotSettings {
  productName: string;
  productDescription: string;
  priceText: string;
  freeTrialDays: number;
  ctaLink: string;
  geminiApiKey?: string;
  isActive: boolean;
  disabledMessage: string;
  archetype: PromptArchetype;
  toneValue: number;
  rhythmValue: number;
  intensityValue: number;
  isWizardCompleted: boolean;
  pwaEnabled: boolean;
  pushEnabled: boolean;
  audioEnabled: boolean;
  ttsEnabled: boolean;
}

export interface User {
  id: string;
  username: string; 
  password?: string;
  role: 'admin' | 'client' | 'super_admin';
  settings: BotSettings;
  conversations: Record<string, Conversation>;
  governance: {
    systemState: SystemState;
    riskScore: number;
    accountFlags: string[];
    updatedAt: string;
    auditLogs: { timestamp: string; adminId: string; action: string }[];
  };
  planType: 'TRIAL' | 'STARTER' | 'ENTERPRISE';
  isSuspended?: boolean; 
  lastSeen?: string;
  internalNotes?: string;
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