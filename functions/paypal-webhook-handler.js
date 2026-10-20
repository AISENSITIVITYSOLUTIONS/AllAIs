// Lógica de recepción del webhook de PayPal.
//
// Separada de paypal.js para poder probarla sin firebase-admin. Las
// dependencias (Firestore, consulta a PayPal, reloj) se inyectan desde afuera.

const { mapSubscriptionStatus, isRelevantEvent, subscriptionIdFromEvent, parseCustomId } = require("./paypal-status");

/**
 * Procesa un evento de PayPal desde su webhook.
 *
 * El webhook de PayPal envía múltiples tipos de evento (BILLING.SUBSCRIPTION.*,
 * PAYMENT.SALE.*). Solo procesamos los relevantes (definidos en paypal-status.js).
 * Para cualquier otro tipo se responde ignorado para que PayPal no reintente.
 *
 * El event body viaja en event.resource.custom_id con formato "uid|plan".
 * Ese custom_id lo pusimos en la creación de la suscripción.
 *
 * @param {object} eventBody          — el body del webhook de PayPal
 * @param {object} deps
 * @param {object} deps.dbInstance    — Firestore (real o fake)
 * @param {Function} deps.getPayPalSubscription — (id) => subscription remota
 * @param {Function} [deps.now]       — reloj inyectable
 * @param {*} [deps.updatedAtSentinel] — valor para updatedAt
 * @param {Function} [deps.log]       — logger inyectable
 */
async function handlePayPalWebhook(eventBody, {
  dbInstance,
  getPayPalSubscription,
  now = () => new Date(),
  updatedAtSentinel = null,
  log = (...args) => console.log(...args)
}) {
  const eventType = String(eventBody?.event_type || "").trim();
  if (!isRelevantEvent(eventType)) {
    return { ignored: true, reason: `event_type_not_relevant: ${eventType}` };
  }

  const subscriptionId = subscriptionIdFromEvent(eventBody);
  if (!subscriptionId) {
    return { ignored: true, reason: "subscription_id_not_found" };
  }

  // Consultamos la suscripción en PayPal antes de confiar en el evento.
  let subscription;
  try {
    subscription = await getPayPalSubscription(subscriptionId);
    if (!subscription) {
      return { ignored: true, reason: "subscription_not_found_in_paypal" };
    }
  } catch (error) {
    log("PayPal webhook: error consultando suscripción", { subscriptionId, error: error.message });
    throw error;  // reintenta: PayPal re-envía si no recibe 2xx
  }

  // El custom_id es nuestro external_reference: "uid|plan"
  const customId = subscription.custom_id || subscription.id;
  const parsed = parseCustomId(customId);
  if (!parsed) {
    return { ignored: true, reason: "invalid_custom_id" };
  }

  const { uid, plan: planId } = parsed;
  const newStatus = mapSubscriptionStatus(subscription.status);
  const nowIso = now().toISOString();

  // Guardamos la suscripción: los campos que PayPal nos devuelve.
  const ref = dbInstance.collection("subscriptions").doc(uid);
  const previous = await ref.get();
  const prevStatus = previous.exists ? previous.get("status") : "none";

  await ref.set({
    uid,
    // Sacamos el email del subscriber si está disponible
    payerEmail: (subscription.subscriber?.email_address || "").toLowerCase() || null,
    plan: planId || null,
    subscriptionId: String(subscription.id),
    gateway: "paypal",
    status: newStatus,
    paypalStatus: subscription.status || "unknown",
    // start_time es cuándo la suscripción empieza
    startTime: subscription.start_time || null,
    // next_billing_time es la próxima fecha de cobro
    nextPaymentAt: subscription.billing_cycles?.[0]?.pricing_scheme?.next_billing_time || null,
    // lastVerifiedAt evita que entitlements.js revalide 6 h después
    lastVerifiedAt: nowIso,
    updatedAt: updatedAtSentinel
  }, { merge: true });

  log("PayPal webhook procesado", {
    event_type: eventType,
    subscription_id: String(subscription.id),
    uid,
    plan: planId || null,
    status_prev: prevStatus,
    status_new: newStatus,
    paypal_status: subscription.status || null,
    next_payment_at: subscription.billing_cycles?.[0]?.pricing_scheme?.next_billing_time || null
  });

  return { processed: true, subscriptionId, uid, plan: planId, status: newStatus };
}

module.exports = {
  handlePayPalWebhook
};
