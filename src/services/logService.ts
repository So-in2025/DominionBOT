

import { db } from '../database.js';
import { LogLevel } from '../types.js';
import { LOG_LEVEL } from '../env.js';

const CONSOLE_LOG_LEVELS: { [key in LogLevel]: number } = {
    'DEBUG': 0,
    'INFO': 1,
    'WARN': 2,
    'ERROR': 3,
    'AUDIT': 4
};

const CURRENT_LOG_LEVEL = CONSOLE_LOG_LEVELS[LOG_LEVEL.toUpperCase() as LogLevel] ?? CONSOLE_LOG_LEVELS.INFO;

class LogService {
    public debug(message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        this.log('DEBUG', message, userId, username, metadata);
    }
    
    public info(message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        this.log('INFO', message, userId, username, metadata);
    }

    public warn(message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        this.log('WARN', message, userId, username, metadata);
    }

    public error(message: string, error: any, userId?: string, username?: string, additionalMetadata?: Record<string, any>): void {
        const metadata = {
            error_message: error?.message || 'Unknown Error',
            error_stack: error?.stack,
            ...additionalMetadata,
        };
        this.log('ERROR', message, userId, username, metadata);
    }

    public audit(message: string, userId: string, username: string, metadata?: Record<string, any>): void {
        this.log('AUDIT', message, userId, username, metadata);
    }

    private log(level: LogLevel, message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        const timestamp = new Date();
        const logEntry = {
            // FIX: Convert Date object to ISO string to match the LogEntry type.
            timestamp: timestamp.toISOString(),
            level,
            message,
            userId,
            username,
            metadata,
        };
        
        // Log to console only if level is high enough
        if (CONSOLE_LOG_LEVELS[level] >= CURRENT_LOG_LEVEL) {
            const colorMap = { DEBUG: '\x1b[90m', INFO: '\x1b[34m', WARN: '\x1b[33m', ERROR: '\x1b[31m', AUDIT: '\x1b[35m' };
            const time = timestamp.toLocaleTimeString();
            const userPart = username ? `(${username})` : (userId ? `(${userId})` : '');
            console.log(`\x1b[90m[${time}]\x1b[0m ${colorMap[level]}[${level}]\x1b[0m ${message} \x1b[90m${userPart}\x1b[0m`);
        }

        // Persist to database (excluding debug logs)
        if (level !== 'DEBUG') {
            db.createLog(logEntry).catch(e => console.error("Failed to persist log:", e));
        }
    }
}

export const logService = new LogService();