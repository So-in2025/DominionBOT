# 🧠 PROMPT ARCHITECTURE: SIGNAL ENGINE v2.6/v2.7

## 1. LA ESTRATEGIA DE LAS 4 CAPAS (NEURAL LAYERING)
El motor de inteligencia de Dominion OS (`aiService.ts`) no genera texto plano; orquesta una estructura de conocimiento jerárquica para garantizar respuestas de alta fidelidad.

### CAPA 1: The Constitution (Hard Rules)
*   **Identidad:** Agente comercial profesional de Mendoza, Argentina.
*   **Restricciones:** Prohibición total de emojis, lenguaje coaching y mención de IA.
*   **Localismo:** Uso de español profesional argentino (Contexto Mendoza).
*   **Formato:** Salida JSON estricta para procesamiento por el backend.

### CAPA 2: Identity Tuning (Neural Sliders)
El sistema traduce los valores numéricos (1-5) del frontend en directivas para el LLM:
*   **Archetype:** Modifica el objetivo principal (Venta, Soporte o Consulta).
*   **Tone Map:** Escala de "Extremadamente Formal" a "Amigable".
*   **Rhythm Map:** Control de la longitud de los mensajes (Bulletpoints vs Detallado).
*   **Intensity Map:** Nivel de agresividad en el cierre comercial.

### CAPA 3: Knowledge Base (Pitch)
*   **Contexto de Producto:** Inyectado dinámicamente desde `productDescription`.
*   **Datos Comerciales:** `priceText` y `ctaLink` (Call to Action).

### CAPA 4: Short-Term Memory (Context Layer)
*   **Window Size:** Últimos 15 mensajes de la conversación.
*   **Internal Notes:** Las notas creadas por humanos en el `SalesContextSidebar` son inyectadas como instrucciones prioritarias para el bot.

## 2. ESQUEMA DE SALIDA (THE SIGNAL JSON)
El bot debe responder exclusivamente con este esquema:
```json
{
  "responseText": "Mensaje para el cliente",
  "newStatus": "Frío | Tibio | Caliente",
  "tags": ["objeción", "interés_precio", "urgente"],
  "recommendedAction": "Notify human | Continue conversation"
}
```

## 3. LÓGICA DE ESCALAMIENTO COMERCIAL
*   **Trigger HOT:** Si `newStatus` es `HOT`, el sistema en `client.ts` ejecuta:
    1.  `conversation.isMuted = true` (Desactiva la IA).
    2.  `conversation.escalatedAt = new Date()`.
    3.  Generación de una **Nota Interna Automática** con el análisis de la IA.
*   **Presence Update:** Durante la generación, el sistema envía `sock.sendPresenceUpdate('composing')` para simular actividad humana real.

---
*Dominion OS - Signal Division*