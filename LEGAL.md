# ⚖️ ASPECTOS LEGALES Y FILOSOFÍA OPERATIVA

Este documento centraliza la Política de Privacidad, los Términos y Condiciones, y el Manifiesto de Dominion.

---

## 1. POLÍTICA DE PRIVACIDAD

*Actualizado: Octubre 2023*

### 1.1. Introducción y Modelo de Datos
Dominion Bot opera bajo un modelo de **Privacidad por Diseño** y **BYOK (Bring Your Own Key)**. Entendemos que tus datos comerciales son sensibles. Esta política detalla cómo tratamos técnicamente la información.

### 1.2. Aislamiento de Datos e IA (Google Gemini)
*   **Modelo BYOK:** Dominion Bot actúa como un orquestador técnico. La inteligencia artificial es provista por **Google AI Studio** a través de tu propia API Key.
*   **No Entrenamiento:** Dominion Bot **NO** utiliza tus conversaciones, datos de clientes ni prompts para entrenar modelos propios ni de terceros. Los datos se envían a Google Gemini exclusivamente para procesar la respuesta inmediata (runtime).
*   **Aislamiento:** Cada cuenta opera en un entorno aislado. Tu API Key y tus sesiones de WhatsApp se almacenan encriptados y separados lógicamente de otros inquilinos (tenants).

### 1.3. Datos que Almacenamos
*   **Credenciales de WhatsApp:** Tokens de sesión necesarios para mantener la conexión (vía librería Baileys), almacenados en nuestra base de datos segura.
*   **Historial de Conversaciones:** Se almacenan en nuestra base de datos para proveer contexto a la IA ("Memoria a Corto Plazo").
*   **Configuración del Bot:** Prompts de sistema, descripción de productos y reglas de negocio.

### 1.4. Datos que NO Almacenamos ni Vendemos
*   No vendemos metadatos de tus clientes.
*   No compartimos tu API Key con terceros.
*   No almacenamos información de tarjetas de crédito (los pagos se procesan externamente).

### 1.5. Responsabilidad del Cliente
Al conectar tu API Key de Google y tu sesión de WhatsApp, aceptas que Dominion Bot actúe como un procesador de datos bajo tus instrucciones. Eres responsable de obtener el consentimiento de tus clientes finales para ser contactados por WhatsApp.

---

## 2. TÉRMINOS Y CONDICIONES

*Actualizado: Octubre 2023*

### 2.1. Definición del Servicio
Dominion Bot es una herramienta SaaS de orquestación técnica que conecta WhatsApp Web (vía protocolo Baileys) con Google Gemini para automatizar respuestas. **Dominion Bot es una herramienta, no un resultado.**

### 2.2. Uso Aceptable y Política Anti-Spam
*   **Prohibido el Spam:** El uso de Dominion Bot para el envío masivo de mensajes no solicitados (spam) está estrictamente prohibido y resultará en la terminación inmediata de la cuenta sin reembolso.
*   **Venta Consultiva:** La plataforma está diseñada para responder a interacciones entrantes (Inbound) o reactivación de bases de datos con consentimiento previo.

### 2.3. Riesgos de WhatsApp y Mitigación de Riesgos
*   **Protocolo No Oficial:** Dominion utiliza librerías que interactúan con WhatsApp Web. No es la API oficial de WhatsApp Business.
*   **Arquitectura de Mitigación:** Nuestra implementación está diseñada para mitigar activamente los riesgos de suspensión mediante la emulación de comportamiento humano, un enfoque anti-spam y el aislamiento de sesiones.
*   **Limitación de Responsabilidad:** Si bien nuestra arquitectura mitiga los vectores de detección comunes, ningún sistema no oficial puede eliminar el riesgo por completo. **Dominion Bot NO se hace responsable por la pérdida, suspensión o bloqueo de números de WhatsApp.** El usuario asume este riesgo inherente al utilizar la plataforma.

### 2.4. Google Gemini y Costos de IA
*   El usuario es responsable de cumplir con los Términos de Servicio de Google AI Studio.
*   Dominion Bot no se hace responsable por costos inesperados en la facturación de Google Cloud del cliente.

### 2.5. Suspensión del Servicio
Nos reservamos el derecho de suspender el servicio si detectamos: uso abusivo de recursos, intentos de ingeniería inversa, o violaciones a la política de privacidad de terceros.

---

## 3. MANIFIESTO DOMINION

*Filosofía Operativa v2.8*

### 3.1. No somos Spammers. Somos Vendedores.
Dominion Bot nació para **cerrar ventas**, no para molestar gente. Creemos que la automatización sin empatía es basura digital. Si tu estrategia es disparar 10.000 mensajes a números fríos que no te conocen, **esta plataforma no es para ti**.

### 3.2. Human in the Loop (El Humano al Mando)
La IA es increíble, pero no es mágica.
*   El Bot **califica**.
*   El Bot **nutre**.
*   El Bot **responde**.
*   **El Humano cierra.**
Diseñamos el sistema para que la IA sepa cuándo callarse y pasarle la pelota a un humano. Respetamos ese límite.

### 3.3. Privacidad Sagrada (BYOK)
Creemos que tus datos son tu activo más valioso. Por eso adoptamos la arquitectura **Bring Your Own Key**. No queremos ser dueños de tu inteligencia, solo queremos ser el mejor motor para ejecutarla.

### 3.4. Calidad sobre Cantidad
Preferimos gestionar 50 conversaciones de alto valor ("High Ticket") con precisión quirúrgica, que 5.000 interacciones mediocres. Dominion está optimizado para agencias, consultoras y servicios B2B donde cada lead vale oro.

### 3.5. Tecnología con Propósito
Usamos Google Gemini no porque esté de moda, sino porque nos permite razonamiento complejo a un costo accesible para nuestros clientes. Optimizamos cada prompt, cada token y cada milisegundo. No hay "features de relleno". Todo lo que ves aquí está diseñado para vender más.