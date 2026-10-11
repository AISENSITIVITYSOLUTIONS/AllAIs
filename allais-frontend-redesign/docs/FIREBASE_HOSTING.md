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

## Despliegue automatico desde GitHub

El repositorio incluye dos flujos de GitHub Actions en `.github/workflows/`:

- `firebase-hosting-pull-request.yml`: publica una vista previa temporal (7 dias) de cada pull request que modifique `public/` y deja el enlace como comentario en el PR.
- `firebase-hosting-merge.yml`: despliega `public/` al canal de produccion (`live`) de `allais-nni` cada vez que se fusiona un cambio en `main`. Tambien puede ejecutarse a mano desde la pestaña Actions (Run workflow).

Ambos flujos despliegan solo Firebase Hosting (el frontend). El rewrite `/api/**` apunta a la version vigente de la Cloud Function `api` (sin `pinTag`), de modo que publicar el frontend no vuelve a desplegar el backend. Cuando cambie el backend, se despliega por separado:

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions --project allais-nni
```

### Configuracion unica: cuenta de servicio

Los flujos necesitan el secreto `FIREBASE_SERVICE_ACCOUNT_ALLAIS_NNI`. La forma mas directa de crearlo es desde una terminal con Firebase CLI autenticado, en la carpeta del proyecto:

```powershell
firebase init hosting:github
```

El asistente pide el repositorio (`AISENSITIVITYSOLUTIONS/AllAIs`), crea la cuenta de servicio con permisos de Hosting y guarda el secreto en GitHub. Cuando pregunte si desea sobrescribir los archivos de flujo existentes, responda **No** para conservar los de este repositorio.

Alternativa manual:

1. Google Cloud Console > IAM y administracion > Cuentas de servicio (proyecto `allais-nni`).
2. Crear una cuenta con los roles **Firebase Hosting Admin** y **Cloud Run Viewer**.
3. Generar una clave JSON.
4. GitHub > AllAIs > Settings > Secrets and variables > Actions > New repository secret: nombre `FIREBASE_SERVICE_ACCOUNT_ALLAIS_NNI`, valor = contenido completo del JSON.
5. Borrar el archivo JSON local.

### Despliegue manual (alternativa)

```powershell
firebase deploy --only hosting --project allais-nni
```
