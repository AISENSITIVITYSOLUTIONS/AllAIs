const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { listProviders, callProvider } = require("./providers");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const DAILY_QUERY_LIMIT = Number(process.env.DAILY_QUERY_LIMIT || 20);
const PROMO_DEFAULT_DAILY_LIMIT = Number(process.env.PROMO_DEFAULT_DAILY_LIMIT || 50);
const QUOTA_TIME_ZONE = "America/Mexico_City";

const runtimeOptions = {
  region: "us-central1",
  timeoutSeconds: 300,
  secrets: [
    "NNI_ACCESS_CODE",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_WORKSPACE_ID",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "QWEN_API_KEY",
    "QWEN_BASE_URL",
    "QWEN_MODEL"
  ]
};

function sendJson(response, status, body) {
  response.status(status).set({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  }).json(body);
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 12 * 1024 * 1024;

function attachmentByteSize(attachment) {
  const declaredSize = Number(attachment?.size || 0);
  const base64 = String(attachment?.data || "");
  const estimatedSize = base64 ? Math.ceil((base64.length * 3) / 4) : 0;
  return Math.max(declaredSize, estimatedSize);
}

function validateAttachments(attachments) {
  let totalBytes = 0;
  for (const attachment of attachments) {
    const size = attachmentByteSize(attachment);
    if (size > MAX_ATTACHMENT_BYTES) {
      return "Each attachment must be 10 MB or smaller.";
    }
    totalBytes += size;
  }
  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return "Attachments must total 12 MB or less per request.";
  }
  return "";
}

const allowedOrigins = new Set([
  "https://allais.nni.ai",
  "https://allais-nni.web.app",
  "https://allais-nni.firebaseapp.com"
]);

// ---------- Acceso por email, visitas y límite diario ----------

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// Medianoche siguiente en la Ciudad de México. CDMX está en UTC-6 todo el año (sin horario de verano desde 2022).
function nextResetIso() {
  const [year, month, day] = dayKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0)).toISOString();
}

function clientIp(request) {
  const forwarded = String(request.get("x-forwarded-for") || "");
  return (forwarded.split(",")[0] || request.ip || "").trim();
}

function cleanText(value, max = 300) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);
}

