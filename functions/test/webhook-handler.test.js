// Pruebas del handler del webhook de Mercado Pago (webhook-handler.js).
// Verifica el enrutamiento por tipo de evento, la consulta a MP para no confiar
// en el payload, el guardado en Firestore (incluido lastVerifiedAt) y la
// resolución de preapproval_id cuando llega un evento de pago autorizado.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { handleWebhook, internalStatus } = require("../webhook-handler");

const AHORA = new Date("2026-10-18T22:00:00Z");

// Request fake: body + query al estilo Express.
function req({ body = {}, query = {} } = {}) {
  return { body, query };
}

// Dependencies factory: por defecto rechaza llamadas no esperadas, cada test
// provee solo lo que necesita.
function deps(overrides = {}) {
  const db = overrides.db || new FakeFirestore();
  const logs = [];
  return {
    dbInstance: db,
    verifyPreapproval: overrides.verifyPreapproval || (() => {
      throw new Error("verifyPreapproval no debería llamarse en este caso");
    }),
    resolvePaymentPreapproval: overrides.resolvePaymentPreapproval || (() => {
      throw new Error("resolvePaymentPreapproval no debería llamarse en este caso");
    }),
    now: () => AHORA,
    updatedAtSentinel: "__SENTINEL__",
    log: (msg, info) => logs.push({ msg, info }),
    _db: db,
    _logs: logs
  };
}

test("sin id en body ni query, el evento se ignora", async () => {
  const d = deps();
  const result = await handleWebhook(req({ body: { type: "subscription_preapproval" } }), d);
  assert.deepEqual(result, { ignored: true, reason: "sin_id" });
  assert.equal(d._db.docs.size, 0);
});

test("tipo no manejado se ignora sin tocar MP ni Firestore", async () => {
  const d = deps();
  const result = await handleWebhook(req({ body: { type: "payment", data: { id: "p-999" } } }), d);
  assert.equal(result.ignored, true);
  assert.match(result.reason, /tipo_no_manejado/);
  assert.equal(d._db.docs.size, 0);
});

test("subscription_preapproval: consulta MP y guarda el estado", async () => {
  const d = deps({
    verifyPreapproval: async (id) => {
      assert.equal(id, "pre-123");
      return {
        id: "pre-123",
        status: "authorized",
        external_reference: "uid-abc|profesional_2",
        payer_email: "Felipe@Example.com",
        next_payment_date: "2026-11-18T00:00:00Z"
      };
    }
  });
  const result = await handleWebhook(req({
    body: { type: "subscription_preapproval", data: { id: "pre-123" } }
  }), d);
  assert.deepEqual(result, { ok: true, status: "active", uid: "uid-abc" });

  const saved = d._db.docs.get("subscriptions/uid-abc").data;
  assert.equal(saved.uid, "uid-abc");
  assert.equal(saved.plan, "profesional_2");
  assert.equal(saved.preapprovalId, "pre-123");
  assert.equal(saved.status, "active");
  assert.equal(saved.mpStatus, "authorized");
  assert.equal(saved.payerEmail, "felipe@example.com"); // lower-case
  assert.equal(saved.nextPaymentAt, "2026-11-18T00:00:00Z");
  assert.equal(saved.lastVerifiedAt, AHORA.toISOString()); // actualizado
  assert.equal(saved.updatedAt, "__SENTINEL__");
});

test("subscription_preapproval sin external_reference se ignora", async () => {
  const d = deps({
    verifyPreapproval: async () => ({ id: "pre-xx", status: "authorized", external_reference: "" })
  });
  const result = await handleWebhook(req({
    body: { type: "subscription_preapproval", data: { id: "pre-xx" } }
  }), d);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "sin_external_reference");
  assert.equal(d._db.docs.size, 0);
});

test("subscription_authorized_payment: resuelve preapproval y refresca el estado", async () => {
  const d = deps({
    resolvePaymentPreapproval: async (paymentId) => {
      assert.equal(paymentId, "pago-789");
      return "pre-456";
    },
    verifyPreapproval: async (id) => {
      assert.equal(id, "pre-456");
      return {
        id: "pre-456",
        status: "authorized",
        external_reference: "uid-xyz|lanzamiento",
        payer_email: "nuevo@test.com",
        next_payment_date: "2026-11-18T00:00:00Z"
      };
    }
  });
  const result = await handleWebhook(req({
    body: { type: "subscription_authorized_payment", data: { id: "pago-789" } }
  }), d);
  assert.equal(result.ok, true);
  assert.equal(result.status, "active");

  const saved = d._db.docs.get("subscriptions/uid-xyz").data;
  assert.equal(saved.plan, "lanzamiento");
  assert.equal(saved.preapprovalId, "pre-456");
  assert.equal(saved.nextPaymentAt, "2026-11-18T00:00:00Z"); // ← actualización mensual
});

test("subscription_authorized_payment sin preapproval_id resuelto se ignora", async () => {
  const d = deps({
    resolvePaymentPreapproval: async () => null
  });
  const result = await handleWebhook(req({
    body: { type: "subscription_authorized_payment", data: { id: "pago-sin" } }
  }), d);
  assert.deepEqual(result, { ignored: true, reason: "pago_sin_preapproval" });
  assert.equal(d._db.docs.size, 0);
});

test("transición de estado: pending → active (previo registro existente)", async () => {
  const db = new FakeFirestore();
  db.seed("subscriptions/uid-abc", { status: "pending", plan: "lanzamiento", preapprovalId: "pre-123" });
  const d = deps({
    db,
    verifyPreapproval: async () => ({
      id: "pre-123",
      status: "authorized",
      external_reference: "uid-abc|lanzamiento"
    })
  });
  const result = await handleWebhook(req({
    body: { type: "subscription_preapproval", data: { id: "pre-123" } }
  }), d);
  assert.equal(result.status, "active");
  assert.equal(d._db.docs.get("subscriptions/uid-abc").data.status, "active");
  // El log debe reflejar la transición.
  const entry = d._logs[0];
  assert.ok(entry, "debe haber log");
  assert.equal(entry.info.status_prev, "pending");
  assert.equal(entry.info.status_new, "active");
});

test("cancelación de MP: mpStatus=cancelled → status interno 'cancelled'", async () => {
  const d = deps({
    verifyPreapproval: async () => ({
      id: "pre-cancel",
      status: "cancelled",
      external_reference: "uid-c|profesional_1"
    })
  });
  await handleWebhook(req({
    body: { type: "subscription_preapproval", data: { id: "pre-cancel" } }
  }), d);
  const saved = d._db.docs.get("subscriptions/uid-c").data;
  assert.equal(saved.status, "cancelled");
  assert.equal(saved.mpStatus, "cancelled");
});

test("id también puede llegar en query (data.id)", async () => {
  const d = deps({
    verifyPreapproval: async () => ({ id: "pre-q", status: "authorized", external_reference: "u-q|lanzamiento" })
  });
  const result = await handleWebhook(
    req({ query: { type: "subscription_preapproval", "data.id": "pre-q" } }),
    d
  );
  assert.equal(result.ok, true);
  assert.equal(result.uid, "u-q");
});

test("internalStatus mapea los estados conocidos", () => {
  assert.equal(internalStatus("authorized"), "active");
  assert.equal(internalStatus("pending"), "pending");
  assert.equal(internalStatus("paused"), "paused");
  assert.equal(internalStatus("cancelled"), "cancelled");
  assert.equal(internalStatus("otro-raro"), "unknown");
});
