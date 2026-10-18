# Cobros con Mercado Pago en AllAIs

Este documento describe la integración de suscripciones mensuales con Mercado Pago México.

## Flujo

1. El usuario elige un plan. El frontend llama a `POST /billing/subscribe` con `{ "plan": "lanzamiento" }`, `profesional_1`, `profesional_2` o `profesional_3` y su token de Firebase Auth.
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
3. **Montos:** definir `MP_PRICE_LANZAMIENTO_MXN`, `MP_PRICE_PROFESIONAL_1_MXN`, `MP_PRICE_PROFESIONAL_2_MXN` y `MP_PRICE_PROFESIONAL_3_MXN` en `functions/.env` (por ejemplo 99, 199, 299 y 399) antes de desplegar. Mientras estén vacíos, el backend responde que el plan no tiene precio y **no cobra**.
4. **Webhook:** en Mercado Pago Developers → Webhooks, registrar `https://allais.nni.ai/billing/webhook` y suscribirse al evento de **Planes y suscripciones**.
5. **Despliegue:**
   ```powershell
   cd "<carpeta-local-de-AllAIs>"  # la carpeta donde está package.json
   git checkout main
   git pull
   firebase deploy --only functions:billing,hosting
   ```
   **Hosting va siempre junto con la función.** Ver la sección siguiente.

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

Por eso, **cualquier cambio en `functions/billing.js` o en las variables de
`functions/.env` exige desplegar Hosting en el mismo comando**:

```powershell
firebase deploy --only functions:billing,hosting
```

Lo mismo aplica al endpoint `api`, que usa la misma configuración.

## Pruebas en sandbox

Con credenciales de prueba, Mercado Pago solo acepta como comprador a un **usuario de prueba**. Define `MP_PAYER_EMAIL` en `functions/.env` con el correo del usuario de prueba (pestaña Cuentas de prueba) y vuelve a desplegar con `firebase deploy --only functions:billing,hosting`. En producción deja esa variable vacía.

## Modo de prueba interno (`BILLING_MOCK`)

Para validar la interfaz y Firestore **sin llamar a Mercado Pago ni cobrar nada**, define
`BILLING_MOCK=true` en `functions/.env` y despliega con
`firebase deploy --only functions:billing,hosting`.

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
- Validar la firma `x-signature` del webhook antes de aceptar notificaciones en producción.
