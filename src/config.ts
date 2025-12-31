
// Detección de Backend para Arquitectura Híbrida (Vercel + Tu PC)

const getBackendUrl = () => {
    // 1. Si está en Vercel, buscará la variable de entorno VITE_BACKEND_URL (tu link de Ngrok)
    // @ts-ignore
    const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
    
    // Si hay una URL en Vercel, la usamos.
    if (envUrl) {
        return envUrl.trim().replace(/\/$/, '');
    }

    // 2. Si no hay variable (estás en local o la variable falló), usa localhost.
    // Esto asegura que si abres la app en tu navegador local, funcione directo.
    return 'http://localhost:3001';
};

export const BACKEND_URL = getBackendUrl();

console.log("🦅 DOMINION TARGET:", BACKEND_URL);
