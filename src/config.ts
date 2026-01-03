/**
 * DOMINION BOT - Configuración de Infraestructura (FRONTEND-ONLY)
 * Este archivo está optimizado para ser procesado por Vite y no debe ser importado en el backend.
 */

// FIX: Define types for Vite's import.meta.env to resolve TypeScript errors.
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CLAVE DE ALMACENAMIENTO LOCAL PARA LA URL DINÁMICA (SMART LINK)
export const STORAGE_KEY_BACKEND = 'dominion_backend_url';

// Detección segura y ordenada de la URL del Backend para el cliente.
const getEnvUrl = (): { url: string; source: string } => {
    // 1. PRIORIDAD MÁXIMA: URL dinámica desde LocalStorage (Smart Link del Frontend)
    // Permite al usuario final sobreescribir la URL sin necesidad de un redeploy.
    if (typeof window !== 'undefined' && window.localStorage) {
        const storedUrl = window.localStorage.getItem(STORAGE_KEY_BACKEND);
        if (storedUrl && storedUrl.startsWith('http')) {
            return { url: storedUrl, source: 'LocalStorage (Smart Link)' };
        }
    }

    // 2. ENTORNO VITE (Vercel / Build de Producción)
    // Vite reemplaza 'import.meta.env.VITE_BACKEND_URL' con el valor real durante el build.
    // Esta es la forma correcta y principal de configurar la URL en producción.
    // FIX: Cast import.meta to `any` to access the `env` property, as the TypeScript compiler is not picking up the interface augmentation.
    const viteUrl = (import.meta as any).env.VITE_BACKEND_URL;
    if (viteUrl && viteUrl.length > 5) {
        return { url: viteUrl, source: 'Vite Environment (Vercel)' };
    }

    // 3. ENTORNO DE DESARROLO LOCAL
    // 'import.meta.env.DEV' es una variable booleana que Vite establece en true cuando corres 'npm run dev'.
    // FIX: Cast import.meta to `any` to access the `env` property, as the TypeScript compiler is not picking up the interface augmentation.
    if ((import.meta as any).env.DEV) {
        return { url: "http://localhost:3001", source: 'Local Dev Fallback' };
    }
    
    // 4. RED DE SEGURIDAD (FALLBACK DE PRODUCCIÓN)
    // Si el build de producción se ejecuta sin la variable VITE_BACKEND_URL, usará esta URL
    // en lugar de fallar o usar localhost. Es un último recurso.
    const HARDCODED_BACKEND_URL = "https://unblanketed-waylon-arbitrarily.ngrok-free.dev";
    return { url: HARDCODED_BACKEND_URL, source: 'Hardcoded Production Fallback' };
};

const resolvedConfig = getEnvUrl();

/**
 * URL del Backend Resuelta:
 * Se elimina cualquier barra final para consistencia.
 */
export const BACKEND_URL: string | undefined = resolvedConfig.url.replace(/\/$/, '');

// HEADERS OBLIGATORIOS PARA EVITAR BLOQUEOS DE NGROK Y CORS
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // BYPASS NGROK WARNING PAGE
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
if (typeof window !== 'undefined') {
    console.log(`%c 🦅 DOMINION NETWORK `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;');
    if (BACKEND_URL) {
        console.log(`%c 🔗 API Target: ${BACKEND_URL}`, 'color: #D4AF37; font-family: monospace;');
        console.log(`%c 💡 Source: ${resolvedConfig.source}`, 'background: #222; color: #aaa; font-size: 10px; padding: 1px 4px; border-radius: 2px;');
    } else {
        console.warn(`%c ⚠️ ALERTA CRÍTICA: BACKEND_URL NO ESTÁ DEFINIDA.`, 'background: #FF0000; color: #FFFFFF; font-weight: bold; padding: 5px 10px; border-radius: 5px;');
    }
}