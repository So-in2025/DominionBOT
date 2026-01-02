

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
  BLACKLIST = 'LISTA NEGRA',
  SETTINGS = 'CONFIGURACIÓN',
  SANDBOX = 'SIMULADOR',
  CAMPAIGNS = 'CAMPAÑAS',
  RADAR = 'RADAR',
  NETWORK = 'RED DOMINION', // NEW: Network View
  ADMIN_GLOBAL = 'DASHBOARD_GLOBAL', 
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
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

// --- DEPTH ENGINE TYPES (NEW) ---

export interface CapabilityContext {
    depthLevel: number; // The input integer (1-10)
    
    // Calculated Capabilities
    horizonHours: number; // How far back to look in history
    memoryDepth: number; // Number of previous interactions to retain context
    inferencePasses: number; // Conceptual complexity of reasoning (1=Linear, 3=Deep)
    confidenceThreshold: number; // 0-100. Higher depth = stricter filter
    simulationAggressiveness: number; // 0-100. For stress testing
    variationDepth: number; // 0-100. Determines Jitter/Humanization variance in Campaigns
    
    // Feature Flags (Derived from depth)
    canPredictTrends: boolean; // Level > 3
    canAnalyzeHiddenSignals: boolean; // Level > 5
    canAutoReplyStrategic: boolean; // Level > 7
}

export interface DepthBoost {
    id: string;
    userId: string;
    depthDelta: number; // e.g., +2
    reason: string;
    startsAt: string;
    endsAt: string;
    createdBy: string; // Admin ID
}

export interface DepthLog {
    timestamp: string;
    userId: string;
    eventType: 'DEPTH_USED' | 'BOOST_APPLIED' | 'LIMIT_HIT';
    details: any;
}

// -------------------------------

// --- RADAR 4.0 TYPES ---
export interface MarketContextSnapshot {
    momentum: 'ACCELERATING' | 'STABLE' | 'COOLING';
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'TENSE';
    activeTopics: string[];
    noiseLevel: number; // 0-100
}

export interface PredictiveWindow {
    confidenceScore: number; // 0-100
    urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    delayRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string;
}

export interface HiddenSignal {
    type: 'MICRO_LANGUAGE' | 'EMOTIONAL_SHIFT' | 'SILENCE_PATTERN' | 'CONVERGENCE';
    description: string;
    intensity: number; // 1-10
}

export interface ActionIntelligence {
    suggestedEntryType: 'DIRECT' | 'CONSULTATIVE' | 'PRIVATE' | 'WAIT';
    communicationFraming: string;
    spamRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedWaitTimeSeconds?: number;
}

export interface RadarSignal {
    id: string;
    userId: string;
    groupJid: string;
    groupName: string;
    senderJid: string;
    senderName?: string;
    messageContent: string;
    timestamp: string;
    
    analysis: {
        score: number;
        category?: string; 
        intentType: 'SEARCH' | 'COMPARISON' | 'QUESTION' | 'URGENT';
        reasoning: string;
        suggestedAction?: string;
    };

    marketContext?: MarketContextSnapshot;
    predictedWindow?: PredictiveWindow;
    hiddenSignals?: HiddenSignal[];
    actionIntelligence?: ActionIntelligence;
    strategicScore?: number;

    status: 'NEW' | 'ACTED' | 'DISMISSED';
}

export interface RadarCalibration {
    opportunityDefinition: string; // What exactly are we looking for?
    noiseDefinition: string; // What should be ignored?
    sensitivity: number; // 1-10. 1=Broad, 10=Laser Focused
}

export interface RadarSettings {
    isEnabled: boolean;
    monitoredGroups: string[];
    keywordsInclude: string[];
    keywordsExclude: string[];
    calibration?: RadarCalibration; // NEW
}

export interface GroupMarketMemory {
    groupJid: string;
    lastUpdated: string;
    avgResponseTime: number;
    successfulWindows: number;
    sentimentHistory: string[];
}
// -----------------------

// --- NETWORK 1.0 TYPES ---
export type PermissionStatus = 'PENDING' | 'GRANTED' | 'DENIED' | 'NOT_REQUESTED';

export interface IntentSignal {
    id: string;
    userId: string; // ID of the user who contributed this signal
    prospectJid: string; // Original JID of the prospect (for sending permission message)
    prospectName: string; // Name of the prospect
    prospectIdentifierHash: string; // SHA256 of JID for privacy in network matching
    intentCategories: string[]; // e.g., ['Marketing Digital', 'Inversiones']
    intentDescription: string; // Summary of the prospect's intent
    signalScore: number; // 0-100, strength of intent
    contributedAt: string;
}

