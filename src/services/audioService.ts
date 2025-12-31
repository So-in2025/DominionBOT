import { getAuthHeaders, BACKEND_URL, API_HEADERS } from '../config.js';
import { decodeRawAudioData } from '../utils/audioUtils.js';

class AudioService {
    private audioContext: AudioContext | null = null;
    private audioCache = new Map<string, AudioBuffer>();
    private isMuted = false;

    constructor() {
        // Inicializar AudioContext solo después de una interacción del usuario
    }

    public async initContext() {
        if (!this.audioContext) {
            try {
                console.log('[AudioService] Creating new AudioContext.');
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                console.log(`[AudioService] Initial context state: ${this.audioContext.state}`);
                if (this.audioContext.state === 'suspended') {
                    console.log('[AudioService] Context is suspended, attempting to resume...');
                    await this.audioContext.resume();
                    console.log(`[AudioService] Context resumed. New state: ${this.audioContext.state}`);
                }
            } catch (e) {
                console.error("AudioContext no es soportado o no se pudo inicializar.", e);
            }
        } else if (this.audioContext.state === 'suspended') {
            try {
                console.log('[AudioService] Existing context is suspended, attempting to resume...');
                await this.audioContext.resume();
                console.log(`[AudioService] Context resumed. New state: ${this.audioContext.state}`);
            } catch (e) {
                 console.error("Failed to resume AudioContext.", e);
            }
        }
    }

    public async play(eventName: string): Promise<void> {
        console.log(`[AudioService] Attempting to play: ${eventName}`);
        await this.initContext();
        
        if (this.isMuted) {
            console.log(`[AudioService] Muted, skipping play for ${eventName}`);
            return;
        }
        if (!this.audioContext) {
            console.error(`[AudioService] AudioContext is null, cannot play ${eventName}. Waiting for user interaction.`);
            return;
        }
        console.log(`[AudioService] Context state for ${eventName}: ${this.audioContext.state}`);
        
        if (this.audioContext.state === 'suspended') {
            console.warn(`[AudioService] AudioContext still suspended for ${eventName}. Playback will likely fail silently. Needs user interaction.`);
        }

        if (this.audioCache.has(eventName)) {
            console.log(`[AudioService] Playing ${eventName} from cache.`);
            this._playBuffer(this.audioCache.get(eventName)!);
            return;
        }

        try {
            console.log(`[AudioService] Fetching audio for ${eventName} from ${BACKEND_URL}...`);
            const token = localStorage.getItem('saas_token');

            // Build headers specifically for an audio file request, not JSON
            const headers: Record<string, string> = {
                'ngrok-skip-browser-warning': 'true',
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${BACKEND_URL}/api/tts/${eventName}`, { headers });
            
            console.log(`[AudioService] Fetch response for ${eventName}: Status ${response.status}`);

            if (!response.ok) {
                throw new Error(`Fallo al obtener el audio para ${eventName}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength < 100 || arrayBuffer.byteLength % 2 !== 0) {
                 console.error(`[AudioService] Received empty or invalid audio buffer for ${eventName}. Length: ${arrayBuffer.byteLength}`);
                 return;
            }
            console.log(`[AudioService] Received ArrayBuffer of length ${arrayBuffer.byteLength} for ${eventName}. Decoding...`);
            
            const audioBuffer = await decodeRawAudioData(arrayBuffer, this.audioContext, 24000, 1);
            
            this.audioCache.set(eventName, audioBuffer);
            this._playBuffer(audioBuffer);
            console.log(`[AudioService] Successfully scheduled ${eventName} for playback.`);

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