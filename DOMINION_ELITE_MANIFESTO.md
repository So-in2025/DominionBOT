
# 🦅 DOMINION ELITE v2.8: EL CÓDICE MAESTRO (THE BLACK PAPER)

> "En la era de la saturación digital, la velocidad es la moneda y la inteligencia es el arma. Dominion no es un bot; es una infraestructura de supremacía comercial."

---

# 📚 ÍNDICE DE CONTENIDOS

1.  **VISIÓN & FILOSOFÍA (THE ORIGIN)**
2.  **FLUJOS DE DATOS & ARQUITECTURA (THE PIPELINE)**
3.  **MAPA DE ARCHIVOS & TECNOLOGÍA (THE STRUCTURE)**
4.  **INGENIERÍA DE PROMPTS & PSICOLOGÍA (THE BRAIN)**
5.  **MANUALES OPERATIVOS (THE FIELD GUIDE)**
    *   Manual de Administrador
    *   Manual de Vendedor (Agente)
    *   Protocolos de Emergencia
6.  **GOBERNANZA Y SEGURIDAD (THE SHIELD)**
7.  **ROADMAP EVOLUTIVO (THE FUTURE)**

---

# 1. 👁️ VISIÓN & FILOSOFÍA (THE ORIGIN)

### 1.1 La Tesis del "Signal"
El mercado actual no sufre de falta de demanda, sufre de **exceso de ruido**. 
Dominion se basa en la **Teoría de Señales**:
*   Un mensaje de WhatsApp no es texto; es una señal de intención.
*   El tiempo de vida de una señal "caliente" es de **menos de 5 minutos**.
*   Dominion existe para capturar, decodificar y capitalizar esa señal antes de que se enfríe.

### 1.2 El Paradigma "Human-in-the-Loop"
Rechazamos la automatización total ciega. La IA es infinita, pero carece de intuición moral y urgencia financiera.
*   **Rol de la IA:** Filtrar curiosos, responder lo obvio (L1 Support), calificar la capacidad de pago y detectar el momento exacto de la compra.
*   **Rol del Humano:** Entrar como un francotirador solo cuando la señal es ROJA (HOT) para ejecutar el cierre y cobrar.

### 1.3 Soberanía de Datos (BYOK)
Dominion opera bajo el modelo **Bring Your Own Key**.
No somos dueños de tus clientes. No somos dueños de tu cerebro (IA).
Tú pones la API Key de Google. Tú pones la sesión de WhatsApp. Dominion es el motor de alto rendimiento que conecta ambos mundos.

---

# 2. ⚡ FLUJOS DE DATOS & ARQUITECTURA (THE PIPELINE)

### 2.1 Diagrama de Flujo: Ingesta de Mensajes (Inbound)

```mermaid
[Cliente] --(WhatsApp)--> [Baileys Socket (Server)]
       |
       v
[Decodificador de Mensajes] --> ¿Es Texto/Audio?
       |
       v
[Normalización] --> Convierte a Objeto "Signal"
       |
       v
[Base de Datos (Mongo)] --> Guarda Historial (Persistencia)
       |
       v
[IA Service (Gemini)] <-- (Historial + Prompt Contextual)
       |
       v
[IA Decision] --> ¿Responder o Escalar?
       |                 |
   (Responder)       (Escalar/HOT)
       |                 |
[Baileys Socket]    [Frontend UI] --> Alerta Visual / Vibración
       |                 |
[Cliente] <------- [Panel Sugerencias (Shadow Mode)]
```

### 2.2 Diagrama de Flujo: Conexión Híbrida (Ngrok)

```
[Vercel Frontend] --(HTTPS)--> [Ngrok Cloud Edge]
                                     |
                               (Túnel Seguro)
                                     |
[Tu PC Local] <--(Header: skip-browser-warning)-- [Ngrok Agent]
      |
[Node.js Server] --> [MongoDB Local/Atlas]
      |
[WhatsApp Web Socket]
```

