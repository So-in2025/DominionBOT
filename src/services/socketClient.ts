
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config';

class SocketClient {
    private socket: Socket | null = null;

    connect(token: string) {
        if (this.socket && this.socket.connected) return;

        // Ensure we don't create multiple instances
        if (this.socket) {
            this.socket.disconnect();
        }

        console.log('[SOCKET-CLIENT] Iniciando conexión a:', BACKEND_URL);

        this.socket = io(BACKEND_URL || 'http://localhost:3001', {
            path: '/socket.io',
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
            console.log('✅ [SOCKET-CLIENT] Conectado. ID:', this.socket?.id);
        });

        this.socket.on('connect_error', (err) => {
            console.warn('⚠️ [SOCKET-CLIENT] Error de conexión:', err.message);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ [SOCKET-CLIENT] Desconectado:', reason);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(event: string, callback: (...args: any[]) => void) {
        if (!this.socket) return;
        this.socket.on(event, callback);
    }

    off(event: string, callback?: (...args: any[]) => void) {
        if (!this.socket) return;
        this.socket.off(event, callback);
    }
    
    emit(event: string, data: any) {
        if (!this.socket) return;
        this.socket.emit(event, data);
    }

    isConnected(): boolean {
        return this.socket?.connected || false;
    }
}

export const socketClient = new SocketClient();
