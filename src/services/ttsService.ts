
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logService } from './logService.js';
import { Buffer } from 'buffer';
import { generateAudioWithFallback } from './geminiService.js';

const AUDIO_EVENTS: Record<string, string> = {
    // Landing Page
    landing_intro: "Bienvenido a la infraestructura de Dominion. Has activado el protocolo de bienvenida. En un mundo saturado de información, la velocidad y la inteligencia no son una ventaja, son una necesidad. Este sistema no es un simple bot. Es un núcleo de inteligencia comercial diseñado para una sola cosa: filtrar el ruido y entregarte únicamente las oportunidades de venta reales, en tiempo real. Sigue explorando para entender cómo esta tecnología puede cambiar tu forma de vender para siempre.",
    // Login & General
    login_welcome: "Bienvenido al núcleo de tu sistema autonomo comercial.",
    // Connection Status
    connection_establishing: "Estableciendo túnel hacia whatsapp...",
    connection_pending: "Pendiente de enlace. Escanee el código para continuar.",
    connection_success: "Nodo sincronizado. Sistema en línea.",
    connection_disconnected: "Nodo desconectado.",
    // Success Notifications
    action_success: "Sincronización exitosa.",
    action_success_feedback: "Reseña publicada. Gracias por tu feedback.",
    admin_action_success: "Operación completada.", // Generic for admin actions
    // Alerts & Warnings
    alert_error_apikey: "API Key inválida o caducada.",
    alert_error_connection: "Alerta: Fallo de conexión con el nodo central.",
    alert_warning_trial_ended: "Atención: Tu período de prueba ha finalizado.",
    alert_error_generic: "Acción fallida. Por favor, intenta nuevamente.",
    alert_error_credentials: "Algun dato parece incorrecto, revisa e intenta nuevamente.",
    // RADAR 3.0
    radar_ping: "Atención: Oportunidad comercial de alto valor detectada en el radar."
};


class TtsService {
    private audioDir: string;
    private isGenerating = false;

    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.audioDir = path.resolve(__dirname, '..', '..', 'public', 'audio');
    }

    public async getOrGenerate(eventName: string): Promise<Buffer | null> {
        const audioPath = path.join(this.audioDir, `${eventName}.mp3`);
        if (fs.existsSync(audioPath)) {
            try {
                return await fs.promises.readFile(audioPath);
            } catch {
                return null;
            }
        }

        const text = AUDIO_EVENTS[eventName];
        if (!text) return null;

        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) return null;

        try {
            const response = await generateAudioWithFallback(apiKey, text, 'Kore');
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) return null;

            const audioBuffer = Buffer.from(base64Audio, 'base64');
            await fs.promises.mkdir(this.audioDir, { recursive: true });
            await fs.promises.writeFile(audioPath, audioBuffer);
            return audioBuffer;
        } catch {
            return null;
        }
    }

    public async init() {
        if (this.isGenerating) return;
        this.isGenerating = true;

        try {
            await fs.promises.mkdir(this.audioDir, { recursive: true });
        } catch (error) {
            logService.warn('[TTS] No se pudo crear el directorio de audio.');
            this.isGenerating = false;
            return;
        }

        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logService.info('[TTS] API_KEY de Gemini no configurada.');
            this.isGenerating = false;
            return;
        }

        logService.info('[TTS] Verificando biblioteca de audios en segundo plano...');

        let consecutiveFailures = 0;
        for (const [eventName, text] of Object.entries(AUDIO_EVENTS)) {
            const audioPath = path.join(this.audioDir, `${eventName}.mp3`);
            
            if (fs.existsSync(audioPath)) {
                continue; // Skip if audio already exists
            }

            try {
                const response = await generateAudioWithFallback(apiKey, text, 'Kore');

                const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Audio) {
                    throw new Error("La respuesta de la API no contenía datos de audio.");
                }

                const audioBuffer = Buffer.from(base64Audio, 'base64');
                await fs.promises.writeFile(audioPath, audioBuffer);
                consecutiveFailures = 0;

                // Rate limit spacing between TTS calls
                await new Promise((r) => setTimeout(r, 3000));

            } catch (error: any) {
                consecutiveFailures++;
                logService.warn(`[TTS] Audio "${eventName}" se generará bajo demanda (${error?.message || 'indisponible'}).`);
                if (consecutiveFailures >= 2) {
                    logService.info('[TTS] Pre-generación pausada; los audios se sintetizarán dinámicamente según se requieran.');
                    break;
                }
            }
        }
        this.isGenerating = false;
    }
}

export const ttsService = new TtsService();
