// Validación de la firma x-signature del webhook de Mercado Pago.
//
// Mercado Pago firma cada notificación con HMAC-SHA256. El manifiesto es:
//   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// Si falta un segmento (data.id o x-request-id), se omite del string.
// El secreto se obtiene en Mercado Pago Developers → Tu integración → Webhooks.
//
// Además del HMAC, se valida que el timestamp (ts) esté dentro de una ventana
// corta frente al reloj del servidor (replay protection): aunque un atacante
// capture una firma válida, no puede reusarla indefinidamente.

const { createHmac, timingSafeEqual } = require("node:crypto");

// Ventana de tolerancia para el ts del webhook (±10 min). Mercado Pago envía
// con ts en segundos; a veces milisegundos. Se aceptan ambos.
const DEFAULT_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Verifica la firma x-signature del webhook.
 * @param {object} options
 * @param {string} options.signatureHeader — valor del header x-signature ("ts=...,v1=...")
 * @param {string} options.requestId       — valor del header x-request-id
 * @param {string} options.dataId          — valor de query "data.id" o body data.id
 * @param {string} options.secret          — secreto del webhook (MP_WEBHOOK_SECRET)
 * @param {Date}   [options.now]           — reloj del servidor (inyectable para pruebas)
 * @param {number} [options.toleranceMs]   — ventana de tolerancia del ts (ms); por defecto 10 min
 * @returns {boolean}
 */
function verify({ signatureHeader, requestId, dataId, secret, now = new Date(), toleranceMs = DEFAULT_TOLERANCE_MS }) {
  if (!secret || !signatureHeader) return false;

  // Parsear "ts=...,v1=..." del header.
  const fields = {};
  for (const part of signatureHeader.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) fields[key] = rest.join("=");
  }
  const { ts, v1 } = fields;
  if (!ts || !v1) return false;

  // Protección contra replay: ts debe ser un número y estar dentro de la ventana.
  // Mercado Pago manda ts en milisegundos; algunos SDK usan segundos. Se acepta
  // cualquiera convirtiendo lo que parezca segundos (< 10^12) a ms.
  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber) || tsNumber <= 0) return false;
  const tsMs = tsNumber < 1e12 ? tsNumber * 1000 : tsNumber;
  if (Math.abs(now.getTime() - tsMs) > toleranceMs) return false;

  // Construir el manifiesto. Si falta un valor, su segmento se omite.
  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  // Comparación en tiempo constante.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

module.exports = { verify, DEFAULT_TOLERANCE_MS };
