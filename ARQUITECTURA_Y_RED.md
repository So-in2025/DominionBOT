# 🏗️ ARQUITECTURA Y FLUJO DE DATOS

Este documento describe la arquitectura técnica de Dominion y cómo fluye la información a través del sistema.

---

### 1. Diagrama de Arquitectura de Alto Nivel

```
            +----------------+      +------------------+      +-------------------+
            | Cliente (React)|<---->|  Backend (Node)  |<---->|   MongoDB Atlas   |
            +----------------+      +------------------+      +-------------------+
                  ^       |                    |                        ^
                  |       | (API RESTful)      | (Baileys WS)           | (Auth State)
                  |       |                    v                        |
                  |       +-----------+----------------+      +-------------------+
                  |                   |  Motor WhatsApp  |      | Google Gemini API |
                  |                   +----------------+      +-------------------+
                  |                           ^                         ^
                  |                           | (Protocolo Web)         | (API RESTful)
                  |                           v                         |
            +----------------+      +------------------+      +-------------------+
            |  Usuario Final |<---->|  WhatsApp Web    |<-----|  (Procesamiento IA) |
            +----------------+      +------------------+      +-------------------+
```

---

### 2. Desglose de Componentes

1.  **Frontend (Cliente):**
    - **Stack:** React con Vite, TypeScript, Tailwind CSS.
    - **Función:** Proporciona la interfaz de usuario (Dashboard) para que el cliente gestione su nodo. Se comunica con el Backend a través de una API RESTful.
    - **Despliegue:** Vercel.

2.  **Backend (Servidor):**
    - **Stack:** Node.js con Express, TypeScript.
    - **Función:** Es el núcleo de la aplicación. Gestiona la lógica de negocio, la autenticación (JWT), las peticiones de la API, y orquesta la comunicación entre el Motor de WhatsApp, la Base de Datos y el Core de IA.
    - **Despliegue:** Render.

3.  **Motor de WhatsApp:**
    - **Librería:** `@whiskeysockets/baileys`.
    - **Función:** Emula una sesión de WhatsApp Web, manteniendo una conexión WebSocket persistente con los servidores de WhatsApp. Se encarga de recibir y enviar mensajes en nombre del usuario. Cada cliente tiene su propia sesión aislada.

4.  **Base de Datos:**
    - **Servicio:** MongoDB Atlas.
    - **Función:** Almacena toda la información persistente:
        - **Credenciales de Sesión (Baileys):** Permite reanudar sesiones de WhatsApp sin necesidad de escanear el QR constantemente.
        - **Datos de Usuario:** Perfiles, planes, configuraciones (`BotSettings`).
        - **Conversaciones:** Historial de mensajes, estado de leads, notas internas.
        - **Logs y Telemetría:** Registros de eventos del sistema para auditoría.

5.  **Core de IA:**
    - **Servicio:** Google Gemini API (`@google/genai`).
    - **Función:** Recibe el historial de una conversación y las directivas del "Cerebro Neural" desde el Backend. Procesa el texto y devuelve una respuesta estructurada en JSON con el texto a enviar, el nuevo estado del lead, tags, etc.

---

### 3. Flujo de Datos Típico (Mensaje Entrante)

1.  **Recepción:** El Usuario Final envía un mensaje a través de WhatsApp.
2.  **Ingestión:** El Motor de WhatsApp (`baileys`) recibe el mensaje a través de su WebSocket.
3.  **Procesamiento Inicial:** El motor identifica a qué cliente (`userId`) pertenece el mensaje y lo reenvía al servicio de conversaciones del Backend.
4.  **Persistencia:** El `conversationService` guarda el mensaje entrante en la conversación correspondiente en MongoDB.
5.  **Debounce y Calificación:** Se activa un temporizador de 6 segundos. Si no llegan más mensajes del mismo usuario en ese tiempo, se procede a la calificación.
6.  **Llamada a IA:** El Backend construye un prompt con el historial de la conversación y las configuraciones del cliente (`BotSettings`).
7.  **Inferencia:** Se envía el prompt a la API de Google Gemini a través de la API Key del cliente (modelo BYOK).
8.  **Respuesta IA:** Gemini devuelve una respuesta JSON estructurada.
9.  **Acción:**
    - El Backend extrae el `responseText` y lo envía al Motor de WhatsApp para que lo mande al Usuario Final.
    - El `newStatus` y los `tags` se actualizan en la base de datos para esa conversación.
    - La respuesta del bot también se guarda en el historial.
10. **Actualización UI:** El Frontend, a través de polling periódico a `/api/conversations`, obtiene la conversación actualizada y la muestra en el Dashboard del cliente.
