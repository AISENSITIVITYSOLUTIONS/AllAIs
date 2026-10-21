// Integración de PayPal Subscriptions API para AllAIs.
//
// Asume que:
// - PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET viven en Secret Manager
// - PAYPAL_ENV ("sandbox" o "production") vive en functions/.env
// - PAYPAL_PLAN_<PLANID> viven en functions/.env con los ids P-XXXX de PayPal
// - Sin credenciales, todas las funciones devuelven { error: "PayPal not configured" }
//
// Reutiliza plans.js para evitar duplicar la lógica de catálogo.

const { createHmac, timingSafeEqual } = require("crypto");

// Contexto: el entorno en el que corre (sandbox o production).
const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
const PAYPAL_API_HOST = PAYPAL_ENV === "production"
  ? "https://api.paypal.com"
  : "https://api.sandbox.paypal.com";

// Verifica que las credenciales existan. Sin ellas, el botón no aparece en el
// navegador y las rutas responden "no configurado".
function isConfigured() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
  return clientId && clientSecret;
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error("PayPal no está configurado (credenciales faltantes).");
  }
}

// Obtén un token OAuth de acceso. Se cachea en memoria por 30 min (los tokens
// duran 9 horas, pero renovar más a menudo es más seguro). Los errores de red
// no se cachean: se re-intenta.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getOAuthToken() {
  requireConfigured();

  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  const clientId = String(process.env.PAYPAL_CLIENT_ID).trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET).trim();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_HOST}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=https://api.paypal.com/v1/payments/subscription"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal OAuth falló: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.access_token || !data.expires_in) {
    throw new Error("PayPal OAuth: respuesta malformada");
  }

  // Cachea el token 30 minutos (30 * 60 * 1000 ms) antes de su expiración real
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (Math.min(data.expires_in * 1000, 30 * 60 * 1000));

  return cachedToken;
}

// Crea una suscripción en PayPal. El navegador ya ha aprobado el plan y
// proporcionó un token de suscripción; nosotros lo activamos en el backend.
// Devuelve { subscriptionId } si todo va bien.
async function createSubscription({
  planId,           // id del plan de AllAIs (ej. "lanzamiento")
  startDate,        // ISO string del primer cobro (normalmente en 3 días)
  customerId,       // uid del usuario
  planName,         // nombre para los registros (ej. "Plan Lanzamiento")
  subscriberEmail   // email del comprador, si está disponible
}) {
  requireConfigured();

  const { planIdFor } = require("./paypal-status");
  const paypalPlanId = planIdFor(planId);
  if (!paypalPlanId) {
    throw new Error(`No hay id de plan de PayPal para "${planId}". ¿Está PAYPAL_PLAN_${planId.toUpperCase()} en .env?`);
  }

  const token = await getOAuthToken();

  const payload = {
    plan_id: paypalPlanId,
    start_time: startDate,  // ISO 8601
    subscriber: {
      email_address: subscriberEmail || "unknown@example.com",
      name: {
        given_name: "Usuario",
        surname: "AllAIs"
      }
    },
    application_context: {
      brand_name: "AllAIs",
      locale: "es-MX",
      user_action: "SUBSCRIBE_NOW",
      return_url: "https://allais.nni.ai/?subscribe=success",
      cancel_url: "https://allais.nni.ai/?subscribe=cancelled"
    },
    custom_id: `${customerId}|${planId}`  // nuestro external_reference
  };

  const response = await fetch(`${PAYPAL_API_HOST}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("PayPal createSubscription error:", text);
    throw new Error(`Fallo al crear suscripción en PayPal: ${response.status}`);
  }

  const data = await response.json();
  if (!data.id) {
    throw new Error("PayPal: suscripción creada pero sin id");
  }

  // Extraer la URL de aprobación del usuario (rel: "approve")
  const approvalLink = (data.links || []).find(l => l.rel === "approve");
  const approvalUrl = approvalLink ? approvalLink.href : null;

  return { subscriptionId: data.id, approvalUrl };
}

// Recupera el estado actual de una suscripción desde PayPal. El backend lo usa
// para re-verificar lo que el webhook dice, sin confiar en el navegador.
// Devuelve { id, status, start_time, next_billing_time, ... } o null si no existe.
async function getSubscription(subscriptionId) {
  requireConfigured();

  const token = await getOAuthToken();

  const response = await fetch(
    `${PAYPAL_API_HOST}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("PayPal getSubscription error:", text);
    throw new Error(`Fallo al consultar suscripción de PayPal: ${response.status}`);
  }

  return await response.json();
}

// Cancela una suscripción activa de PayPal.
async function cancelPayPalSubscription(subscriptionId, reason = "Cancelado por el usuario") {
  requireConfigured();

  const token = await getOAuthToken();

  const response = await fetch(
    `${PAYPAL_API_HOST}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason })
    }
  );

  // 204 = éxito sin cuerpo
  if (response.status === 204) return { status: "cancelled" };

  const text = await response.text();
  console.error("PayPal cancelSubscription error:", response.status, text);
  throw new Error(`Fallo al cancelar suscripción de PayPal: ${response.status}`);
}

// Verifica la firma del webhook de PayPal. El webhook viaja con 5 headers:
//   paypal-transmission-id
//   paypal-transmission-time
//   paypal-transmission-sig
//   paypal-cert-url
//   paypal-auth-algo
//
// Construimos un manifest = transmission-id|transmission-time|webhook-id|event-body-hash
// y validamos que la firma SHA256(HMAC, manifest, webhook-secret) coincida.
async function verifyWebhookSignature(transmissionId, transmissionTime, signature, webhookId, eventBody) {
  requireConfigured();

  const webhookSecret = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookSecret) {
    console.error("PayPal webhook: PAYPAL_WEBHOOK_ID no configurado");
    return false;
  }

  // PayPal usa el hash SHA256 del body como parte del manifest.
  const bodyHash = createHmac("sha256", "")
    .update(JSON.stringify(eventBody))
    .digest("hex");

  const manifest = [
    transmissionId,
    transmissionTime,
    webhookId,
    bodyHash
  ].join("|");

  // Firma con HMAC-SHA256.
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("base64");

  // Comparación segura contra timing attacks.
  try {
    return timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expectedSignature, "utf8")
    );
  } catch {
    return false;
  }
}

module.exports = {
  PAYPAL_ENV,
  PAYPAL_API_HOST,
  isConfigured,
  requireConfigured,
  getOAuthToken,
  createSubscription,
  getSubscription,
  cancelPayPalSubscription,
  verifyWebhookSignature
};
