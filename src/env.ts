
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
export const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:C3WcIkonjZ4tnYUN@cluster0.rxgrwk7.mongodb.net/dominion_local?retryWrites=true&w=majority&appName=Cluster0';
export const PORT = process.env.PORT || 3001;
export const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
export const ENABLE_GOD_MODE = process.env.ENABLE_GOD_MODE === 'true';

// Debug de seguridad (solo muestra los últimos 4 caracteres)
const secretDisplay = JWT_SECRET === 'dominion-local-secret-key' ? 'DEFAULT_DEV_KEY' : `...${JWT_SECRET.slice(-4)}`;
console.log(`[ENV] Log Level: [${LOG_LEVEL}]`);
console.log(`[ENV] JWT Key Hash: [${secretDisplay}]`);
if (ENABLE_GOD_MODE) console.warn('[ENV] ⚠️ God Mode está HABILITADO.');
