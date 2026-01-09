
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';

class SocketClient {
    // Used 'any' to bypass strict type definition mismatches in socket.io-client versions
    private socket: any | null = null;

    connect(token: string) {
        if (this.socket && this.socket.connected) return;

        // Ensure we don't create multiple instances
        if (this.socket) {
            this.socket.disconnect();
        }

        console.log('[SOCKET-CLIENT] Iniciando conexión a:', BACKEND_URL);

        // Cast options to any to resolve TS error about 'transports' property not existing on ManagerOptions in some versions
        const opts: any = {
            path: '/socket.io',
            auth: { token },
            // IMPORTANTE: Polling primero es más estable en túneles Cloudflare/Ngrok gratuitos
            // Websocket upgrade se hará automáticamente si es posible.
            // Para redes móviles con firewall o proxys, polling es mandatorio al inicio.
            transports: ['polling', 'websocket'], 
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            // Aumentar timeout del cliente también para evitar falsos positivos "offline"
            timeout: 20000, 
        };

        this.socket = io(BACKEND_URL || 'http://localhost:3001', opts);

        this.socket.on('connect', () => {
            console.log('✅ [SOCKET-CLIENT] Conectado. ID:', this.socket?.id);
        });

        this.socket.on('connect_error', (err: any) => {
            console.warn('⚠️ [SOCKET-CLIENT] Error de conexión:', err.message);
        });

        this.socket.on('disconnect', (reason: any) => {
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
