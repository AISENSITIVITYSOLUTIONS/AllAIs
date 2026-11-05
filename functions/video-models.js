// Modelos de video de AllAIs: MiniMax (directo) y los modelos de video de OpenRouter.
//
// Regla de acceso:
//  - Administrador: todos los modelos, sin límite.
//  - Suscriptores con video en su plan: todos los modelos con precio publicado. El
//    límite es la bolsa mensual de segundos del plan (videoSeconds): cada video
//    descuenta su duración.
//  - Opcional: VIDEO_PRICE_CAP_<PLAN> en functions/.env fija un precio máximo por
//    segundo (USD) para ese plan. Sin la variable no hay tope.
//  - Modelos sin precio publicado: solo administrador.
//  - Sin plan con video: ningún modelo.

const OPENROUTER_VIDEO_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/videos/models";
const OPENROUTER_VIDEOS_ENDPOINT = "https://openrouter.ai/api/v1/videos";

const MINIMAX_ID = "minimax";

// Sin tope de precio por defecto: manda la bolsa de segundos del plan.
const DEFAULT_PRICE_CAPS = {
  lanzamiento: Infinity,
  profesional_1: Infinity,
  profesional_2: Infinity,
  profesional_3: Infinity
};

const PLAN_ORDER = ["profesional_1", "profesional_2", "profesional_3"];
const PLAN_NAMES = { profesional_1: "Esencial", profesional_2: "Profesional", profesional_3: "Avanzado" };

function priceCaps(env = process.env) {
  const caps = {};
  for (const [plan, value] of Object.entries(DEFAULT_PRICE_CAPS)) {
    const raw = env[`VIDEO_PRICE_CAP_${plan.toUpperCase()}`];
    const n = raw === undefined || raw === "" ? NaN : Number(raw);
    caps[plan] = Number.isFinite(n) && n >= 0 ? n : value;
  }
  return caps;
}

// Precio base por segundo: el SKU más barato que sea "por segundo". Si el modelo
// no publica precio por segundo, se trata como desconocido (solo administrador).
function pricePerSecond(pricingSkus) {
  if (!pricingSkus || typeof pricingSkus !== "object") return null;
  const values = Object.entries(pricingSkus)
    .filter(([sku]) => /second/i.test(sku))
    .map(([, v]) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  return values.length ? Math.min(...values) : null;
}

function normalizeOpenRouterVideoModel(m) {
  const durations = (Array.isArray(m.supported_durations) ? m.supported_durations : [])
    .map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  return {
    id: String(m.id || m.canonical_slug || ""),
    name: String(m.name || m.id || ""),
    provider: "openrouter",
    pricePerSecond: pricePerSecond(m.pricing_skus),
    durations,
    aspectRatios: Array.isArray(m.supported_aspect_ratios) ? m.supported_aspect_ratios.map(String) : [],
    resolutions: Array.isArray(m.supported_resolutions) ? m.supported_resolutions.map(String) : []
  };
}

function minimaxModel(modelName = "T2V-01-Director") {
  return {
    id: MINIMAX_ID,
    name: `MiniMax (${modelName})`,
    provider: "minimax",
    pricePerSecond: null,
    included: true,
    durations: [6],
    aspectRatios: [],
    resolutions: []
  };
}

// Duración a pedir: la más corta que el modelo acepte y que sea al menos 5 s.
function pickDuration(model, preferred = 5) {
  const d = model?.durations || [];
  if (!d.length) return preferred;
  return d.find((n) => n >= preferred) || d[d.length - 1];
}

function pickAspectRatio(model) {
  const r = model?.aspectRatios || [];
  if (!r.length) return undefined;
  return r.includes("16:9") ? "16:9" : r[0];
}

// Plan mínimo cuyo tope cubre el precio del modelo (para mostrar el candado).
function minPlanForPrice(price, caps) {
  if (price === null) return null;
  return PLAN_ORDER.find((plan) => caps[plan] > 0 && price <= caps[plan]) || null;
}

/**
 * ¿Puede este usuario usar el modelo de video?
 * entitlement: el derecho resuelto en el servidor (source "admin" | "subscription" | "free").
 */
function videoModelAccess(model, entitlement, caps = priceCaps()) {
  if (!model) return { allowed: false, reason: "unknown_model" };
  if (entitlement?.source === "admin") return { allowed: true };
  const hasVideo = Number(entitlement?.videoSeconds) > 0;
  if (!hasVideo) return { allowed: false, reason: "not_in_plan", requiredPlan: "profesional_1" };
  if (model.provider === "minimax") return { allowed: true };
  const cap = caps[entitlement.planId] ?? 0;
  if (model.pricePerSecond !== null && model.pricePerSecond <= cap) return { allowed: true };
  const required = minPlanForPrice(model.pricePerSecond, caps);
  return { allowed: false, reason: required ? "plan" : "admin_only", requiredPlan: required };
}

// Catálogo con el acceso calculado para el usuario, listo para el selector.
function catalogFor(models, entitlement, caps = priceCaps()) {
  return models.map((m) => {
    const access = videoModelAccess(m, entitlement, caps);
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      pricePerSecond: m.pricePerSecond,
      included: Boolean(m.included),
      allowed: access.allowed,
      requiredPlan: access.requiredPlan || null,
      requiredPlanName: access.requiredPlan ? PLAN_NAMES[access.requiredPlan] || null : null,
      adminOnly: access.reason === "admin_only"
    };
  });
}

