
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

// --- COLOR UTILS ---
const COLORS = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
    Gray: "\x1b[90m",
};

const TAG_COLORS: Record<string, string> = {
    '[DB]': COLORS.Cyan,
    '[REDIS]': COLORS.Magenta,
    '[SOCKET]': COLORS.Green,
    '[HYDRA]': COLORS.Blue,
    '[AUTH]': COLORS.Yellow,
    '[TTS]': COLORS.Blue,
    '[SERVER]': COLORS.White,
    '[WORKER]': COLORS.Blue,
    '[CAMPAIGN]': COLORS.Magenta,
    '[RADAR]': COLORS.Red,
    '[WA]': COLORS.Green,
    '[INFO]': COLORS.White
};

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

    private colorizeTags(message: string): string {
        let coloredMessage = message;
        for (const [tag, color] of Object.entries(TAG_COLORS)) {
            if (message.includes(tag)) {
                coloredMessage = coloredMessage.replace(tag, `${color}${tag}${COLORS.Reset}`);
            }
        }
        return coloredMessage;
    }

    private log(level: LogLevel, message: string, userId?: string, username?: string, metadata?: Record<string, any>): void {
        const timestamp = new Date();
        const logEntry = {
            timestamp: timestamp.toISOString(),
            level,
            message,
            userId,
            username,
            metadata,
        };
        
        // Log to console only if level is high enough
        if (CONSOLE_LOG_LEVELS[level] >= CURRENT_LOG_LEVEL) {
            const levelColorMap = { 
                DEBUG: COLORS.Gray, 
                INFO: COLORS.Blue, 
                WARN: COLORS.Yellow, 
                ERROR: COLORS.Red, 
                AUDIT: COLORS.Magenta 
            };
            
            const time = timestamp.toLocaleTimeString();
            const userPart = username ? `(${username})` : (userId ? `(${userId})` : '');
            
            // Format: [TIME] [LEVEL] [TAG] Message (User)
            const formattedMessage = this.colorizeTags(message);
            
            // Use levelColor for the [LEVEL] tag
            const levelTag = `${levelColorMap[level]}[${level}]${COLORS.Reset}`;
            
            console.log(`${COLORS.Gray}[${time}]${COLORS.Reset} ${levelTag} ${formattedMessage} ${COLORS.Gray}${userPart}${COLORS.Reset}`);
        }

        // Persist to database (excluding debug logs)
        if (level !== 'DEBUG') {
            if (db.isReady()) {
                db.createLog(logEntry).catch(e => console.error("Failed to persist log (DB Write Error):", e.message));
            }
        }
    }
}

export const logService = new LogService();
