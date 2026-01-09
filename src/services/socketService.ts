
import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js';
import { logService } from './logService.js';
import { SocketEvents } from '../types.js';

class SocketService {
    private io: Server | null = null;

    /**
     * Initializes the Socket.IO server.
     * Must be called in server.ts after creating the HTTP server.
     */
    public init(httpServer: HttpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: "*", 
                methods: ["GET", "POST"]
            },
            path: '/socket.io',
            // OPTIMIZACIÓN MÓVIL: Aumentamos tolerancia
            // 60s timeout permite que un móvil con mala señal no se desconecte inmediatamente
            pingTimeout: 60000, 
            // 25s intervalo de ping para mantener vivo el túnel Cloudflare
            pingInterval: 25000,
            // Permitir transportes flexibles
            transports: ['polling', 'websocket'] 
        });

        // Authentication Middleware
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
            
            if (!token) {
                return next(new Error('Authentication error: Token missing'));
            }

            try {
                const decoded = jwt.verify(token as string, JWT_SECRET) as any;
                // Attach user data to the socket object for later use
                (socket as any).user = decoded;
                next();
            } catch (err) {
                return next(new Error('Authentication error: Invalid token'));
            }
        });

        this.io.on('connection', (socket: Socket) => {
            const user = (socket as any).user;
            
            // logService.debug(`[SOCKET] Cliente conectado: ${user.username}`, user.id);

            // AUTO-JOIN: Automatically join the user to a room named by their User ID.
            // This is CRITICAL for targeting specific users from the backend.
            socket.join(user.id);
            
            // Optionally join a specific role room (e.g. 'super_admin')
            if (user.role === 'super_admin') {
                socket.join('super_admin');
            }

            socket.on(SocketEvents.DISCONNECT, (reason) => {
                // Solo loguear si es una desconexión inesperada, no cierre de pestaña
                if (reason !== 'transport close' && reason !== 'client namespace disconnect') {
                     // logService.debug(`[SOCKET] Cliente desconectado (${reason}): ${user.username}`, user.id);
                }
            });
        });

        console.log(`\x1b[32m✅ [SOCKET] Servicio de Real-Time inicializado (Mobile-Optimized).\x1b[0m`);
    }

    /**
     * Emit an event to a specific user (by their User ID).
     */
    public emitToUser(userId: string, event: SocketEvents, data: any) {
        if (!this.io) {
            console.warn('[SOCKET] Warning: Emitting event before initialization.');
            return;
        }
        this.io.to(userId).emit(event, data);
    }

    /**
     * Emit an event to all super admins.
     */
    public emitToAdmins(event: SocketEvents, data: any) {
        if (!this.io) return;
        this.io.to('super_admin').emit(event, data);
    }
}

export const socketService = new SocketService();
