# 🛡️ GOBERNANZA Y SEGURIDAD

Este documento describe las medidas de seguridad y los protocolos de gobernanza implementados en Dominion.

---

### 1. Autenticación y Autorización

- **Tokens JWT:** La comunicación entre el cliente y el servidor está protegida mediante JSON Web Tokens.
    - Después de un login exitoso, el servidor firma un token con un `JWT_SECRET` que contiene el `userId` y el `role`.
    - Este token se envía en la cabecera `Authorization` de cada petición a la API.
    - El middleware `authenticateToken` en el backend valida la firma del token en cada endpoint protegido, denegando el acceso si es inválido o ha expirado.

- **Roles de Usuario:** El sistema implementa un control de acceso basado en roles (RBAC) simple:
    - **`client`:** Rol estándar para los usuarios del SaaS. Tienen acceso solo a sus propios datos (configuraciones, conversaciones).
    - **`super_admin`:** Rol con acceso privilegiado. Puede acceder a los datos de todos los clientes, ver logs globales y realizar acciones administrativas a través de los endpoints `/api/admin`.

### 2. Seguridad de Datos

- **Aislamiento de Datos (Multi-Tenant):** La arquitectura está diseñada para un aislamiento estricto de los datos de cada cliente.
    - Cada documento en la base de datos (conversaciones, configuraciones) está asociado a un `userId`.
    - Todas las consultas a la base de datos están condicionadas por el `userId` obtenido del token JWT, asegurando que un cliente no pueda acceder accidentalmente a los datos de otro.

- **Encriptación de Contraseñas:** Las contraseñas de los usuarios se almacenan en la base de datos utilizando el algoritmo de hashing **bcrypt**. Nunca se almacenan en texto plano.

- **Modelo BYOK (Bring Your Own Key):**
    - La API Key de Google Gemini del cliente se almacena en la base de datos y se utiliza para todas las llamadas a la IA.
    - **Ventaja de Seguridad:** Esto significa que Dominion no tiene una clave maestra centralizada que pueda ser comprometida. La responsabilidad y el control del acceso a la IA recaen en el cliente, minimizando el vector de ataque.

### 3. Seguridad de la Conexión de WhatsApp

- **Persistencia de Sesión Segura:** El estado de autenticación de Baileys (credenciales y claves) se almacena directamente en MongoDB a través del módulo `mongoAuth.ts`.
    - Esto es más seguro que almacenar archivos de sesión en el disco del servidor, ya que aprovecha las capacidades de seguridad de MongoDB Atlas.
    - Las credenciales están vinculadas al `userId`, manteniendo el aislamiento.

- **Arquitectura de Mitigación Activa de Riesgos:** Aunque se utiliza una API no oficial, la plataforma está diseñada para minimizar el riesgo de suspensión mediante una estrategia integral:
    - **Emulación de Comportamiento Humano:** Se utiliza un sistema de `debounce` (6 segundos) para evitar respuestas instantáneas y patrones detectables de bot, simulando una cadencia de conversación natural.
    - **Enfoque Anti-Spam por Diseño:** La plataforma está orientada a la gestión de conversaciones entrantes y no posee funcionalidades de envío masivo.
    - **Aislamiento de Sesiones:** Cada cliente opera con una sesión de WhatsApp completamente aislada para prevenir riesgos de bloqueo en cascada.
    - **Huella Digital Legítima:** La conexión se identifica como un navegador estándar (ej. Chrome en macOS), haciendo que la sesión sea indistinguible de una operación humana.

### 4. Gobernanza y Auditoría

- **Logging Centralizado (`logService`):** Todas las acciones importantes del sistema se registran en la base de datos con diferentes niveles (`INFO`, `WARN`, `ERROR`, `AUDIT`).
    - **AUDIT:** Registra eventos críticos de seguridad y negocio, como inicios de sesión, cambios de plan, y acciones de super_admin.
    - Esto permite una trazabilidad completa de las operaciones y facilita la depuración y el análisis de seguridad.

- **Panel de Super Admin:** Proporciona una interfaz para monitorear la salud del sistema, gestionar clientes y revisar logs, permitiendo una supervisión activa de la plataforma.