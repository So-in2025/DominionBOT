import { WhatsAppProvider, WhatsAppProviderId, SendMessageOptions, SendMessageResult } from './types.js';
import { BaileysProvider } from './providers/baileysProvider.js';
import { logService } from '../services/logService.js';

// Re-export types
export * from './types.js';

// Re-export domain-level constants and AI processing from client for backward compatibility
export {
    ELITE_BOT_JID,
    ELITE_BOT_NAME,
    DOMINION_NETWORK_JID,
    processAiResponseForJid,
    activeSessions,
    waMetrics
} from './client.js';

/**
 * Fábrica de proveedores WhatsApp.
 * Lee la variable de entorno WA_PROVIDER ('baileys' | 'cloud').
 * NOTA: El modo 'cloud' (Meta WhatsApp Cloud API) NO está implementado en esta fase.
 * Si se especifica 'cloud', debe lanzar un ERROR EXPLÍCITO y detener la inicialización
 * para evitar que producción opere accidentalmente con Baileys.
 */
function createProvider(): WhatsAppProvider {
    const rawProvider = process.env.WA_PROVIDER || 'baileys';
    const configuredProvider = rawProvider.toLowerCase().trim() as WhatsAppProviderId;

    if (configuredProvider === 'cloud') {
        const errorMsg = '[CRITICAL FATAL] WA_PROVIDER=cloud fue configurado, pero Meta WhatsApp Cloud Provider todavía NO está implementado en esta versión. Se detiene la inicialización para evitar que producción opere con un proveedor no deseado.';
        logService.error(errorMsg);
        console.error(`\x1b[31m${errorMsg}\x1b[0m`);
        throw new Error(errorMsg);
    }

    if (configuredProvider === 'baileys') {
        logService.info(`[WA-FACTORY] Proveedor activo inicializado: BaileysProvider (WA_PROVIDER=${configuredProvider})`);
        return new BaileysProvider();
    }

    const errorMsg = `[CRITICAL FATAL] Proveedor WhatsApp desconocido: "${rawProvider}". Opciones válidas: "baileys", "cloud".`;
    logService.error(errorMsg);
    console.error(`\x1b[31m${errorMsg}\x1b[0m`);
    throw new Error(errorMsg);
}

/**
 * Instancia singleton activa del proveedor de WhatsApp
 */
export const whatsAppProvider: WhatsAppProvider = createProvider();

export function getWhatsAppProvider(): WhatsAppProvider {
    return whatsAppProvider;
}

// -------------------------------------------------------------------------
// FUNCIONES DE FACHADA DE ALTO NIVEL PARA EL DOMINIO DE DOMINION
// Permiten llamar a las operaciones sin acoplarse directamente a Baileys
// -------------------------------------------------------------------------

export async function connectToWhatsApp(userId: string, phoneNumber?: string, isManual: boolean = false): Promise<void> {
    return whatsAppProvider.connect(userId, phoneNumber, isManual);
}

export async function disconnectWhatsApp(userId: string, persistConfig: boolean = false): Promise<void> {
    return whatsAppProvider.disconnect(userId, persistConfig);
}

export async function softResetConnection(userId: string): Promise<void> {
    return whatsAppProvider.softReset(userId);
}

export async function purgeSession(userId: string): Promise<void> {
    return whatsAppProvider.purgeSession(userId);
}

export function getSessionStatus(userId: string) {
    return whatsAppProvider.getStatus(userId);
}

export function isSessionConnected(userId: string): boolean {
    return whatsAppProvider.isConnected(userId);
}

export async function sendMessage(senderId: string, to: string, text: string, imageUrl?: string): Promise<any> {
    const res = await whatsAppProvider.sendMessage(senderId, to, text, { imageUrl });
    return res.raw || res;
}

export async function fetchUserGroups(userId: string) {
    return whatsAppProvider.fetchUserGroups(userId);
}

export async function shutdownAllWhatsAppSessions(): Promise<void> {
    return whatsAppProvider.shutdownAll();
}
