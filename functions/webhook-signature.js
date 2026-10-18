// Validación de la firma x-signature del webhook de Mercado Pago.
//
// Mercado Pago firma cada notificación con HMAC-SHA256. El manifiesto es:
//   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// Si falta un segmento (data.id o x-request-id), se omite del string.
// El secreto se obtiene en Mercado Pago Developers → Tu integración → Webhooks.

const { createHmac, timingSafeEqual } = require("node:crypto");

/**
 * Verifica la firma x-signature del webhook.
 * @param {object} options
 * @param {string} options.signatureHeader — valor del header x-signature ("ts=...,v1=...")
 * @param {string} options.requestId       — valor del header x-request-id
 * @param {string} options.dataId          — valor de query "data.id" o body data.id
 * @param {string} options.secret          — secreto del webhook (MP_WEBHOOK_SECRET)
 * @returns {boolean}
 */
function verify({ signatureHeader, requestId, dataId, secret }) {
  if (!secret || !signatureHeader) return false;

  // Parsear "ts=...,v1=..." del header.
  const fields = {};
  for (const part of signatureHeader.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) fields[key] = rest.join("=");
  }
  const { ts, v1 } = fields;
  if (!ts || !v1) return false;

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

module.exports = { verify };
