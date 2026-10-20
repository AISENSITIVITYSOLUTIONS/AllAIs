// Traducción entre el vocabulario de PayPal y el nuestro.
//
// Lógica pura (sin red ni Firestore) para poder probarla sola, igual que
// plans.js y trial-schedule.js. El objetivo es que exista UN solo lugar donde
// se decida qué significa cada estado de PayPal, y que ese lugar esté cubierto
// por pruebas: un mapeo equivocado aquí activa o desactiva el acceso de un
// cliente que sí pagó.

// Estados de una suscripción de PayPal (Subscriptions API v1).
//
//   APPROVAL_PENDING  el comprador aún no aprobó en el checkout
//   APPROVED          aprobó, pero PayPal todavía no la activa
//   ACTIVE            viva y cobrando
//   SUSPENDED         pausada (p. ej. tras fallos de cobro)
//   CANCELLED         cancelada
//   EXPIRED           llegó a su fin programado
//
// Se mapean al mismo vocabulario que ya usa Mercado Pago en subscriptions/{uid}
// para que el resto del backend y el frontend no tengan que saber por qué
// pasarela entró el cliente.
const PAYPAL_STATUS_MAP = {
  APPROVAL_PENDING: "pending",
  APPROVED: "pending",
  ACTIVE: "active",
  SUSPENDED: "paused",
  CANCELLED: "cancelled",
  EXPIRED: "cancelled"
};

// Un estado desconocido NO se traduce a "active": ante la duda, no damos
// acceso. Si PayPal introduce un estado nuevo, preferimos que el cliente
// reclame a que cualquiera obtenga el producto gratis.
function mapSubscriptionStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  return PAYPAL_STATUS_MAP[key] || "unknown";
}

// Eventos de webhook que nos interesan. Los demás se ignoran en silencio:
// PayPal envía muchos tipos y no queremos que uno inesperado rompa el flujo.
const RELEVANT_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.CREATED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED"
]);

function isRelevantEvent(eventType) {
  return RELEVANT_EVENTS.has(String(eventType || "").trim().toUpperCase());
}

// De qué suscripción habla un evento. PayPal coloca el id en sitios distintos
// según el tipo: en los BILLING.SUBSCRIPTION.* es `resource.id`; en
// PAYMENT.SALE.COMPLETED el recurso es el cobro y la suscripción viaja en
// `billing_agreement_id`.
function subscriptionIdFromEvent(event) {
  const resource = event?.resource;
  if (!resource) return null;
  const id = resource.billing_agreement_id || resource.id;
  return id ? String(id) : null;
}

// Variable de entorno que guarda el id de plan de PayPal para un plan nuestro.
// Los ids (P-XXXX) no son secretos —viajan al navegador en el checkout—, así
// que viven en functions/.env y no en Secret Manager.
function planEnvName(planId) {
  const id = String(planId || "").trim();
  if (!/^[a-z0-9_]+$/i.test(id)) return null;
  return `PAYPAL_PLAN_${id.toUpperCase()}`;
}

function planIdFor(planId, env = process.env) {
  const name = planEnvName(planId);
  if (!name) return null;
  const value = String(env[name] || "").trim();
  return value || null;
}

// external_reference equivalente al de Mercado Pago: "uid|plan". PayPal lo
// acepta en custom_id y nos lo devuelve en los webhooks, así que podemos
// resolver a qué usuario pertenece un evento sin confiar en el navegador.
function buildCustomId(uid, planId) {
  return `${uid}|${planId}`;
}

function parseCustomId(customId) {
  const raw = String(customId || "");
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const uid = raw.slice(0, sep).trim();
  const plan = raw.slice(sep + 1).trim();
  if (!uid || !plan) return null;
  return { uid, plan };
}

module.exports = {
  PAYPAL_STATUS_MAP,
  RELEVANT_EVENTS,
  mapSubscriptionStatus,
  isRelevantEvent,
  subscriptionIdFromEvent,
  planEnvName,
  planIdFor,
  buildCustomId,
  parseCustomId
};
