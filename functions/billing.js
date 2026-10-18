// Cobros de AllAIs con Mercado Pago (suscripciones mensuales en MXN).
// Flujo: el usuario elige plan -> /billing/subscribe crea una suscripción (preapproval) en estado pendiente
// con inicio diferido a 3 días (prueba gratuita) -> Mercado Pago pide la tarjeta en init_point ->
// Mercado Pago avisa a /billing/webhook -> el backend consulta la suscripción en la API y actualiza Firestore.
// El webhook nunca confía en el contenido de la notificación: siempre vuelve a consultar a Mercado Pago.

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { canSubscribeTo, isPromoOpen, promoEndsAtIso } = require("./plans");
const { verify: verifySignature } = require("./webhook-signature");

if (!getApps().length) initializeApp();
const db = getFirestore();

const MP_API = "https://api.mercadopago.com";
const TRIAL_DAYS = Number(process.env.BILLING_TRIAL_DAYS || 3);
const BACK_URL = process.env.BILLING_BACK_URL || "https://allais.nni.ai/?pago=retorno";
const CURRENCY = "MXN";
const MOCK_MODE = process.env.BILLING_MOCK === "true";

const allowedOrigins = new Set([
  "https://allais.nni.ai",
  "https://allais-nni.web.app",
  "https://allais-nni.firebaseapp.com"
]);

// Los montos salen de variables de entorno (functions/.env), en pesos mexicanos al mes.
// Si falta un monto, ese plan no se puede contratar y no se cobra nada.
function plans() {
  return {
    lanzamiento: {
      id: "lanzamiento",
      label: "AllAIs · Plan Lanzamiento",
      amount: Number(process.env.MP_PRICE_LANZAMIENTO_MXN || 0)
    },
    profesional_1: {
      id: "profesional_1",
      label: "AllAIs · Plan Esencial",
      amount: Number(process.env.MP_PRICE_PROFESIONAL_1_MXN || 0)
    },
    profesional_2: {
      id: "profesional_2",
      label: "AllAIs · Plan Profesional",
      amount: Number(process.env.MP_PRICE_PROFESIONAL_2_MXN || 0)
    },
    profesional_3: {
      id: "profesional_3",
      label: "AllAIs · Plan Avanzado",
      amount: Number(process.env.MP_PRICE_PROFESIONAL_3_MXN || 0)
    }
  };
}

// La vigencia de la promoción se decide aquí, en el servidor. El navegador puede
// ocultar o mostrar el precio de Lanzamiento, pero no puede contratarlo fuera de fecha.
function assertAvailable(planId) {
  const verdict = canSubscribeTo(planId);
  if (verdict.ok) return;
  if (verdict.reason === "promo_closed") {
    throw httpError(409, "El precio de lanzamiento ya terminó. Elige uno de los planes vigentes.");
  }
  throw httpError(400, "Plan no disponible.");
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function sendJson(response, status, body) {
  response.status(status).set({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  }).json(body);
}

// Llamada autenticada a la API de Mercado Pago.
async function mercadoPago(path, options = {}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw httpError(503, "Los cobros aún no están configurados.");
  const response = await fetch(`${MP_API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("AllAIs Mercado Pago error", { path, status: response.status, message: data.message });
    throw httpError(502, "Mercado Pago no pudo completar la solicitud. Inténtalo de nuevo.");
  }
  return data;
}

// Consulta de una suscripción en Mercado Pago. La API principal la usa para
// revalidar el plan de una cuenta: el derecho de uso se confirma contra Mercado
// Pago, nunca contra lo que declare el navegador.
async function fetchPreapproval(preapprovalId) {
  const data = await mercadoPago(`/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "GET" });
  // "status" sale tal cual lo manda Mercado Pago ("authorized", "paused"...),
  // porque quien consume este dato lo traduce con su propio mapa de estados.
  // Devolverlo ya traducido degradaría a "unknown" a un suscriptor al corriente.
  return {
    id: data.id,
    status: data.status,
    internalStatus: internalStatus(data.status),
    externalReference: data.external_reference || null,
    nextPaymentDate: data.next_payment_date || null
  };
}

// Identidad del usuario por token de Firebase Auth (mismo criterio que la API principal).
async function verifyUser(request) {
  const match = String(request.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const token = await getAuth().verifyIdToken(match[1]);
    if (!token.email || !token.email_verified) return null;
    return { uid: token.uid, email: token.email.toLowerCase() };
  } catch {
    return null;
  }
}

// Mapa de estados de Mercado Pago a estados internos de AllAIs.
function internalStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized": return "active";
    case "pending": return "pending";
    case "paused": return "paused";
    case "cancelled": return "cancelled";
    default: return "unknown";
  }
}

