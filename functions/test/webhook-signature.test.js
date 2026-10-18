// Pruebas de la validación de firma x-signature del webhook de Mercado Pago.
// Verifica que solo se acepten notificaciones firmadas con el secreto correcto.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const { verify } = require("../webhook-signature");

const SECRET = "test_webhook_secret_12345";
const DATA_ID = "abc123";
const REQUEST_ID = "req-456-xyz";
const TS = "1704908010";

// Genera una firma válida con los parámetros dados.
function firmar({ dataId = DATA_ID, requestId = REQUEST_ID, ts = TS, secret = SECRET } = {}) {
  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const hash = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${hash}`;
}

test("una firma válida se acepta", () => {
  const sig = firmar();
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), true);
});

test("una firma con secreto incorrecto se rechaza", () => {
  const sig = firmar({ secret: "otro_secreto_completamente_diferente" });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);
});

test("sin header x-signature se rechaza", () => {
  assert.equal(verify({ signatureHeader: "", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);
});

test("sin secreto configurado se rechaza todo", () => {
  const sig = firmar();
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: "" }), false);
});

test("un timestamp alterado invalida la firma", () => {
  const sig = firmar({ ts: "1704908010" });
  // Cambiar el ts en el header sin recalcular el hash.
  const tampered = sig.replace("ts=1704908010", "ts=9999999999");
  assert.equal(verify({ signatureHeader: tampered, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);
});

test("un data.id alterado invalida la firma", () => {
  const sig = firmar({ dataId: "abc123" });
  // La firma es para abc123, pero la verificación recibe otro id.
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: "HACKED", secret: SECRET }), false);
});

test("un x-request-id alterado invalida la firma", () => {
  const sig = firmar({ requestId: "req-456-xyz" });
  assert.equal(verify({ signatureHeader: sig, requestId: "falso", dataId: DATA_ID, secret: SECRET }), false);
});

test("sin data.id, el segmento se omite del manifiesto y la firma es válida", () => {
  // Firma generada sin data.id.
  const sig = firmar({ dataId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: "", secret: SECRET }), true);
});

test("sin x-request-id, el segmento se omite del manifiesto y la firma es válida", () => {
  const sig = firmar({ requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: DATA_ID, secret: SECRET }), true);
});

test("header x-signature con formato malformado se rechaza", () => {
  assert.equal(verify({ signatureHeader: "basura-total", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);
  assert.equal(verify({ signatureHeader: "ts=123", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);  // falta v1
  assert.equal(verify({ signatureHeader: "v1=abc", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }), false);  // falta ts
});

test("solo ts y data.id: firma válida cuando x-request-id está vacío", () => {
  const sig = firmar({ requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: DATA_ID, secret: SECRET }), true);
});

test("solo ts: firma válida cuando data.id y x-request-id están vacíos", () => {
  const sig = firmar({ dataId: "", requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: "", secret: SECRET }), true);
});
