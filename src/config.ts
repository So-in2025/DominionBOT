
// Detección automática del entorno
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// Lógica de limpieza de URL: Si hay variable de entorno, úsala. Si no, usa localhost.
// NUNCA usa Render hardcodeado.
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : 'http://localhost:3001'; 

// LOG DE DEPURACIÓN (Abre la consola F12 para ver esto)
console.log(`%c ⚡ DOMINION NETWORK LINK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;');
console.log(`%c TARGET: ${BACKEND_URL} `, 'background: #000; color: #D4AF37; border: 1px solid #D4AF37; padding: 2px;');

// HEADERS OBLIGATORIOS (CRÍTICO PARA NGROK)
// Sin esto, Ngrok devuelve HTML en lugar de JSON y rompe la app.
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true' 
};

// Helper para peticiones autenticadas
export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});
