
import { db } from '../database.js';
import { LogLevel } from '../types.js';

class LogService {
    public info(message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        this.log('INFO', message, userId, username, metadata);
    }

    public warn(message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        this.log('WARN', message, userId, username, metadata);
    }

    // FIX: Updated `error` method signature to accept an optional `additionalMetadata` parameter.
    public error(message: string, error: any, userId?: string, username?: string, additionalMetadata?: Record<string, any>): void {
        const metadata = {
            error_message: error.message,
            error_stack: error.stack,
            ...additionalMetadata, // Merge additional metadata provided by the caller
        };
        this.log('ERROR', message, userId, username, metadata);
    }

    public audit(message: string, userId: string, username: string, metadata?: Record<string, any>): void {
        this.log('AUDIT', message, userId, username, metadata);
    }

    private log(level: LogLevel, message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            userId,
            username,
            metadata,
        };
        
        // Log to console for real-time debugging
        const colorMap = { INFO: '\x1b[34m', WARN: '\x1b[33m', ERROR: '\x1b[31m', AUDIT: '\x1b[35m' };
        console.log(`${colorMap[level]}[${level}]\x1b[0m ${message} ${username ? `(${username})` : ''}`);

        // Persist to database
        db.createLog(logEntry).catch(e => console.error("Failed to persist log:", e));
    }
}

export const logService = new LogService();