
// Configuración de Conexión Estricta (Ngrok / Vercel)
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// Validación de Seguridad: No permitir hardcoding ni fallbacks automáticos
if (!envUrl) {
    console.warn("⚠️ ADVERTENCIA CRÍTICA: VITE_BACKEND_URL no está definida en Vercel. La app no podrá conectarse al túnel Ngrok.");
}

// Limpiamos la URL de barras finales para evitar errores de doble slash //
export const BACKEND_URL = envUrl ? envUrl.replace(/\/$/, '') : '';

console.log("🦅 DOMINION TARGET (Ngrok):", BACKEND_URL || "SIN DEFINIR - REVISAR VARIABLES DE ENTORNO");
