import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 1. Detectar qué archivo existe (.env o .env.local)
// Fixed: Removed process.cwd() to resolve type errors; path.resolve defaults to the CWD when relative paths are used.
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
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dominion_local';
export const PORT = process.env.PORT || 3001;

// Debug de seguridad (solo muestra los últimos 4 caracteres)
const secretDisplay = JWT_SECRET === 'dominion-local-secret-key' ? 'DEFAULT_DEV_KEY' : `...${JWT_SECRET.slice(-4)}`;
console.log(`[ENV] JWT Key Hash: [${secretDisplay}]`);