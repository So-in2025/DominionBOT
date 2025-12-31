/**
 * DOMINION BOT - Configuración de Infraestructura
 * Este archivo es compartido entre el Frontend (Vite) y el Backend (Node.js).
 */

// Referencia segura al scope global para evitar errores "Cannot find name 'window'" en el build del servidor.
const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;

// Detección segura de la URL del Backend desde variables de entorno
const getEnvUrl = () => {
    // 1. Intentar proceso de Node.js (Backend)
    if (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) {
        // console.log(`[ENV_DEBUG] Backend: process.env.BACKEND_URL found: ${process.env.BACKEND_URL}`);
        return process.env.BACKEND_URL;
    }
    // 2. Intentar import.meta de Vite (Frontend)
    try {
        const meta = (import.meta as any);
        if (meta && meta.env && meta.env.VITE_BACKEND_URL) {
            // console.log(`[ENV_DEBUG] Frontend: import.meta.env.VITE_BACKEND_URL found: ${meta.env.VITE_BACKEND_URL}`);
            return meta.env.VITE_BACKEND_URL;
        } else {
            // Log raw value of VITE_BACKEND_URL even if undefined
            if (typeof g.window !== 'undefined') {
                 console.warn(`%c [ENV_WARNING] Frontend: import.meta.env.VITE_BACKEND_URL es: "${meta?.env?.VITE_BACKEND_URL}" (esperado un valor aquí). Cayendo a valor por defecto.`, 'background: #FFD700; color: #333; padding: 2px 6px; border-radius: 4px;');
            }
        }
    } catch (e) {
        if (typeof g.window !== 'undefined') { // Only warn in browser context
            console.warn(`[ENV_WARNING] Frontend: Error al acceder a import.meta.env: ${e}. Cayendo a valor por defecto.`);
        }
    }
    return null;
};

const envUrl = getEnvUrl();

/**
 * URL del Backend Resuelta:
 * 1. Prioridad: Variable de entorno configurada (`VITE_BACKEND_URL` en frontend, `BACKEND_URL` en backend).
 * 2. Fallback (si no hay variable de entorno): `https://unblanketed-waylon-arbitrarily.ngrok-free.dev`.
 */
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : 'https://unblanketed-waylon-arbitrarily.ngrok-free.dev'; 

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
    console.log(`%c API_TARGET: ${BACKEND_URL} `, 'color: #D4AF37; font-family: monospace;');
    if (BACKEND_URL.includes('ngrok-free.dev') && !envUrl) {
        console.warn(`%c ⚠️ ALERTA: El frontend está usando la URL de Ngrok hardcodeada. Asegúrate de configurar VITE_BACKEND_URL en Vercel para una URL dinámica y segura.`, 'background: #FFA500; color: #000000; font-weight: bold; padding: 5px 10px; border-radius: 5px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);');
        console.warn(`%c PASOS CLAVE PARA UNA CONFIGURACIÓN ÓPTIMA (PARA DEPLOYMENT EN VERCEL):
1. Ve a tu proyecto en Vercel -> Settings -> Environment Variables.
2. Asegúrate de que tienes una variable llamada 'VITE_BACKEND_URL' con el VALOR CORRECTO de tu URL de Ngrok o tu dominio personalizado del backend.
3. ¡ES FUNDAMENTAL que DISPARES un NUEVO DEPLOYMENT en Vercel después de configurar la variable!`, 'background: #FFA500; color: #000000; font-weight: bold; padding: 10px; border-radius: 5px; line-height: 1.5; white-space: pre-wrap;');
    } else {
        console.log(`%c ✅ CONEXIÓN CONFIRMADA: Frontend usando URL: ${BACKEND_URL}`, 'background: #4CAF50; color: #FFFFFF; font-weight: bold; padding: 3px 8px; border-radius: 3px;');
    }
}