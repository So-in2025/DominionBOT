# 🧬 BLUEPRINT TÉCNICO: DOMINION OS (GOD MODE v2.7.2)

Este documento contiene las especificaciones exactas de ingeniería del sistema. Para la visión estratégica completa, refiérase al [DOCUMENTO_MAESTRO.md](./DOCUMENTO_MAESTRO.md).

## 1. ESPECIFICACIÓN DE COMPONENTES CORE

### WhatsApp Node (`client.ts`)
```typescript
// Configuración de Identidad de Nodo
browser: ['Dominion Signal Engine', 'Chrome', '2.4.1']

// Tiempos Críticos
DEBOUNCE_TIME_MS = 6000 // Agrupación semántica de mensajes
HEARTBEAT_INTERVAL = 30000 // Chequeo de salud de WebSocket
```

### Signal Engine (`aiService.ts`)
*   **Lógica de Escalado:** Si `json.newStatus === "HOT"`, el sistema ejecuta un bypass de la IA y notifica al nodo humano de forma inmediata.
*   **Estructura de Tags:** Extracción automática de intención (ej. "precio", "objecion_tiempo", "listo_para_pagar").

### Persistencia de Sesión (`mongoAuth.ts`)
*   **Manejo de Buffer:** Conversión de llaves de señal a formato `BufferJSON` para almacenamiento seguro en MongoDB. Esto permite que el nodo se mantenga "online" incluso después de reiniciar el servidor.

---

## 2. ESQUEMA DE DISEÑO SENSORIAL (UX/UI)

### Paleta de Colores (Fidelidad Técnica)
*   **Base:** `#050505` (Deep Black)
*   **Superficie:** `#121212` (Matte Black)
*   **Primario:** `#D4AF37` (Gold Platinum)
*   **Secundario:** `#F9DF74` (Gold Light)

### Capa de Audio (`App.tsx`)
```javascript
osc.frequency.setValueAtTime(220, ctx.currentTime); // Tono de notificación financiera
gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3); // Decaimiento suave
```

---

## 3. GOBERNANZA Y CONTROL GLOBAL
*   **Super Admin Dashboard:** Capacidad de inyectar `SystemState` a cualquier nodo en tiempo real.
*   **Audit Mode:** Filtro de seguridad que elimina el campo `password` de las respuestas del API y bloquea las mutaciones de base de datos (Read-Only).

---
*Dominion OS - Systems Architecture*