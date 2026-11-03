// Pruebas de la bolsa de media (imágenes y segundos de video) por plan.
// Verifica que consumeMedia descuenta de la bolsa correcta, bloquea al agotar o
// cuando el plan no incluye la prestación, y que readMedia refleja el uso.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { consumeMedia, readMedia } = require("../quota");
const { resolveEntitlement } = require("../entitlements");

const UID = "u1";
const ANCLA = "2026-03-15T06:00:00Z";

async function derechoDe(db, planId, now) {
  db.seed(`subscriptions/${UID}`, {
    uid: UID, plan: planId, status: "active", mock: true, trialEndsAt: ANCLA
  });
  return resolveEntitlement({ db, uid: UID, freeDaily: 10, now });
}

test("Esencial descuenta de la bolsa de imágenes (15)", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const derecho = await derechoDe(db, "profesional_1", now);

  const r = await consumeMedia({ db, uid: UID, entitlement: derecho, kind: "image", amount: 1, now });
  assert.equal(r.ok, true);
  assert.equal(r.limit, 15);
  assert.equal(r.remaining, 14);

  const estado = await readMedia({ db, uid: UID, entitlement: derecho });
  assert.equal(estado.images.used, 1);
  assert.equal(estado.images.remaining, 14);
});

test("video consume segundos y bloquea cuando no caben", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const derecho = await derechoDe(db, "profesional_1", now); // 30 s de video

  const ok = await consumeMedia({ db, uid: UID, entitlement: derecho, kind: "video", amount: 25, now });
  assert.equal(ok.ok, true);
  assert.equal(ok.remaining, 5);

  const no = await consumeMedia({ db, uid: UID, entitlement: derecho, kind: "video", amount: 10, now });
  assert.equal(no.ok, false);
  assert.equal(no.reason, "exhausted");
  assert.equal(no.remaining, 5, "no se descuenta si no cabe");
});

test("un plan sin video (Lanzamiento) rechaza con not_in_plan", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const derecho = await derechoDe(db, "lanzamiento", now); // video 0

  const r = await consumeMedia({ db, uid: UID, entitlement: derecho, kind: "video", amount: 5, now });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_in_plan");
});

test("usuario gratis (sin suscripción) no tiene media", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const derecho = resolveEntitlement({ db, uid: UID, freeDaily: 10, now });

  const img = await consumeMedia({ db, uid: UID, entitlement: derecho, kind: "image", amount: 1, now });
  assert.equal(img.ok, false);
  // Sin suscripción no hay ciclo ni bolsa: cualquiera de las dos razones bloquea.
  assert.ok(["no_cycle", "not_in_plan"].includes(img.reason), `razón de bloqueo: ${img.reason}`);
});
