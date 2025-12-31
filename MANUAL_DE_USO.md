# 📖 MANUALES OPERATIVOS

Este documento contiene las guías de uso esenciales para los dos roles principales del sistema: Cliente y Super Administrador.

---

## 1. GUÍA PARA CLIENTES

Esta guía te ayudará a poner en marcha y operar tu nodo de Dominion.

### a. Registro y Primeros Pasos
1.  **Solicitar Acceso:** En la página principal, haz clic en "Solicitar Acceso".
2.  **Completa el Formulario:**
    - **Número de WhatsApp:** Será tu nombre de usuario. Ingresa el número completo, incluyendo código de país (ej: 549261...).
    - **Nombre del Negocio:** El nombre que la IA usará para presentarse.
    - **Contraseña:** Elige una contraseña segura.
3.  **Acceso Inmediato:** Tras el registro, iniciarás sesión automáticamente y comenzarás un período de prueba **PRO** de 14 días.
4.  **Guarda tu Master Recovery Key:** Se te mostrará una clave de recuperación única. **¡GUÁRDALA EN UN LUGAR SEGURO!** Es la única forma de recuperar tu cuenta si olvidas la contraseña.

### b. Conexión del Nodo (Pestaña "Conexión")
1.  **Elige un Método:**
    - **Código QR:** Abre WhatsApp en tu teléfono, ve a `Ajustes > Dispositivos Vinculados > Vincular un dispositivo` y escanea el QR que aparece en pantalla. Es el método más rápido.
    - **Vincular Teléfono:** Ingresa tu número de WhatsApp y haz clic en "Vincular". Recibirás una notificación en tu teléfono para ingresar un código de 8 caracteres que aparecerá en Dominion.
2.  **Espera la Sincronización:** El estado cambiará a "Conectado" en unos segundos. ¡Listo! Tu nodo está en línea.
3.  **Resetear Conexión:** Si tienes problemas para conectar, usa el botón "Limpiar rastro de sesión" o "Resetear Conexión" para forzar una desvinculación completa y empezar de cero.

### c. Configuración del Cerebro Neural (Pestaña "Configuración")
Esta es la parte más importante. Aquí le enseñas a la IA cómo vender tu producto.

1.  **Carga una Plantilla (Opcional):** Para empezar rápido, selecciona una "Plantilla Táctica" que se ajuste a tu negocio (ej: Agencia, Inmobiliaria). Esto rellenará los campos principales.
2.  **Calibración (Wizard de 3 Fases):**
    - **Fase 1 (Misión):** Define el nombre de tu negocio, tu misión principal y tu cliente ideal.
    - **Fase 2 (Arsenal):** Describe en detalle tu producto/servicio, el precio y el llamado a la acción (ej: un link para agendar una llamada).
    - **Fase 3 (Playbook):** Enseña a la IA a manejar objeciones comunes (ej: "¿Cuánto cuesta?") y establece las reglas que nunca debe romper.
3.  **Personalidad:** Ajusta el Tono, Ritmo e Intensidad de la IA para que coincida con la voz de tu marca.
4.  **API Key de Gemini:** Pega tu clave de la API de Google AI Studio en el campo correspondiente. Es **obligatorio** para que la IA funcione.
5.  **Sincronizar IA:** Siempre que hagas cambios, presiona el botón "Sincronizar IA" para que se apliquen.

### d. Operación Diaria (Pestaña "Mensajes" y "Métricas")
- **Mensajes:** Aquí verás todas las conversaciones entrantes. Puedes tomar el control de una conversación en cualquier momento desactivando el "Bot ON" para ese chat.
- **Métricas:** Monitorea el rendimiento de tu embudo de ventas, la tasa de conversión y el retorno de inversión estimado que la IA está generando.

---

## 2. GUÍA PARA SUPER ADMINISTRADOR

Esta guía cubre las funcionalidades del panel de control global.

### a. Acceso
- **Credenciales:** Utiliza las credenciales de Super Administrador para iniciar sesión.
- **Vista por Defecto:** Al iniciar sesión, serás dirigido directamente al "Panel de Control Global".

### b. Visión General (Dashboard)
- **KPIs Globales:** Monitorea métricas clave de toda la plataforma: MRR, total de clientes, nodos en línea, y cuentas en riesgo.
- **Distribución de Planes:** Visualiza cuántos clientes están en cada plan (`pro` vs. `starter`).
- **Vencimientos Próximos:** Identifica rápidamente las cuentas cuyas licencias están por expirar para una gestión proactiva.

### c. Gestión de Clientes (Pestaña "Clientes")
- **Listado Completo:** Accede a una tabla con todos los clientes registrados.
- **Auditoría ("Gestionar"):** Al hacer clic en "Gestionar" en un cliente, entras en el modo de auditoría. Desde aquí puedes:
    - **Modificar Datos:** Cambiar el nombre del negocio.
    - **Gestionar Plan:** Cambiar el `plan_type` (pro/starter) o el `plan_status` (active/expired/suspended).
    - **Activar Licencia:** Para un cliente en `trial` o `expired`, el botón "Activar Licencia" le otorga 30 días de servicio `pro`.
    - **Renovar Plan:** Para un cliente `active`, el botón "Renovar Plan" extiende su fecha de vencimiento por 30 días más.

### d. Telemetría (Pestaña "Logs")
- **Visor de Logs:** Consulta un flujo en tiempo real de los eventos del sistema.
- **Niveles de Log:**
    - `INFO`: Eventos normales de operación.
    - `WARN`: Advertencias que no interrumpen el servicio.
    - `ERROR`: Fallos que requieren atención.
    - `AUDIT`: Acciones críticas de seguridad y negocio (registros, cambios de plan, etc.).
- **Utilidad:** Esencial para depurar problemas y monitorear la salud de la plataforma.

### e. Acciones de Alto Riesgo
- **Hard Reset:** Ubicado en la parte inferior del Dashboard.
- **¡PRECAUCIÓN!** Esta acción es **destructiva e irreversible**. Borra todos los clientes, conversaciones, logs y sesiones de la base de datos.
- **Confirmación:** Requiere escribir la palabra "RESET" para proceder, como medida de seguridad. Úsalo solo en entornos de prueba o en caso de una emergencia catastrófica que requiera reiniciar la plataforma desde cero.