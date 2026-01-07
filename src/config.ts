
/**
 * DOMINION BOT - Configuración de Infraestructura (FRONTEND-ONLY)
 * ESTRICTO: La variable de entorno de Vercel es la ÚNICA fuente de verdad.
 */

// FIX: Define types for Vite's import.meta.env to resolve TypeScript errors.
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export const STORAGE_KEY_BACKEND = 'dominion_backend_url';

/**
 * URL del Backend Resuelta:
 * Prioridad 0: Override Manual (LocalStorage) - Para recuperar acceso si la URL cambia.
 * Prioridad 1: Variable de Entorno VITE_BACKEND_URL.
 * Fallback: Localhost (solo para desarrollo local si no hay variable).
 */
const getBackendUrl = (): string => {
    // 0. Check LocalStorage Override (Browser only)
    if (typeof window !== 'undefined') {
        const manualUrl = localStorage.getItem(STORAGE_KEY_BACKEND);
        if (manualUrl) return manualUrl;
    }

    // 1. Variable de Entorno (Vercel / Producción / .env)
    const viteUrl = (import.meta as any).env.VITE_BACKEND_URL;
    
    if (viteUrl && viteUrl.length > 0) {
        return viteUrl.replace(/\/$/, ''); // Quitar slash final si existe
    }

    // 2. Fallback Desarrollo Local
    return "http://localhost:3001";
};

export const BACKEND_URL = getBackendUrl();

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK Y CORS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // BYPASS NGROK WARNING PAGE (Legacy Support)
    'Accept': 'application/json'
};

/**
 * Helper para generar headers con autenticación
 */
export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});

// Logs de inicialización solo visibles en el navegador
if (typeof window !== 'undefined') {
    console.log(`%c 🦅 DOMINION NETWORK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;');
    console.log(`%c 🔗 API Target: ${BACKEND_URL}`, 'color: #D4AF37; font-family: monospace;');
}
