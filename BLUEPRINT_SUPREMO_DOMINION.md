# 🦅 BLUEPRINT SUPREMO: DOMINION OS v2.7.2 (ESTÁNDAR DE INGENIERÍA GOD)

## 0. NÚCLEO FILOSÓFICO
**Dominion OS** no es una aplicación de chat; es una **Infraestructura de Inferencia Comercial**. Su objetivo es la "Fricción Selectiva": eliminar el ruido operativo (leads fríos) y amplificar la señal estratégica (leads calientes). El sistema está diseñado para ser invisible para el cliente y omnisciente para el dueño.

---

## 1. VISIÓN Y OBJETIVO DEL PRODUCTO
Transformar el caos de WhatsApp en un pipeline de ventas predecible.
*   **Target:** Agencias High Ticket, Consultoras y Real Estate.
*   **Misión:** Automatizar el 90% de la conversación comercial con una fidelidad indistinguible de un humano experto de Mendoza, Argentina.
*   **KPI Maestro:** Reducción del tiempo de respuesta de minutos a <6 segundos y aumento del 400% en la capacidad de atención simultánea.

---

## 2. ARQUITECTURA TÉCNICA (DEEP INFRASTRUCTURE)

### A. Capa de Conectividad (The Node Layer)
*   **Motor de Protocolo:** `@whiskeysockets/baileys` v7.0.0-rc.9.
*   **Emulación de Sesión:** Navegador Chrome v2.4.1 (Identidad: `Dominion Signal Engine`).
*   **Persistencia Binaria:** Almacenamiento en MongoDB Atlas de los objetos de autenticación (keys, creds) serializados con `BufferJSON` para evitar el cierre de sesión por inactividad.
*   **Heartbeat Node:** Chequeo de salud del socket cada 30 segundos para garantizar latencia cero en la primera respuesta.

### B. Motor Neural (Neural Signal Engine)
*   **Provider Principal:** Google Gemini 1.5/2.5/3 API.
*   **Jerarquía de Failover:**
    1. `gemini-3-flash-preview`: Por defecto (Baja latencia, alta eficiencia).
    2. `gemini-2.5-flash`: Estabilidad en horas pico.
    3. `gemini-3-pro-preview`: Activación automática para auditorías de riesgo o razonamiento complejo.
*   **Capa de Debounce:** `DEBOUNCE_TIME_MS = 6000`. Crucial para la "comprensión de ráfagas": si un lead envía 5 mensajes seguidos, Dominion espera 6 segundos para procesarlos todos como un único bloque semántico, evitando respuestas fragmentadas.

### C. Persistencia y Datos (The Core)
*   **Stack:** Node.js (Express) + MongoDB Atlas + Mongoose.
*   **Esquema SaaS:** Multi-tenant estricto por `UserId`. Cada cliente tiene su propia "burbuja" de base de datos y llaves de cifrado.

---

## 3. FLUJOS OPERATIVOS (SIGNAL PIPELINES)

### A. Pipeline de Ingesta (Inbound Signal)
1.  **Recepción:** Baileys captura el `messages.upsert`.
2.  **Dispatch SSE:** El backend notifica al frontend instantáneamente vía Server-Sent Events.
3.  **Presence Sim:** Se activa `sendPresenceUpdate('composing')` para generar el indicador "Escribiendo..." en el móvil del cliente.
4.  **Inferencia:** El bot consulta a Gemini enviando el "Prompt de 4 Capas" (Constitución, Identidad, Conocimiento, Contexto).

### B. Pipeline de Salida y Escalado (The Hot Logic)
1.  **Extracción de Tags:** La IA devuelve JSON con señales (`price`, `urgency`, `decision_maker`).
2.  **Scoring de Temperatura:** Si la señal detectada es `HOT 🔥`:
    *   Se ejecuta el **Auto-Mute**: `isBotActive = false`.
    *   Se bloquea el envío automático para que el bot no "arruine" el cierre.
    *   Se dispara la **Alerta de Sonido 220Hz** y la **Notificación Push PWA**.

---

## 4. DISEÑO SENSORIAL Y ESTÉTICA (UX/UI FIDELITY)

### A. Identidad Visual (Luxury Platinum)
*   **Paleta:**
    *   `#050505` (Deep Black): Fondo de vacío comercial.
    *   `#D4AF37` (Gold Platinum): El color del éxito y la exclusividad.
    *   `#121212` (Matte Surface): Superficies de trabajo.
*   **Textura:** Capa de ruido SVG al 5% para dar profundidad orgánica y evitar la sensación de "software barato".
*   **Glassmorphism:** Uso intensivo de `backdrop-blur` en sidebar y headers para simular capas de cristal ahumado.

### B. Arquitectura de Sonido
*   **Audio Notification:** Generación en runtime vía `Web Audio API`. Onda senoidal pura a 220Hz (A3 suave) con decaimiento de 0.3s. No es un MP3, es una señal de sistema.
*   **Voz (TTS):** Síntesis de voz configurada específicamente en `es-AR` (Español Argentino) con un pitch de 0.95 para sonar profesional y autoritario en las alertas de leads prioritarios.

---

## 5. ESTRATEGIA DE PROMPT (THE NEURAL CORE)
Dominion OS utiliza una arquitectura de prompt inyectada en 4 niveles:
1.  **Capa 1 (La Constitución):** Reglas de comportamiento (No emojis, no coaching, no IA).
2.  **Capa 2 (Los Sliders):** Modulación de Tono, Ritmo e Intensidad basada en los controles del UI.
3.  **Capa 3 (Knowledge Base):** El pitch de venta real, precios y links de cierre.
4.  **Capa 4 (Memoria):** Notas internas escritas por el humano que el bot debe respetar como órdenes directas.

---

## 6. GOBERNANZA Y SEGURIDAD (ENTERPRISE)
*   **Modo Auditoría:** Capacidad del Super Admin para "entrar" en el flujo de señales de cualquier tenant en modo solo lectura (`auditMode`).
*   **Risk Score:** Algoritmo que mide la velocidad de envío y la tasa de bloqueos para predecir y evitar el baneo de la cuenta de WhatsApp.
*   **BYOK Architecture:** Soberanía total. El cliente es dueño de su inteligencia a través de su propia API Key de Google.

---
*Dominion OS: Engineering Excellence v2.7.2 - Code as Law*