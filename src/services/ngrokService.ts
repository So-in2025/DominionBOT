
import { logService } from './logService.js';

// Ngrok local API usually runs on port 4040
const NGROK_LOCAL_API = 'http://127.0.0.1:4040/api/tunnels';

class NgrokService {
    private currentUrl: string | null = null;

    /**
     * Intenta descubrir la URL pública de Ngrok consultando la API local.
     */
    public async detectPublicUrl(): Promise<string | null> {
        try {
            // Use a short timeout to avoid blocking startup if ngrok isn't running
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); 

            const response = await fetch(NGROK_LOCAL_API, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const data: { tunnels?: any[] } = await response.json();
            const tunnels = data.tunnels;

            if (tunnels && tunnels.length > 0) {
                // Prefer HTTPS tunnel
                const httpsTunnel = tunnels.find((t: any) => t.public_url.startsWith('https'));
                const tunnel = httpsTunnel || tunnels[0];
                
                if (tunnel) {
                    const newUrl = tunnel.public_url;
                    if (newUrl !== this.currentUrl) {
                        this.currentUrl = newUrl;
                        logService.info(`[NGROK-AUTO] 🌍 NUEVA URL PÚBLICA DETECTADA: ${newUrl}`, 'SYSTEM');
                        console.log('\x1b[32m%s\x1b[0m', `\n    👉 COPIA ESTA URL PARA EL FRONTEND: ${newUrl}\n`);
                    }
                    return newUrl;
                }
            }
        } catch (e) {
            // Silent fail, usually means ngrok is not running locally or port is different
        }
        return null;
    }

    public startAutoDetection(intervalMs: number = 30000) {
        // Initial check
        this.detectPublicUrl();
        // Polling
        setInterval(() => this.detectPublicUrl(), intervalMs);
    }
}

export const ngrokService = new NgrokService();