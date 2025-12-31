# 🦅 DOMINION ELITE v2.8: EL CÓDICE MAESTRO (THE BLACK PAPER)

> "En la era de la saturación digital, la velocidad es la moneda y la inteligencia es el arma. Dominion no es un bot; es una infraestructura de supremacía comercial."

---

# 📚 ÍNDICE DE CONTENIDOS

1.  **VISIÓN & FILOSOFÍA (THE ORIGIN)**
2.  **MODELO SAAS Y PLANES COMERCIALES (THE BUSINESS CORE)**
3.  **FLUJOS DE DATOS & ARQUITECTURA (THE PIPELINE)**
4.  **MAPA DE ARCHIVOS & TECNOLOGÍA (THE STRUCTURE)**
5.  **INGENIERÍA DE PROMPTS & PSICOLOGÍA (THE BRAIN)**
6.  **MANUALES OPERATIVOS (THE FIELD GUIDE)**
7.  **GOBERNANZA Y SEGURIDAD (THE SHIELD)**
8.  **ROADMAP EVOLUTIVO (THE FUTURE)**
9.  **PROTOCOLO DE GUERRA ECONÓMICA (THE WAR ROOM)**
10. **EL CREDO DEL OPERADOR (THE OATH)**

---

# 1. 👁️ VISIÓN & FILOSOFÍA (THE ORIGIN)

### 1.1 La Tesis del "Signal"
El mercado actual no sufre de falta de demanda, sufre de **exceso de ruido**. Dominion se basa en la **Teoría de Señales**: un mensaje de WhatsApp no es texto; es una señal de intención. El tiempo de vida de una señal "caliente" es de **menos de 5 minutos**. Dominion existe para capturar, decodificar y capitalizar esa señal antes de que se enfríe.

### 1.2 El Paradigma "Human-in-the-Loop"
Rechazamos la automatización total ciega. La IA es para filtrar y calificar; el Humano es para ejecutar el cierre y cobrar.

### 1.3 Soberanía de Datos (BYOK)
Dominion opera bajo el modelo **Bring Your Own Key**. No somos dueños de tus clientes ni de tu IA. Tú pones la API Key de Google y la sesión de WhatsApp. Dominion es el motor.

---

# 2. 💼 MODELO SAAS Y PLANES COMERCIALES (THE BUSINESS CORE)

Dominion opera como una plataforma SaaS multi-tenant. Cada cliente es una entidad aislada con su propio ciclo de vida y nivel de acceso a funcionalidades, regido por un plan comercial.

### 2.1 Modelo de Cliente (Client Entity)
La base de datos centraliza la información de cada cliente en un único documento, que define el comportamiento del bot para ese nodo.
*   **`client_id`**: Identificador único.
*   **`business_name`**: Nombre del negocio.
*   **`plan_type`**: `starter` | `pro`.
*   **`plan_status`**: `active` | `expired` | `suspended`.
*   **`billing_end_date`**: Fecha de vencimiento del ciclo actual. Clave para el control automático.

### 2.2 Sistema de Planes por Feature Flags
La funcionalidad se habilita mediante flags, no con lógica hardcodeada. Esto permite escalabilidad y flexibilidad.

*   **PLAN STARTER:**
    *   `auto_reply`: **true** (Respuestas básicas)
    *   `professional_tone`: **true** (Tono profesional estándar)
    *   `intent_detection`: **false**
    *   `lead_scoring`: **false**
    *   `close_assist`: **false**

*   **PLAN PRO:**
    *   `auto_reply`: **true**
    *   `professional_tone`: **true**
    *   `intent_detection`: **true** (Detecta intención de compra)
    *   `lead_scoring`: **true** (Califica leads como Frío, Tibio, Caliente)
    *   `close_assist`: **true** (Genera sugerencias de cierre para el vendedor)

