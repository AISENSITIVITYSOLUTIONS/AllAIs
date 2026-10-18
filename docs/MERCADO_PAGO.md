# Cobros con Mercado Pago en AllAIs

Este documento describe la integración de suscripciones mensuales con Mercado Pago México.

## Flujo

1. El usuario elige un plan. El frontend llama a `POST /billing/subscribe` con `{ "plan": "lanzamiento" }`, `profesional_1`, `profesional_2` o `profesional_3` y su token de Firebase Auth.

   **Los identificadores no coinciden con los nombres comerciales.** Los ids son del backend
   y no cambian; los nombres visibles viven solo en `public/billing.js`:

   | id | nombre visible | precio |
   |---|---|---|
   | `lanzamiento` | Lanzamiento | $99 |
   | `profesional_1` | Esencial | $199 |
   | `profesional_2` | Profesional (recomendado) | $299 |
   | `profesional_3` | Avanzado | $399 |

2. El backend crea una suscripción (preapproval) en **estado pendiente**, con inicio dentro de **3 días** (prueba gratuita) y cobro mensual en **MXN**.
3. El usuario es enviado a `init_point` de Mercado Pago, donde registra su tarjeta.
4. Mercado Pago llama a `POST /billing/webhook`. El backend **vuelve a consultar** la suscripción en la API antes de cambiar nada.
5. El estado queda en `subscriptions/{uid}` de Firestore. El frontend lo lee con `GET /billing/status`.

## Rutas

| Ruta | Método | Qué hace |
|---|---|---|
| `/billing/subscribe` | POST | Crea la suscripción. Falla con 409 si ya hay una vigente. |
| `/billing/status` | GET | Estado, plan y si es de prueba. |
| `/billing/change` | POST | Cambia el plan de una suscripción vigente. |
| `/billing/cancel` | POST | Cancela la suscripción vigente. |
| `/billing/webhook` | POST | Notificaciones de Mercado Pago. |

**Cambiar de plan reutiliza el mismo preapproval**: solo actualiza el monto mensual y la
referencia externa, así que el usuario no vuelve a registrar su tarjeta.

**Cancelar no borra el documento**: deja `status: "cancelled"` para conservar el historial.
El usuario puede contratar de nuevo desde la misma pantalla.

Ambas rutas detectan las suscripciones de prueba (`mock: true`) y, en ese caso, solo
escriben en Firestore sin llamar a Mercado Pago.

## Estados

| Mercado Pago | AllAIs | Significado |
|---|---|---|
| `pending` | `pending` | Esperando que el usuario registre la tarjeta |
| `authorized` | `active` | Suscripción activa |
| `paused` | `paused` | Pausada |
| `cancelled` | `cancelled` | Cancelada |

## Configuración previa al despliegue (lo ejecuta Felipe)

1. **Token de acceso de producción:** en Mercado Pago Developers → AllAIs → Credenciales de producción. No usar el de prueba en producción.
2. **Guardarlo como secreto** (no va en el repositorio):
   ```powershell
   firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN
   ```
3. **Secreto del webhook:** en Mercado Pago Developers → Webhooks → Configurar notificación, revelar el secreto y guardarlo:
   ```powershell
   firebase functions:secrets:set MP_WEBHOOK_SECRET
   ```
4. **Montos:** definir `MP_PRICE_LANZAMIENTO_MXN`, `MP_PRICE_PROFESIONAL_1_MXN`, `MP_PRICE_PROFESIONAL_2_MXN` y `MP_PRICE_PROFESIONAL_3_MXN` en `functions/.env` (por ejemplo 99, 199, 299 y 399) antes de desplegar. Mientras estén vacíos, el backend responde que el plan no tiene precio y **no cobra**.
5. **Webhook:** en Mercado Pago Developers → Webhooks, registrar `https://allais.nni.ai/billing/webhook` y suscribirse al evento de **Planes y suscripciones**.
6. **Despliegue:**
   ```powershell
   cd "<carpeta-local-de-AllAIs>"  # la carpeta donde está package.json
   git checkout main
   git pull origin main

   cd functions
   npm install
   npm test            # debe decir: # pass 57  /  # fail 0
   cd ..

   firebase deploy --only functions:api,functions:billing,hosting
   ```
   **Hosting va siempre junto con las funciones**, y `api` va junto con `billing`
   porque el control de cuotas vive en `api`. Ver la sección siguiente.

### Cómo saber qué versión subió

El comando imprime una línea como esta:

