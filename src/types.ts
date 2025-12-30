
// Shared types between Frontend and Backend - v2.6 (Governance Update)

export enum LeadStatus {
  COLD = 'Frío',
  WARM = 'Tibio',
  HOT = 'Caliente',
}

export enum View {
  CHATS = 'SIGNALS',
  SETTINGS = 'CORE',
  CONNECTION = 'NODES',
  SANDBOX = 'SANDBOX',
  DASHBOARD = 'DASHBOARD', // Added missing member
  ADMIN_GLOBAL = 'ADMIN_GLOBAL', // Super Admin View
  AUDIT_MODE = 'AUDIT_MODE'      // Support/Auditing View
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

export type IntendedUse = 'VENTAS_CONSULTIVAS' | 'SOPORTE' | 'OTRO';

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
  // Added missing fields
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
}

export interface User {
  id: string;
  username: string; 
  password?: string; // Added password property
  role: 'admin' | 'client' | 'super_admin'; // Extended roles
  settings: BotSettings;
  conversations: Record<string, Conversation>;
  governance: {
    systemState: SystemState;
    riskScore: number; // 0-100
    accountFlags: string[];
    updatedAt: string;
    auditLogs: { timestamp: string; adminId: string; action: string }[]; // Added missing auditLogs
  };
  planType: 'TRIAL' | 'STARTER' | 'ENTERPRISE';
  isSuspended?: boolean; 
  lastSeen?: string;
  internalNotes?: string; // Added string notes for UserRow
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
