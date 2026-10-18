// Pruebas de la identificación del plan activo: qué plan tiene cada cuenta, qué
// pasa cuando una suscripción vence o se cancela, y qué se consulta a Mercado Pago.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { resolveEntitlement, REVALIDATE_AFTER_MS } = require("../entitlements");

const FREE_DAILY = 10;
const AHORA = new Date("2026-10-17T18:00:00Z");

function conSuscripcion(data) {
  const db = new FakeFirestore();
  db.seed("subscriptions/u1", data);
  return db;
}

const resolver = (db, extra = {}) =>
  resolveEntitlement({ db, uid: "u1", freeDaily: FREE_DAILY, now: AHORA, ...extra });

test("sin identidad no hay plan: cupo gratuito", async () => {
  const db = new FakeFirestore();
  const derecho = await resolveEntitlement({ db, uid: null, freeDaily: FREE_DAILY, now: AHORA });
  assert.equal(derecho.source, "free");
  assert.equal(derecho.reason, "anonymous");
  assert.equal(derecho.daily, FREE_DAILY);
  assert.equal(derecho.monthly, null);
});

test("una cuenta sin suscripción usa el cupo gratuito", async () => {
  const derecho = await resolver(new FakeFirestore());
  assert.equal(derecho.source, "free");
  assert.equal(derecho.reason, "no_subscription");
  assert.equal(derecho.daily, FREE_DAILY);
});

test("cada uno de los cuatro planes activos entrega su propia cuota", async () => {
  const esperado = [
    ["lanzamiento",   "Lanzamiento", 300,  10],
    ["profesional_1", "Esencial",    300,  null],
    ["profesional_2", "Profesional", 600,  null],
    ["profesional_3", "Avanzado",    1000, null]
  ];

  for (const [planId, nombre, mensual, diario] of esperado) {
    const db = conSuscripcion({
      uid: "u1", plan: planId, status: "active", mock: true,
      trialEndsAt: "2026-09-15T06:00:00Z"
    });
    const derecho = await resolver(db);
    assert.equal(derecho.source, "subscription", `${planId} debe reconocerse como suscripción`);
    assert.equal(derecho.planId, planId);
    assert.equal(derecho.planName, nombre);
    assert.equal(derecho.monthly, mensual, `cuota mensual de ${planId}`);
    assert.equal(derecho.daily, diario, `tope diario de ${planId}`);
    assert.ok(derecho.cycle, `${planId} necesita un ciclo de facturación`);
  }
});

test("un plan que ya no existe en la tabla no concede cuota", async () => {
  const db = conSuscripcion({ uid: "u1", plan: "plan_viejo", status: "active", mock: true });
  const derecho = await resolver(db);
  assert.equal(derecho.source, "free");
  assert.equal(derecho.reason, "unknown_plan");
});

test("solo el estado activo da derecho al plan", async () => {
  // "pending" es una tarjeta sin confirmar: no se regala cupo de pago.
  for (const status of ["pending", "paused", "cancelled", "unknown", "none"]) {
    const db = conSuscripcion({ uid: "u1", plan: "profesional_2", status, mock: true });
    const derecho = await resolver(db);
    assert.equal(derecho.source, "free", `${status} no debe conceder plan`);
    assert.equal(derecho.reason, `status_${status}`);
    assert.equal(derecho.daily, FREE_DAILY);
    assert.equal(derecho.monthly, null);
  }
});

test("una suscripción cancelada en Mercado Pago deja de dar cuota aunque Firestore diga activa", async () => {
  const db = conSuscripcion({
    uid: "u1", plan: "profesional_3", status: "active",
    preapprovalId: "pre-123",
    lastVerifiedAt: "2026-10-01T00:00:00Z"   // viejo: toca revalidar
  });

  let consultado = null;
  const derecho = await resolver(db, {
    verifyPreapproval: async (id) => {
      consultado = id;
      return { id, status: "cancelled" };
    }
  });

  assert.equal(consultado, "pre-123", "debe consultarse la suscripción en Mercado Pago");
  assert.equal(derecho.source, "free", "cancelada en Mercado Pago = sin plan");
  assert.equal(derecho.reason, "status_cancelled");
  // Y el estado corregido queda guardado, para no volver a preguntar en cada consulta.
  assert.equal(db.docs.get("subscriptions/u1").data.status, "cancelled");
  assert.equal(db.docs.get("subscriptions/u1").data.lastVerifiedAt, AHORA.toISOString());
});

