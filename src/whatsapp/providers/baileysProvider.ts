import { WhatsAppGroup } from '../../types.js';
import {
    WhatsAppProvider,
    WhatsAppProviderId,
    SendMessageOptions,
    SendMessageResult,
    ProviderSessionStatus,
    ProviderMetrics
} from '../types.js';
import {
    connectToWhatsApp,
    disconnectWhatsApp,
    softResetConnection,
    purgeSession,
    getSessionStatus,
    isSessionConnected,
    sendMessage as clientSendMessage,
    fetchUserGroups as clientFetchUserGroups,
    waMetrics,
    activeSessions
} from '../client.js';
import { logService } from '../../services/logService.js';

/**
 * Implementación de WhatsAppProvider respaldada por Baileys (WhatsApp Web Multi-Device).
 * Mantiene intacta toda la lógica previa de autenticación en MongoDB, anti-loop Bad MAC,
 * reconexión exponencial y cola secuencial de envíos.
 */
export class BaileysProvider implements WhatsAppProvider {
    public readonly id: WhatsAppProviderId = 'baileys';
    public readonly name: string = 'Baileys Multi-Device (Web Protocol)';

    public async connect(userId: string, phoneNumber?: string, isManual: boolean = false): Promise<void> {
        return connectToWhatsApp(userId, phoneNumber, isManual);
    }

    public async disconnect(userId: string, persistConfig: boolean = false): Promise<void> {
        return disconnectWhatsApp(userId, persistConfig);
    }

    public async softReset(userId: string): Promise<void> {
        return softResetConnection(userId);
    }

    public async purgeSession(userId: string): Promise<void> {
        return purgeSession(userId);
    }

    public getStatus(userId: string): ProviderSessionStatus {
        return getSessionStatus(userId);
    }

    public isConnected(userId: string): boolean {
        return isSessionConnected(userId);
    }

    public getMetrics(): ProviderMetrics {
        return waMetrics;
    }

    public async sendMessage(
        senderId: string,
        to: string,
        text: string,
        options?: SendMessageOptions
    ): Promise<SendMessageResult> {
        const sent = await clientSendMessage(senderId, to, text, options?.imageUrl);
        return {
            messageId: sent?.key?.id,
            raw: sent
        };
    }

    public async fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
        return clientFetchUserGroups(userId);
    }

    public async shutdownAll(): Promise<void> {
        logService.info('[WA-PROVIDER] Deteniendo todas las sesiones activas de Baileys...');
        for (const [userId] of activeSessions.entries()) {
            try {
                await disconnectWhatsApp(userId, true);
            } catch (err) {
                logService.error(`[WA-PROVIDER] Error deteniendo sesión de ${userId}`, err, userId);
            }
        }
    }
}
