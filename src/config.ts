
// Detección automática del entorno
// Prioridad: Variable de Entorno > Localhost por defecto
// @ts-ignore
const envUrl = import.meta.env?.VITE_BACKEND_URL;

// Lógica de limpieza de URL
export const BACKEND_URL = envUrl 
    ? envUrl.replace(/\/$/, '') 
    : 'http://localhost:3001'; 

// LOG DE DEPURACIÓN (Visible en Consola del Navegador)
console.log(`%c 🦅 DOMINION INFRASTRUCTURE DETECTED `, 'background: #D4AF37; color: #000; font-weight: bold; padding: 4px;');
console.log(`%c 🎯 TARGET NODE: ${BACKEND_URL} `, 'background: #000; color: #D4AF37; border: 1px solid #D4AF37;');

// HEADERS GLOBALES (CRÍTICO PARA NGROK)
// 'ngrok-skip-browser-warning': Evita la pantalla de "Visit Site" que rompe los fetchs
export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true' 
};

// Helper para peticiones autenticadas
export const getAuthHeaders = (token: string | null) => ({
    ...API_HEADERS,
    'Authorization': `Bearer ${token || ''}`
});
