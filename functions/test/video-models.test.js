const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("../video-models");

const caps = vm.priceCaps({});
const barato = vm.normalizeOpenRouterVideoModel({ id: "wan/barato", name: "Wan", supported_durations: [5, 10], supported_aspect_ratios: ["9:16", "16:9"], pricing_skus: { "per-video-second": "0.08", "per-video-second-1080p": "0.12" } });
const medio = vm.normalizeOpenRouterVideoModel({ id: "x/medio", pricing_skus: { "per-video-second": "0.18" } });
const caro = vm.normalizeOpenRouterVideoModel({ id: "google/veo-3.1", pricing_skus: { "per-video-second": "0.50" } });
const sinPrecio = vm.normalizeOpenRouterVideoModel({ id: "x/sin-precio", pricing_skus: {} });
const minimax = vm.minimaxModel();

const admin = { source: "admin", planId: "profesional_3", videoSeconds: 9999 };
const esencial = { source: "subscription", planId: "profesional_1", videoSeconds: 30 };
const avanzado = { source: "subscription", planId: "profesional_3", videoSeconds: 90 };
const lanzamiento = { source: "subscription", planId: "lanzamiento", videoSeconds: 0 };
const gratis = { source: "free", planId: null, videoSeconds: 0 };

test("el precio por segundo es el SKU por segundo más barato", () => {
  assert.equal(barato.pricePerSecond, 0.08);
  assert.equal(sinPrecio.pricePerSecond, null);
});

test("el administrador puede usar todos los modelos de video", () => {
  for (const m of [minimax, barato, medio, caro, sinPrecio]) {
    assert.equal(vm.videoModelAccess(m, admin, caps).allowed, true, m.id);
  }
});

test("sin tope configurado, los suscriptores con video usan todos los modelos con precio", () => {
  for (const m of [minimax, barato, medio, caro]) {
    assert.equal(vm.videoModelAccess(m, esencial, caps).allowed, true, m.id);
  }
});

test("un modelo sin precio publicado es solo para administrador", () => {
  assert.equal(vm.videoModelAccess(sinPrecio, avanzado, caps).reason, "admin_only");
});

test("con tope en el entorno, el modelo caro pide el plan que lo cubre", () => {
  const c = vm.priceCaps({ VIDEO_PRICE_CAP_PROFESIONAL_1: "0.1", VIDEO_PRICE_CAP_PROFESIONAL_2: "0.15", VIDEO_PRICE_CAP_PROFESIONAL_3: "0.2" });
  assert.equal(vm.videoModelAccess(barato, esencial, c).allowed, true);
  const m = vm.videoModelAccess(medio, esencial, c);
  assert.equal(m.allowed, false);
  assert.equal(m.requiredPlan, "profesional_3");
  assert.equal(vm.videoModelAccess(caro, avanzado, c).reason, "admin_only");
});

test("sin video en el plan no se concede ningún modelo", () => {
  assert.equal(vm.videoModelAccess(minimax, lanzamiento, caps).allowed, false);
  assert.equal(vm.videoModelAccess(barato, gratis, caps).allowed, false);
});

test("duración y formato se ajustan a lo que acepta el modelo", () => {
  assert.equal(vm.pickDuration(barato), 5);
  assert.equal(vm.pickDuration({ durations: [8, 10] }), 8);
  assert.equal(vm.pickDuration({ durations: [] }), 5);
  assert.equal(vm.pickAspectRatio(barato), "16:9");
});
