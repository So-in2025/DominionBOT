export const LEGAL_TEXTS = {
    privacy: {
        title: "Política de Privacidad",
        lastUpdated: "Actualizado: Octubre 2023",
        content: `
### 1. Introducción y Modelo de Datos
Dominion Bot opera bajo un modelo de **Privacidad por Diseño** y **BYOK (Bring Your Own Key)**. Entendemos que tus datos comerciales son sensibles. Esta política detalla cómo tratamos técnicamente la información.

### 2. Aislamiento de Datos e IA (Google Gemini)
*   **Modelo BYOK:** Dominion Bot actúa como un orquestador técnico. La inteligencia artificial es provista por **Google AI Studio** a través de tu propia API Key.
*   **No Entrenamiento:** Dominion Bot **NO** utiliza tus conversaciones, datos de clientes ni prompts para entrenar modelos propios ni de terceros. Los datos se envían a Google Gemini exclusivamente para procesar la respuesta inmediata (runtime).
*   **Aislamiento:** Cada cuenta opera en un entorno aislado. Tu API Key y tus sesiones de WhatsApp se almacenan en directorios persistentes encriptados y separados lógicamente de otros inquilinos (tenants).

### 3. Datos que Almacenamos
*   **Credenciales de WhatsApp:** Tokens de sesión necesarios para mantener la conexión (vía librería Baileys). Estos residen en el disco persistente del servidor.
*   **Historial de Conversaciones:** Se almacenan localmente en nuestra base de datos para proveer contexto a la IA ("Memoria a Corto Plazo").
*   **Configuración del Bot:** Prompts de sistema, descripción de productos y reglas de negocio.

### 4. Datos que NO Almacenamos ni Vendemos
*   No vendemos metadatos de tus clientes.
*   No compartimos tu API Key con terceros.
*   No almacenamos información de tarjetas de crédito (los pagos se procesan externamente).

### 5. Responsabilidad del Cliente
Al conectar tu API Key de Google y tu sesión de WhatsApp, aceptas que Dominion Bot actúe como un procesador de datos bajo tus instrucciones. Eres responsable de obtener el consentimiento de tus clientes finales para ser contactados por WhatsApp.
`
    },
    terms: {
        title: "Términos y Condiciones",
        lastUpdated: "Actualizado: Octubre 2023",
        content: `
### 1. Definición del Servicio
Dominion Bot es una herramienta SaaS de orquestación técnica que conecta WhatsApp Web (vía protocolo Baileys) con Google Gemini para automatizar respuestas. **Dominion Bot es una herramienta, no un resultado.**

### 2. Uso Aceptable y Política Anti-Spam
*   **Prohibido el Spam:** El uso de Dominion Bot para el envío masivo de mensajes no solicitados (spam) está estrictamente prohibido y resultará en la terminación inmediata de la cuenta sin reembolso.
*   **Venta Consultiva:** La plataforma está diseñada para responder a interacciones entrantes (Inbound) o reactivación de bases de datos con consentimiento previo.

### 3. Riesgos de WhatsApp y Limitación de Responsabilidad
*   **Protocolo No Oficial:** Dominion Bot utiliza librerías de emulación de navegador para conectar con WhatsApp Web. No utilizamos la API oficial de WhatsApp Business (BSP) para permitir flexibilidad y reducción de costos al cliente.
*   **Riesgo de Bloqueo:** Existe un riesgo inherente de bloqueo numérico por parte de WhatsApp si se detectan patrones abusivos. **Dominion Bot NO se hace responsable por la pérdida, suspensión o bloqueo de números de WhatsApp.** El usuario asume este riesgo al utilizar la plataforma.

### 4. Precio Fundadores
El "Precio Fundadores" es un beneficio para los primeros usuarios (Early Adopters). El precio de suscripción se mantiene fijo únicamente mientras la suscripción permanezca activa e ininterrumpida. En caso de cancelación o vencimiento por falta de pago, el beneficio se pierde irrevocablemente. Cualquier reactivación se realizará al precio de lista vigente en ese momento.

### 5. Google Gemini y Costos de IA
*   El usuario es responsable de cumplir con los Términos de Servicio de Google AI Studio.
*   Dominion Bot no se hace responsable por costos inesperados en la facturación de Google Cloud del cliente si este excede la capa gratuita.
*   Garantizamos compatibilidad técnica con la capa gratuita (Free Tier) de Gemini, sujeto a los límites de rate-limit de Google.

### 6. Suspensión del Servicio
Nos reservamos el derecho de suspender el servicio si detectamos: uso abusivo de recursos, intentos de ingeniería inversa, o violaciones a la política de privacidad de terceros.
`
    },
    manifesto: {
        title: "Manifiesto Dominion",
        subtitle: "Filosofía Operativa v2.1",
        content: `
### 1. No somos Spammers. Somos Vendedores.
Dominion Bot nació para **cerrar ventas**, no para molestar gente. Creemos que la automatización sin empatía es basura digital. Si tu estrategia es disparar 10.000 mensajes a números fríos que no te conocen, **esta plataforma no es para ti**.

### 2. Human in the Loop (El Humano al Mando)
La IA es increíble, pero no es mágica.
*   El Bot **califica**.
*   El Bot **nutre**.
*   El Bot **responde**.
*   **El Humano cierra.**
Diseñamos el sistema para que la IA sepa cuándo callarse y pasarle la pelota a un humano. Respetamos ese límite.

### 3. Privacidad Sagrada (BYOK)
Creemos que tus datos son tu activo más valioso. Por eso adoptamos la arquitectura **Bring Your Own Key**. No queremos ser dueños de tu inteligencia, solo queremos ser el mejor motor para ejecutarla. No entrenamos modelos con tus chats. Lo que pasa en tu negocio, se queda en tu negocio.

### 4. Calidad sobre Cantidad
Preferimos gestionar 50 conversaciones de alto valor ("High Ticket") con precisión quirúrgica, que 5.000 interacciones mediocres. Dominion está optimizado para agencias, consultoras y servicios B2B donde cada lead vale oro.

### 5. Tecnología con Propósito
Usamos Google Gemini no porque esté de moda, sino porque nos permite razonamiento complejo a costo cero para nuestros clientes. Optimizamos cada prompt, cada token y cada milisegundo. No hay "features de relleno". Todo lo que ves aquí está diseñado para vender más.
`
    },
    network: { // NEW: Network Legal Text
        title: "Términos de la Red Colaborativa Dominion",
        lastUpdated: "Actualizado: Junio 2024",
        content: `
### 1. Propósito de la Red
La Red Colaborativa Dominion es un ecosistema de negocios diseñado para **intercambiar oportunidades comerciales cualificadas con permiso previo**. Su objetivo es conectar oferta y demanda de manera ética, reduciendo el ruido y maximizando la relevancia para todas las partes.

### 2. Contribución de Señales de Intención
*   **Voluntario y Consensuado:** Los usuarios de Dominion pueden optar por **contribuir "Señales de Intención"** a la red. Esto ocurre cuando un lead en tu propio sistema es calificado como "Caliente" (alta intención de compra) y decides explícitamente compartir esa información.
*   **Anonimato Inicial:** Cuando contribuyes una señal, se comparte una descripción **anonimizada** de la intención del prospecto (ej: "Interés en marketing digital para PYMES"). **Nunca se comparte el número de teléfono, el nombre real del prospecto ni el historial de conversación en este paso.**
*   **Datos Mínimos:** Solo se extrae y comparte la información esencial para describir la oportunidad: categorías de interés y una descripción concisa de la intención de compra.

### 3. Recepción de Oportunidades de Conexión
*   **Basado en Interés:** Los negocios participantes pueden **recibir "Oportunidades de Conexión"** de otros miembros de la red, si la intención de un prospecto coincide con las "Categorías de Interés" que has configurado en tu perfil de red.
*   **Permiso Previo Siempre:** Antes de que cualquier negocio pueda contactar a un prospecto a través de la red, el sistema Dominion generará y enviará una **solicitud de permiso transparente** al prospecto (a través de un número neutral de la red Dominion). Este mensaje explica de dónde viene la solicitud y por qué se cree que es relevante.
*   **Tú decides:** **Solo si el prospecto acepta explícitamente** (respondiendo "SÍ" o haciendo clic en un enlace de confirmación), se revelará su número de teléfono y nombre al negocio que solicitó la conexión.

### 4. Compromiso de Confianza
*   **No Spam:** La Red Dominion está diseñada para combatir el spam, no para generarlo. El contacto siempre será relevante y autorizado.
*   **Respeto a la Privacidad:** En ningún momento se comparten chats privados ni datos sensibles sin consentimiento directo.
*   **Intercambio Justo:** El valor de la red se basa en la reciprocidad. Al contribuir señales, mejoras la calidad del ecosistema para todos, incluyendo las oportunidades que tú mismo recibirás.

### 5. Revocación del Consentimiento
Puedes desactivar tu participación en la Red Dominion en cualquier momento desde la sección de "Configuración de Red". Al hacerlo, tu negocio dejará de contribuir señales y de recibir nuevas oportunidades. Los datos anonimizados de intenciones ya compartidos permanecerán para análisis agregados de mercado, pero no se usarán para nuevas conexiones a tu nombre.
        `
    }
};