# AllAIs

Interfaz multimodelo de **NNI – Neural Network Initiative** para trabajar con distintos proveedores de inteligencia artificial desde una sola experiencia profesional.

AllAIs permite conectar OpenAI/ChatGPT, Claude, Gemini, DeepSeek, Qwen y proveedores futuros mediante un backend propio. El objetivo central es mantener las API keys del lado del servidor, evitar que queden expuestas en el navegador y ofrecer una interfaz sobria para prompts profesionales.

## Caracteristicas

- Interfaz web sobria con identidad NNI.
- Selector de proveedor de IA.
- Selector de modo de trabajo.
- Area central para prompts largos.
- Backend Node.js sin dependencias externas.
- Adaptadores para OpenAI, Anthropic, Gemini, DeepSeek y Qwen.
- Archivo `.env` para claves privadas.
- Documentacion de seguridad para API keys.

## Estructura del proyecto

```text
.
├── docs/
│   └── API_KEYS.md
├── public/
│   ├── assets/
│   │   └── nni-logo.svg
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── index.js
│   └── providers.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Requisitos

- Node.js 20 o superior.
- Una terminal como PowerShell, Terminal de Windows o macOS/Linux shell.
- API keys de los proveedores que quieras usar.

## Instalacion local

Clona o descomprime el proyecto y entra a la carpeta donde esta `package.json`.

```bash
cd nni-ai-platform
```

Crea tu archivo `.env` a partir de la plantilla:

```bash
cp .env.example .env
```

En Windows PowerShell, si `cp` no funciona, usa:

```powershell
Copy-Item .env.example .env
```

Edita `.env` y coloca ahi tus claves privadas. Consulta:

```text
docs/API_KEYS.md
```

## Ejecucion local

Inicia el servidor:

```bash
npm start
```

Abre la app:

```text
http://127.0.0.1:8787
```

Codigo demo por defecto:

```text
NNI-DEMO-2026
```

Si el puerto `8787` esta ocupado, puedes usar otro puerto:

```powershell
$env:PORT=8788
npm start
```

Y abrir:

```text
http://127.0.0.1:8788
```

## Arquitectura

AllAIs usa una separacion sencilla:

```text
Frontend web -> Backend AllAIs -> APIs privadas de IA
```

- `public/`: interfaz web servida al navegador.
- `server/index.js`: servidor HTTP local y rutas API.
- `server/providers.js`: adaptadores de proveedores.
- `.env`: configuracion privada local. No debe subirse a GitHub.
- `.env.example`: plantilla publica sin claves reales.

## Variables de entorno

Ejemplo general:

```env
PORT=8787
HOST=127.0.0.1
NNI_ACCESS_CODE=NNI-DEMO-2026

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
QWEN_API_KEY=
```

Consulta `docs/API_KEYS.md` para saber exactamente donde colocar las claves de OpenAI, Claude, Gemini, DeepSeek y Qwen.

## Seguridad

Las API keys deben vivir siempre en el servidor. Nunca deben enviarse al navegador ni guardarse en el codigo del frontend.

No subas a GitHub:

- `.env`
- claves privadas;
- capturas con claves visibles;
- logs con respuestas sensibles;
- archivos temporales con configuraciones privadas.

El archivo `.gitignore` ya bloquea `.env`, `node_modules/`, logs y salidas temporales.

## Despliegue

Para una version comercial con API keys protegidas, no conviene publicar solo archivos estaticos si el frontend llamara directamente a proveedores privados. La opcion correcta debe incluir backend:

- Firebase Hosting + Cloud Functions.
- Firebase Hosting + backend externo.
- Vercel, Render o Railway con backend Node.

Este repositorio ya incluye una preparacion inicial para Firebase Hosting + Cloud Functions. Consulta:

```text
docs/FIREBASE_HOSTING.md
```

No ejecutes deploy sin revisar primero proyecto, costos, secretos y variables privadas.

## Roadmap comercial

Para una version de venta conviene agregar:

- Firebase Auth o Supabase Auth para Google/email/password.
- Base de datos de usuarios.
- Tabla de consumo por usuario.
- Límites por plan.
- Integración de pagos con Stripe/Mercado Pago.
- Registro de auditoría: usuario, modelo, tokens estimados, fecha y costo.

## Modelo de negocio recomendado

NNI no vende acceso simple a modelos. Vende una capa profesional:

- prompts guiados;
- selección de modelo por tarea;
- plantillas para investigación, educación, mercado, seguridad y gobierno;
- historial organizado por cliente/proyecto;
- control de costos;
- reportes exportables.