// Ubicación aproximada a partir de la IP (país, estado, ciudad). La IP no se guarda.
async function lookupGeo(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return {};
  const template = process.env.GEO_LOOKUP_URL || "https://ipapi.co/{ip}/json/";
  try {
    const response = await fetch(template.replace("{ip}", encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return {};
    const data = await response.json();
    if (data.error) return {};
    return {
      country: cleanText(data.country_name || data.country, 80),
      countryCode: cleanText(data.country_code || data.countryCode, 8),
      region: cleanText(data.region || data.regionName, 80),
      city: cleanText(data.city, 80)
    };
  } catch {
    return {};
  }
}

async function verifyEmailUser(request) {
  const match = String(request.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const token = await admin.auth().verifyIdToken(match[1]);
    if (!token.email || !token.email_verified) return null;
    const signIn = token.firebase?.sign_in_provider || "";
    return { uid: token.uid, email: token.email.toLowerCase(), name: token.name || "", provider: signIn === "google.com" ? "google" : "email" };
  } catch {
    return null;
  }
}

async function recordVisit({ method, email, code, request, consent }) {
  const client = request.body?.client || {};
  const geo = await lookupGeo(clientIp(request));
  const now = FieldValue.serverTimestamp();
  const visit = {
    method,
    email: email || null,
    code: code || null,
    at: now,
    country: geo.country || "",
    countryCode: geo.countryCode || "",
    region: geo.region || "",
    city: geo.city || "",
    userAgent: cleanText(request.get("user-agent"), 400),
    referrer: cleanText(client.referrer),
    utm: cleanText(client.utm),
    browserTimeZone: cleanText(client.timeZone, 64),
    browserLanguage: cleanText(client.language, 32)
  };
  await db.collection("visits").add(visit);
  const summary = { pais: visit.country, estado: visit.region, ciudad: visit.city, navegador: visit.userAgent, referencia: visit.referrer, utm: visit.utm };
  if (!email) return summary;
  const visitor = db.collection("visitors").doc(email);
  await visitor.create({ email, firstSeen: now, firstReferrer: visit.referrer }).catch(() => {});
  await visitor.set({
    email,
    lastSeen: now,
    visits: FieldValue.increment(1),
    lastCountry: visit.country,
    lastRegion: visit.region,
    lastCity: visit.city,
    lastUserAgent: visit.userAgent,
    lastMethod: method,
    ...(consent ? { privacyConsentAt: now } : {})
  }, { merge: true });
  return summary;
}

function quotaPayload(used, limit = DAILY_QUERY_LIMIT) {
  return {
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextResetIso()
  };
}

// La cuota se lleva por "titular": el email de la cuenta o "code:CODIGO" para los códigos promocionales.
async function readQuota(holder, limit = DAILY_QUERY_LIMIT) {
  const snapshot = await db.collection("usage").doc(`${holder}_${dayKey()}`).get();
  return quotaPayload(snapshot.exists ? Number(snapshot.get("count") || 0) : 0, limit);
}

async function consumeQuota(holder, limit = DAILY_QUERY_LIMIT) {
  const day = dayKey();
  const ref = db.collection("usage").doc(`${holder}_${day}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const used = snapshot.exists ? Number(snapshot.get("count") || 0) : 0;
    if (used >= limit) return { ok: false, quota: quotaPayload(used, limit) };
    transaction.set(ref, { holder, email: holder.startsWith("code:") ? null : holder, day, count: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, ref, quota: quotaPayload(used + 1, limit) };
  });
}

// ---------- Registro en Google Sheets (Apps Script) ----------
// SHEETS_WEBHOOK_URL y SHEETS_WEBHOOK_TOKEN se configuran en functions/.env. Si faltan, no se envía nada.
async function logToSheet(type, row) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: process.env.SHEETS_WEBHOOK_TOKEN || "", type, at: new Date().toISOString(), ...row }),
      signal: AbortSignal.timeout(2500),
      redirect: "follow"
    });
  } catch (error) {
    console.warn("AllAIs sheet log failed", error?.message);
  }
}

// ---------- Códigos de acceso ----------
// El código maestro (secreto NNI_ACCESS_CODE) no tiene límite. Los códigos promocionales viven en
// Firestore (promoCodes/{CODIGO}): active, maxUses, uses, expiresAt, dailyLimit, label.
function cleanCode(value) {
  return String(value || "").replace(/[^\x20-\x7E]/g, "").trim();
}

async function resolveCode(rawCode, { activate = false } = {}) {
  const code = cleanCode(rawCode);
  if (!code) return null;
  const master = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
  if (code === master) return { kind: "master", code: "MAESTRO", limit: null };

  const id = code.toUpperCase();
  const ref = db.collection("promoCodes").doc(id);
  const check = (data) => {
    if (!data || data.active === false) return "invalid";
    const expires = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null);
    if (expires && expires.getTime() < Date.now()) return "expired";
    if (activate && data.maxUses && Number(data.uses || 0) >= Number(data.maxUses)) return "exhausted";
    return "";
  };

  if (!activate) {
    const snapshot = await ref.get();
    const data = snapshot.exists ? snapshot.data() : null;
    if (check(data)) return null;
    return { kind: "promo", code: id, limit: Number(data.dailyLimit || PROMO_DEFAULT_DAILY_LIMIT), label: data.label || "" };
  }

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : null;
    const problem = check(data);
    if (problem) return { kind: "rejected", reason: problem };
    transaction.update(ref, { uses: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp() });
    return { kind: "promo", code: id, limit: Number(data.dailyLimit || PROMO_DEFAULT_DAILY_LIMIT), label: data.label || "" };
  });
}

async function refundQuota(ref) {
  if (!ref) return;
  try {
    await ref.update({ count: FieldValue.increment(-1) });
  } catch (error) {
    console.warn("AllAIs quota refund failed", error?.message);
  }
}


exports.api = onRequest(runtimeOptions, async (request, response) => {
  const origin = request.get("origin");
  if (allowedOrigins.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  try {
    const path = request.path.replace(/^\/api/, "") || "/";

    if (path === "/providers" && request.method === "GET") {
      sendJson(response, 200, { providers: listProviders() });
      return;
    }

    if (path === "/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, service: "allais-api", version: "2026-10-06-api-rewrite-json-errors" });
      return;
    }

    if (path === "/session" && request.method === "POST") {
      if (request.body?.authType === "email") {
        const user = await verifyEmailUser(request);
        if (!user) {
          sendJson(response, 401, { ok: false, message: "Invalid or expired session" });
          return;
        }
        const visit = await recordVisit({ method: user.provider, email: user.email, request, consent: request.body?.consent === true })
          .catch((error) => { console.error("AllAIs visit log failed", error?.message); return {}; });
        await logToSheet("visita", { email: user.email, metodo: user.provider, ...visit });
        sendJson(response, 200, { ok: true, authType: "email", email: user.email, quota: await readQuota(user.email) });
        return;
      }

      const access = await resolveCode(request.body?.accessCode, { activate: true });
      const ok = Boolean(access && access.kind !== "rejected");
      if (ok) {
        const visit = await recordVisit({ method: access.kind === "master" ? "code" : "promo", email: null, code: access.code, request })
          .catch((error) => { console.error("AllAIs visit log failed", error?.message); return {}; });
        await logToSheet("visita", { email: "", metodo: access.kind === "master" ? "código maestro" : "código promocional", codigo: access.code, ...visit });
      }
      const reasons = { expired: "Este código ya caducó.", exhausted: "Este código ya alcanzó su número de usos." };
      sendJson(response, ok ? 200 : 401, {
        ok,
        message: ok ? "Access granted" : (reasons[access?.reason] || "Invalid access code"),
        ...(ok && access.limit ? { quota: await readQuota(`code:${access.code}`, access.limit) } : {})
      });
      return;
    }

    if (path === "/chat" && request.method === "POST") {
      const emailUser = await verifyEmailUser(request);
      const codeAccess = emailUser ? null : await resolveCode(request.body?.accessCode);
      if (!emailUser && !codeAccess) {
        sendJson(response, 401, { error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }

      const prompt = String(request.body?.prompt || "").trim();
      const provider = String(request.body?.provider || "openai");
      const system = String(request.body?.system || "").trim();
      const temperature = Math.min(Math.max(Number(request.body?.temperature ?? 0.4), 0), 1.2);
      const history = Array.isArray(request.body?.history) ? request.body.history.slice(-30) : [];
      const attachments = Array.isArray(request.body?.attachments) ? request.body.attachments : [];
      const attachmentError = validateAttachments(attachments);
      if (attachmentError) {
        sendJson(response, 413, { error: attachmentError });
        return;
      }
      const webSearch = request.body?.webSearch === true;
      const documentRequest = request.body?.documentRequest === true;
      const documentTransform = request.body?.documentTransform === true;

      if (!prompt) {
        sendJson(response, 400, { error: "Prompt is required." });
        return;
      }

      // El código maestro no tiene límite diario; las cuentas y los códigos promocionales sí.
      let quotaRef = null;
      let quota = null;
      const holder = emailUser ? emailUser.email : (codeAccess.limit ? `code:${codeAccess.code}` : null);
      const holderLimit = emailUser ? DAILY_QUERY_LIMIT : codeAccess.limit;
      if (holder) {
        const consumed = await consumeQuota(holder, holderLimit);
        if (!consumed.ok) {
          sendJson(response, 429, { error: "Daily query limit reached.", code: "DAILY_LIMIT", quota: consumed.quota });
          return;
        }
        quotaRef = consumed.ref;
        quota = consumed.quota;
      }

      const startedAt = Date.now();
      let result;
      try {
        result = await callProvider(provider, { prompt, system, temperature, history, documentRequest, documentTransform, webSearch, attachments });
      } catch (error) {
        await refundQuota(quotaRef);
        await logToSheet("consulta", { email: emailUser?.email || "", codigo: codeAccess?.code || "", modelo: provider, resultado: "error", detalle: cleanText(error?.message, 200) });
        throw error;
      }
      await logToSheet("consulta", { email: emailUser?.email || "", codigo: codeAccess?.code || "", modelo: provider, resultado: "ok", restantes: quota ? quota.remaining : "" });

      sendJson(response, 200, {
        provider,
        model: result.rawModel,
        answer: result.text,
        sources: result.sources || [],
        usage: result.usage,
        elapsedMs: Date.now() - startedAt,
        ...(quota ? { quota } : {})
      });
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    console.error("AllAIs API error", {
      message: error?.message,
      stack: error?.stack,
      path: request.path,
      method: request.method
    });
    sendJson(response, 500, {
      error: error?.message || "Unexpected server error.",
      code: "ALLAIS_API_ERROR"
    });
  }
});




// redeploy qwen secret refresh
// qwen secret refresh

// force qwen redeploy 2026-10-04

// force qwen turbo model 2026-10-04

// force qwen flash model 2026-10-04

// force qwen streaming 2026-10-04
