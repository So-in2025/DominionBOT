# 🎨 DISEÑO Y EXPERIENCIA DE USUARIO (UI/UX)

Este documento define la identidad visual y los principios de experiencia de usuario para la plataforma Dominion.

---

### 1. Filosofía de Diseño: "Elite Neural Interface"

La interfaz de Dominion debe sentirse como una herramienta profesional, precisa y de alta tecnología. La estética está inspirada en interfaces de ciencia ficción, terminales de datos y dashboards de inteligencia.

- **Precisión y Claridad:** La información debe ser densa pero legible. El usuario debe poder tomar decisiones rápidas basadas en los datos presentados.
- **Sensación Táctica:** La UI debe sentirse como un "centro de comando" o un "núcleo de control". Los elementos deben ser deliberados y funcionales.
- **Estética "Luxury Tech":** La combinación de negro profundo, dorados metálicos y brillos sutiles busca evocar una sensación de exclusividad y poder.

---

### 2. Paleta de Colores Principal

La paleta de colores está definida en `tailwind.config.js` y `index.html`.

| Nombre                | Hex       | Rol en la UI                                                            |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `brand-black`         | `#050505` | Color de fondo principal. Proporciona el máximo contraste.               |
| `brand-surface`       | `#121212` | Fondos para tarjetas y paneles. Un gris muy oscuro para crear profundidad. |
| `brand-gold`          | `#D4AF37` | Color de acento principal. Usado para botones, highlights y estado activo. |
| `brand-gold-light`    | `#F9DF74` | Variante más brillante del dorado para gradientes y efectos de hover.     |
| `brand-gold-dark`     | `#997B19` | Variante más oscura para sombras y gradientes.                           |
| `Texto Principal`     | `#e5e7eb` | Color de texto por defecto (Gris claro).                                |
| `Texto Secundario`    | `#6b7280` | Texto de menor jerarquía (labels, metadatos).                           |

---

### 3. Tipografía

- **Fuente Principal:** `Inter`.
- **Justificación:** Es una fuente sans-serif moderna y altamente legible en una gran variedad de tamaños y pesos, ideal para interfaces de usuario densas en datos.
- **Pesos Utilizados:**
    - `900 (Black)`: Para títulos principales y KPIs.
    - `700 (Bold)`: Para subtítulos y botones.
    - `500 (Medium)`: Para texto de cuerpo y párrafos.
    - `400 (Regular)`: Para textos secundarios.

---

### 4. Principios de UI/UX

- **Feedback Constante:** El sistema debe comunicar siempre su estado.
    - **Carga:** Spinners y animaciones de pulso (`animate-pulse`).
    - **Éxito/Error:** Notificaciones (`Toast`) y cambios de color en botones (ej. "Sincronizado ✓").
    - **Audio:** Micro-interacciones sonoras para confirmar acciones (clicks, éxito, error).

- **Jerarquía Visual Clara:**
    - El color `brand-gold` se reserva para las acciones más importantes y los datos más relevantes.
    - El tamaño y peso de la fuente se utilizan para guiar la atención del usuario desde los KPIs generales hasta los detalles específicos.

- **Diseño "Mobile-First" (Adaptativo):**
    - La aplicación debe ser completamente funcional en dispositivos móviles, aunque la experiencia de escritorio es la prioritaria.
    - Se utilizan menús laterales ocultos (`off-canvas`) y diseños de una sola columna en vistas móviles.

- **Efectos Visuales Sutiles:**
    - `neural-grid` y `bg-noise`: Crean una textura de fondo que refuerza la estética "high-tech" sin distraer.
    - `backdrop-blur`: Se utiliza en elementos superpuestos (modales, cabeceras) para crear una sensación de profundidad.
    - Transiciones y animaciones (`animate-fade-in`): Hacen que la aparición de elementos sea suave y menos abrupta.