### 2.3 Stack Tecnológico (Why we chose this)
*   **Frontend:** React 18 + Vite + TailwindCSS. Velocidad de renderizado y estética "Luxury Dark Mode".
*   **Backend:** Node.js + Express. Manejo asíncrono nativo ideal para sockets.
*   **Conector WA:** `@whiskeysockets/baileys`. La única librería que emula un navegador real, reduciendo el riesgo de bloqueo comparado con la API oficial costosa.
*   **Inteligencia:** Google Gemini 1.5/Pro (via `@google/genai`). Ventana de contexto amplia (1M tokens) y razonamiento superior a GPT-3.5 para ventas.
*   **Base de Datos:** MongoDB. Esquema flexible para guardar conversaciones complejas y objetos JSON dinámicos de la IA.

---

# 3. 📂 MAPA DE ARCHIVOS (THE STRUCTURE)

Entender dónde vive cada órgano del sistema.

### `/src` (Núcleo)
*   **`App.tsx`**: El orquestador del Frontend. Maneja el estado global de autenticación y carga.
*   **`config.ts`**: **CRÍTICO.** Centraliza la URL del Backend y los Headers para Ngrok. Si esto falla, nada conecta.
*   **`main.tsx` / `index.tsx`**: Punto de entrada de React.
*   **`types.ts`**: Definiciones de TypeScript. El "diccionario" de datos (User, Conversation, BotSettings).

### `/src/components` (Interfaz)
*   **`AdminLogin.tsx`**: Puerta de acceso segura.
*   **`AuthModal.tsx`**: Gestión de registro y recuperación de cuentas.
*   **`ChatWindow.tsx`**: El quirófano de ventas. Donde el humano opera. Incluye `MessageBubble` y `ChatInput`.
*   **`ConnectionPanel.tsx`**: Gestión del código QR y estado de la sesión de WhatsApp.
*   **`SettingsPanel.tsx`**: El cerebro. Donde se configuran los Prompts y la personalidad de la IA.
*   **`AgencyDashboard.tsx`**: Métricas de alto nivel (KPIs, Embudo).
*   **`SalesContextSidebar.tsx`**: Barra lateral derecha con notas internas y etiquetas.

### `/src/whatsapp` (Conectividad)
*   **`client.ts`**: El corazón de Baileys. Maneja los sockets, reconexión automática y eventos de mensajes.
*   **`mongoAuth.ts`**: Adaptador para guardar las credenciales de sesión (keys) en MongoDB en lugar de archivos JSON (para despliegues en la nube).

### `/src/services` (Lógica de Negocio)
*   **`aiService.ts`**: El puente con Google Gemini. Construye los prompts dinámicos.
*   **`conversationService.ts`**: Maneja la lógica de guardar/recuperar chats de la DB.
*   **`sseService.ts`**: Server-Sent Events. Permite que el servidor "empuje" datos al frontend (ej: nuevo mensaje) sin que el frontend tenga que recargar.

### Raíz
*   **`server.ts`**: El servidor Express. Define los endpoints de la API (`/api/login`, `/api/send`, etc.).

---

# 4. 🧠 INGENIERÍA DE PROMPTS & PSICOLOGÍA (THE BRAIN)

Dominion no usa un prompt plano. Usa un sistema de **Capas Sedimentarias**.

### Capa 1: La Constitución (Inmutable)
Instrucciones hardcodeadas en `aiService.ts`.
> "Eres un asistente comercial útil y directo. No alucines precios. No prometas lo que no está en el contexto."

### Capa 2: Identidad (Configurable)
Se inyecta desde `SettingsPanel`.
*   **Arquetipo:** Consultivo vs. Closer Agresivo.
*   **Tono:** Formal (Usted) vs. Casual (Vos/Tú).
*   **Ritmo:** Respuestas cortas (tipo chat) vs. párrafos explicativos (tipo email).

### Capa 3: Conocimiento del Producto (Dinámico)
El texto que el usuario ingresa en "Descripción del Producto".
*   *Estrategia:* La IA prioriza esta información sobre su conocimiento general.

### Capa 4: Protocolo Shadow (Contextual)
Si el sistema detecta palabras clave ("precio", "comprar", "link", "cbu"), el prompt cambia:
> "El usuario muestra intención de compra ALTA. Tu objetivo cambia: DEJA DE VENDER Y EMPIEZA A CERRAR. Ofrece el link inmediatamente."

