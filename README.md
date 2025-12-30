# 🦅 Dominion Bot SaaS - Signal Infrastructure v2.4.1

**Arquitectura:** SaaS Multi-Tenant de Inteligencia Comercial (Node.js + React + Baileys + Gemini AI)

---

## 1. Visión del Producto (Sales Intelligence)
Dominion Bot ha evolucionado de un chatbot a una **Infraestructura de Inteligencia de Ventas**. Utiliza IA Generativa de alto nivel para cualificar leads y permitir que el equipo humano se enfoque exclusivamente en el cierre de ventas de alto ticket.

**Diferenciadores Clave v2.4.1:**
- **Signal Engine:** Detección automática de intención y objeciones.
- **Mute Safety Mode:** Pausa inteligente de la IA en leads calientes para proteger el cierre.
- **BYOK (Bring Your Own Key):** Soberanía de datos y costos para el cliente.

---

## 2. Ecosistema Técnico

### Backend (Node.js / Express)
- **Motor WhatsApp:** `@whiskeysockets/baileys` emulando sesiones web seguras.
- **Capa de Datos:** MongoDB Atlas para persistencia de credenciales, señales y notas comerciales.
- **IA Core:** Procesamiento asíncrono vía Gemini (Modelos Flash y Pro).

### Frontend (React + Tailwind)
- **UI:** Dashboard operativo diseñado para la toma de decisiones rápidas.
- **Context Layer:** Sidebar lateral para gestión de señales y seguimiento interno.

---

## 3. Guía de Despliegue (Render + MongoDB)
1. **Database:** Configurar cluster en MongoDB Atlas y obtener `MONGO_URI`.
2. **Backend:** Desplegar en Render con disco persistente (opcional si se usa MongoDB para auth) y configurar `CORS_ORIGIN`.
3. **Frontend:** Desplegar en Vercel apuntando a la URL del API de Render.

---
**Autor:** Senior Engineer (Dominion-OS)
**Estado:** Production Ready v2.4.1