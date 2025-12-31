# 🔊 SISTEMA DE AUDIO Y TEXT-TO-SPEECH (TTS)

Este documento detalla la arquitectura y el funcionamiento del sistema de feedback auditivo de Dominion.

---

### 1. Propósito

El sistema de audio tiene dos objetivos principales:

1.  **Feedback de Interfaz (UI/UX):** Proporcionar confirmación auditiva para las acciones del usuario (éxito, error, clics). Esto hace que la interfaz se sienta más responsiva y "viva".
2.  **Inmersión y Branding:** Reforzar la identidad de marca "Elite" y "High-Tech" de Dominion a través de una voz sintética profesional y sonidos de sistema distintivos.

---

### 2. Arquitectura de Dos Componentes

El sistema se divide en un componente de backend para la generación y uno de frontend para la reproducción.

#### a. Backend: `ttsService.ts` (Generación)

- **Responsabilidad:** Pre-generar los archivos de audio para todos los eventos de la aplicación.
- **Tecnología:** Utiliza la API de Gemini (`gemini-2.5-flash-preview-tts`) para convertir texto a voz.
- **Proceso (`init`):**
    1.  Al iniciar el servidor, el `ttsService` se inicializa.
    2.  Verifica la existencia de un directorio `/public/audio`. Si no existe, lo crea.
    3.  Itera sobre una lista predefinida de eventos y textos (`AUDIO_EVENTS`).
    4.  Para cada evento, comprueba si ya existe un archivo `.mp3` correspondiente.
    5.  Si el archivo **no existe**, realiza una llamada a la API de Gemini para generar el audio.
    6.  El audio se recibe como una cadena base64, se decodifica a un buffer y se guarda como un archivo `.mp3` en `/public/audio`.
- **Endpoint:** Expone una ruta `GET /api/tts/:eventName` que sirve estos archivos de audio estáticos.

#### b. Frontend: `audioService.ts` (Reproducción)

- **Responsabilidad:** Gestionar la carga y reproducción de los sonidos en el navegador.
- **Tecnología:** Web Audio API (`AudioContext`).
- **Proceso (`play`):**
    1.  **Inicialización del Contexto:** El `AudioContext` solo puede ser creado o reanudado después de una interacción del usuario (clic, tecla). El servicio está diseñado para manejar esta restricción del navegador.
    2.  **Cache:** Mantiene un `Map` en memoria (`audioCache`) para almacenar los `AudioBuffer` ya decodificados.
    3.  Cuando se llama a `audioService.play('evento')`:
        - Si el audio está en caché, lo reproduce inmediatamente.
        - Si no está en caché, realiza un `fetch` a `/api/tts/evento`.
        - Recibe el `ArrayBuffer` del audio `.mp3` (que en realidad es PCM crudo).
        - Utiliza la función `decodeRawAudioData` para convertir el `ArrayBuffer` en un `AudioBuffer` reproducible.
        - Almacena el `AudioBuffer` en la caché para futuras reproducciones.
        - Reproduce el audio.

---

### 3. Decodificación de Audio Crudo (`audioUtils.ts`)

- **Problema:** La API de Gemini TTS devuelve datos de audio **PCM crudos**, no un formato de archivo estándar como MP3 o WAV. No tiene cabeceras.
- **Solución:** La función `decodeRawAudioData` lee el `ArrayBuffer` como una secuencia de enteros de 16 bits (`Int16Array`). Luego, normaliza estos valores a un rango de -1.0 a 1.0 (que es lo que requiere la Web Audio API) y los carga en un `AudioBuffer`.

---

### 4. Listado de Eventos de Audio

| Evento                        | Texto a Generar                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `landing_intro`               | "Bienvenido a la infraestructura de Dominion..."                                     |
| `login_welcome`               | "Bienvenido al núcleo de tu sistema autonomo comercial."                           |
| `connection_establishing`     | "Estableciendo túnel hacia whatsapp..."                                            |
| `connection_pending`          | "Pendiente de enlace. Escanee el código para continuar."                           |
| `connection_success`          | "Nodo sincronizado. Sistema en línea."                                             |
| `connection_disconnected`     | "Nodo desconectado."                                                               |
| `action_success`              | "Sincronización exitosa."                                                          |
| `action_success_feedback`     | "Reseña publicada. Gracias por tu feedback."                                       |
| `alert_warning_trial_ended`   | "Atención: Tu período de prueba ha finalizado."                                    |
| `alert_error_generic`         | "Acción fallida. Por favor, intenta nuevamente."                                   |
| ...                           | (Lista completa en `ttsService.ts`)                                                |
