# 🦅 CÓDICE DOMINION v2.9.1 [ADN DEL PROYECTO]

> "En la era de la saturación digital, la velocidad es la moneda y la inteligencia es el arma. Dominion no es un bot; es la herramienta para no perder ventas en WhatsApp."

---

## 📜 EL CREDO DEL OPERADOR (THE OATH)

1.  **No somos Spammers. Somos Vendedores.** Nuestra tecnología es para cerrar ventas, no para molestar gente.
2.  **Human in the Loop.** La IA califica, el Humano cierra. Respetamos ese límite.
3.  **Privacidad Sagrada (BYOK).** Tus datos son tu activo. Nosotros solo proveemos el motor.
4.  **Calidad sobre Cantidad.** Priorizamos la gestión de conversaciones de alto valor.
5.  **Tecnología con Propósito.** Cada feature existe para vender más, sin relleno.

---

## 👁️ VISIÓN & FILOSOFÍA

Este documento detalla la tesis fundamental que impulsa el desarrollo y la estrategia de Dominion.

### 1. La Tesis del "Signal" (Teoría de Señales)
El mercado moderno no sufre de falta de demanda, sufre de **exceso de ruido**. Un mensaje de un cliente potencial en WhatsApp no es simplemente texto; es una **señal de intención** con una vida útil extremadamente corta.

- **La Ventana Crítica:** La probabilidad de calificar un lead se desploma después de los primeros 5 minutos. Una señal "caliente" (un cliente listo para comprar) se enfría rápidamente si no se actúa de inmediato.
- **Misión de Dominion:** Existir como una infraestructura diseñada para **capturar, decodificar y capitalizar** esa señal de intención en tiempo real, 24/7. No es un "chatbot", es un motor de procesamiento de señales comerciales.

### 2. El Paradigma "Human-in-the-Loop"
La automatización total en ventas de alto valor es una falacia. La IA es una herramienta de apalancamiento, no un reemplazo para el juicio humano y la conexión personal.

- **La IA Califica, el Humano Cierra:** El rol de Dominion es manejar el 80% del trabajo de bajo valor: responder preguntas frecuentes, filtrar curiosos y medir la "temperatura" de un lead.
- **Protocolo de Escalada:** Una vez que una señal es calificada como "Caliente", el sistema entra en "Shadow Mode", silenciando la IA y alertando al vendedor humano. Provee sugerencias de respuesta ("Copiloto") pero cede el control para el cierre final. El humano siempre está al mando en la fase crítica.

### 3. Soberanía de Datos y Costos (BYOK)
La inteligencia comercial y los datos de clientes son los activos más valiosos de una empresa. No deben ser cedidos a terceros.

- **Bring Your Own Key (BYOK):** Dominion se integra con la API Key de Google Gemini del propio cliente. Esto garantiza tres cosas:
    1.  **Privacidad Absoluta:** Las conversaciones no se usan para entrenar nuestros modelos. Lo que pasa en tu negocio, se queda en tu negocio.
    2.  **Control de Costos:** El cliente tiene control total sobre su gasto en IA, aprovechando las capas gratuitas y los precios directos de Google.
    3.  **Transparencia:** No hay "cajas negras". El cliente sabe exactamente qué tecnología está potenciando su operación.

### 4. Mercado Objetivo: Calidad sobre Cantidad
Dominion no está diseñado para spam o marketing masivo. Está optimizado para operaciones donde cada conversación importa y el costo de un lead perdido es alto.

- **Perfil Ideal:** Agencias, consultores, servicios de alto ticket, inmobiliarias, y cualquier negocio que dependa de la venta consultiva.
- **Métrica Clave:** No medimos el éxito por "mensajes enviados", sino por "leads calientes entregados al equipo de ventas".

---

## 💰 MODELO SAAS Y PLANES COMERCIALES

Este documento detalla el modelo de negocio, los planes de suscripción y la lógica de monetización de Dominion.

### 1. Modelo de Negocio: SaaS Multi-Tenant
Dominion opera como una plataforma de Software como Servicio (SaaS) donde múltiples clientes (inquilinos o *tenants*) utilizan la misma infraestructura de software, pero con sus datos completamente aislados y seguros.

