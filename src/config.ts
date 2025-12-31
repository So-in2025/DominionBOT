
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// 1. URL STRICTA: Si no hay variable en Vercel, no hay conexión. Nada de localhost.
export const BACKEND_URL = envUrl ? envUrl.replace(/\/$/, '') : '';

if (!BACKEND_URL) {
    console.error("🚨 ERROR FATAL: Variable VITE_BACKEND_URL no detectada. Configure esto en Vercel.");
} else {
    console.log("🦅 DOMINION TARGET (Ngrok):", BACKEND_URL);
}

// 2. HEADER MÁGICO PARA NGROK
// Esto evita el error 403 Forbidden y la pantalla de "Visit Site"
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true' 
};

// Helper para headers con Auth
export const getAuthHeaders = (token: string) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token}`
});
