# 🛠️ STACK TECNOLÓGICO Y ESTRUCTURA DE ARCHIVOS

Este documento proporciona una visión general de las tecnologías utilizadas en Dominion y cómo está organizado el código fuente.

---

### 1. Stack Tecnológico Principal

| Área              | Tecnología Principal         | Descripción                                                              |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------ |
| **Frontend**      | React (con Vite) & TypeScript| Para una UI moderna, rápida y tipada.                                    |
| **Estilos**       | Tailwind CSS                 | Framework Utility-First para un diseño rápido y consistente.             |
| **Backend**       | Node.js & Express            | Entorno de ejecución y framework para construir la API RESTful.            |
| **Lenguaje (Back)** | TypeScript                 | Añade tipado estático a JavaScript para robustez.                        |
| **Base de Datos**   | MongoDB (con Mongoose)     | Base de datos NoSQL flexible, ideal para los datos de sesión y chats.    |
| **Motor WhatsApp**| `@whiskeysockets/baileys`    | Librería clave que emula WhatsApp Web para la conexión.                  |
| **Inteligencia IA**| `@google/genai` (Gemini)     | SDK oficial para interactuar con los modelos de IA de Google.            |
| **Autenticación** | JWT (jsonwebtoken)           | Estándar para crear tokens de acceso seguros entre cliente y servidor.   |
| **Despliegue (BE)** | Render                       | Plataforma en la nube para desplegar el servicio Node.js.                |
| **Despliegue (FE)** | Vercel                       | Plataforma optimizada para el despliegue de aplicaciones frontend.       |

---

### 2. Estructura de Archivos del Proyecto (`/src`)

La carpeta `src` contiene el núcleo de la aplicación, compartido por el frontend y el backend.

```
/src
├── components/         # Componentes de React para la UI
│   ├── Admin/          # Componentes específicos del panel de Super Admin
│   ├── AuthModal.tsx
│   ├── ChatWindow.tsx
│   └── ...
├── controllers/        # Lógica de la API (manejo de requests/responses)
│   ├── apiController.ts
│   └── adminController.ts
├── data/               # Datos estáticos (ej: textos legales)
├── middleware/         # Middlewares de Express (ej: autenticación)
├── services/           # Lógica de negocio y comunicación con APIs externas
│   ├── aiService.ts      # Lógica de construcción de prompts y llamada a Gemini
│   ├── audioService.ts   # (Frontend) Gestión de reproducción de audio
│   ├── conversationService.ts # Orquesta la lógica de las conversaciones
│   ├── logService.ts     # Sistema centralizado de logging
│   ├── planService.ts    # Define las funcionalidades por tipo de plan
│   └── ttsService.ts     # (Backend) Generación de audio con Text-to-Speech
├── utils/              # Funciones de ayuda reutilizables
├── whatsapp/           # Lógica de conexión con WhatsApp (Baileys)
│   ├── client.ts       # Orquesta la conexión, recepción y envío de mensajes
│   └── mongoAuth.ts    # Almacena y recupera el estado de autenticación de Baileys en MongoDB
├── App.tsx             # Componente raíz de React
├── config.ts           # Configuración compartida (URLs, headers)
├── database.ts         # Conexión con MongoDB y modelos de datos (Mongoose)
├── env.ts              # Carga y exporta variables de entorno
├── server.ts           # Punto de entrada del servidor Express
└── types.ts            # Definiciones de tipos y enumeraciones de TypeScript
```

---

### 3. Flujo de Compilación y Ejecución

- **Desarrollo (`npm run dev`):**
    - `concurrently` ejecuta dos procesos a la vez:
        1.  `ts-node-dev`: Inicia el servidor de backend (`src/server.ts`) y lo reinicia automáticamente ante cambios.
        2.  `vite`: Inicia el servidor de desarrollo del frontend, sirviendo `index.html` y los componentes de React.

- **Producción (`npm start` después de `npm run build`):**
    1.  `tsc -p tsconfig.server.json`: El compilador de TypeScript (`tsc`) transpila los archivos `.ts` del backend a JavaScript plano en la carpeta `/dist`.
    2.  `node dist/server.js`: Node.js ejecuta el servidor compilado. El frontend se construye por separado (`vite build`) y se sirve como estático o desde Vercel.
