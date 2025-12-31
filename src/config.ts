
// Detección de Backend para Frontend en Vercel
// 1. En Vercel: Usará VITE_BACKEND_URL (que será tu link de Ngrok).
// 2. En Local (Desarrollo): Usará localhost:3001.

const getBackendUrl = () => {
    // @ts-ignore
    const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
    
    if (envUrl) {
        return envUrl.trim().replace(/\/$/, '');
    }

    // Fallback para desarrollo local
    return 'http://localhost:3001';
};

export const BACKEND_URL = getBackendUrl();

console.log("🦅 Target Backend Node:", BACKEND_URL);
