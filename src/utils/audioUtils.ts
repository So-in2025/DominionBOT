
/**
 * Decodifica un ArrayBuffer que contiene datos de audio PCM crudo de 16 bits.
 * @param arrayBuffer El buffer con los datos de audio.
 * @param ctx El AudioContext para crear el AudioBuffer final.
 * @param sampleRate La tasa de muestreo del audio (ej: 24000 para Gemini TTS).
 * @param numChannels El número de canales (ej: 1 para mono).
 * @returns Una Promise que resuelve a un AudioBuffer reproducible.
 */
export async function decodeRawAudioData(
  arrayBuffer: ArrayBuffer,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  // Los datos vienen como enteros de 16 bits (signed).
  const dataInt16 = new Int16Array(arrayBuffer);
  
  // Calculamos el número de frames de audio.
  const frameCount = dataInt16.length / numChannels;
  
  // Creamos un AudioBuffer vacío con la configuración correcta.
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  // Llenamos el buffer canal por canal.
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    
    // Iteramos sobre los frames y normalizamos las muestras.
    // El formato Int16 va de -32768 a 32767. La Web Audio API necesita floats de -1.0 a 1.0.
    for (let i = 0; i < frameCount; i++) {
      // Obtenemos la muestra para el frame `i` y el canal actual.
      const sample = dataInt16[i * numChannels + channel];
      // Normalizamos dividiendo por el valor máximo de Int16.
      channelData[i] = sample / 32768.0;
    }
  }
  
  return buffer;
}
