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
async function consumeUsage({ db, holder, uid, entitlement, now = new Date() }) {
  const { day, monthlyRef, dailyRef } = usageRefs({ db, holder, uid, entitlement, now });

  // Sin límites aplicables (por ejemplo el código maestro) no se registra nada.
  if (!monthlyRef && !dailyRef) return { ok: true, quota: null, blockedBy: null, refs: [] };

  return db.runTransaction(async (transaction) => {
    // Firestore exige todas las lecturas antes de cualquier escritura.
    const monthlySnap = monthlyRef ? await transaction.get(monthlyRef) : null;
    const dailySnap = dailyRef ? await transaction.get(dailyRef) : null;

    const monthlyUsed = countOf(monthlySnap);
    const dailyUsed = countOf(dailySnap);

    const blockedBy = exceeded({
      monthly: entitlement.monthly,
      daily: entitlement.daily,
      monthlyUsed,
      dailyUsed
    });

    if (blockedBy) {
      return {
        ok: false,
        blockedBy,
        refs: [],
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
        count: monthlyUsed + 1,
        updatedAt: stamp
      }, { merge: true });
      refs.push(monthlyRef);
    }
    if (dailyRef) {
      transaction.set(dailyRef, {
        holder,
        email: holder && holder.startsWith("code:") ? null : holder,
        day,
        count: dailyUsed + 1,
        updatedAt: stamp
      }, { merge: true });
      refs.push(dailyRef);
    }

    return {
      ok: true,
      blockedBy: null,
      refs,
      quota: quotaView({
        monthly: entitlement.monthly,
        daily: entitlement.daily,
        monthlyUsed: monthlyUsed + 1,
        dailyUsed: dailyUsed + 1,
        cycle: entitlement.cycle,
        now
      })
    };
  });
}

// Devuelve el consumo cuando la consulta no llegó a entregarse.
async function refundUsage(refs, increment) {
  for (const ref of refs || []) {
    try {
      await ref.update({ count: increment(-1) });
    } catch (error) {
      console.warn("AllAIs quota refund failed", error?.message);
    }
  }
}

module.exports = {
  dailyDocId,
  cycleDocId,
  usageRefs,
  readUsage,
  consumeUsage,
  refundUsage
};
