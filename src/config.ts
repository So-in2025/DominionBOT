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
        return process.env.BACKEND_URL;
    }
    // 2. Intentar import.meta de Vite (Frontend)
    try {
        const meta = (import.meta as any);
        if (meta && meta.env && meta.env.VITE_BACKEND_URL) {
            return meta.env.VITE_BACKEND_URL;
        }
    } catch (e) {
        // Suppress client-side errors if import.meta.env is not available (e.g., SSR build tools)
    }
    return undefined; // Explicitly return undefined if not found
};

/**
 * URL del Backend Resuelta:
 * 1. Prioridad: Variable de entorno configurada (`VITE_BACKEND_URL` en frontend, `BACKEND_URL` en backend).
 * 2. Si no se encuentra, será `undefined`, lo que debe ser manejado por la aplicación para alertar al usuario.
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
        console.warn(`%c ⚠️ ALERTA CRÍTICA: BACKEND_URL NO ESTÁ DEFINIDA.`, 'background: #FF0000; color: #FFFFFF; font-weight: bold; padding: 5px 10px; border-radius: 5px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);');
        // FIX: Escaped command-line instructions within console.warn messages
        console.warn(`%c PASOS CLAVE PARA LA CONFIGURACIÓN DEL BACKEND_URL:
1. Si estás usando NGROK para desarrollo local:
   - Inicia tu backend (\`npm run server:dev\`).
   - Inicia NGROK (\`ngrok http 3001\` o el puerto que use tu backend).
   - COPIA la URL HTTPS que te da NGROK (ej. 'https://xxxxx.ngrok-free.dev').
   - Actualiza tu archivo '.env.local' (para desarrollo) o las variables de entorno de Vercel (para deploy) con:
     'VITE_BACKEND_URL=https://[TU_NUEVA_URL_DE_NGROK]'.
   - Reinicia tu frontend (\`npm run client:dev\` o redeploy en Vercel).
2. Si tu backend está en Render (o un servidor estable):
   - Usa la URL pública de tu servicio Render para 'VITE_BACKEND_URL'.
3. ¡ES FUNDAMENTAL que RE-DEPLOYES tu frontend en Vercel después de cada cambio de 'VITE_BACKEND_URL' si cambias tu túnel de Ngrok!`, 'background: #FF0000; color: #FFFFFF; font-weight: bold; padding: 10px; border-radius: 5px; line-height: 1.5; white-space: pre-wrap;');
    }
}