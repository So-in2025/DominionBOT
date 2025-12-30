# 🦅 DOCUMENTO MAESTRO: DOMINION OS v2.7.2 (OMNI-EXHAUSTIVE)

## 1. VISIÓN ESTRATÉGICA Y FILOSOFÍA
Dominion OS es una **Infraestructura de Operaciones Comerciales de Grado Enterprise**. Su objetivo es la eliminación del "ruido" en el embudo de ventas mediante la orquestación de nodos emulados de WhatsApp y un motor de señales neurales. 

**Principio de Diseño:** *Fricción Selectiva*. El sistema automatiza la cualificación masiva (frío/tibio) y escala al humano solo cuando se detecta alta intención de compra (caliente), protegiendo la energía del equipo de ventas.

---

## 2. ARQUITECTURA TÉCNICA (DEEP STACK)

### A. Capa de Conectividad (The Node Layer)
*   **Engine Core:** `@whiskeysockets/baileys` v7.0.0-rc.9.
*   **Protocolo:** Emulación de WebSocket para WhatsApp Web.
*   **Browser Identity:** `['Dominion Signal Engine', 'Chrome', '2.4.1']`.
*   **Persistencia de Sesión:** `mongoAuth.ts`. Las credenciales se serializan mediante `BufferJSON` y se almacenan en MongoDB Atlas para reconexión automática sin escaneo de QR.
*   **Heartbeat:** Sistema de reconexión con lógica de backoff exponencial integrado en el cliente de WhatsApp.

### B. Motor de Inferencia Neural (Signal Engine)
*   **Provider:** Google Gemini SDK (`@google/genai`).
*   **Failover Priority:** `gemini-3-flash-preview` (Velocidad) -> `gemini-2.5-flash` (Estabilidad) -> `gemini-3-pro-preview` (Razonamiento Complejo).
*   **Memory Depth:** `MAX_CONTEXT_MESSAGES = 15`. Inyección de historial semántico para mantener la coherencia.
*   **Tactical Debounce:** `DEBOUNCE_TIME_MS = 6000`. Crucial para agrupar ráfagas de mensajes del cliente en una sola inferencia, optimizando el consumo de tokens y el realismo de la respuesta.

### C. Capa de Datos y Persistencia
*   **Database:** MongoDB Atlas (Mongoose 9.1.0).
*   **Modelos de Datos:**
    *   `SaaSUser`: Perfil, configuraciones de IA y métricas de gobernanza.
    *   `BaileysSession`: Almacenamiento binario de llaves de señal y credenciales.
    *   `Conversations`: Mapa de objetos indexado por `JID` (identificador de WhatsApp).

---

## 3. PROMPT ARCHITECTURE (THE 4-LAYER STRATEGY)

### Capa 1: The Constitution (Reglas Hard)
*   **Identidad:** Agente comercial profesional de Mendoza, Argentina.
*   **Restricciones:** Prohibición de emojis, lenguaje coaching y mención de IA.
*   **Localismo:** Español profesional mendocino.
*   **Output:** Formato JSON estricto para procesamiento sistémico.

### Capa 2: Identity Tuning (Sliders Neurales)
Traducción de valores (1-5) a directivas de prompt:
*   **Archetype:** Modifica el objetivo (Consultivo, Closer o Soporte).
*   **Tone Map:** De Formal a Cercano.
*   **Rhythm Map:** De Bulletpoints a Detallado.
*   **Intensity Map:** De Información a Cierre Agresivo.

### Capa 3: Knowledge Base (The Pitch)
*   **Contexto:** Inyectado dinámicamente desde `productDescription`.
*   **Datos Duros:** `priceText` y `ctaLink` (Call to Action).

### Capa 4: Short-Term Memory (Context Layer)
*   **Internal Notes:** Inyección de notas humanas como instrucciones prioritarias para el bot en la siguiente respuesta.

---

## 4. FLUJOS OPERATIVOS (PIPELINES)

### Ciclo de Mensaje (Inbound Pipeline)
1.  **messages.upsert:** Captura de mensaje vía Baileys.
2.  **SSE Dispatch:** Envío de evento `new_message` al frontend en tiempo real.
3.  **Debounce Timer (6s):** Acumulación de mensajes del usuario.
4.  **Presence Update:** `sock.sendPresenceUpdate('composing')`.
5.  **Inferencia:** Ejecución del motor Gemini.
6.  **Signal Extract:** Actualización de `LeadStatus` (COLD, WARM, HOT) y `Tags`.
7.  **Mute Safety Mode:** Si el status es `HOT`, se activa `isMuted = true`, se detiene el bot y se escalan las alertas.

---

## 5. IDENTIDAD SENSORIAL Y UX (UX/UI ENGINE)

### Estética "Luxury Platinum"
*   **Fondo:** Deep Black (`#050505`) con textura de ruido SVG al 5%.
*   **Acentos:** Gold Platinum (`#D4AF37`) y Gold Light (`#F9DF74`).
*   **Glassmorphism:** Superficies `rgba(18, 18, 18, 0.95)` con desenfoque de fondo.

### Sistema de Alertas Neurales
*   **Audio Alerta:** Oscilador senoidal a `220Hz` (Web Audio API) con caída exponencial de 0.3s.
*   **TTS Layer:** Síntesis de voz `es-AR` para confirmación verbal de leads críticos.
*   **PWA:** Service Worker para notificaciones Push nativas en iOS/Android.

---

## 6. GOBERNANZA Y SEGURIDAD (ENTERPRISE GRADE)
*   **Aislamiento Multi-Tenant:** Namespace único por usuario. Las sesiones de WhatsApp están aisladas físicamente en la base de datos.
*   **BYOK (Bring Your Own Key):** El cliente provee su `geminiApiKey`, garantizando soberanía de costos y datos.
*   **Risk Scoring:** Algoritmo de monitoreo de actividad para prevenir bloqueos de cuenta.
*   **Governance States:** `ACTIVE`, `PAUSED`, `LIMITED`, `SUSPENDED`.

---
*Dominion OS - Engineering Excellence v2.7.2*