
import { BACKEND_URL } from '../config.js';
import { hexToRgb, interpolateColor } from './colorUtils.js'; // Import new color utilities
import { SystemSettings } from '../types.js'; // Import SystemSettings type

export const formatPhoneNumber = (input: string | undefined): string => {
    if (!input) return 'Desconocido';
    
    // Remove JID suffix if present and non-numeric chars
    const clean = input.split('@')[0].replace(/[^0-9]/g, '');
    
    // Format Argentina (Mendoza/General) numbers
    // Typical format: 549 (Country+Mobile) + 261 (Area) + 1234567 (Number)
    if (clean.startsWith('549') && clean.length >= 12) {
        // Extract Area Code (usually 3 digits after 549, e.g. 261)
        const areaCode = clean.substring(3, 6);
        const number = clean.substring(6);
        // Format: +54 9 261 123-4567
        return `+54 9 ${areaCode} ${number.substring(0, 3)}-${number.substring(3)}`;
    }
    
    // Generic formatting only if it looks like a standard international number (10-13 digits)
    // This avoids formatting internal IDs (often very long) as phone numbers.
    if (clean.length >= 10 && clean.length <= 13) {
        return `+${clean}`;
    }
    
    // Fallback for IDs or unknown formats
    return clean;
};

export const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
};

export const openSupportWhatsApp = async (message: string = 'Hola, necesito ayuda con Dominion Bot.') => {
    let supportNumber = '5492617145654'; // Default fallback number
    
    try {
        // Use fetch only if available (mostly for client-side)
        if (typeof fetch !== 'undefined') {
            const res = await fetch(`${BACKEND_URL}/api/system/settings`);
            if (res.ok) {
                const data: SystemSettings = await res.json();
                if (data && data.supportWhatsappNumber && data.supportWhatsappNumber.length > 8) {
                    supportNumber = data.supportWhatsappNumber;
                }
            }
        }
    } catch (e) {
        console.warn("Failed to fetch support number dynamically, using fallback.");
    }

    const url = `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
    
    const globalScope = globalThis as any;
    if (globalScope.window) {
        globalScope.window.open(url, '_blank');
    } else {
        console.log(`[SERVER-SIDE] Would open URL: ${url}`);
    }
};