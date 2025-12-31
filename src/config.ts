
// Detección automática del entorno
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// Detectar si estamos en un entorno local para facilitar el desarrollo sin configurar variables
const isLocal = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/**
 * Lógica de resolución de BACKEND_URL:
 * 1. Prioridad: Variable de entorno VITE_BACKEND_URL (para producción/Vercel).
 * 2. Desarrollo: Si el navegador está en localhost, intenta conectar al puerto local 3001.
 * 3. Fallback: URL de túnel estática (Ngrok).
 */
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : (isLocal ? 'http://localhost:3001' : 'https://unblanketed-waylon-arbitrarily.ngrok-free.dev'); 

// LOG DE DEPURACIÓN EN CONSOLA
console.log(`%c 🔗 DOMINION NETWORK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;');
console.log(`%c TARGET: ${BACKEND_URL} `, 'color: #D4AF37; font-family: monospace;');
if (isLocal && !envUrl) {
    console.log(`%c Dev Mode: Usando backend local en puerto 3001 `, 'color: #666; font-style: italic;');
}

// HEADERS OBLIGATORIOS PARA CORS Y NGROK
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true' 
};

// Helper para peticiones con Token
export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});