async function createSubscription(request) {
  const user = await verifyUser(request);
  if (!user) throw httpError(401, "Inicia sesión con tu correo verificado para suscribirte.");

  const planId = String(request.body?.plan || "");
  const plan = plans()[planId];
  if (!plan) throw httpError(400, "Plan no válido.");
  if (!plan.amount || plan.amount <= 0) throw httpError(503, "Este plan aún no tiene precio configurado.");
  assertAvailable(plan.id);

  // Una sola suscripción activa o pendiente por correo.
  const existing = await db.collection("subscriptions").doc(user.uid).get();
  if (existing.exists && ["active", "pending"].includes(existing.get("status"))) {
    throw httpError(409, "Ya tienes una suscripción activa o pendiente.");
  }

  const startDate = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Modo de prueba interno (BILLING_MOCK=true): activa la suscripción sin llamar a Mercado Pago.
  // Sirve para validar la interfaz y Firestore. Debe estar apagado (false o sin definir) en producción.
  if (MOCK_MODE) {
    await db.collection("subscriptions").doc(user.uid).set({
      email: user.email,
      uid: user.uid,
      plan: plan.id,
      preapprovalId: "mock",
      status: "active",
      mpStatus: "mock",
      mock: true,
      trialEndsAt: startDate,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { initPoint: null, mock: true };
  }

  // En sandbox, Mercado Pago solo acepta un usuario de prueba como comprador: MP_PAYER_EMAIL.
  // En producción se deja vacío y se usa el correo real del usuario.
  const payerEmail = process.env.MP_PAYER_EMAIL || user.email;
  const preapproval = await mercadoPago("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: plan.label,
      external_reference: `${user.uid}|${plan.id}`,
      payer_email: payerEmail,
      back_url: BACK_URL,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        start_date: startDate,
        transaction_amount: plan.amount,
        currency_id: CURRENCY
      }
    })
  });

  await db.collection("subscriptions").doc(user.uid).set({
    email: user.email,
    payerEmail,
    uid: user.uid,
    plan: plan.id,
    preapprovalId: String(preapproval.id),
    status: "pending",
    mpStatus: preapproval.status || "pending",
    trialEndsAt: startDate,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { initPoint: preapproval.init_point, preapprovalId: String(preapproval.id) };
}

async function subscriptionStatus(request) {
  const user = await verifyUser(request);
  if (!user) throw httpError(401, "Inicia sesión para ver tu suscripción.");
  const snapshot = await db.collection("subscriptions").doc(user.uid).get();
  if (!snapshot.exists) return { status: "none" };
  const data = snapshot.data();
  const toIso = (value) => (value?.toDate ? value.toDate().toISOString() : value || null);
  return {
    status: data.status || "unknown",
    plan: data.plan || null,
    mock: data.mock === true,
    trialEndsAt: toIso(data.trialEndsAt),
    updatedAt: toIso(data.updatedAt)
  };
}

// Devuelve la suscripción vigente del usuario, o un error si no hay ninguna que administrar.
async function liveSubscription(user) {
  const ref = db.collection("subscriptions").doc(user.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists || !["active", "pending"].includes(snapshot.get("status"))) {
    throw httpError(409, "No tienes una suscripción activa.");
  }
  return { ref, data: snapshot.data() };
}

// Una suscripción de prueba (BILLING_MOCK) no existe en Mercado Pago: solo vive en Firestore.
function isMock(data) {
  return data.mock === true || data.preapprovalId === "mock";
}

// Cancelar no borra el documento: deja el estado en `cancelled` para conservar el historial.
async function cancelSubscription(request) {
  const user = await verifyUser(request);
  if (!user) throw httpError(401, "Inicia sesión para administrar tu suscripción.");

  const { ref, data } = await liveSubscription(user);

  if (isMock(data)) {
    await ref.set({
      status: "cancelled",
      mpStatus: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: "cancelled" };
  }

  const preapproval = await mercadoPago(`/preapproval/${encodeURIComponent(String(data.preapprovalId))}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" })
  });

  const status = internalStatus(preapproval.status) || "cancelled";
  await ref.set({
    status,
    mpStatus: preapproval.status || "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { status };
}

// Cambiar de plan reutiliza la misma suscripción: solo cambia el monto mensual.
// No se crea un preapproval nuevo, así que el usuario no vuelve a registrar su tarjeta.
async function changePlan(request) {
  const user = await verifyUser(request);
  if (!user) throw httpError(401, "Inicia sesión para cambiar de plan.");

  const planId = String(request.body?.plan || "");
  const plan = plans()[planId];
  if (!plan) throw httpError(400, "Plan no válido.");
  if (!plan.amount || plan.amount <= 0) throw httpError(503, "Este plan aún no tiene precio configurado.");
  assertAvailable(plan.id);

  const { ref, data } = await liveSubscription(user);
  if (data.plan === plan.id) throw httpError(409, "Ya tienes ese plan.");

  if (isMock(data)) {
    await ref.set({ plan: plan.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { plan: plan.id, mock: true };
  }

  const preapproval = await mercadoPago(`/preapproval/${encodeURIComponent(String(data.preapprovalId))}`, {
    method: "PUT",
    body: JSON.stringify({
      reason: plan.label,
      external_reference: `${user.uid}|${plan.id}`,
      auto_recurring: {
        transaction_amount: plan.amount,
        currency_id: CURRENCY
      }
    })
  });

  await ref.set({
    plan: plan.id,
    mpStatus: preapproval.status || data.mpStatus || null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { plan: plan.id };
}

// Validación de la firma x-signature del webhook de Mercado Pago.
// La lógica vive en webhook-signature.js; aquí solo se extraen los datos del request.
function verifyWebhookSignature(request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("AllAIs webhook: MP_WEBHOOK_SECRET no está configurado — se rechazan todas las notificaciones.");
    return false;
  }
  return verifySignature({
    signatureHeader: request.get("x-signature") || "",
    requestId: request.get("x-request-id") || "",
    dataId: request.query?.["data.id"] || request.body?.data?.id || "",
    secret
  });
}

// Mercado Pago envía { type, data: { id } } o parámetros en la URL. Solo se usa el id; el estado se consulta a la API.
async function handleWebhook(request) {
  const type = request.body?.type || request.query?.type || request.query?.topic || "";
  const id = request.body?.data?.id || request.query?.["data.id"] || request.query?.id || "";
  if (type !== "subscription_preapproval" || !id) return { ignored: true };

  const preapproval = await mercadoPago(`/preapproval/${encodeURIComponent(String(id))}`);
  const [uid = "", planId = ""] = String(preapproval.external_reference || "").split("|");
  if (!uid) return { ignored: true };

  await db.collection("subscriptions").doc(uid).set({
    uid,
    payerEmail: String(preapproval.payer_email || "").toLowerCase(),
    plan: planId || null,
    preapprovalId: String(preapproval.id),
    status: internalStatus(preapproval.status),
    mpStatus: preapproval.status || "unknown",
    nextPaymentAt: preapproval.next_payment_date || null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true };
}

exports.billing = onRequest({
  region: "us-central1",
  timeoutSeconds: 60,
  secrets: ["MERCADOPAGO_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"]
}, async (request, response) => {
  const origin = request.get("origin");
  if (allowedOrigins.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  try {
    const path = request.path.replace(/^\/billing/, "") || "/";

    if (path === "/subscribe" && request.method === "POST") {
      sendJson(response, 200, { ok: true, ...(await createSubscription(request)) });
      return;
    }
    if (path === "/change" && request.method === "POST") {
      sendJson(response, 200, { ok: true, ...(await changePlan(request)) });
      return;
    }
    if (path === "/cancel" && request.method === "POST") {
      sendJson(response, 200, { ok: true, ...(await cancelSubscription(request)) });
      return;
    }
    if (path === "/status" && request.method === "GET") {
      sendJson(response, 200, { ok: true, ...(await subscriptionStatus(request)) });
      return;
    }
    if (path === "/webhook" && request.method === "POST") {
      // Validar la firma antes de procesar. Sin firma válida, se rechaza con 401.
      // En modo mock no hay webhook real, pero la firma se valida igual si llega.
      if (!MOCK_MODE && !verifyWebhookSignature(request)) {
        console.warn("AllAIs webhook: firma x-signature inválida o ausente — solicitud rechazada.");
        sendJson(response, 401, { ok: false, error: "Firma inválida." });
        return;
      }
      // Mercado Pago reintenta si no recibe 200/201; los eventos ignorados también responden 200.
      await handleWebhook(request);
      response.status(200).send("ok");
      return;
    }
    sendJson(response, 404, { ok: false, error: "Ruta de cobros no encontrada." });
  } catch (error) {
    console.error("AllAIs billing error", { message: error?.message, path: request.path });
    sendJson(response, error.status || 500, {
      ok: false,
      error: error.status ? error.message : "Ocurrió un error al procesar el cobro."
    });
  }
});

exports.fetchPreapproval = fetchPreapproval;
exports.verifyWebhookSignature = verifyWebhookSignature;
