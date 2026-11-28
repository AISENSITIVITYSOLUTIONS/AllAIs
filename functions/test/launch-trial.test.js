// Pruebas de resolveTrialSchedule (billing.js) — la decisión de fecha de primer
// cobro y tipo de prueba para una nueva suscripción (Tarea #4b, trial-with-card).
//
// Es lógica pura: no toca Firestore ni Mercado Pago. Verifica que:
//   - la prueba de lanzamiento difiere el cobro al cierre de la promo (1-dic),
//   - solo aplica al plan Lanzamiento,
//   - se rechaza si la promo ya cerró,
//   - el flujo normal mantiene los 3 días de prueba.

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveTrialSchedule } = require("../trial-schedule");

// Fechas de referencia relativas al cierre de la promo: 2026-12-01T06:00:00Z.
const ANTES_DE_PROMO = new Date("2026-10-19T12:00:00Z"); // promo abierta
const DESPUES_DE_PROMO = new Date("2027-01-02T00:00:00Z"); // promo cerrada
const FASE_FUNDADOR = new Date("2026-12-05T18:00:00Z"); // Precio fundador abierto
const PROMO_END_ISO = "2026-12-01T06:00:00.000Z";

test("launch trial: difiere el primer cobro al cierre de la promo (1-dic)", () => {
  const r = resolveTrialSchedule({
    launchFreeTrial: true,
    planId: "lanzamiento",
    now: ANTES_DE_PROMO
  });
  assert.equal(r.error, undefined);
  assert.equal(r.trialType, "launch_free_trial");
  assert.equal(r.startDate, PROMO_END_ISO);
});

test("launch trial: rechaza cualquier plan que no sea Lanzamiento", () => {
  for (const planId of ["profesional_1", "profesional_2", "profesional_3"]) {
    const r = resolveTrialSchedule({ launchFreeTrial: true, planId, now: ANTES_DE_PROMO });
    assert.ok(r.error, `${planId} debería dar error`);
    assert.equal(r.error.status, 400);
    assert.match(r.error.message, /Lanzamiento/);
  }
});

test("launch trial: rechaza si la promoción ya cerró", () => {
  const r = resolveTrialSchedule({
    launchFreeTrial: true,
    planId: "lanzamiento",
    now: DESPUES_DE_PROMO
  });
  assert.ok(r.error);
  assert.equal(r.error.status, 409);
  assert.match(r.error.message, /cerró/);
});

test("Precio fundador: desde el 1-dic el plan de $99 usa la prueba estándar de 3 días", () => {
  const r = resolveTrialSchedule({ launchFreeTrial: true, planId: "lanzamiento", now: FASE_FUNDADOR, trialDays: 3 });
  assert.equal(r.error, undefined);
  assert.equal(r.trialType, "founder");
  assert.equal(r.startDate, "2026-12-08T18:00:00.000Z");
});

test("flujo normal: 3 días de prueba desde ahora, trialType standard", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const r = resolveTrialSchedule({
    launchFreeTrial: false,
    planId: "profesional_2",
    now,
    trialDays: 3
  });
  assert.equal(r.error, undefined);
  assert.equal(r.trialType, "standard");
  assert.equal(r.startDate, new Date("2026-10-22T12:00:00Z").toISOString());
});

test("flujo normal: respeta un BILLING_TRIAL_DAYS distinto", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const r = resolveTrialSchedule({
    launchFreeTrial: false,
    planId: "lanzamiento",
    now,
    trialDays: 7
  });
  assert.equal(r.startDate, new Date("2026-10-26T12:00:00Z").toISOString());
});

test("launch trial sin flag: un plan Lanzamiento normal usa los 3 días, no el 1-dic", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const r = resolveTrialSchedule({
    launchFreeTrial: false,
    planId: "lanzamiento",
    now,
    trialDays: 3
  });
  assert.equal(r.trialType, "standard");
  assert.notEqual(r.startDate, PROMO_END_ISO);
});
