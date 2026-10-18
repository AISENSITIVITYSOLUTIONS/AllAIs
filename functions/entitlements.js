// Qué plan tiene derecho un usuario, resuelto siempre en el servidor.
//
// Regla central: el plan se lee de Firestore por uid. Nunca se acepta el plan que
// declare el navegador, porque cualquiera puede alterar una petición.
//
// Firestore solo lo escriben nuestras funciones (el webhook, que a su vez consulta
// a Mercado Pago antes de tocar nada). Aun así se revalida contra Mercado Pago
// cuando el registro lleva horas sin confirmarse, para que una notificación perdida
// no deje activo un plan que ya se canceló o cuyo cobro falló.

const { getPlan, cycleFor } = require("./plans");

const REVALIDATE_AFTER_MS = 6 * 60 * 60 * 1000;

// Solo "active" da derecho al plan. "pending" significa que la tarjeta aún no se
// confirmó, así que no se concede cupo de pago antes de tener el cobro asegurado.
const GRANTS_PLAN = new Set(["active"]);

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function isMock(data) {
  return data.mock === true || data.preapprovalId === "mock";
}

function mapStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized": return "active";
    case "pending": return "pending";
    case "paused": return "paused";
    case "cancelled": return "cancelled";
    default: return "unknown";
  }
}

function freeEntitlement(freeDaily, reason) {
  return {
    source: "free",
    reason: reason || null,
    planId: null,
    planName: null,
    status: "none",
    monthly: null,
    daily: freeDaily,
    cycle: null
  };
}

function isStale(lastVerifiedAt, now, maxAgeMs) {
  const iso = toIso(lastVerifiedAt);
  if (!iso) return true;
  return now.getTime() - new Date(iso).getTime() > maxAgeMs;
}

/**
 * Resuelve el derecho de uso del usuario.
 *
 * @param {object}   options
 * @param {object}   options.db               Firestore.
 * @param {string}   options.uid              Identidad verificada por Firebase Auth.
 * @param {number}   options.freeDaily        Cupo diario de quien no tiene suscripción.
 * @param {Function} [options.verifyPreapproval]  Consulta a Mercado Pago, inyectada para poder probarla.
 * @param {Date}     [options.now]
 */
async function resolveEntitlement({
  db,
  uid,
  freeDaily,
  verifyPreapproval = null,
  now = new Date(),
  revalidateAfterMs = REVALIDATE_AFTER_MS
}) {
  if (!uid) return freeEntitlement(freeDaily, "anonymous");

  const ref = db.collection("subscriptions").doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) return freeEntitlement(freeDaily, "no_subscription");

  const data = snapshot.data() || {};
  let status = String(data.status || "unknown");

  // Revalidación contra Mercado Pago cuando el registro está viejo.
  // Si Mercado Pago no responde, se conserva el estado conocido: una caída suya
  // no debe dejar sin servicio a quien ya pagó.
  if (GRANTS_PLAN.has(status) && !isMock(data) && verifyPreapproval && data.preapprovalId
      && isStale(data.lastVerifiedAt, now, revalidateAfterMs)) {
    try {
      const preapproval = await verifyPreapproval(String(data.preapprovalId));
      const fresh = mapStatus(preapproval?.status);
      status = fresh;
      await ref.set({
        status: fresh,
        mpStatus: preapproval?.status || null,
        lastVerifiedAt: now.toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("AllAIs entitlement revalidation failed", { uid, message: error?.message });
    }
  }

  if (!GRANTS_PLAN.has(status)) return freeEntitlement(freeDaily, `status_${status}`);

  const plan = getPlan(data.plan);
  if (!plan) return freeEntitlement(freeDaily, "unknown_plan");

  // El ciclo se ancla a la fecha de alta del cobro. Si falta, se usa la última
  // actualización: es preferible una ventana aproximada a quedarse sin cuota.
  const anchor = toIso(data.trialEndsAt) || toIso(data.cycleAnchorAt) || toIso(data.updatedAt);
  const cycle = anchor ? cycleFor(anchor, now) : null;

  return {
    source: "subscription",
    reason: null,
    planId: plan.id,
    planName: plan.name,
    status,
    monthly: plan.monthly,
    daily: plan.daily,
    cycle
  };
}

module.exports = {
  REVALIDATE_AFTER_MS,
  GRANTS_PLAN,
  resolveEntitlement,
  freeEntitlement,
  mapStatus,
  isMock,
  toIso
};
