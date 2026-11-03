// Registro de consumo y aplicación de cuotas.
//
// Un usuario con plan tiene un cupo por ciclo de facturación y, en el caso de
// Lanzamiento, además un tope diario. Ambos se verifican y se incrementan dentro
// de una sola transacción de Firestore: si dos peticiones llegan a la vez, una de
// las dos se reintenta sobre el valor ya escrito y nunca se rebasa el límite.
//
// Los documentos viven en la colección "usage":
//   <holder>_<YYYY-MM-DD>   consumo diario (formato previo, se conserva)
//   <uid>_c_<claveDeCiclo>  consumo del ciclo de facturación

const { dayKey, quotaView, exceeded } = require("./plans");

function dailyDocId(holder, day) {
  return `${holder}_${day}`;
}

function cycleDocId(uid, cycleKey) {
  return `${uid}_c_${cycleKey}`;
}

function countOf(snapshot) {
  return snapshot && snapshot.exists ? Number(snapshot.get("count") || 0) : 0;
}

// Referencias que aplican a este usuario. Un plan sin tope diario no toca el
// documento del día; el cupo gratuito no toca el del ciclo.
function usageRefs({ db, holder, uid, entitlement, now = new Date() }) {
  const day = dayKey(now);
  const usesMonthly = Number.isFinite(entitlement.monthly) && entitlement.monthly > 0 && entitlement.cycle;
  const usesDaily = Number.isFinite(entitlement.daily) && entitlement.daily > 0 && Boolean(holder);
  return {
    day,
    monthlyRef: usesMonthly ? db.collection("usage").doc(cycleDocId(uid, entitlement.cycle.key)) : null,
    dailyRef: usesDaily ? db.collection("usage").doc(dailyDocId(holder, day)) : null
  };
}

// Lectura sin consumir, para mostrar el estado de la cuota.
async function readUsage({ db, holder, uid, entitlement, now = new Date() }) {
  const { monthlyRef, dailyRef } = usageRefs({ db, holder, uid, entitlement, now });
  const [monthlySnap, dailySnap] = await Promise.all([
    monthlyRef ? monthlyRef.get() : null,
    dailyRef ? dailyRef.get() : null
  ]);
  return quotaView({
    monthly: entitlement.monthly,
    daily: entitlement.daily,
    monthlyUsed: countOf(monthlySnap),
    dailyUsed: countOf(dailySnap),
    cycle: entitlement.cycle,
    now
  });
}

/**
 * Consume una consulta si queda cupo.
 * Devuelve { ok, quota, blockedBy, refs } — refs sirve para devolver el consumo
 * si después falla el proveedor y la consulta no llegó a entregarse.
 */
// units: cuántas consultas consume esta operación. Una comparación multi-modelo
// (Tarea #9) consume una por proveedor, así que pasa units = n.º de modelos.
// El valor por defecto 1 mantiene el comportamiento del chat de un solo modelo.
async function consumeUsage({ db, holder, uid, entitlement, now = new Date(), units = 1 }) {
  const { day, monthlyRef, dailyRef } = usageRefs({ db, holder, uid, entitlement, now });
  const n = Math.max(1, Math.floor(units));

  // Sin límites aplicables (por ejemplo el código maestro) no se registra nada.
  if (!monthlyRef && !dailyRef) return { ok: true, quota: null, blockedBy: null, refs: [], units: n };

  return db.runTransaction(async (transaction) => {
    // Firestore exige todas las lecturas antes de cualquier escritura.
    const monthlySnap = monthlyRef ? await transaction.get(monthlyRef) : null;
    const dailySnap = dailyRef ? await transaction.get(dailyRef) : null;

    const monthlyUsed = countOf(monthlySnap);
    const dailyUsed = countOf(dailySnap);

    // ¿Caben `n` consultas más? Para n=1 equivale a exceeded() (used >= limit).
    const wouldExceed = (used, limit) =>
      Number.isFinite(limit) && limit > 0 && (used + n) > limit;
    let blockedBy = null;
    if (wouldExceed(monthlyUsed, entitlement.monthly)) blockedBy = "monthly";
    else if (wouldExceed(dailyUsed, entitlement.daily)) blockedBy = "daily";

    if (blockedBy) {
      return {
        ok: false,
        blockedBy,
        refs: [],
        units: n,
        quota: quotaView({
          monthly: entitlement.monthly,
          daily: entitlement.daily,
          monthlyUsed,
          dailyUsed,
          cycle: entitlement.cycle,
          now
        })
      };
    }

    const stamp = now.toISOString();
    const refs = [];
    if (monthlyRef) {
      transaction.set(monthlyRef, {
        uid,
        scope: "cycle",
        plan: entitlement.planId,
        cycleKey: entitlement.cycle.key,
        cycleStart: entitlement.cycle.startIso,
        cycleEnd: entitlement.cycle.endIso,
        count: monthlyUsed + n,
        updatedAt: stamp
      }, { merge: true });
      refs.push(monthlyRef);
    }
    if (dailyRef) {
      transaction.set(dailyRef, {
        holder,
        email: holder && holder.startsWith("code:") ? null : holder,
        day,
        count: dailyUsed + n,
        updatedAt: stamp
      }, { merge: true });
      refs.push(dailyRef);
    }

    return {
      ok: true,
      blockedBy: null,
      refs,
      units: n,
      quota: quotaView({
        monthly: entitlement.monthly,
        daily: entitlement.daily,
        monthlyUsed: monthlyUsed + n,
        dailyUsed: dailyUsed + n,
        cycle: entitlement.cycle,
        now
      })
    };
  });
}

