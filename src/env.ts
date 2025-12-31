
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dominion_local';
export const PORT = process.env.PORT || 3001;

console.log(`[ENV] Config Loaded. Secret Hash: ${JWT_SECRET.length > 5 ? '***' + JWT_SECRET.slice(-4) : 'WEAK'}`);
