// Lógica de recepción del webhook de Mercado Pago.
//
// Separada de billing.js para poder probarla sin levantar firebase-admin ni
// hablar con la API real de Mercado Pago. Las dependencias (Firestore,
// consulta a Mercado Pago, reloj, logging y el sentinel de serverTimestamp)
// se inyectan desde fuera; billing.js provee las instancias reales.

// Mapa de estados de Mercado Pago a estados internos de AllAIs. Idéntico al
// que usa billing.js; se duplica aquí para que este módulo sea autónomo y la
// prueba no dependa del admin SDK que billing.js inicializa.
function internalStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized": return "active";
    case "pending": return "pending";
    case "paused": return "paused";
    case "cancelled": return "cancelled";
    default: return "unknown";
  }
}

/**
 * Procesa una notificación de Mercado Pago.
 *
 * Se soportan dos tipos de evento:
 *
 *   - subscription_preapproval: la suscripción cambió de estado (alta, cobro
 *     autorizado, pausa, cancelación). El id es el del preapproval.
 *
 *   - subscription_authorized_payment: Mercado Pago cobró un pago mensual.
 *     El id es el del pago; se usa para resolver el preapproval_id y luego
 *     refrescar el estado del preapproval (incluido next_payment_date).
 *
 * Para cualquier otro tipo se responde ignorado para que Mercado Pago no
 * reintente.
 *
 * @param {object} request                       — req de Express (body + query)
 * @param {object} deps
 * @param {object} deps.dbInstance               — Firestore (real o fake)
 * @param {Function} deps.verifyPreapproval      — (id) => preapproval remoto
 * @param {Function} deps.resolvePaymentPreapproval — (paymentId) => preapprovalId | null
 * @param {Function} [deps.now]                  — reloj inyectable
 * @param {*} [deps.updatedAtSentinel]           — valor para updatedAt (FieldValue.serverTimestamp() en prod)
 * @param {Function} [deps.log]                  — logger inyectable
 */
async function handleWebhook(request, {
  dbInstance,
  verifyPreapproval,
  resolvePaymentPreapproval,
  now = () => new Date(),
  updatedAtSentinel = null,
  log = (...args) => console.log(...args)
}) {
  const type = request.body?.type || request.query?.type || request.query?.topic || "";
  const id = request.body?.data?.id || request.query?.["data.id"] || request.query?.id || "";
  if (!id) return { ignored: true, reason: "sin_id" };

  let preapprovalId = null;
  if (type === "subscription_preapproval") {
    preapprovalId = String(id);
  } else if (type === "subscription_authorized_payment") {
    preapprovalId = await resolvePaymentPreapproval(id);
    if (!preapprovalId) return { ignored: true, reason: "pago_sin_preapproval" };
  } else {
    return { ignored: true, reason: `tipo_no_manejado:${type}` };
  }

  const preapproval = await verifyPreapproval(preapprovalId);
  const [uid = "", planId = ""] = String(preapproval.external_reference || "").split("|");
  if (!uid) return { ignored: true, reason: "sin_external_reference" };

  const ref = dbInstance.collection("subscriptions").doc(uid);
  const previous = await ref.get();
  const prevStatus = previous.exists ? previous.get("status") : "none";
  const newStatus = internalStatus(preapproval.status);
  const nowIso = now().toISOString();

  await ref.set({
    uid,
    payerEmail: String(preapproval.payer_email || "").toLowerCase(),
    plan: planId || null,
    preapprovalId: String(preapproval.id),
    status: newStatus,
    mpStatus: preapproval.status || "unknown",
    nextPaymentAt: preapproval.next_payment_date || null,
    // lastVerifiedAt evita que entitlements.js revalide 6 h después contra la
    // API de Mercado Pago cuando el webhook ya refrescó el registro.
    lastVerifiedAt: nowIso,
    updatedAt: updatedAtSentinel
  }, { merge: true });

  log("AllAIs webhook procesado", {
    type,
    event_id: String(id),
    preapproval_id: String(preapproval.id),
    uid,
    plan: planId || null,
    status_prev: prevStatus,
    status_new: newStatus,
    mp_status: preapproval.status || null,
    next_payment_at: preapproval.next_payment_date || null
  });

  return { ok: true, status: newStatus, uid };
}

module.exports = { handleWebhook, internalStatus };
