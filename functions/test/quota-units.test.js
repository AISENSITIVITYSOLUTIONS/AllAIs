// Pruebas de consumo por unidades (units) para la comparación multi-modelo
// (Tarea #9): una consulta por modelo. Verifica que consumeUsage descuenta n
// de golpe, bloquea cuando no caben n, y que refundUsage devuelve n.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { consumeUsage, readUsage, refundUsage } = require("../quota");
const { resolveEntitlement } = require("../entitlements");

const UID = "u1";
const CORREO = "felipe@example.com";
const ANCLA = "2026-03-15T06:00:00Z";

async function derechoDe(planId, now) {
  const db = new FakeFirestore();
  db.seed(`subscriptions/${UID}`, {
    uid: UID, plan: planId, status: "active", mock: true, trialEndsAt: ANCLA
  });
  return resolveEntitlement({ db, uid: UID, freeDaily: 10, now });
}

test("units=4 descuenta cuatro consultas de golpe", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_2", now); // 600/mes
  const db = new FakeFirestore();

  const r = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.units, 4);
  assert.equal(r.quota.remaining, 596, "600 - 4");

  const after = await readUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(after.remaining, 596, "el consumo de 4 quedó guardado");
});

test("units default 1 mantiene el comportamiento previo", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_2", now);
  const db = new FakeFirestore();

  const r = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(r.quota.remaining, 599);
});

test("bloquea si no caben las n unidades, sin consumir nada", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  // Plan con tope diario de 10 (Lanzamiento): pedimos 4 cuando quedan 2.
  const derecho = await derechoDe("lanzamiento", now);
  const db = new FakeFirestore();

  // Gastar 8 de las 10 diarias (dos consumos de 4).
  await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 4 });
  await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 4 });
  const mid = await readUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(mid.daily.remaining, 2, "quedan 2 diarias");

  // Pedir 4 más debe bloquear por el tope diario y no escribir.
  const blocked = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 4 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedBy, "daily");

  const after = await readUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(after.daily.remaining, 2, "el bloqueo no consumió nada");
});

test("deja pasar exactamente n cuando caben justo", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", now); // 10/día
  const db = new FakeFirestore();

  await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 7 });
  const r = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 3 });
  assert.equal(r.ok, true, "7 + 3 = 10, cabe exacto");
  const after = await readUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(after.daily.remaining, 0);
});

test("refundUsage con units devuelve varias consultas", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_2", now);
  const db = new FakeFirestore();

  const consumed = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now, units: 4 });
  assert.equal(consumed.quota.remaining, 596);

  // Simular que 2 de los 4 modelos fallaron: devolver 2.
  const increment = (n) => ({ __increment: n });
  // FakeFirestore.update debe aplicar el incremento; usamos el mismo patrón que
  // el resto de los tests: el refund real usa FieldValue.increment, aquí
  // comprobamos que refundUsage llama update una vez por ref con -units.
  let captured = null;
  const fakeRefs = [{ update: async (patch) => { captured = patch; } }];
  await refundUsage(fakeRefs, increment, 2);
  assert.deepEqual(captured, { count: { __increment: -2 } });
});