export interface ConnectionOpportunity {
    id: string;
    contributedByUserId: string; // User ID who contributed the signal
    receivedByUserId: string;   // User ID who received this opportunity
    intentSignalId: string;     // Reference to the original IntentSignal
    
    // Prospect details (only revealed after permission)
    prospectOriginalJid: string; // Actual JID, revealed if permission GRANTED
    prospectName: string;        // Actual name, revealed if permission GRANTED

    intentCategories: string[];
    intentDescription: string;
    opportunityScore: number; // Calculated match score

    permissionStatus: PermissionStatus;
    requestedAt?: string;
    respondedAt?: string;
    connectionMadeAt?: string; // When the receiving business actually connected
    
    createdAt: string;
}

export interface NetworkProfile {
    networkEnabled: boolean;
    categoriesOfInterest: string[]; // Categories of signals this user wants to receive
    contributionScore: number; // How many signals this user has contributed
    receptionScore: number; // How many opportunities this user has successfully converted
    lastActivity?: string;
}
// -----------------------

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type ScheduleType = 'ONCE' | 'DAILY' | 'WEEKLY';

export interface Campaign {
    id: string;
    userId: string;
    name: string;
    message: string;
    imageUrl?: string; // Base64 or URL
    groups: string[];
    status: CampaignStatus;
    schedule: {
        type: ScheduleType;
        startDate: string;
        time: string;
        daysOfWeek?: number[];
    };
    config: {
        minDelaySec: number;
        maxDelaySec: number;
        // NEW CONFIGS
        operatingWindow?: {
            startHour: number; // 0-23
            endHour: number;   // 0-23
        };
        useSpintax: boolean; // Enables {Hello|Hi} rotation
    };
    stats: {
        totalSent: number;
        totalFailed: number;
        lastRunAt?: string;
        nextRunAt?: string;
    };
    createdAt: string;
}

export interface WhatsAppGroup {
    id: string;
    subject: string;
    size?: number;
}

export type SimulationScenario = 'STANDARD_FLOW' | 'PRICE_OBJECTION' | 'COMPETITOR_COMPARISON' | 'GHOSTING_RISK' | 'CONFUSED_BUYER';

export interface EvaluationResult {
    score: number;
    outcome: 'SUCCESS' | 'FAILURE' | 'NEUTRAL';
    detectedFailurePattern?: string;
    insights: string[];
}

export interface SimulationRun {
    id: string;
    timestamp: string;
    scenario: SimulationScenario;
    brainVersionSnapshot: {
        archetype: string;
        tone: number;
    };
    durationSeconds: number;
    evaluation: EvaluationResult;
}

export interface SimulationLab {
    experiments: SimulationRun[];
    aggregatedScore: number;
    topFailurePatterns: Record<string, number>;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'owner' | 'elite_bot'; 
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
  isTestBotConversation?: boolean; 
}

export interface BotSettings {
  productName: string;
  productDescription: string;
  priceText: string;
  ticketValue: number; // NEW: Real Ticket Value for metrics
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
  isWizardCompleted: boolean; 
  pwaEnabled: boolean;
  pushEnabled: boolean;
  audioEnabled: boolean;
  ttsEnabled: boolean;
  ignoredJids: string[];
  isNetworkEnabled: boolean; // NEW: Network participation toggle
}

export interface User {
  id: string; 
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
  
  is_founder?: boolean;

  // DEPTH ENGINE
  depthLevel: number; // Base depth (default: 1)

  settings: BotSettings;
  conversations: Record<string, Conversation>;
  
  radar?: RadarSettings;
  networkProfile?: NetworkProfile; // NEW: User's network participation profile

  governance: {
    systemState: SystemState;
    riskScore: number;
    accountFlags: string[];
    updatedAt: string;
    auditLogs: { timestamp: string; adminId: string; action: string }[];
    humanDeviationScore: number;
  };

  simulationLab?: SimulationLab;
  
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
  campaignsActive: number;
  campaignMessagesSent: number;
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
    totalSignalsProcessed: number; // NEW
    activeHotLeads: number;
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
  _id?: string; // Made optional
  userId: string;
  name?: string; // Made optional
  location?: string; // Made optional
  text: string;
  createdAt: string;
  updatedAt?: string; // Add this, as it's used in server.ts seeding
}

export interface SystemSettings {
    supportWhatsappNumber: string;
    logLevel: LogLevel;
    dominionNetworkJid?: string; // FIX: Made optional to handle potential missing data from API
}
