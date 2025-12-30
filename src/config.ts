// Detección automática del entorno
// Si existe la variable de Vercel, la usa. Si no, usa el fallback de producción de Render.
const RAW_URL = ((import.meta as any).env?.VITE_BACKEND_URL) || 'https://dominion-backend-ahsh.onrender.com';

// Limpieza de URL: Elimina espacios y barras al final para evitar errores como "...com//api"
export const BACKEND_URL = RAW_URL.trim().replace(/\/$/, '');

console.log("🦅 Configured Backend Node:", BACKEND_URL);