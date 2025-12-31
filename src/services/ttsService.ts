
import { GoogleGenAI, Modality } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logService } from './logService.js';
import { Buffer } from 'buffer';

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
    alert_error_credentials: "Algun dato parece incorrecto, revisa e intenta nuevamente."
};


class TtsService {
    private audioDir: string;

    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.audioDir = path.resolve(__dirname, '..', '..', 'public', 'audio');
    }

    public async init() {
        logService.info('[TTS] Iniciando servicio de pre-generación de audio...');

        try {
            await fs.promises.mkdir(this.audioDir, { recursive: true });
        } catch (error) {
            logService.error('[TTS] No se pudo crear el directorio de audio.', error);
            return;
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            logService.warn('[TTS] API_KEY de Gemini no encontrada. No se pueden generar audios.');
            return;
        }

        const ai = new GoogleGenAI({ apiKey });

        for (const [eventName, text] of Object.entries(AUDIO_EVENTS)) {
            const audioPath = path.join(this.audioDir, `${eventName}.mp3`);
            
            if (fs.existsSync(audioPath)) {
                continue; // Skip if audio already exists
            }

            try {
                logService.info(`[TTS] Generando audio para el evento: ${eventName}`);
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: 'Kore' }, // Professional and clear voice
                            },
                        },
                    },
                });

                const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Audio) {
                    throw new Error("La respuesta de la API no contenía datos de audio.");
                }

                const audioBuffer = Buffer.from(base64Audio, 'base64');
                await fs.promises.writeFile(audioPath, audioBuffer);

            } catch (error) {
                logService.error(`[TTS] Falló la generación de audio para "${eventName}"`, error);
            }
        }
        logService.info('[TTS] Verificación de audios completada.');
    }
}

export const ttsService = new TtsService();
