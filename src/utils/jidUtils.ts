
/**
 * Normaliza un JID de WhatsApp para garantizar consistencia en todo el sistema.
 * Maneja la conversión de @lid a @s.whatsapp.net y limpieza de espacios/casing.
 * SI detecta que es solo números (y longitud > 5), asume que es un usuario y agrega @s.whatsapp.net
 * 
 * FUENTE ÚNICA DE VERDAD PARA JID (BLOQUE 1)
 */
export function normalizeJid(jid: string | undefined | null): string | undefined {
    if (!jid) return undefined;

    let clean = jid.trim();

    // 1. Handle LID
    clean = clean.replace(/@lid/g, '@s.whatsapp.net');

    // 2. Handle raw numbers (missing suffix)
    // If it contains ONLY digits and is long enough to be a phone number, append suffix.
    // Exclude 'status@broadcast' or existing suffixes.
    if (/^\d+$/.test(clean) && clean.length > 5) {
        clean = `${clean}@s.whatsapp.net`;
    }

    return clean.toLowerCase();
}
