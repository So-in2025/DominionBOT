# 💰 MODELO SAAS Y PLANES COMERCIALES

Este documento detalla el modelo de negocio, los planes de suscripción y la lógica de monetización de Dominion.

---

### 1. Modelo de Negocio: SaaS Multi-Tenant

Dominion opera como una plataforma de Software como Servicio (SaaS) donde múltiples clientes (inquilinos o *tenants*) utilizan la misma infraestructura de software, pero con sus datos completamente aislados y seguros.

- **Infraestructura Centralizada:** Un único backend y base de datos sirven a todos los clientes.
- **Aislamiento de Datos:** Cada pieza de información (usuarios, conversaciones, configuraciones) está estrictamente vinculada a un `userId`.
- **Escalabilidad:** Este modelo permite una gestión y actualización eficientes de la plataforma para todos los clientes a la vez.

---

### 2. Planes Comerciales

La plataforma ofrece un único plan principal y un estado de repliegue, simplificando la oferta comercial.

#### a) Plan `pro` (Profesional) - **USD 29/mes**
- **Funcionalidades:** Incluye todas las capacidades de la plataforma:
    - `intent_detection`: Capacidad de la IA para entender la intención real del cliente.
    - `lead_scoring`: Calificación automática de leads en **Frío, Tibio, Caliente**.
    - `priority_alerts`: Notificaciones o cambios visuales para leads calientes.
    - `close_assist`: Modo "Copiloto" donde la IA sugiere respuestas al vendedor humano.
- **Caso de Uso:** Es el plan único y completo, diseñado para equipos de ventas que buscan maximizar la eficiencia y la conversión.

#### b) Plan `starter` (Fallback / Repliegue)
- **Funcionalidades:**
    - `auto_reply`: Respuestas automáticas básicas.
    - `professional_tone`: La IA mantiene un tono profesional.
- **Caso de Uso:** Este plan funciona como un **estado de repliegue (fallback)**. Cuando el plan `pro` o el período de `trial` de un cliente expira, el sistema revierte a las funcionalidades `starter` para garantizar que el bot no se apague por completo. **No es un plan de venta.**

---

### 3. Ciclo de Vida de la Suscripción

1.  **Registro (`trial`):**
    - Al registrarse, un nuevo cliente comienza automáticamente en un período de prueba (`plan_status: 'trial'`).
    - Este período le otorga acceso a todas las funcionalidades del plan `pro` durante **14 días o hasta calificar 10 conversaciones**, lo que ocurra primero.

2.  **Activación (`active`):**
    - Un `super_admin` debe activar manualmente la licencia del cliente.
    - La activación cambia el `plan_status` a `active` y establece una nueva `billing_end_date` a **30 días en el futuro**.

3.  **Expiración (`expired`):**
    - Si llega la `billing_end_date` y el plan no se ha renovado, el `plan_status` cambia automáticamente a `expired`.
    - En este estado, las funcionalidades del bot se limitan a las del plan `starter`.

4.  **Renovación:**
    - Un `super_admin` puede renovar la licencia de un cliente en cualquier momento.
    - La renovación extiende la `billing_end_date` por otros 30 días y asegura que el `plan_status` sea `active`.

5.  **Suspensión (`suspended`):**
    - Es un estado manual que puede ser asignado por un `super_admin` en caso de abuso de la plataforma.
    - En este estado, la IA se desactiva por completo.

---

### 4. Lógica de Monetización y Métricas

- **MRR (Ingreso Mensual Recurrente):** El panel de `super_admin` calcula una estimación del MRR sumando `USD 29` por cada cliente con `plan_status: 'active'`.
- **ROIE (Retorno de Inversión Estimado):** En el dashboard del cliente, se muestra un "Retorno Estimado" calculado como `(Nº de Leads Calientes) x (Valor Fijo por Lead)`. Este es un KPI para demostrar el valor que genera la herramienta.