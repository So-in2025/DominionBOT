# 🦅 Dominion Bot SaaS - v2.8

**Arquitectura:** SaaS Multi-Tenant para Calificación de Leads en WhatsApp (Node.js + React + Baileys + Gemini AI)

---

## 1. Visión del Producto (Pitch Comercial)
Dominion es la herramienta que evita que pierdas ventas en WhatsApp. Responde por ti cuando no estás, identifica quién realmente quiere comprar y te avisa solo cuando vale la pena que entres a cerrar.

**Diferenciadores Clave v2.8:**
- **Calificación por IA:** Usa Gemini para entender la intención real, separando curiosos de clientes potenciales.
- **Human-in-the-Loop:** Cuando un lead está listo para comprar, la IA se silencia y te pasa el control.
- **BYOK (Bring Your Own Key):** Soberanía de datos y costos para el cliente.

---

## 2. Ecosistema Técnico

### Backend (Node.js / Express)
- **Motor WhatsApp:** `@whiskeysockets/baileys` emulando sesiones web seguras con mitigación de riesgos.
- **Capa de Datos:** MongoDB Atlas para persistencia de credenciales y conversaciones.
- **IA Core:** Procesamiento asíncrono vía Google Gemini.

### Frontend (React + Tailwind)
- **UI:** Dashboard operativo diseñado para la toma de decisiones rápidas.
- **Context Layer:** Sidebar para gestión de notas y seguimiento interno.

---

## 3. Guía de Despliegue (Render + MongoDB)
1. **Database:** Configurar cluster en MongoDB Atlas y obtener `MONGO_URI`.
2. **Backend:** Desplegar en Render y configurar las variables de entorno (`JWT_SECRET`, `MONGO_URI`, etc).
3. **Frontend:** Desplegar en Vercel apuntando a la URL del API de Render.

---
**Autor:** Senior Engineer (Dominion-OS)
**Estado:** Production Ready v2.8