// Devuelve el consumo cuando la consulta no llegó a entregarse. units permite
// devolver más de una (p. ej. los modelos que fallaron en una comparación).
async function refundUsage(refs, increment, units = 1) {
  const n = Math.max(1, Math.floor(units));
  for (const ref of refs || []) {
    try {
      await ref.update({ count: increment(-n) });
    } catch (error) {
      console.warn("AllAIs quota refund failed", error?.message);
    }
  }
}

// ---------- Cuota de media (imágenes y segundos de video) ----------
// Bolsas mensuales separadas del texto, por ciclo de facturación. kind: "image"
// (amount = número de imágenes) o "video" (amount = segundos). Devuelve el ref y
// el campo para poder reembolsar si la generación falla.
function mediaDocId(uid, cycleKey) {
  return `${uid}_${cycleKey}`;
}

async function consumeMedia({ db, uid, entitlement, kind, amount = 1, now = new Date() }) {
  const limit = kind === "video" ? Number(entitlement.videoSeconds) : Number(entitlement.images);
  const field = kind === "video" ? "videoSecondsUsed" : "imagesUsed";
  if (!uid || !entitlement.cycle) {
    return { ok: false, reason: "no_cycle", limit: limit || 0, used: 0, remaining: 0 };
  }
  if (!(Number.isFinite(limit) && limit > 0)) {
    return { ok: false, reason: "not_in_plan", limit: 0, used: 0, remaining: 0 };
  }
  const ref = db.collection("mediaUsage").doc(mediaDocId(uid, entitlement.cycle.key));
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const used = snap.exists ? Number(snap.get(field) || 0) : 0;
    if (used + amount > limit) {
      return { ok: false, reason: "exhausted", limit, used, remaining: Math.max(0, limit - used) };
    }
    transaction.set(ref, {
      uid,
      cycleKey: entitlement.cycle.key,
      [field]: used + amount,
      updatedAt: now.toISOString()
    }, { merge: true });
    return { ok: true, reason: null, limit, used: used + amount, remaining: limit - (used + amount), ref, field, amount };
  });
}

async function readMedia({ db, uid, entitlement }) {
  const images = { limit: Number(entitlement.images) || 0, used: 0 };
  const video = { limit: Number(entitlement.videoSeconds) || 0, used: 0 };
  if (uid && entitlement.cycle) {
    const snap = await db.collection("mediaUsage").doc(mediaDocId(uid, entitlement.cycle.key)).get();
    if (snap.exists) {
      images.used = Number(snap.get("imagesUsed") || 0);
      video.used = Number(snap.get("videoSecondsUsed") || 0);
    }
  }
  images.remaining = Math.max(0, images.limit - images.used);
  video.remaining = Math.max(0, video.limit - video.used);
  return { images, video };
}

module.exports = {
  dailyDocId,
  cycleDocId,
  usageRefs,
  readUsage,
  consumeUsage,
  refundUsage,
  consumeMedia,
  readMedia
};
