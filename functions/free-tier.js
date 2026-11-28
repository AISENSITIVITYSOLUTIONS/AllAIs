// Uso gratuito: cortesía inicial y, después, un tope diario reducido.
//
// Una cuenta sin suscripción tiene FREE_COURTESY_TOTAL consultas de cortesía en
// total (con el tope diario habitual). Cuando las agota pasa a ser "frecuente":
// conserva acceso gratuito, pero con FREE_DAILY_AFTER_COURTESY consultas al día.
// Así quien ya probó el producto encuentra un límite cada día y la oferta de plan.
//
// El total histórico vive en freeUsage/<correo>.count. La primera vez se siembra
// con lo ya consumido (documentos diarios de "usage"), para que las cuentas que
// ya eran frecuentes antes de este cambio no reciban una cortesía nueva.

const COLLECTION = "freeUsage";

function limitsFromEnv(env = process.env) {
  const total = Math.floor(Number(env.FREE_COURTESY_TOTAL || 12));
  const after = Math.floor(Number(env.FREE_DAILY_AFTER_COURTESY || 2));
  return {
    courtesyTotal: Number.isFinite(total) && total >= 0 ? total : 12,
    dailyAfter: Number.isFinite(after) && after >= 1 ? after : 2
  };
}

function lifetimeRef(db, email) {
  return db.collection(COLLECTION).doc(String(email).toLowerCase());
}

// Suma lo consumido antes de que existiera el contador histórico.
async function seedFromHistory(db, email) {
  const snapshot = await db.collection("usage").where("email", "==", email).get();
  let total = 0;
  snapshot.forEach((doc) => { total += Number(doc.get("count") || 0); });
  return total;
}

async function readLifetime({ db, email, now = new Date(), seed = seedFromHistory }) {
  const ref = lifetimeRef(db, email);
  const snapshot = await ref.get();
  if (snapshot.exists) return { ref, count: Number(snapshot.get("count") || 0) };
  let count = 0;
  try {
    count = await seed(db, email);
  } catch (error) {
    // Sin historial legible se empieza en cero: nunca se bloquea por un fallo de lectura.
    console.warn("AllAIs free-tier seed failed", error?.message);
  }
  await ref.set({ email, count, seededAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
  return { ref, count };
}

/**
 * Ajusta el derecho gratuito de una cuenta con correo. Los planes de pago, los
 * administradores y los accesos sin correo se devuelven sin cambios.
 */
async function applyFreeTier({ db, entitlement, email, limits = limitsFromEnv(), now = new Date(), seed }) {
  if (!entitlement || entitlement.source !== "free" || !email) return entitlement;
  const { ref, count } = await readLifetime({ db, email, now, seed });
  const exhausted = count >= limits.courtesyTotal;
  return {
    ...entitlement,
    daily: exhausted ? limits.dailyAfter : entitlement.daily,
    lifetimeRef: ref,
    courtesy: {
      total: limits.courtesyTotal,
      used: Math.min(count, limits.courtesyTotal),
      remaining: Math.max(0, limits.courtesyTotal - count),
      exhausted,
      dailyAfter: limits.dailyAfter
    }
  };
}

module.exports = { COLLECTION, limitsFromEnv, lifetimeRef, readLifetime, applyFreeTier, seedFromHistory };