```
i  functions: packaged ...\functions (75.15 KB) for uploading
```

Ese tamaño es la forma más rápida de verificar la versión: el código con el control
de cuotas y sus pruebas pesa **~75 KB**; el anterior pesaba ~55 KB. Si el número es
el chico, subió una versión vieja.

Confirmación sin consola: abrir el sitio en una ventana privada e ir a la pantalla de
planes. Debe decir **«Precio válido si contratas antes del 10 de noviembre de 2026»**.

### Si hay que volver a la versión anterior

> **Esto no es parte del despliegue.** Es un extintor: se usa **solo** si después de
> desplegar el sitio queda roto. Si el despliegue salió bien, estos comandos no se
> tocan — ejecutarlos «de pasada» vuelve a publicar el código viejo y deshace el
> trabajo, sin ningún mensaje de error que lo advierta.

```powershell
git checkout <commit-anterior>
firebase deploy --only functions:api,functions:billing,hosting
git checkout main
```

Después de usarlo, el sitio queda en la versión vieja hasta que se vuelva a desplegar
desde `main`. Conviene anotar el commit al que se regresó y por qué.

## Validación de firma del webhook (`x-signature`)

Cada notificación de Mercado Pago lleva un header `x-signature` con una firma
HMAC-SHA256. El backend la valida **antes** de procesar el evento; si la firma
falta o no coincide, responde `401` y descarta la solicitud.

El secreto se obtiene en **Mercado Pago Developers → Tu integración → Webhooks →
Configurar notificación** (el botón "Revelar" lo muestra). Se guarda como secreto
de Firebase:

```powershell
firebase functions:secrets:set MP_WEBHOOK_SECRET
```

Después de guardarlo, desplegar con el comando habitual. La función `billing` ya
lo declara en su lista de secretos.

Si `MP_WEBHOOK_SECRET` no está configurado, **todas** las notificaciones se
rechazan, lo que impide activar suscripciones por webhook. En modo mock
(`BILLING_MOCK=true`) la validación se salta porque no hay webhook real.

La lógica vive en `functions/webhook-signature.js` y sus pruebas en
`functions/test/webhook-signature.test.js`.

## Por qué hay que desplegar Hosting junto con la función

En `firebase.json`, la reescritura de `/billing/**` usa `"pinTag": true`:

```json
{
  "source": "/billing/**",
  "function": { "functionId": "billing", "region": "us-central1", "pinTag": true }
}
```

`pinTag` fija la ruta `/billing/**` a la **revisión concreta** de la función que existía
cuando se desplegó Hosting por última vez. Es deliberado: evita que un despliegue a medias
deje el sitio hablando con una versión de la función que todavía no está lista.

La consecuencia práctica es que **`firebase deploy --only functions:billing` no basta**.
Ese comando crea una revisión nueva, pero Hosting sigue enviando el tráfico a la revisión
anterior, así que el sitio se comporta como si nada hubiera cambiado. El síntoma es
desconcertante: el despliegue termina en `Deploy complete!`, el código y el `.env` son
correctos, y aun así el comportamiento viejo persiste por más veces que se repita.

Por eso, **cualquier cambio en `functions/billing.js`, en `functions/index.js` o en las
variables de `functions/.env` exige desplegar Hosting en el mismo comando**:

```powershell
firebase deploy --only functions:api,functions:billing,hosting
```

`api` lleva la misma configuración `pinTag`, y es donde vive el control de cuotas, así
que se despliega junto con `billing` aunque el cambio parezca ser solo de cobros.

Si el despliegue salió bien, el comando imprime esta línea, que es la confirmación de
que Hosting sí va a enrutar las revisiones nuevas:

```
i  hosting: The following function(s) are pinned to site allais-nni and will be deployed as well: api,billing
```

## Cuotas por plan

Las cuotas no viven en el frontend. El plan de cada cuenta se resuelve en el servidor
a partir del `uid` del token de Firebase Auth y se revalida contra Mercado Pago; la
petición del navegador nunca declara su propio plan.

| Plan | id en el backend | Precio | Al mes | Al día |
|---|---|---|---|---|
| Lanzamiento | `lanzamiento` | $99 | 300 | 10 |
| Esencial | `profesional_1` | $199 | 300 | — |
| Profesional | `profesional_2` | $299 | 600 | — |
| Avanzado | `profesional_3` | $399 | 1 000 | — |

Tres módulos, con una responsabilidad cada uno:

