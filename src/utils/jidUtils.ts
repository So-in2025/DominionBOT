/**
 * Normaliza un JID de WhatsApp para garantizar consistencia en todo el sistema.
 * Maneja la conversión de @lid a @s.whatsapp.net y limpieza de espacios/casing.
 * 
 * FUENTE ÚNICA DE VERDAD PARA JID (BLOQUE 1)
 */
export function normalizeJid(jid: string | undefined | null): string | undefined {
    if (!jid) return undefined;

    return jid
        .replace(/@lid/g, '@s.whatsapp.net')
        .trim()
        .toLowerCase();
}