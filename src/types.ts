
// Shared types between Frontend and Backend - v2.8.0 (Elite Update)

export enum LeadStatus {
  COLD = 'Frío',
  WARM = 'Tibio',
  HOT = 'Caliente',
}

export enum View {
  CHATS = 'SIGNALS', // Renamed to Signals
  SETTINGS = 'CORE',
  CONNECTION = 'NODES',
  SANDBOX = 'SANDBOX',
  DASHBOARD = 'DASHBOARD',
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

// FASE 1: Blindaje - Contrato de Señal
export interface Signal {
  id: string;
  source: 'WHATSAPP' | 'INSTAGRAM' | 'WEB';
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: Date;
  metadata?: any;
}

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
  // FASE 2: Copiloto
  suggestedReplies?: string[]; 
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
  recoveryKey?: string; 
  loginAttempts?: number; 
  lockedUntil?: string; 
  role: 'admin' | 'client' | 'super_admin';
  intendedUse: IntendedUse;
  settings: BotSettings;
  conversations: Record<string, Conversation>;
  governance: {
    systemState: SystemState;
    riskScore: number;
    // FASE 3: Control de Calidad Humana
    humanDeviationScore: number; 
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
  humanDeviationScore: number; // NUEVO CAMPO REAL
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
