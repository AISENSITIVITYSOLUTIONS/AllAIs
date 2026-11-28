// Pruebas del uso gratuito: cortesía inicial, tope diario reducido para cuentas
// frecuentes, siembra con el historial y devolución cuando la consulta falla.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore, increment } = require("./fake-firestore");
const { applyFreeTier, limitsFromEnv } = require("../free-tier");
const { freeEntitlement } = require("../entitlements");
const { consumeUsage, refundUsage } = require("../quota");

const CORREO = "persona@example.com";
const UID = "u1";
const LIMITES = { courtesyTotal: 12, dailyAfter: 2 };
const sinHistorial = async () => 0;

async function derecho(db, { seed = sinHistorial, now = new Date("2026-12-02T18:00:00Z") } = {}) {
  return applyFreeTier({ db, entitlement: freeEntitlement(10, "no_subscription"), email: CORREO, limits: LIMITES, now, seed });
}

test("valores por defecto: 12 consultas de cortesía y después 2 al día", () => {
  assert.deepEqual(limitsFromEnv({}), { courtesyTotal: 12, dailyAfter: 2 });
  assert.deepEqual(limitsFromEnv({ FREE_COURTESY_TOTAL: "20", FREE_DAILY_AFTER_COURTESY: "3" }), { courtesyTotal: 20, dailyAfter: 3 });
  assert.deepEqual(limitsFromEnv({ FREE_COURTESY_TOTAL: "x", FREE_DAILY_AFTER_COURTESY: "0" }), { courtesyTotal: 12, dailyAfter: 2 });
});

test("una cuenta nueva conserva el tope diario habitual durante la cortesía", async () => {
  const db = new FakeFirestore();
  const d = await derecho(db);
  assert.equal(d.daily, 10);
  assert.deepEqual(d.courtesy, { total: 12, used: 0, remaining: 12, exhausted: false, dailyAfter: 2 });
});

test("agotada la cortesía, la cuenta frecuente queda en 2 consultas al día", async () => {
  const db = new FakeFirestore();
  const dia1 = new Date("2026-12-02T18:00:00Z");

  // Tres comparaciones de 4 modelos consumen las 12 de cortesía... si el tope diario lo permite.
  let d = await derecho(db, { now: dia1 });
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia1, units: 4 })).ok, true);
  d = await derecho(db, { now: dia1 });
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia1, units: 4 })).ok, true);
  assert.equal(db.count(`freeUsage/${CORREO}`), 8);

  const dia2 = new Date("2026-12-03T18:00:00Z");
  d = await derecho(db, { now: dia2 });
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia2, units: 4 })).ok, true);
  assert.equal(db.count(`freeUsage/${CORREO}`), 12);

  // Ya es frecuente: ese mismo día topa de inmediato y al siguiente tiene 2.
  d = await derecho(db, { now: dia2 });
  assert.equal(d.daily, 2);
  assert.equal(d.courtesy.exhausted, true);
  const bloqueada = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia2 });
  assert.equal(bloqueada.ok, false);
  assert.equal(bloqueada.blockedBy, "daily");

  const dia3 = new Date("2026-12-04T18:00:00Z");
  d = await derecho(db, { now: dia3 });
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia3 })).ok, true);
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia3 })).ok, true);
  const tercera = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia3 });
  assert.equal(tercera.ok, false);
  assert.equal(tercera.quota.limit, 2);
  // Una comparación de 4 modelos ya no cabe en el uso gratuito.
  const dia4 = new Date("2026-12-05T18:00:00Z");
  d = await derecho(db, { now: dia4 });
  assert.equal((await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now: dia4, units: 4 })).ok, false);
});

test("quien ya era frecuente antes del cambio no recibe una cortesía nueva", async () => {
  const db = new FakeFirestore();
  let siembras = 0;
  const seed = async () => { siembras += 1; return 26; };
  const d = await derecho(db, { seed });
  assert.equal(d.daily, 2);
  assert.equal(d.courtesy.remaining, 0);
  assert.equal(db.count(`freeUsage/${CORREO}`), 26);
  await derecho(db, { seed });
  assert.equal(siembras, 1, "el historial se suma una sola vez");
});

test("si el historial no se puede leer, la cuenta empieza en cero y no se bloquea", async () => {
  const db = new FakeFirestore();
  const d = await derecho(db, { seed: async () => { throw new Error("índice no disponible"); } });
  assert.equal(d.daily, 10);
  assert.equal(d.courtesy.used, 0);
});

test("una consulta fallida se devuelve también del total histórico", async () => {
  const db = new FakeFirestore();
  const now = new Date("2026-12-02T18:00:00Z");
  const d = await derecho(db, { now });
  const consumida = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: d, now, units: 4 });
  assert.equal(db.count(`freeUsage/${CORREO}`), 4);
  await refundUsage(consumida.refs, increment, 4);
  assert.equal(db.count(`freeUsage/${CORREO}`), 0);
});

test("planes de pago, administradores y accesos sin correo no se tocan", async () => {
  const db = new FakeFirestore();
  const pago = { source: "subscription", planId: "profesional_2", monthly: 600, daily: null };
  assert.equal(await applyFreeTier({ db, entitlement: pago, email: CORREO, limits: LIMITES }), pago);
  const anonimo = freeEntitlement(10, "anonymous");
  assert.equal(await applyFreeTier({ db, entitlement: anonimo, email: null, limits: LIMITES }), anonimo);
  assert.equal(db.docs.size, 0);
});
