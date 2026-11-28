// Catálogo de planes y reglas de cuota de AllAIs.
//
// Este módulo es la única fuente de verdad sobre cupos, topes diarios y vigencia
// de la promoción. Es lógica pura, sin Firestore ni red, para poder probarla sola
// y para que backend y pruebas no puedan desalinearse.

// CDMX está en UTC-6 todo el año: México suprimió el horario de verano en 2022.
const QUOTA_TIME_ZONE = "America/Mexico_City";
const TZ_OFFSET_HOURS = 6;

// Fase 1 — Lanzamiento (noviembre de 2026): prueba gratis con tarjeta hasta el 30-nov;
// el primer cobro se difiere al 1-dic. Termina a la medianoche, hora de la Ciudad de México.
const LAUNCH_TRIAL_ENDS_AT = Date.UTC(2026, 11, 1, TZ_OFFSET_HOURS, 0, 0);

// Fase 2 — Precio fundador (desde el 1-dic-2026): el mismo plan de $99 queda abierto
// para los primeros FOUNDER_SEATS suscriptores o hasta el 31-dic-2026, lo que ocurra
// primero. PROMO_ENDS_AT es ese cierre definitivo por fecha.
const PROMO_ENDS_AT = Date.UTC(2027, 0, 1, TZ_OFFSET_HOURS, 0, 0);
const FOUNDER_SEATS = Math.max(1, Math.floor(Number(process.env.FOUNDER_SEATS || 100)));

// monthly: consultas por ciclo de facturación. daily: tope adicional por día (null si no tiene).
const PLANS = {
  lanzamiento: {
    id: "lanzamiento",
    name: "Lanzamiento",
    label: "AllAIs · Plan Lanzamiento",
    amountEnv: "MP_PRICE_LANZAMIENTO_MXN",
    monthly: 300,
    daily: 10,
    images: 10,
    videoSeconds: 0,
    promo: true
  },
  profesional_1: {
    id: "profesional_1",
    name: "Esencial",
    label: "AllAIs · Plan Esencial",
    amountEnv: "MP_PRICE_PROFESIONAL_1_MXN",
    monthly: 300,
    daily: null,
    images: 15,
    videoSeconds: 30,
    promo: false
  },
  profesional_2: {
    id: "profesional_2",
    name: "Profesional",
    label: "AllAIs · Plan Profesional",
    amountEnv: "MP_PRICE_PROFESIONAL_2_MXN",
    monthly: 600,
    daily: null,
    images: 40,
    videoSeconds: 60,
    promo: false
  },
  profesional_3: {
    id: "profesional_3",
    name: "Avanzado",
    label: "AllAIs · Plan Avanzado",
    amountEnv: "MP_PRICE_PROFESIONAL_3_MXN",
    monthly: 1000,
    daily: null,
    images: 80,
    videoSeconds: 90,
    promo: false
  }
};

function getPlan(id) {
  return PLANS[String(id || "")] || null;
}

function planIds() {
  return Object.keys(PLANS);
}

// El precio vive en functions/.env: el catálogo no inventa montos.
// Si falta el monto, el plan no se puede contratar y no se cobra nada.
function planAmount(plan, env = process.env) {
  if (!plan) return 0;
  return Number(env[plan.amountEnv] || 0);
}

// ---------- Vigencia de la promoción ----------

function isPromoOpen(now = new Date()) {
  return now.getTime() < PROMO_ENDS_AT;
}

function promoEndsAtIso() {
  return new Date(PROMO_ENDS_AT).toISOString();
}

// ¿Sigue vigente la prueba gratis de lanzamiento (cobro diferido al 1-dic)?
function isLaunchTrialOpen(now = new Date()) {
  return now.getTime() < LAUNCH_TRIAL_ENDS_AT;
}

function launchTrialEndsAtIso() {
  return new Date(LAUNCH_TRIAL_ENDS_AT).toISOString();
}

// Lugares de Precio fundador. `taken` es el número de suscripciones activas al plan
// promocional; lo cuenta el llamador (billing.js) porque este módulo no toca Firestore.
function founderStatus(taken = 0, now = new Date(), seats = FOUNDER_SEATS) {
  const used = Math.max(0, Math.floor(Number(taken) || 0));
  const left = Math.max(0, seats - used);
  return {
    seats,
    taken: Math.min(used, seats),
    left,
    open: isPromoOpen(now) && left > 0,
    founderPhase: !isLaunchTrialOpen(now),
    endsAt: promoEndsAtIso()
  };
}