### 2.3 Ciclo de Vida del Plan (Control de Vencimiento)
El sistema es autónomo y no depende de pasarelas de pago para su lógica operativa.
1.  **Chequeo por Evento:** En cada mensaje entrante, el sistema verifica `billing_end_date`.
2.  **Downgrade Automático:** Si `today > billing_end_date`, el `plan_status` cambia a `expired`.
3.  **Lógica de Expiración:**
    *   Las features del plan "Pro" se desactivan al instante.
    *   El bot revierte su comportamiento al modo "Starter" (respuestas básicas).
    *   Se genera un log de tipo `AUDIT` registrando el vencimiento.
    *   El cliente final nunca percibe un error, solo una menor "inteligencia" en la respuesta.
4.  **Renovación Manual:** El Super Admin puede extender el `billing_end_date` 30 días desde el "God Panel", reactivando el plan `pro` instantáneamente.

---

# 3. ⚡ FLUJOS DE DATOS & ARQUITECTURA (THE PIPELINE)

*Diagramas de flujo y stack tecnológico se mantienen como en la versión anterior, pero ahora cada decisión del `IA Service` pasa primero por una consulta al `PlanService` para verificar los feature flags del cliente.*

---

# 4. 📂 MAPA DE ARCHIVOS (THE STRUCTURE)

### Nuevas Adiciones Críticas:
*   `/src/services/logService.ts`: Módulo centralizado para registrar todos los eventos del sistema.
*   `/src/services/planService.ts`: Define los planes y sus features. Es el "guardián" de la lógica comercial.
*   `/src/controllers/adminController.ts`: Agrupa toda la lógica de la API para el "God Panel".

### Modificaciones Clave:
*   `database.ts`: El `UserSchema` ahora es un `ClientSchema` con toda la lógica SaaS. Se añade `LogSchema`.
*   `aiService.ts`: Ahora es consciente del plan del cliente y adapta sus prompts dinámicamente.
*   `AdminDashboard.tsx` y `AuditView.tsx`: Reconstruidos para la gestión de clientes y visualización de logs.

---

# 5. 🧠 INGENIERÍA DE PROMPTS & PSICOLOGÍA (THE BRAIN)

El sistema de "Capas Sedimentarias" ahora incluye una **Capa Cero** de validación.

### Capa 0: Validación de Plan (Plan Gate)
Antes de construir el prompt, `aiService` consulta a `planService`.
*   Si `lead_scoring` es `false`, la instrucción de calificar el lead (Frío, Tibio, Caliente) **nunca se añade al prompt**.
*   Si `close_assist` es `false`, la instrucción de generar `suggestedReplies` **nunca se añade al prompt**.

Esto asegura que no se consuman recursos de IA en funcionalidades que el cliente no ha pagado y que el bot se comporte estrictamente según el plan contratado.

---

# 6. 📘 MANUALES OPERATIVOS (THE FIELD GUIDE)

### 6.1 Manual de Super Administrador (God Panel)
1.  **Acceso:** Ingresar con credenciales `master`.
2.  **Gestión de Clientes:**
    *   La vista principal muestra todos los clientes, su plan y fecha de vencimiento.
    *   Hacer clic en "Gestionar" para entrar a la vista de detalle.
3.  **Modificar Plan:** En la vista de detalle, puedes cambiar el `plan_type` y el `plan_status` y guardar los cambios.
4.  **Renovar Suscripción:** Usar el botón "Renovar 30 Días" para extender la `billing_end_date`.
5.  **Suspender Cliente:** Cambiar `plan_status` a `suspended` para bloquear el bot de un cliente sin borrar sus datos.
6.  **Monitoreo:** La pestaña "Telemetría y Logs" muestra un feed en vivo de toda la actividad del sistema para auditoría y debugging.

---

# 7. 🛡️ GOBERNANZA Y SEGURIDAD (THE SHIELD)

*La separación de roles ahora es más crítica. El bot (`client.ts`) tiene permisos de solo lectura sobre el plan del cliente. Solo los endpoints del `adminController` pueden modificar el estado de un plan, y solo son accesibles por el `super_admin`.*

---
*El resto del códice se mantiene y expande sobre esta nueva base SaaS.*