---

# 5. 📘 MANUALES OPERATIVOS (THE FIELD GUIDE)

### 5.1 Manual de Administrador (Setup)
1.  **Despliegue:** Iniciar `npm run dev`. Asegurar que MongoDB esté corriendo.
2.  **Túnel:** Si se opera remoto, iniciar Ngrok: `ngrok http 3001`. Copiar URL a `config.ts` o variable de entorno Vercel.
3.  **Conexión:** Ir a "Nodos", escanear QR con el WhatsApp del negocio. Esperar estado "CONNECTED".
4.  **Configuración IA:** Ir a "Cerebro", pegar API Key de Gemini, definir producto, guardar. Activar "IA ON".

### 5.2 Manual de Vendedor (Agente)
1.  **Monitoreo:** Mantener la pestaña "Signals" abierta.
2.  **Semáforo:**
    *   🔵 **Azul:** Lead frío. Ignorar. La IA responde.
    *   🟠 **Naranja:** Lead tibio. Observar. La IA está nutriendo.
    *   🔴 **Rojo:** Lead caliente/Escalado. **INTERVENIR.**
3.  **Intervención (Shadow Mode):**
    *   Cuando un chat está en rojo, la IA se silencia (Mute).
    *   Aparecen sugerencias de respuesta. Haz clic en una para enviarla o escribe manualmente.
    *   Una vez resuelta la duda crítica, puedes reactivar la IA o cerrar la venta manualmente.

### 5.3 Protocolos de Emergencia
*   **Loop Infinito:** Si la IA se responde a sí misma (error raro pero posible), pulsar el botón de pánico "IA OFF" en el Header global.
*   **Desconexión WA:** Si los mensajes no llegan, ir a "Nodos" -> "Desconectar" -> Forzar Reinicio. Volver a escanear.
*   **Bloqueo de Número:** Si WhatsApp suspende el número, exportar base de datos de leads (CSV) inmediatamente desde Admin Dashboard.

---

# 6. 🛡️ GOBERNANZA Y SEGURIDAD (THE SHIELD)

### 6.1 Niveles de Acceso (RBAC)
*   **Super Admin:** Ve todos los nodos, métricas globales, puede suspender cuentas.
*   **Admin (Dueño de Agencia):** Configura la IA, ve métricas financieras, conecta el WhatsApp.
*   **Client (Vendedor):** Solo ve el Chat y puede responder. No toca la configuración de la IA.

### 6.2 Seguridad de Datos
*   **Encriptación:** Las contraseñas se hashean con `bcrypt`.
*   **Tokens:** Sesiones mantenidas con JWT (JSON Web Tokens).
*   **Aislamiento:** Un usuario no puede ver los chats de otro (validación de `userId` en cada request).

### 6.3 Anti-Spam (Risk Scoring)
El sistema calcula un "Risk Score" interno.
*   Si envías > 10 mensajes por minuto -> Warning.
*   Si envías > 50 mensajes por minuto -> Bloqueo preventivo del bot para proteger el número.

---

# 7. 🚀 ROADMAP EVOLUTIVO (THE FUTURE)

### Fase 1: Estabilización (Q3 2024) - [ACTUAL]
*   [x] Soporte estable para Baileys con MongoDB.
*   [x] Integración Gemini 1.5 Flash.
*   [x] Panel de Control "Elite".
*   [ ] Fix definitivo de reconexión automática sin QR (Jitter fix).

### Fase 2: Omnicanalidad (Q4 2024)
*   Integración de Instagram Direct (vía API oficial o scraping).
*   Integración de Facebook Messenger.
*   Bandeja de entrada unificada "All-Signals".

### Fase 3: Voice Synthesis (Q1 2025)
*   El bot podrá enviar **notas de voz** generadas por IA que clonen la voz del vendedor real.
*   Transcripción de audios entrantes a texto (Whisper).

### Fase 4: Pagos Autónomos (Q2 2025)
*   Generación de links de pago (Stripe/MercadoPago) dentro del chat.
*   Verificación automática de comprobantes de transferencia (OCR).

---

*Dominion Bot v2.8 Elite.*
*Engineered for Supremacy. Designed for Sales.*
