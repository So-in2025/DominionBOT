/**
 * DOMINION BOT - Configuración de Infraestructura
 * Este archivo es compartido entre el Frontend (Vite) y el Backend (Node.js).
 */

// Referencia segura al scope global para evitar errores "Cannot find name 'window'" en el build del servidor.
const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;

// Detección segura de la URL del Backend desde variables de entorno
const getEnvUrl = () => {
    // 1. Intentar proceso de Node.js (Backend)
    if (typeof process !== 'undefined' && process.env && process.env.VITE_BACKEND_URL) {
        return process.env.VITE_BACKEND_URL;
    }
    // 2. Intentar import.meta de Vite (Frontend)
    try {
        const meta = (import.meta as any);
        if (meta && meta.env && meta.env.VITE_BACKEND_URL) {
            return meta.env.VITE_BACKEND_URL;
        }
    } catch (e) {}
    return null;
};

const envUrl = getEnvUrl();

// Detección de entorno local sin referenciar 'window' directamente como identificador
const getIsLocal = () => {
    try {
        const win = g.window;
        if (win && win.location) {
            const hostname = win.location.hostname;
            return hostname === 'localhost' || 
                   hostname === '127.0.0.1' || 
                   hostname.startsWith('192.168.');
        }
    } catch (e) {}
    return false;
};

const isLocal = getIsLocal();

/**
 * URL del Backend Resuelta:
 * 1. Prioridad: Variable de entorno configurada.
 * 2. Desarrollo: Localhost 3001 si estamos en navegador local.
 * 3. Fallback: URL de túnel Ngrok activa.
 */
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : (isLocal ? 'http://localhost:3001' : 'https://unblanketed-waylon-arbitrarily.ngrok-free.dev'); 

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK Y CORS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
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
    console.log(`%c API_TARGET: ${BACKEND_URL} `, 'color: #D4AF37; font-family: monospace;');
}
