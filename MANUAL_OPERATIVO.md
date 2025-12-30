# 🛠️ MANUAL OPERATIVO: INFRAESTRUCTURA v2.7.2

## 1. GESTIÓN DE BASE DE DATOS (MONGODB)
El sistema utiliza una arquitectura no relacional para máxima velocidad.
*   **Colección `SaaSUser`:** Almacena el perfil completo, configuraciones de IA y el historial de gobernanza.
*   **Colección `BaileysSession`:** Almacena las claves de señal y credenciales binarias necesarias para la reconexión automática sin QR.

## 2. EL MOTOR DE MENSAJERÍA (client.ts)
*   **Debounce Logic:** Retraso de 6000ms (`DEBOUNCE_TIME_MS`) para agrupar mensajes del usuario y evitar respuestas múltiples.
*   **Presence States:** Uso de `composing` y `paused` para realismo táctico.
*   **SSE Despacho:** Los eventos `status_update`, `qr` y `new_message` se envían en tiempo real al frontend.

## 3. INFRAESTRUCTURA DE ALERTAS (Neural Alerts)
Lógica implementada en `App.tsx`:
*   **playAlertAudio:** Genera ondas senoidales a 220Hz con caída exponencial usando la `Web Audio API`.
*   **speakAlert:** Utiliza `window.speechSynthesis` con voz en español (es-AR).
*   **pushAlert:** Orquestado por el `service-worker.js` en segundo plano.

## 4. GOBERNANZA CENTRALIZADA (Global Control)
Acciones del Super Admin:
*   **Update Governance:** Modifica el `systemState` de cualquier tenant.
*   **Risk Scoring:** Monitoreo del `riskScore` (0-100). Valores >50 requieren auditoría.
*   **Audit Mode:** El backend filtra la respuesta eliminando el campo `password` y otorgando acceso de solo lectura.

## 5. DESPLIEGUE Y MANTENIMIENTO
*   **Actualizaciones PWA:** Incrementar versión en `CACHE_NAME` dentro de `service-worker.js`.
*   **Failover de IA:** El sistema rota automáticamente entre `3-Flash`, `2.5-Flash` y `3-Pro` si detecta errores de Rate Limit o API Keys inválidas.

---
*Dominion OS - Systems Division*