# Firebase Hosting para AllAIs

AllAIs no debe desplegarse como sitio estatico puro si va a usar claves privadas de OpenAI, Claude, Gemini, DeepSeek o Qwen. El frontend puede vivir en Firebase Hosting, pero las llamadas a los proveedores de IA deben pasar por un backend propio.

## Opcion recomendada

La opcion mas segura para este proyecto es:

```text
Firebase Hosting + Cloud Functions
```

Flujo:

```text
Navegador -> Firebase Hosting -> /api/** -> Cloud Function -> Proveedor de IA
```

Ventajas:

- Las API keys quedan del lado servidor.
- El navegador nunca recibe claves privadas.
- Se mantiene una sola infraestructura Firebase.
- Permite agregar autenticacion, base de datos y medicion de consumo despues.

## Archivos agregados

- `firebase.json`: configura Hosting y redirige `/api/**` a la funcion `api`.
- `.firebaserc`: define el proyecto sugerido `allais-nni`.
- `functions/index.js`: backend HTTP para las rutas API en Firebase Functions.
- `functions/providers.js`: adaptadores server-side para los proveedores de IA.
- `functions/package.json`: dependencias de Cloud Functions.

## Comandos de preparacion

Instalar Firebase CLI si no existe:

```powershell
npm install -g firebase-tools
```

Iniciar sesion:

```powershell
firebase login
```

Crear o seleccionar proyecto:

```powershell
firebase projects:create allais-nni
```

Instalar dependencias de Functions:

```powershell
cd functions
npm install
cd ..
```

## Variables privadas

Las claves no deben ponerse en `public/`, `index.html`, `app.js` ni GitHub.

Para produccion, configura secretos o variables del backend. Ejemplos:

```powershell
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set DEEPSEEK_API_KEY
firebase functions:secrets:set QWEN_API_KEY
```

Los modelos y el codigo de acceso tambien deben configurarse en el entorno servidor antes de desplegar.

## Antes del deploy

Antes de ejecutar `firebase deploy`, revisar:

- proyecto Firebase correcto;
- plan de facturacion y posibles costos;
- claves privadas cargadas como secretos o variables de entorno;
- `.env` fuera de GitHub;
- repo actualizado;
- pruebas locales completadas.

## No desplegar todavia

La tarea 9 solo prepara el proyecto. El despliegue corresponde a la tarea 10 y requiere autorizacion explicita.