- **Infraestructura Centralizada:** Un único backend y base de datos sirven a todos los clientes.
- **Aislamiento de Datos:** Cada pieza de información (usuarios, conversaciones, configuraciones) está estrictamente vinculada a un `userId`.
- **Escalabilidad:** Este modelo permite una gestión y actualización eficientes de la plataforma para todos los clientes a la vez.

### 2. Planes Comerciales
La plataforma ofrece un único plan principal y un estado de repliegue.

#### a) Plan `pro` (Profesional) - **USD 29/mes**
- **Funcionalidades:**
    - `intent_detection`: Capacidad de la IA para entender la intención real del cliente.
    - `lead_scoring`: Calificación automática de leads en **Frío, Tibio, Caliente**.
    - `priority_alerts`: Notificaciones o cambios visuales para leads calientes.
    - `close_assist`: Modo "Copiloto" donde la IA sugiere respuestas al vendedor humano.
- **Caso de Uso:** Es el plan único y completo, diseñado para equipos de ventas que buscan maximizar la eficiencia y la conversión.

#### b) Plan `starter` (Fallback)
- **Funcionalidades:**
    - `auto_reply`: Respuestas automáticas básicas.
    - `professional_tone`: La IA mantiene un tono profesional.
- **Caso de Uso:** Este plan funciona como un **estado de repliegue (fallback)**. Cuando el plan `pro` o el `trial` de un cliente expira, el sistema revierte a las funcionalidades `starter` para garantizar que el bot no se apague por completo. **No es un plan de venta.**

### 3. Ciclo de Vida de la Suscripción
1.  **Registro (`trial`):**
    - Al registrarse, un nuevo cliente comienza automáticamente en un período de prueba (`plan_status: 'trial'`).
    - Este período le otorga acceso a todas las funcionalidades del plan `pro` durante **14 días o hasta calificar 10 conversaciones**, lo que ocurra primero.
2.  **Activación (`active`):**
    - Un `super_admin` activa manualmente la licencia.
    - La activación cambia el `plan_status` a `active` y establece una nueva `billing_end_date` a **30 días en el futuro**.
3.  **Expiración (`expired`):**
    - Si llega la `billing_end_date` y el plan no se ha renovado, el `plan_status` cambia a `expired`.
    - Las funcionalidades se limitan a las del plan `starter`.

### 4. Lógica de Monetización y Métricas
- **MRR (Ingreso Mensual Recurrente):** El panel de `super_admin` calcula el MRR sumando `USD 29` por cada cliente con `plan_status: 'active'`.
- **ROIE (Retorno de Inversión Estimado):** En el dashboard del cliente, se muestra un "Retorno Estimado" calculado como `(Nº de Leads Calientes) x (Valor Fijo por Lead)`.

---

## 🏗️ ARQUITECTURA Y FLUJO DE DATOS

Este documento describe la arquitectura técnica de Dominion y cómo fluye la información a través del sistema.

