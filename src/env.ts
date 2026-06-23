
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
    console.warn(`[ENV] ⚠️ No se encontraron archivos .env. Asegúrate de tener las variables de entorno configuradas.`);
}

// 3. VALIDACIÓN DE SEGURIDAD CRÍTICA
// Si no hay MONGO_URI configurado, detenemos el arranque para evitar usar defaults inseguros.
if (!process.env.MONGO_URI) {
    console.error('\x1b[31m%s\x1b[0m', '\n[FATAL ERROR] MONGO_URI no está definido.');
    console.error('Por seguridad, Dominion no iniciará sin una base de datos propia.');
    console.error('Crea un archivo .env y agrega: MONGO_URI=mongodb+srv://...\n');
    (process as any).exit(1);
}

// 4. Exportar constantes
export const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';
export const MONGO_URI = process.env.MONGO_URI; 
export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const PORT = process.env.PORT || 3000;
export const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
export const ENABLE_GOD_MODE = process.env.ENABLE_GOD_MODE === 'true';

// Debug de seguridad (solo muestra los últimos 4 caracteres del secret)
const secretDisplay = JWT_SECRET === 'dominion-local-secret-key' ? 'DEFAULT_DEV_KEY' : `...${JWT_SECRET.slice(-4)}`;
console.log(`[ENV] Log Level: [${LOG_LEVEL}]`);
console.log(`[ENV] JWT Key Hash: [${secretDisplay}]`);
