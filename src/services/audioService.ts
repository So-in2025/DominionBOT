
import { getAuthHeaders, BACKEND_URL } from '../config';

class AudioService {
    private audioContext: AudioContext | null = null;
    private audioCache = new Map<string, AudioBuffer>();
    private isMuted = false;

    constructor() {
        // Inicializar AudioContext solo después de una interacción del usuario
    }

    private async initContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
            } catch (e) {
                console.error("AudioContext no es soportado o no se pudo inicializar.", e);
            }
        }
    }

    public async play(eventName: string): Promise<void> {
        await this.initContext();
        if (!this.audioContext || this.isMuted) return;

        if (this.audioCache.has(eventName)) {
            this._playBuffer(this.audioCache.get(eventName)!);
            return;
        }

        try {
            const token = localStorage.getItem('saas_token');
            if (!token) return;

            const response = await fetch(`${BACKEND_URL}/api/tts/${eventName}`, {
                headers: getAuthHeaders(token)
            });

            if (!response.ok) {
                throw new Error(`Fallo al obtener el audio para ${eventName}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.audioCache.set(eventName, audioBuffer);
            this._playBuffer(audioBuffer);

        } catch (error) {
            console.error(`Error al procesar el audio para ${eventName}:`, error);
        }
    }

    private _playBuffer(buffer: AudioBuffer): void {
        if (!this.audioContext) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
    }
}

export const audioService = new AudioService();
