
// Detección de Backend para Arquitectura Híbrida (Vercel + Tu PC)

const getBackendUrl = () => {
    // 1. Si está en Vercel, buscará la variable de entorno que pusiste (el link de Ngrok)
    // @ts-ignore
    const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
    
    if (envUrl) {
        return envUrl.trim().replace(/\/$/, '');
    }

    // 2. Si no hay variable (estás probando en tu PC), usa el backend local.
    return 'http://localhost:3001';
};

export const BACKEND_URL = getBackendUrl();

console.log("🦅 Conectando a Nodo:", BACKEND_URL);
