
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 1. Detectar qué archivo existe (.env o .env.local)
const envPath = path.resolve('.env');
const localEnvPath = path.resolve('.env.local');

// 2. Cargar configuración
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    console.log(`[ENV] Cargado desde .env`);
} else if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: false });
    console.log(`[ENV] Cargado desde .env.local`);
} else {
    console.warn(`[ENV] ⚠️ No se encontraron archivos .env. Asegúrate de tener las variables de entorno configuradas.`);
}

// 3. VALIDACIÓN DE SEGURIDAD
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Validación crítica: JWT_SECRET
export const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'dominion-local-secret-key');

if (IS_PRODUCTION && (!JWT_SECRET || JWT_SECRET === 'dominion-local-secret-key')) {
    const fatalError = '[SECURITY FATAL] En entorno de producción (NODE_ENV=production), JWT_SECRET es OBLIGATORIO y no puede ser el valor por defecto. Configure una clave segura en las variables de entorno.';
    console.error(`\x1b[31m${fatalError}\x1b[0m`);
    throw new Error(fatalError);
}

if (IS_PRODUCTION && !process.env.MONGO_URI) {
    const fatalError = '[SECURITY FATAL] En entorno de producción (NODE_ENV=production), MONGO_URI es OBLIGATORIO. El sistema no puede operar en modo degradado en producción.';
    console.error(`\x1b[31m${fatalError}\x1b[0m`);
    throw new Error(fatalError);
}

if (!process.env.MONGO_URI) {
    console.warn('\x1b[33m%s\x1b[0m', '\n[WARN] MONGO_URI no está definido. Operando en modo degradado/offline (Solo desarrollo).');
}

// 4. Credenciales maestras configurables por entorno
export const MASTER_ADMIN_USER = process.env.MASTER_ADMIN_USER || 'master';
export const MASTER_ADMIN_PASSWORD = process.env.MASTER_ADMIN_PASSWORD || (IS_PRODUCTION ? '' : 'dominion2024');

if (IS_PRODUCTION && !MASTER_ADMIN_PASSWORD) {
    const fatalError = '[SECURITY FATAL] En entorno de producción (NODE_ENV=production), MASTER_ADMIN_PASSWORD es OBLIGATORIO.';
    console.error(`\x1b[31m${fatalError}\x1b[0m`);
    throw new Error(fatalError);
}

// 5. Exportar constantes
export const MONGO_URI = process.env.MONGO_URI; 
export const REDIS_URL = process.env.REDIS_URL || (IS_PRODUCTION ? '' : 'redis://127.0.0.1:6379');

if (IS_PRODUCTION && !process.env.REDIS_URL) {
    const fatalError = '[SECURITY FATAL] En entorno de producción (NODE_ENV=production), REDIS_URL es OBLIGATORIO para persistencia y colas BullMQ.';
    console.error(`\x1b[31m${fatalError}\x1b[0m`);
    throw new Error(fatalError);
}
export const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
if (!process.env.API_KEY && process.env.GEMINI_API_KEY) {
    process.env.API_KEY = process.env.GEMINI_API_KEY;
}
// AI Studio container uses NGINX on 8080 forwarding to 3000. Node must listen on 3000.
export const PORT = (process.env.PORT === '8080' || !process.env.PORT) ? 3000 : Number(process.env.PORT);
export const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
export const ENABLE_GOD_MODE = process.env.ENABLE_GOD_MODE === 'true';
export const WA_PROVIDER = (process.env.WA_PROVIDER || 'baileys').toLowerCase().trim();

// Debug de seguridad (solo muestra los últimos 4 caracteres del secret si existe)
const secretDisplay = !JWT_SECRET 
    ? 'EMPTY' 
    : JWT_SECRET === 'dominion-local-secret-key' 
        ? 'DEFAULT_DEV_KEY' 
        : `...${JWT_SECRET.slice(-4)}`;

console.log(`[ENV] Entorno: [${NODE_ENV}] | Log Level: [${LOG_LEVEL}] | Proveedor WA: [${WA_PROVIDER}]`);
console.log(`[ENV] JWT Key Hash: [${secretDisplay}]`);