### 1. Diagrama de Arquitectura de Alto Nivel
\`\`\`
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
\`\`\`

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
    - **Librería:** \`@whiskeysockets/baileys\`.
    - **Función:** Emula una sesión de WhatsApp Web, manteniendo una conexión WebSocket persistente con los servidores de WhatsApp. Se encarga de recibir y enviar mensajes en nombre del usuario. Cada cliente tiene su propia sesión aislada.
4.  **Base de Datos:**
    - **Servicio:** MongoDB Atlas.
    - **Función:** Almacena toda la información persistente:
        - **Credenciales de Sesión (Baileys):** Permite reanudar sesiones de WhatsApp sin necesidad de escanear el QR constantemente.
        - **Datos de Usuario:** Perfiles, planes, configuraciones (\`BotSettings\`).
        - **Conversaciones:** Historial de mensajes, estado de leads, notas internas.
        - **Logs y Telemetría:** Registros de eventos del sistema para auditoría.
5.  **Core de IA:**
    - **Servicio:** Google Gemini API (\`@google/genai\`).
    - **Función:** Recibe el historial de una conversación y las directivas del "Cerebro Neural" desde el Backend. Procesa el texto y devuelve una respuesta estructurada en JSON con el texto a enviar, el nuevo estado del lead, tags, etc.

### 3. Flujo de Datos Típico (Mensaje Entrante)
1.  **Recepción:** El Usuario Final envía un mensaje a través de WhatsApp.
2.  **Ingestión:** El Motor de WhatsApp (\`baileys\`) recibe el mensaje a través de su WebSocket.
3.  **Procesamiento Inicial:** El motor identifica a qué cliente (\`userId\`) pertenece el mensaje y lo reenvía al servicio de conversaciones del Backend.
4.  **Persistencia:** El \`conversationService\` guarda el mensaje entrante en la conversación correspondiente en MongoDB.
5.  **Debounce y Calificación:** Se activa un temporizador de 6 segundos. Si no llegan más mensajes del mismo usuario en ese tiempo, se procede a la calificación.
6.  **Llamada a IA:** El Backend construye un prompt con el historial de la conversación y las configuraciones del cliente (\`BotSettings\`).
7.  **Inferencia:** Se envía el prompt a la API de Google Gemini a través de la API Key del cliente (modelo BYOK).
8.  **Respuesta IA:** Gemini devuelve una respuesta JSON estructurada.
9.  **Acción:**
    - El Backend extrae el \`responseText\` y lo envía al Motor de WhatsApp para que lo mande al Usuario Final.
    - El \`newStatus\` y los \`tags\` se actualizan en la base de datos para esa conversación.
    - La respuesta del bot también se guarda en el historial.
10. **Actualización UI:** El Frontend, ahora a través de **Server-Sent Events (SSE)**, recibe la conversación actualizada y la muestra en el Dashboard del cliente en tiempo real.

---

## 🛠️ STACK TECNOLÓGICO Y ESTRUCTURA DE ARCHIVOS

### 1. Stack Tecnológico Principal
| Área              | Tecnología Principal         | Descripción                                                              |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------ |
| **Frontend**      | React (con Vite) & TypeScript| Para una UI moderna, rápida y tipada.                                    |
| **Estilos**       | Tailwind CSS                 | Framework Utility-First para un diseño rápido y consistente.             |
| **Backend**       | Node.js & Express            | Entorno de ejecución y framework para construir la API RESTful.            |
| **Lenguaje (Back)** | TypeScript                 | Añade tipado estático a JavaScript para robustez.                        |
| **Base de Datos**   | MongoDB (con Mongoose)     | Base de datos NoSQL flexible, ideal para los datos de sesión y chats.    |
| **Motor WhatsApp**| \`@whiskeysockets/baileys\`    | Librería clave que emula WhatsApp Web para la conexión.                  |
| **Inteligencia IA**| \`@google/genai\` (Gemini)     | SDK oficial para interactuar con los modelos de IA de Google.            |
| **Autenticación** | JWT (jsonwebtoken)           | Estándar para crear tokens de acceso seguros entre cliente y servidor.   |
| **Despliegue (BE)** | Render                       | Plataforma en la nube para desplegar el servicio Node.js.                |
| **Despliegue (FE)** | Vercel                       | Plataforma optimizada para el despliegue de aplicaciones frontend.       |
| **Tiempo Real**     | Server-Sent Events (SSE)     | Para actualizaciones de UI en tiempo real.                               |

### 2. Estructura de Archivos del Proyecto (\`/src\`)
\`\`\`
/src
├── components/         # Componentes de React para la UI
│   ├── Admin/          # Componentes específicos del panel de Super Admin
│   ├── AuthModal.tsx
│   ├── ChatWindow.tsx
│   └── ...
├── controllers/        # Lógica de la API (manejo de requests/responses)
│   ├── apiController.ts
│   └── adminController.ts
├── data/               # Datos estáticos (ej: textos legales)
├── middleware/         # Middlewares de Express (ej: autenticación)
├── services/           # Lógica de negocio y comunicación con APIs externas
│   ├── aiService.ts      # Lógica de construcción de prompts y llamada a Gemini
│   ├── audioService.ts   # (Frontend) Gestión de reproducción de audio
│   ├── conversationService.ts # Orquesta la lógica de las conversaciones
│   ├── logService.ts     # Sistema centralizado de logging
│   ├── planService.ts    # Define las funcionalidades por tipo de plan
│   ├── sseService.ts     # (Backend) Gestión de conexiones Server-Sent Events
│   └── ttsService.ts     # (Backend) Generación de audio con Text-to-Speech
├── utils/              # Funciones de ayuda reutilizables
├── whatsapp/           # Lógica de conexión con WhatsApp (Baileys)
│   ├── client.ts       # Orquesta la conexión, recepción y envío de mensajes
│   └── mongoAuth.ts    # Almacena y recupera el estado de autenticación de Baileys en MongoDB
├── App.tsx             # Componente raíz de React
├── config.ts           # Configuración compartida (URLs, headers)
├── database.ts         # Conexión con MongoDB y modelos de datos (Mongoose)
├── env.ts              # Carga y exporta variables de entorno
├── server.ts           # Punto de entrada del servidor Express
└── types.ts            # Definiciones de tipos y enumeraciones de TypeScript
\`\`\`

---

## 📖 MANUALES OPERATIVOS

### 1. GUÍA PARA CLIENTES
Esta guía te ayudará a poner en marcha y operar tu nodo de Dominion.

#### a. Registro y Primeros Pasos
1.  **Solicitar Acceso:** En la página principal, haz clic en "Solicitar Acceso".
2.  **Completa el Formulario:**
    - **Número de WhatsApp:** Será tu nombre de usuario. Ingresa el número completo, incluyendo código de país (ej: 549261...).
    - **Nombre del Negocio:** El nombre que la IA usará para presentarse.
    - **Contraseña:** Elige una contraseña segura.
3.  **Acceso Inmediato:** Tras el registro, iniciarás sesión y comenzarás un período de prueba **PRO** de 14 días.
4.  **Guarda tu Master Recovery Key:** Se te mostrará una clave de recuperación única. **¡GUÁRDALA EN UN LUGAR SEGURO!** Es la única forma de recuperar tu cuenta si olvidas la contraseña.

#### b. Conexión del Nodo (Pestaña "Conexión")
1.  **Elige un Método:**
    - **Código QR:** Abre WhatsApp en tu teléfono, ve a \`Ajustes > Dispositivos Vinculados > Vincular un dispositivo\` y escanea el QR que aparece en pantalla. Es el método más rápido.
    - **Vincular Teléfono:** Ingresa tu número de WhatsApp y haz clic en "Vincular". Recibirás una notificación en tu teléfono para ingresar un código de 8 caracteres que aparecerá en Dominion.
2.  **Espera la Sincronización:** El estado cambiará a "Conectado" en unos segundos. ¡Listo! Tu nodo está en línea.
3.  **Resetear Conexión:** Si tienes problemas para conectar, usa el botón "Limpiar rastro de sesión" o "Resetear Conexión" para forzar una desvinculación completa y empezar de cero.

#### c. Configuración del Cerebro Neural (Pestaña "Configuración")
Esta es la parte más importante. Aquí le enseñas a la IA cómo vender tu producto.

1.  **Carga una Plantilla (Opcional):** Para empezar rápido, selecciona una "Plantilla Táctica" que se ajuste a tu negocio (ej: Agencia, Inmobiliaria). Esto rellenará los campos principales.
2.  **Calibración (Wizard de 3 Fases):**
    - **Fase 1 (Misión):** Define el nombre de tu negocio, tu misión principal y tu cliente ideal.
    - **Fase 2 (Arsenal):** Describe en detalle tu producto/servicio, el precio y el llamado a la acción (ej: un link para agendar una llamada).
    - **Fase 3 (Playbook):** Enseña a la IA a manejar objeciones comunes (ej: "¿Cuánto cuesta?") y establece las reglas que nunca debe romper.
3.  **Personalidad:** Ajusta el Tono, Ritmo e Intensidad de la IA para que coincida con la voz de tu marca.
4.  **API Key de Gemini:** Pega tu clave de la API de Google AI Studio en el campo correspondiente. Es **obligatorio** para que la IA funcione.
5.  **Sincronizar IA:** Siempre que hagas cambios, presiona el botón "Sincronizar IA" para que se apliquen.

### 2. GUÍA PARA SUPER ADMINISTRADOR
Esta guía cubre las funcionalidades del panel de control global.

#### a. Acceso
- **Credenciales:** Utiliza las credenciales de Super Administrador para iniciar sesión.
- **Vista por Defecto:** Al iniciar sesión, serás dirigido directamente al "Panel de Control Global".

#### b. Visión General (Dashboard)
- **KPIs Globales:** Monitorea métricas clave de toda la plataforma: MRR, total de clientes, nodos en línea, y cuentas en riesgo.
- **Distribución de Planes:** Visualiza cuántos clientes están en cada plan (\`pro\` vs. \`starter\`).

#### c. Gestión de Clientes (Pestaña "Clientes")
- **Listado Completo:** Accede a una tabla con todos los clientes registrados.
- **Auditoría ("Gestionar"):** Al hacer clic en "Gestionar" en un cliente, entras en el modo de auditoría para cambiar datos y gestionar su plan.

---

## 🛡️ GOBERNANZA Y SEGURIDAD

### 1. Autenticación y Autorización
- **Tokens JWT:** La comunicación entre cliente y servidor está protegida mediante JSON Web Tokens.
- **Roles de Usuario:** El sistema implementa un control de acceso basado en roles (RBAC): \`client\` y \`super_admin\`.

### 2. Seguridad de Datos
- **Aislamiento de Datos (Multi-Tenant):** La arquitectura está diseñada para un aislamiento estricto de los datos de cada cliente.
- **Encriptación de Contraseñas:** Las contraseñas se almacenan hasheadas con **bcrypt**.
- **Modelo BYOK (Bring Your Own Key):** La API Key de Gemini del cliente se almacena encriptada y se utiliza para todas las llamadas a la IA, minimizando el vector de ataque centralizado.

### 3. Seguridad de la Conexión de WhatsApp
- **Persistencia de Sesión Segura:** El estado de autenticación de Baileys se almacena encriptado en MongoDB.
- **Mitigación Activa de Riesgos:** La plataforma está diseñada para minimizar el riesgo de suspensión mediante:
    - **Emulación de Comportamiento Humano:** Se utiliza un sistema de 'debounce' (6s) para evitar respuestas instantáneas y patrones detectables de bot.
    - **Enfoque Anti-Spam:** El sistema está orientado a la gestión de conversaciones entrantes, no a envíos masivos.
    - **Aislamiento de Sesiones:** Cada cuenta opera de forma independiente para prevenir riesgos en cascada.
    - **Huella Digital Legítima:** La conexión se identifica como un navegador estándar (Chrome en macOS).

---

## 🎨 DISEÑO Y EXPERIENCIA DE USUARIO (UI/UX)

### 1. Filosofía de Diseño: "Elite Neural Interface"
La interfaz debe sentirse como una herramienta profesional, precisa y de alta tecnología, inspirada en terminales de datos y dashboards de inteligencia.

### 2. Paleta de Colores Principal
| Nombre                | Hex       | Rol en la UI                                                            |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| \`brand-black\`         | \`#050505\` | Color de fondo principal.                                               |
| \`brand-surface\`       | \`#121212\` | Fondos para tarjetas y paneles.                                         |
| \`brand-gold\`          | \`#D4AF37\` | Color de acento principal para acciones y highlights.                   |

### 3. Tipografía
- **Fuente Principal:** \`Inter\` (sans-serif), por su alta legibilidad en interfaces densas.

---

## 🔊 SISTEMA DE AUDIO Y TEXT-TO-SPEECH (TTS)

### 1. Propósito
Proporcionar feedback auditivo para acciones de UI/UX y reforzar la identidad de marca "High-Tech".

### 2. Arquitectura
- **Backend (\`ttsService.ts\`):** Pre-genera archivos de audio para eventos usando Gemini TTS y los sirve a través de un endpoint.
- **Frontend (\`audioService.ts\`):** Gestiona la carga (con caché) y reproducción de los sonidos en el navegador usando la Web Audio API.

---

## 🗺️ ROADMAP EVOLUTIVO

### ✅ v2.9 (Completado)
- **Implementación de SSE (Server-Sent Events):** Reemplazar el *polling* por comunicación en tiempo real para conversaciones y estado de conexión.
- **Funcionalidad Completa del Sandbox:** Permitir a los usuarios probar su "Cerebro Neural" en un entorno seguro antes de desplegarlo.

### 🚀 v3.0 (Visión a Medio Plazo)
- **Mejoras de PWA:** Implementar notificaciones push para alertas de leads calientes.
- **Copiloto Proactivo:** Expandir las capacidades del "Close Assist" para sugerir seguimientos.

### 🌌 Visión a Largo Plazo
- **Integración Multi-Canal:** Expandir el motor a Instagram DMs, Telegram, etc.
- **Inteligencia de Negocio Autónoma:** Permitir que la IA analice las métricas y sugiera mejoras en la configuración del "Cerebro Neural" basadas en el análisis de métricas.

---

## ⚖️ ASPECTOS LEGALES Y FILOSOFÍA OPERATIVA

### 1. POLÍTICA DE PRIVACIDAD
- **Modelo BYOK:** Dominion Bot actúa como un orquestador técnico. La IA es provista por Google a través de tu propia API Key. **No entrenamos modelos con tus datos.**
- **Aislamiento:** Cada cuenta opera en un entorno de datos lógicamente separado.

### 2. TÉRMINOS Y CONDICIONES
- **Política Anti-Spam:** El uso para envío masivo de mensajes no solicitados está estrictamente prohibido.
- **Riesgos de WhatsApp:** Se utiliza un protocolo no oficial. Si bien la arquitectura mitiga activamente los riesgos, el usuario asume la responsabilidad inherente de un posible bloqueo numérico por parte de WhatsApp. Dominion Bot NO se hace responsable por la pérdida de números.

### 3. MANIFIESTO DOMINION
- **Human in the Loop:** El Bot califica, el Humano cierra.
- **Calidad sobre Cantidad:** Optimizado para ventas de alto valor y consultivas.
- **Tecnología con Propósito:** Cada feature existe para vender más, sin relleno.




---

## ⚡ ADDENDUM v2.9.2: CAPACIDADES TÁCTICAS AVANZADAS

### 1. Protocolo de Trial Dinámico (Gobernanza de Escasez)
Para maximizar la conversión del usuario SaaS, hemos endurecido las reglas del período de prueba. Ya no es solo tiempo, es **resultado**.
- **Límite Híbrido:** El trial finaliza a los **3 días** O al calificar los primeros **3 Leads**, lo que ocurra primero.
- **Psicología:** Esto fuerza al usuario a valorar cada interacción de la IA. Si la IA le consigue 3 clientes potenciales, el valor está demostrado y el bloqueo se activa, obligando a la compra para continuar operando.

### 2. Ingesta Multimedia (Ojos y Oídos del Sistema)
El motor de WhatsApp (`client.ts`) ha sido parcheado para reconocer tipos de mensajes no textuales en el historial.
- **Capacidad:** El sistema ahora detecta `[Imagen]`, `[Audio]`, `[Video]`, `[Ubicación]`.
- **Utilidad:** Esto evita que el historial se rompa o se ignore si el último mensaje del cliente fue una foto (muy común en talleres, inmobiliarias, etc.). Aunque la IA procesa texto, ahora tiene conciencia de que "algo más" fue enviado.

### 3. Simulador Neural (Client Sandbox)
Se ha integrado un entorno de pruebas seguro dentro del dashboard del cliente (`AgencyDashboard`).
- **Función:** Permite al usuario "chatear" consigo mismo (simulando ser un bot) o ejecutar scripts de prueba automatizados para ver cómo su configuración de "Cerebro Neural" reacciona ante objeciones antes de conectar su número real.
- **Seguridad:** Aísla el entorno de pruebas de la base de datos de producción real.

### 4. Trigger Manual de Inferencia (Botón de Pánico)
Se ha añadido un control de anulación manual en la interfaz de chat (`ChatWindow`).
- **Problema:** A veces el *debounce* (espera automática) es muy lento para un vendedor ansioso, o el `webhook` de WhatsApp se retrasa.
- **Solución:** Un botón **"EJECUTAR IA"** que fuerza una llamada inmediata a Gemini, ignorando los temporizadores de espera y el estado de silencio, permitiendo una intervención táctica instantánea.

### 5. Acceso Universal en Estado 'Trial'
Se ha reescrito la lógica de permisos (`planService.ts` y `aiService.ts`).
- **Cambio:** El estado `trial` ahora hereda **todos** los permisos del plan `pro`.
- **Objetivo:** El usuario no debe encontrar *ninguna* fricción durante su prueba. La experiencia debe ser 100% Premium hasta el momento exacto del corte.