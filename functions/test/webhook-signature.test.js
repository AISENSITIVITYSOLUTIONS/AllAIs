// Pruebas de la validación de firma x-signature del webhook de Mercado Pago.
// Verifica que solo se acepten notificaciones firmadas con el secreto correcto
// y dentro de la ventana de tolerancia de tiempo.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const { verify } = require("../webhook-signature");

const SECRET = "test_webhook_secret_12345";
const DATA_ID = "abc123";
const REQUEST_ID = "req-456-xyz";
// Mercado Pago envía ts en milisegundos. Se usa un valor que corresponde a NOW.
const TS = "1760000000000";
const NOW = new Date(Number(TS));

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
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), true);
});

test("una firma con secreto incorrecto se rechaza", () => {
  const sig = firmar({ secret: "otro_secreto_completamente_diferente" });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);
});

test("sin header x-signature se rechaza", () => {
  assert.equal(verify({ signatureHeader: "", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);
});

test("sin secreto configurado se rechaza todo", () => {
  const sig = firmar();
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: "", now: NOW }), false);
});

test("un timestamp alterado invalida la firma (hash no coincide)", () => {
  const sig = firmar();
  // Cambiar el ts en el header sin recalcular el hash (y mover now para evitar que lo mate la ventana).
  const tsFalso = String(Number(TS) + 1000);
  const tampered = sig.replace(`ts=${TS}`, `ts=${tsFalso}`);
  const nowCercano = new Date(Number(tsFalso));
  assert.equal(verify({ signatureHeader: tampered, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: nowCercano }), false);
});

test("un data.id alterado invalida la firma", () => {
  const sig = firmar({ dataId: "abc123" });
  // La firma es para abc123, pero la verificación recibe otro id.
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: "HACKED", secret: SECRET, now: NOW }), false);
});

test("un x-request-id alterado invalida la firma", () => {
  const sig = firmar({ requestId: "req-456-xyz" });
  assert.equal(verify({ signatureHeader: sig, requestId: "falso", dataId: DATA_ID, secret: SECRET, now: NOW }), false);
});

test("sin data.id, el segmento se omite del manifiesto y la firma es válida", () => {
  // Firma generada sin data.id.
  const sig = firmar({ dataId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: "", secret: SECRET, now: NOW }), true);
});

test("sin x-request-id, el segmento se omite del manifiesto y la firma es válida", () => {
  const sig = firmar({ requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: DATA_ID, secret: SECRET, now: NOW }), true);
});

test("header x-signature con formato malformado se rechaza", () => {
  assert.equal(verify({ signatureHeader: "basura-total", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);
  assert.equal(verify({ signatureHeader: "ts=123", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);  // falta v1
  assert.equal(verify({ signatureHeader: "v1=abc", requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);  // falta ts
});

test("solo ts y data.id: firma válida cuando x-request-id está vacío", () => {
  const sig = firmar({ requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: DATA_ID, secret: SECRET, now: NOW }), true);
});

test("solo ts: firma válida cuando data.id y x-request-id están vacíos", () => {
  const sig = firmar({ dataId: "", requestId: "" });
  assert.equal(verify({ signatureHeader: sig, requestId: "", dataId: "", secret: SECRET, now: NOW }), true);
});

// --- Replay protection ---

test("replay protection: una firma con ts > 10 min en el pasado se rechaza", () => {
  const sig = firmar(); // ts del momento NOW
  const unaHoraDespues = new Date(NOW.getTime() + 60 * 60 * 1000);
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: unaHoraDespues }), false);
});

test("replay protection: una firma con ts > 10 min en el futuro se rechaza", () => {
  const tsFuturo = String(Number(TS) + 60 * 60 * 1000);
  const sig = firmar({ ts: tsFuturo });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);
});

test("replay protection: ts dentro de la ventana (±10 min) se acepta", () => {
  const tsAdelantado = String(Number(TS) + 9 * 60 * 1000);
  const sig = firmar({ ts: tsAdelantado });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), true);
});

test("replay protection: ts no numérico se rechaza", () => {
  const sig = `ts=no-es-numero,v1=${createHmac("sha256", SECRET).update("id:" + DATA_ID + ";request-id:" + REQUEST_ID + ";ts:no-es-numero;").digest("hex")}`;
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), false);
});

test("replay protection: ts en segundos (unix) también se acepta en la ventana", () => {
  // Mercado Pago manda ts en ms, pero algunos SDK/entornos muestran segundos.
  const tsEnSeg = String(Math.floor(Number(TS) / 1000)); // ~"1760000000"
  const sig = firmar({ ts: tsEnSeg });
  assert.equal(verify({ signatureHeader: sig, requestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, now: NOW }), true);
});
