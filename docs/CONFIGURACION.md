# AllAIs · Guía de configuración (octubre de 2026)

Pasos que se hacen una sola vez en las consolas de Google, Firebase y los proveedores de IA. Cada paso indica si es obligatorio u opcional.

## 1. Inicio de sesión con Google (obligatorio)

1. Firebase → **Authentication → Método de acceso → Google → Habilitar**.
2. Elija el correo de asistencia (`fdealbam@nni.ai`) y guarde.
3. En **Authentication → Configuración → Dominios autorizados** confirme que estén `allais.nni.ai`, `allais-nni.web.app` y `allais-nni.firebaseapp.com`.

## 2. Archivo `functions/.env` (obligatorio)

En la carpeta del proyecto, copie `functions/.env.example` como `functions/.env` y complete los valores. Este archivo no se sube a GitHub.

```powershell
Copy-Item functions\.env.example functions\.env
notepad functions\.env
```

## 3. Registro en Google Sheets (recomendado)

1. Cree una hoja de cálculo nueva en Google Drive, por ejemplo «AllAIs · Registro de uso».
2. Menú **Extensiones → Apps Script**. Borre el contenido y pegue el archivo `docs/sheets-apps-script.gs`.
3. En la línea `const TOKEN = "CAMBIA-ESTE-TOKEN";` escriba una clave larga inventada (por ejemplo, 30 letras y números al azar).
4. **Implementar → Nueva implementación → Tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Pulse **Implementar** y autorice.
5. Copie la URL que termina en `/exec`.
6. En `functions/.env`:
   ```
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   SHEETS_WEBHOOK_TOKEN=la-misma-clave-del-paso-3
   ```
7. Las pestañas Visitas, Consultas y Usuarios se crean solas con el primer registro.

## 4. Firestore (recomendado)

- **Firestore → TTL (Time-to-live) → Crear política**: colección `rateLimits`, campo `expiresAt`. Así se borran solos los contadores de protección.
- Si al abrir el panel aparece un error de índice, el mensaje incluye un enlace para crearlo con un clic.

## 5. App Check con reCAPTCHA v3 (opcional)

App Check es gratuito; reCAPTCHA tiene un cupo gratuito mensual (confirme la tarifa vigente en Google Cloud).

1. Google Cloud → **reCAPTCHA** → crear clave de tipo **sitio web** (puntuación) para `allais.nni.ai` y `allais-nni.web.app`.
2. Firebase → **App Check → Apps → app web → reCAPTCHA** y registre la clave.
3. En `functions/.env`: `APPCHECK_SITE_KEY=<clave de sitio>` y deje `APPCHECK_ENFORCE=false`.
4. Publique y use la app unos días. Si en Firebase → App Check las solicitudes aparecen como verificadas, cambie a `APPCHECK_ENFORCE=true` y vuelva a publicar.

## 6. Alertas de gasto (obligatorio)

**Google Cloud / Firebase**
1. console.cloud.google.com → **Facturación → Presupuestos y alertas → Crear presupuesto**.
2. Proyecto: `allais-nni`. Monto: por ejemplo 20 USD al mes.
3. Alertas al 50 %, 90 % y 100 %, con aviso por correo a los administradores de facturación.

**OpenAI** — platform.openai.com → Settings → **Limits**: fije un *budget* mensual y un correo de aviso.

**Anthropic** — console.anthropic.com → Settings → **Limits** (o Billing): fije el límite de gasto mensual del espacio de trabajo y active las notificaciones.

**Google AI Studio (Gemini)** — Gemini se factura en el proyecto de Google Cloud de la clave; queda cubierto por el presupuesto de Google Cloud si la clave pertenece a `allais-nni`, o cree uno igual en el proyecto de la clave.

**DeepSeek** — platform.deepseek.com funciona con saldo prepagado: cargue solo el monto que esté dispuesto a gastar.

Los nombres de los menús pueden variar; si no encuentra alguno, busque «budget» o «usage limits» en la consola del proveedor.

## 7. Dominio de correo para que los enlaces no lleguen a spam (recomendado)

1. Firebase → **Authentication → Plantillas → Personalizar dominio** y escriba `mail.nni.ai`.
2. En Namecheap (Advanced DNS de `nni.ai`) agregue los cuatro registros que indique Firebase. En *Host*: `mail` para los dos TXT; `firebase1._domainkey.mail` y `firebase2._domainkey.mail` para los CNAME.
3. Cuando Firebase lo dé por verificado, cambie el remitente a `acceso@mail.nni.ai` y el nombre a «AllAIs · NNI».
4. Si antes agregó registros con `allais` como host (TXT o CNAME de `_domainkey`), bórrelos. No borre el CNAME `allais` que apunta a la página.

## 8. Publicar

```powershell
cd "H:\Telegram Desktop\0 NNI issues\App interfase AllIAs\nni-ai-platform"
git checkout main
git pull
cd functions; npm install; cd ..
firebase deploy --only functions,hosting,firestore:rules
```

Después: abra `https://allais.nni.ai`, entre con Google, haga una consulta y revise `https://allais.nni.ai/admin.html`.
