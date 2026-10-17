# Cobros con Mercado Pago en AllAIs

Este documento describe la integración de suscripciones mensuales con Mercado Pago México.

## Flujo

1. El usuario elige un plan. El frontend llama a `POST /billing/subscribe` con `{ "plan": "lanzamiento" }` o `{ "plan": "profesional" }` y su token de Firebase Auth.
2. El backend crea una suscripción (preapproval) en **estado pendiente**, con inicio dentro de **3 días** (prueba gratuita) y cobro mensual en **MXN**.
3. El usuario es enviado a `init_point` de Mercado Pago, donde registra su tarjeta.
4. Mercado Pago llama a `POST /billing/webhook`. El backend **vuelve a consultar** la suscripción en la API antes de cambiar nada.
5. El estado queda en `subscriptions/{correo}` de Firestore. El frontend lo lee con `GET /billing/status`.

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
3. **Montos:** definir `MP_PRICE_LANZAMIENTO_MXN` y `MP_PRICE_PROFESIONAL_MXN` en `functions/.env` antes de desplegar. Mientras estén vacíos, el backend responde que el plan no tiene precio y **no cobra**.
4. **Webhook:** en Mercado Pago Developers → Webhooks, registrar `https://allais.nni.ai/billing/webhook` y suscribirse al evento de **Planes y suscripciones**.
5. **Despliegue:**
   ```powershell
   cd "<carpeta-local-de-AllAIs>"  # la carpeta donde está package.json
   git checkout main
   git pull
   firebase deploy --only functions:billing,hosting
   ```
   Desplegar solo `billing` no altera el endpoint principal `api`.

## Pruebas antes de cobrar a clientes reales

- Usar las **credenciales de prueba** y las **cuentas de prueba** de Mercado Pago para registrar tarjetas de prueba.
- Verificar que el webhook actualiza `subscriptions/{correo}` a `active`.
- Revisar los registros en Firebase Functions (`billing`) si algo falla.

## Pendientes antes de publicar precios

- Confirmar que la cuenta puede cobrar en **USD** o fijar la conversión a MXN. Esta versión cobra solo en MXN.
- Confirmar con Mercado Pago que la prueba gratuita por fecha de inicio diferido se comporta como se espera en producción.
- Conectar el frontend (botón de suscripción y estado de la cuenta). No está incluido en esta rama.
