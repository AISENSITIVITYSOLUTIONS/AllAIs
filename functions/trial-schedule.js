// Decisión de fecha de primer cobro y tipo de prueba para una nueva suscripción.
//
// Lógica pura (sin Firestore ni Mercado Pago) para poder probarla sola y para
// que backend y pruebas no puedan desalinearse — mismo patrón que plans.js.
//
//   - launchFreeTrial (Tarea #4b, trial-with-card): solo válido para el plan
//     Lanzamiento y solo mientras la promo siga abierta. El primer cobro se
//     difiere al cierre de la promo (1-dic) en vez de a los 3 días habituales.
//     Capturamos la tarjeta hoy pero no cobramos nada hasta esa fecha.
//   - flujo normal: `trialDays` días de prueba desde ahora.
//
// Devuelve un objeto `error` {status, message} en vez de lanzar, para que el
// llamador (billing.js) decida cómo mapearlo a un httpError.

const { isPromoOpen, isLaunchTrialOpen, launchTrialEndsAtIso } = require("./plans");

function resolveTrialSchedule({ launchFreeTrial, planId, now = new Date(), trialDays = 3 }) {
  if (launchFreeTrial) {
    if (planId !== "lanzamiento") {
      return { error: { status: 400, message: "La prueba de lanzamiento solo aplica al plan Lanzamiento." } };
    }
    if (!isPromoOpen(now)) {
      return { error: { status: 409, message: "La promoción de lanzamiento ya cerró." } };
    }
    // Noviembre: prueba gratis con cobro diferido al 1-dic (lo que se anunció).
    if (isLaunchTrialOpen(now)) {
      return { startDate: launchTrialEndsAtIso(), trialType: "launch_free_trial" };
    }
    // Desde el 1-dic (Precio fundador): mismo plan de $99 con la prueba estándar.
    return {
      startDate: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
      trialType: "founder"
    };
  }
  return {
    startDate: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
    trialType: "standard"
  };
}

module.exports = { resolveTrialSchedule };
