import { ConnectionStatus, WhatsAppGroup } from '../types.js';

export type WhatsAppProviderId = 'baileys' | 'cloud';

export interface SendMessageOptions {
    imageUrl?: string;
    caption?: string;
}

export interface SendMessageResult {
    messageId?: string;
    raw?: any;
}

export interface ProviderSessionStatus {
    status: ConnectionStatus;
    qr?: string;
    pairingCode?: string;
}

export interface ProviderMetrics {
    lastMessageReceived: Date | null;
    lastMessageSent: Date | null;
    messagesProcessed: number;
    messagesSent: number;
    reconnectionsCount: number;
    lastEventReceived: Date | null;
}

/**
 * Contrato arquitectónico unificado para proveedores de WhatsApp en Dominion.
 * Permite desacoplar el dominio de Dominion (campañas, radar, inbox, bot de IA)
 * de las implementaciones concretas (Baileys o Meta Cloud API).
 */
export interface WhatsAppProvider {
    readonly id: WhatsAppProviderId;
    readonly name: string;

    // Ciclo de vida y conexión
    connect(userId: string, phoneNumber?: string, isManual?: boolean): Promise<void>;
    disconnect(userId: string, persistConfig?: boolean): Promise<void>;
    softReset(userId: string): Promise<void>;
    purgeSession(userId: string): Promise<void>;

    // Estado y telemetría
    getStatus(userId: string): ProviderSessionStatus;
    isConnected(userId: string): boolean;
    getMetrics(): ProviderMetrics;

    // Mensajería
    sendMessage(senderId: string, to: string, text: string, options?: SendMessageOptions): Promise<SendMessageResult>;
    
    // Grupos
    fetchUserGroups(userId: string): Promise<WhatsAppGroup[]>;

    // Cierre limpio de infraestructura
    shutdownAll(): Promise<void>;
}
