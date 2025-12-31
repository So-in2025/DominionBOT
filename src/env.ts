import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 1. Detectar qué archivo existe (.env o .env.local)
const envPath = path.resolve('.env');
const localEnvPath = path.resolve('.env.local');

// 2. Cargar configuración
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[ENV] Cargado desde .env`);
} else if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
    console.log(`[ENV] Cargado desde .env.local`);
} else {
    console.log(`[ENV] No se encontraron archivos de entorno. Usando valores por defecto.`);
}

// 3. Exportar constantes ÚNICAS para toda la app
// Si no existe la variable, usa 'dominion-local-secret-key' SIEMPRE.
export const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:C3WcIkonjZ4tnYUN@cluster0.rxgrwk7.mongodb.net/dominion_local?retryWrites=true&w=majority&appName=Cluster0';
export const PORT = process.env.PORT || 3001;
// Export Gemini API key. CRÍTICO: Asegúrate de que esta variable esté definida en tu archivo .env o .env.local
// Ejemplo: API_KEY=TU_CLAVE_DE_GEMINI_AQUI
export const API_KEY = process.env.API_KEY || ''; 

// Debug de seguridad (solo muestra los últimos 4 caracteres)
const secretDisplay = JWT_SECRET === 'dominion-local-secret-key' ? 'DEFAULT_DEV_KEY' : `...${JWT_SECRET.slice(-4)}`;
console.log(`[ENV] JWT Key Hash: [${secretDisplay}]`);