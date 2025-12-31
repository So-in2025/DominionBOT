/**
 * DOMINION BOT - Configuración de Infraestructura
 * Este archivo es compartido entre el Frontend (Vite) y el Backend (Node.js).
 */

// Referencia segura al scope global para evitar errores "Cannot find name 'window'" en el build del servidor.
const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;

// --- ZONA DE EMERGENCIA: HARDCODE ---
// Ponemos tu URL de Ngrok directamente aquí para que funcione SÍ o SÍ.
// Si cambia tu Ngrok, solo actualiza esta línea y redeploya.
const MANUAL_BACKEND_URL = "https://unblanketed-waylon-arbitrarily.ngrok-free.dev"; 
// ------------------------------------

// Detección segura de la URL del Backend desde variables de entorno
const getEnvUrl = () => {
    // 1. Si hay un hardcode manual, ÚSALO. Prioridad absoluta.
    if (MANUAL_BACKEND_URL) {
        return MANUAL_BACKEND_URL;
    }

    // 2. Intentar proceso de Node.js (Backend)
    if (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) {
        return process.env.BACKEND_URL;
    }
    // 3. Intentar import.meta de Vite (Frontend)
    try {
        const meta = (import.meta as any);
        if (meta && meta.env) {
            if (meta.env.VITE_BACKEND_URL) {
                return meta.env.VITE_BACKEND_URL;
            }
        }
    } catch (e) {
        // Suppress client-side errors
    }
    return undefined; 
};

/**
 * URL del Backend Resuelta:
 */
export const BACKEND_URL: string | undefined = getEnvUrl()?.replace(/\/$/, '');

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK Y CORS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // Mantener este header, es útil para Ngrok
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
        console.log(`%c API_TARGET: ${BACKEND_URL} `, 'color: #D4AF37; font-family: monospace;');
        console.log(`%c ✅ CONEXIÓN CONFIRMADA: Frontend usando URL: ${BACKEND_URL}`, 'background: #4CAF50; color: #FFFFFF; font-weight: bold; padding: 3px 8px; border-radius: 3px;');
    } else {
        console.warn(`%c ⚠️ ALERTA CRÍTICA: BACKEND_URL NO ESTÁ DEFINIDA.`, 'background: #FF0000; color: #FFFFFF; font-weight: bold; padding: 5px 10px; border-radius: 5px;');
    }
}