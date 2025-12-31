
// Detección automática del entorno
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// Lógica de limpieza de URL: Prioriza ENV, si no, usa el Ngrok proporcionado por el usuario
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : 'https://unblanketed-waylon-arbitrarily.ngrok-free.dev'; 

// LOG DE DEPURACIÓN
console.log(`%c 🔗 DOMINION LINK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 2px;');
console.log(`%c TARGET: ${BACKEND_URL} `, 'background: #000; color: #D4AF37;');

// HEADERS OBLIGATORIOS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true' 
};

// Helper para peticiones con Token
export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});