- **`functions/plans.js`** — única fuente de las cuotas, los topes diarios, los ciclos
  de facturación y la vigencia de la promoción. Lógica pura, sin red ni base de datos.
  **Cualquier cambio de precio o de cuota se hace aquí**, no en el frontend ni en
  `billing.js`, o las dos mitades se desalinean.
- **`functions/entitlements.js`** — identifica el plan activo. Solo el estado `active`
  concede cuota: una tarjeta `pending` no. Revalida contra Mercado Pago cada 6 horas;
  si Mercado Pago no responde, conserva el estado conocido para no dejar sin servicio
  a quien ya pagó.
- **`functions/quota.js`** — registra el consumo. Verifica e incrementa el contador del
  ciclo y el del día **dentro de una sola transacción**, de modo que las solicitudes
  simultáneas no rebasan el límite. Reinicia por ciclo de facturación y por día.

Documentos en la colección `usage`:

```
<correo>_<AAAA-MM-DD>     consumo del día
<uid>_c_<claveDeCiclo>    consumo del ciclo de facturación
```

El ciclo se ancla en la fecha de contratación, no en el día 1 del mes, con aritmética
ajustada a fin de mes (quien contrató un 31 de enero factura el 28 de febrero).

Al agotarse el cupo, el endpoint de chat responde `429` con `MONTHLY_LIMIT` o
`DAILY_LIMIT`. Si la respuesta falla a medio camino, la consulta se devuelve en todos
los contadores que la registraron.

### Pruebas

```powershell
cd functions
npm test
```

57 pruebas en `functions/test/`, sobre un Firestore en memoria que lleva número de
versión por documento y reintenta las transacciones igual que el real, para que las
pruebas de concurrencia valgan algo. Cubren los cuatro planes, los cambios de
suscripción, los vencimientos, las solicitudes simultáneas y la expiración de la
promoción.

> La promoción de Lanzamiento cierra a la medianoche del **10 de noviembre de 2026**,
> hora de la Ciudad de México. La fecha está en `functions/plans.js` y, repetida solo
> para lo que se muestra, en `public/billing.js`. Quien la tenga contratada conserva
> su precio: la fecha limita la venta, no el servicio.

## Pruebas en sandbox

Con credenciales de prueba, Mercado Pago solo acepta como comprador a un **usuario de prueba**. Define `MP_PAYER_EMAIL` en `functions/.env` con el correo del usuario de prueba (pestaña Cuentas de prueba) y vuelve a desplegar con `firebase deploy --only functions:api,functions:billing,hosting`. En producción deja esa variable vacía.

## Modo de prueba interno (`BILLING_MOCK`)

Para validar la interfaz y Firestore **sin llamar a Mercado Pago ni cobrar nada**, define
`BILLING_MOCK=true` en `functions/.env` y despliega con
`firebase deploy --only functions:api,functions:billing,hosting`.

Con el modo activo, `/billing/subscribe` no contacta a Mercado Pago: escribe directamente
`subscriptions/{uid}` con `status: "active"` y `mock: true`, y responde `{ mock: true }`.
El frontend muestra entonces "Suscripción de prueba activada (sin cobro)".

Sirve sobre todo mientras no se tenga un comprador de prueba válido para el sandbox.

> **En producción, `BILLING_MOCK` debe quedar en `false` o sin definir, y `MP_PAYER_EMAIL`
> vacío.** De lo contrario nadie paga y todas las cuentas quedan activas.

## Pruebas antes de cobrar a clientes reales

- Usar las **credenciales de prueba** y las **cuentas de prueba** de Mercado Pago para registrar tarjetas de prueba.
- Verificar que el webhook actualiza `subscriptions/{uid}` a `active`.
- Revisar los registros en Firebase Functions (`billing`) si algo falla.

## Pendientes antes de publicar precios

- Confirmar que la cuenta puede cobrar en **USD** o fijar la conversión a MXN. Esta versión cobra solo en MXN.
- Confirmar con Mercado Pago que la prueba gratuita por fecha de inicio diferido se comporta como se espera en producción.
- Quitar `BILLING_MOCK` y `MP_PAYER_EMAIL` del `.env` de producción, cambiar el secreto al token de producción y registrar el webhook en modo productivo.
- ~~Validar la firma `x-signature` del webhook antes de aceptar notificaciones en producción.~~ ✅ Implementado: el webhook rechaza con 401 toda notificación sin firma válida. El secreto se guarda en Secret Manager como `MP_WEBHOOK_SECRET`.