// Un plan promocional deja de poder contratarse cuando la promoción cierra.
// Los planes ya contratados no se tocan: se respeta el precio al que se contrataron.
// founderTaken (opcional): suscripciones activas al plan promocional. Si se pasa y ya
// no quedan lugares, el plan tampoco se puede contratar aunque la fecha siga abierta.
function canSubscribeTo(planId, now = new Date(), { founderTaken = null } = {}) {
  const plan = getPlan(planId);
  if (!plan) return { ok: false, reason: "invalid" };
  if (plan.promo && !isPromoOpen(now)) return { ok: false, reason: "promo_closed" };
  if (plan.promo && founderTaken !== null && !founderStatus(founderTaken, now).open) {
    return { ok: false, reason: "founder_full" };
  }
  return { ok: true, plan };
}

// ---------- Fechas ----------

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// Medianoche siguiente en la Ciudad de México.
function nextDailyResetIso(date = new Date()) {
  const [year, month, day] = dayKey(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, TZ_OFFSET_HOURS, 0, 0)).toISOString();
}

// Suma meses conservando el día, recortando cuando el mes destino es más corto:
// un alta el 31 de enero cae el 28 de febrero, no el 3 de marzo.
function addMonthsClamped(year, monthIndex, day, months) {
  const target = new Date(Date.UTC(year, monthIndex + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return Date.UTC(ty, tm, Math.min(day, lastDay), TZ_OFFSET_HOURS, 0, 0);
}

// Ciclo de facturación anclado al día de alta de la suscripción.
// Antes del primer cobro (periodo de prueba) devuelve el ciclo previo, para que
// la prueba tenga su propia ventana de cuota en lugar de consumir la del primer mes.
function cycleFor(anchorIso, now = new Date()) {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;

  const [ay, am, ad] = dayKey(anchor).split("-").map(Number);
  const at = (months) => addMonthsClamped(ay, am - 1, ad, months);

  const nowMs = now.getTime();
  const [ny, nm] = dayKey(now).split("-").map(Number);
  let k = (ny - ay) * 12 + (nm - am);

  // Ajuste acotado: el estimado por meses nunca se desvía más de un paso.
  for (let guard = 0; guard < 480 && at(k) > nowMs; guard += 1) k -= 1;
  for (let guard = 0; guard < 480 && at(k + 1) <= nowMs; guard += 1) k += 1;

  const startMs = at(k);
  const endMs = at(k + 1);
  return {
    index: k,
    key: dayKey(new Date(startMs)),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString()
  };
}

// ---------- Decisión de cuota ----------

// Devuelve el límite que manda: el más cercano a agotarse.
// El frontend lee limit/remaining/resetAt, así que esos campos describen ese límite.
function quotaView({ monthly = null, daily = null, monthlyUsed = 0, dailyUsed = 0, cycle = null, now = new Date() }) {
  const parts = [];
  if (Number.isFinite(monthly) && monthly > 0) {
    parts.push({
      scope: "monthly",
      limit: monthly,
      used: monthlyUsed,
      remaining: Math.max(0, monthly - monthlyUsed),
      resetAt: cycle ? cycle.endIso : null
    });
  }
  if (Number.isFinite(daily) && daily > 0) {
    parts.push({
      scope: "daily",
      limit: daily,
      used: dailyUsed,
      remaining: Math.max(0, daily - dailyUsed),
      resetAt: nextDailyResetIso(now)
    });
  }
  if (!parts.length) return null;

  const binding = parts.reduce((a, b) => (b.remaining < a.remaining ? b : a));
  const view = {
    limit: binding.limit,
    remaining: binding.remaining,
    resetAt: binding.resetAt,
    scope: binding.scope
  };
  for (const part of parts) view[part.scope] = part;
  return view;
}

// ¿Se puede consumir una consulta más? Devuelve cuál límite lo impide.
function exceeded({ monthly = null, daily = null, monthlyUsed = 0, dailyUsed = 0 }) {
  if (Number.isFinite(monthly) && monthly > 0 && monthlyUsed >= monthly) return "monthly";
  if (Number.isFinite(daily) && daily > 0 && dailyUsed >= daily) return "daily";
  return null;
}

module.exports = {
  PLANS,
  QUOTA_TIME_ZONE,
  TZ_OFFSET_HOURS,
  PROMO_ENDS_AT,
  LAUNCH_TRIAL_ENDS_AT,
  FOUNDER_SEATS,
  isLaunchTrialOpen,
  launchTrialEndsAtIso,
  founderStatus,
  getPlan,
  planIds,
  planAmount,
  isPromoOpen,
  promoEndsAtIso,
  canSubscribeTo,
  dayKey,
  nextDailyResetIso,
  addMonthsClamped,
  cycleFor,
  quotaView,
  exceeded
};