// ---------- Red ----------

let cache = { at: 0, data: [] };
const CACHE_MS = 10 * 60 * 1000;

function openRouterHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://allais.nni.ai",
    "X-Title": "AllAIs"
  };
}

function openRouterKey(env = process.env) {
  return String(env.OPENROUTER_API_KEY || "").replace(/^﻿/, "").trim();
}

async function listOpenRouterVideoModels() {
  const apiKey = openRouterKey();
  if (!apiKey) return [];
  if (cache.data.length && Date.now() - cache.at < CACHE_MS) return cache.data;
  const resp = await fetch(OPENROUTER_VIDEO_MODELS_ENDPOINT, {
    headers: openRouterHeaders(apiKey),
    signal: AbortSignal.timeout(15_000)
  });
  if (!resp.ok) throw new Error(`OpenRouter video models ${resp.status}`);
  const payload = await resp.json();
  const data = (Array.isArray(payload?.data) ? payload.data : [])
    .map(normalizeOpenRouterVideoModel)
    .filter((m) => m.id)
    .sort((a, b) => (a.pricePerSecond ?? 999) - (b.pricePerSecond ?? 999));
  cache = { at: Date.now(), data };
  return data;
}

async function allVideoModels(minimaxModelName) {
  let openrouter = [];
  try {
    openrouter = await listOpenRouterVideoModels();
  } catch (error) {
    console.error("AllAIs video models", { message: error?.message });
  }
  const minimax = process.env.MINIMAX_API_KEY ? [minimaxModel(minimaxModelName)] : [];
  return [...minimax, ...openrouter];
}

async function submitOpenRouterVideo(model, prompt) {
  const apiKey = openRouterKey();
  if (!apiKey) throw new Error("Falta configurar OPENROUTER_API_KEY.");
  const duration = pickDuration(model);
  const body = { model: model.id, prompt: String(prompt).slice(0, 2000), duration };
  const aspect = pickAspectRatio(model);
  if (aspect) body.aspect_ratio = aspect;
  const resp = await fetch(OPENROUTER_VIDEOS_ENDPOINT, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`OpenRouter video submit ${resp.status}: ${text.slice(0, 300)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { /* */ }
  if (!data?.id) throw new Error(`OpenRouter no devolvió id de video: ${text.slice(0, 300)}`);
  return { jobId: String(data.id), duration };
}

// Estado: processing | success | failed.
async function queryOpenRouterVideo(jobId) {
  const apiKey = openRouterKey();
  const resp = await fetch(`${OPENROUTER_VIDEOS_ENDPOINT}/${encodeURIComponent(jobId)}`, {
    headers: openRouterHeaders(apiKey),
    signal: AbortSignal.timeout(20_000)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`OpenRouter video status ${resp.status}: ${text.slice(0, 300)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { /* */ }
  const status = String(data?.status || "");
  if (status === "completed") return { state: "success", raw: status, cost: data?.usage?.cost ?? null };
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return { state: "failed", raw: `${status}: ${JSON.stringify(data?.error || "").slice(0, 250)}` };
  }
  return { state: "processing", raw: status || "unknown" };
}

// Descarga el video terminado (la URL de contenido requiere la clave).
async function downloadOpenRouterVideo(jobId) {
  const apiKey = openRouterKey();
  const resp = await fetch(`${OPENROUTER_VIDEOS_ENDPOINT}/${encodeURIComponent(jobId)}/content?index=0`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(60_000)
  });
  if (!resp.ok) throw new Error(`OpenRouter video content ${resp.status}`);
  return {
    buffer: Buffer.from(await resp.arrayBuffer()),
    contentType: resp.headers.get("content-type") || "video/mp4"
  };
}

module.exports = {
  MINIMAX_ID,
  DEFAULT_PRICE_CAPS,
  priceCaps,
  pricePerSecond,
  normalizeOpenRouterVideoModel,
  minimaxModel,
  pickDuration,
  pickAspectRatio,
  videoModelAccess,
  catalogFor,
  allVideoModels,
  listOpenRouterVideoModels,
  submitOpenRouterVideo,
  queryOpenRouterVideo,
  downloadOpenRouterVideo
};
