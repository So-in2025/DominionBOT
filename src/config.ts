
/**
 * DOMINION BOT - Configuración de Infraestructura
 * ARQUITECTURA: Vercel (Front) <-> Cloudflare Tunnel <-> Local Backend
 */

export const STORAGE_KEY_BACKEND = 'dominion_backend_target';

// FIX: Define types for Vite's import.meta.env
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * URL del Backend Resuelta:
 * Prioridad:
 * 1. LocalStorage (Override manual via UI)
 * 2. Env Variable (Vercel)
 * 3. Localhost (Dev)
 */
const getBackendUrl = (): string => {
    // 1. LocalStorage Override (Dynamic Tunnel Support)
    if (typeof window !== 'undefined') {
        const local = localStorage.getItem(STORAGE_KEY_BACKEND);
        if (local) return local.replace(/\/$/, '');
    }

    // 2. Variable de Entorno (Vercel / Producción / .env)
    const viteUrl = (import.meta as any).env.VITE_BACKEND_URL;
    
    if (viteUrl && viteUrl.length > 0) {
        return viteUrl.replace(/\/$/, ''); // Quitar slash final si existe
    }

    // 3. Same-origin fallback
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    // 4. Fallback Default (Solo Desarrollo Local)
    return "http://localhost:3000";
};

export const BACKEND_URL = getBackendUrl();

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK/CLOUDFLARE
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // Bypass pantalla de advertencia de tuneles
    'Accept': 'application/json'
};

export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});

if (typeof window !== 'undefined') {
    console.log(`%c 🦅 DOMINION TARGET: ${BACKEND_URL} `, 'background: #D4AF37; color: #000; font-weight: bold;');
}