test("una suscripción vigente en Mercado Pago se confirma y conserva su plan", async () => {
  const db = conSuscripcion({
    uid: "u1", plan: "profesional_2", status: "active",
    preapprovalId: "pre-ok", lastVerifiedAt: "2026-10-01T00:00:00Z",
    trialEndsAt: "2026-09-20T06:00:00Z"
  });

  const derecho = await resolver(db, {
    verifyPreapproval: async (id) => ({ id, status: "authorized" })
  });

  assert.equal(derecho.source, "subscription");
  assert.equal(derecho.planId, "profesional_2");
  assert.equal(derecho.monthly, 600);
  assert.equal(db.docs.get("subscriptions/u1").data.status, "active");
});

test("no se vuelve a preguntar a Mercado Pago si la validación es reciente", async () => {
  const db = conSuscripcion({
    uid: "u1", plan: "profesional_1", status: "active",
    preapprovalId: "pre-fresh",
    lastVerifiedAt: new Date(AHORA.getTime() - REVALIDATE_AFTER_MS / 2).toISOString(),
    trialEndsAt: "2026-09-20T06:00:00Z"
  });

  let llamadas = 0;
  const derecho = await resolver(db, {
    verifyPreapproval: async () => { llamadas += 1; return { status: "authorized" }; }
  });

  assert.equal(llamadas, 0, "una validación reciente no se repite");
  assert.equal(derecho.planId, "profesional_1");
});

test("una suscripción de prueba interna no consulta a Mercado Pago", async () => {
  const db = conSuscripcion({
    uid: "u1", plan: "lanzamiento", status: "active",
    preapprovalId: "mock", mock: true, trialEndsAt: "2026-09-20T06:00:00Z"
  });

  let llamadas = 0;
  const derecho = await resolver(db, {
    verifyPreapproval: async () => { llamadas += 1; return { status: "cancelled" }; }
  });

  assert.equal(llamadas, 0);
  assert.equal(derecho.planId, "lanzamiento");
});

test("si Mercado Pago no responde, quien ya pagó conserva su plan", async () => {
  const db = conSuscripcion({
    uid: "u1", plan: "profesional_3", status: "active",
    preapprovalId: "pre-caido", lastVerifiedAt: "2026-10-01T00:00:00Z",
    trialEndsAt: "2026-09-20T06:00:00Z"
  });

  const derecho = await resolver(db, {
    verifyPreapproval: async () => { throw new Error("502 Bad Gateway"); }
  });

  assert.equal(derecho.source, "subscription", "una caída de Mercado Pago no deja sin servicio");
  assert.equal(derecho.planId, "profesional_3");
  assert.equal(derecho.monthly, 1000);
  // Y no se marca como validado, para reintentar en la siguiente consulta.
  assert.notEqual(db.docs.get("subscriptions/u1").data.lastVerifiedAt, AHORA.toISOString());
});

test("el plan sale de Firestore, no de lo que diga la petición", async () => {
  // Esta es la garantía central: aunque el navegador mande otro plan, el derecho
  // de uso se resuelve solo con el uid y lo que hay guardado en el servidor.
  const db = conSuscripcion({
    uid: "u1", plan: "lanzamiento", status: "active", mock: true,
    trialEndsAt: "2026-09-20T06:00:00Z"
  });

  const derecho = await resolveEntitlement({
    db, uid: "u1", freeDaily: FREE_DAILY, now: AHORA,
    // Campos intrusos: resolveEntitlement no acepta un plan por parámetro.
    plan: "profesional_3", monthly: 999999
  });

  assert.equal(derecho.planId, "lanzamiento");
  assert.equal(derecho.monthly, 300);
  assert.equal(derecho.daily, 10);
});

test("el ciclo se ancla en la fecha de contratación y avanza mes a mes", async () => {
  const base = {
    uid: "u1", plan: "profesional_2", status: "active", mock: true,
    trialEndsAt: "2026-03-15T06:00:00Z"
  };

  const primero = await resolveEntitlement({
    db: conSuscripcion(base), uid: "u1", freeDaily: FREE_DAILY, now: new Date("2026-03-20T00:00:00Z")
  });
  const segundo = await resolveEntitlement({
    db: conSuscripcion(base), uid: "u1", freeDaily: FREE_DAILY, now: new Date("2026-04-20T00:00:00Z")
  });

  assert.equal(primero.cycle.startIso, "2026-03-15T06:00:00.000Z");
  assert.equal(segundo.cycle.startIso, "2026-04-15T06:00:00.000Z");
  assert.notEqual(primero.cycle.key, segundo.cycle.key, "el cambio de ciclo reinicia el contador");
});
