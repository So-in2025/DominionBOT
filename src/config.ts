
/**
 * DOMINION BOT - Configuración de Infraestructura
 * Este archivo es compartido entre el Frontend (Vite) y el Backend (Node.js).
 */

// Referencia segura al scope global para evitar errores "Cannot find name 'window'" en el build del servidor.
const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;

// CLAVE DE ALMACENAMIENTO LOCAL PARA LA URL DINÁMICA
export const STORAGE_KEY_BACKEND = 'dominion_backend_url';

// Detección segura y ordenada de la URL del Backend
const getEnvUrl = (): { url: string; source: string } => {
    // 1. PRIORIDAD MÁXIMA: URL dinámica desde LocalStorage (Smart Link del Frontend)
    if (typeof g.window !== 'undefined' && g.localStorage) {
        const storedUrl = g.localStorage.getItem(STORAGE_KEY_BACKEND);
        if (storedUrl && storedUrl.startsWith('http')) {
            return { url: storedUrl, source: 'LocalStorage (Smart Link)' };
        }
    }

    // 2. ENTORNO VITE (Vercel / Frontend Build)
    try {
        const meta = (import.meta as any);
        if (meta && meta.env && meta.env.VITE_BACKEND_URL) {
            return { url: meta.env.VITE_BACKEND_URL, source: 'Vite Env (Vercel)' };
        }
    } catch (e) {
        // No es un entorno Vite, ignorar error.
    }

    // 3. ENTORNO NODE.JS (Backend local)
    if (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) {
        return { url: process.env.BACKEND_URL, source: 'Node.js Env' };
    }
    
    // 4. FALLBACK PARA DESARROLLO LOCAL PURO (si no hay .env)
    if (typeof g.window !== 'undefined') {
        const hostname = g.window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return { url: "http://localhost:3001", source: 'Localhost Fallback' };
        }
    }

    // Default final si todo falla
    return { url: "http://localhost:3001", source: 'Default Fallback' }; 
};

const resolvedConfig = getEnvUrl();

/**
 * URL del Backend Resuelta:
 */
export const BACKEND_URL: string | undefined = resolvedConfig.url.replace(/\/$/, '');

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK Y CORS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // BYPASS NGROK WARNING PAGE
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
if (typeof g.window !== 'undefined') {
    console.log(`%c 🦅 DOMINION NETWORK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;');
    if (BACKEND_URL) {
        console.log(`%c 🔗 API Target: ${BACKEND_URL}`, 'color: #D4AF37; font-family: monospace;');
        console.log(`%c 💡 Source: ${resolvedConfig.source}`, 'background: #222; color: #aaa; font-size: 10px; padding: 1px 4px; border-radius: 2px;');
    } else {
        console.warn(`%c ⚠️ ALERTA CRÍTICA: BACKEND_URL NO ESTÁ DEFINIDA.`, 'background: #FF0000; color: #FFFFFF; font-weight: bold; padding: 5px 10px; border-radius: 5px;');
    }
}
