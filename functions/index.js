const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { listProviders, callProvider } = require("./providers");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const DAILY_QUERY_LIMIT = Number(process.env.DAILY_QUERY_LIMIT || 20);
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
    return { uid: token.uid, email: token.email.toLowerCase() };
  } catch {
    return null;
  }
}

async function recordVisit({ method, email, request, consent }) {
  const client = request.body?.client || {};
  const geo = await lookupGeo(clientIp(request));
  const now = FieldValue.serverTimestamp();
  const visit = {
    method,
    email: email || null,
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
  if (!email) return;
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
    ...(consent ? { privacyConsentAt: now } : {})
  }, { merge: true });
}

function quotaPayload(used) {
  return {
    limit: DAILY_QUERY_LIMIT,
    remaining: Math.max(0, DAILY_QUERY_LIMIT - used),
    resetAt: nextResetIso()
  };
}

async function readQuota(email) {
  const snapshot = await db.collection("usage").doc(`${email}_${dayKey()}`).get();
  return quotaPayload(snapshot.exists ? Number(snapshot.get("count") || 0) : 0);
}

async function consumeQuota(email) {
  const day = dayKey();
  const ref = db.collection("usage").doc(`${email}_${day}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const used = snapshot.exists ? Number(snapshot.get("count") || 0) : 0;
    if (used >= DAILY_QUERY_LIMIT) return { ok: false, quota: quotaPayload(used) };
    transaction.set(ref, { email, day, count: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, ref, quota: quotaPayload(used + 1) };
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

function requireAccess(request) {
  const expected = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
  const accessCode = String(request.body?.accessCode || "").replace(/[^\x20-\x7E]/g, "").trim();
  return accessCode && accessCode === expected;
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
        await recordVisit({ method: "email", email: user.email, request, consent: request.body?.consent === true })
          .catch((error) => console.error("AllAIs visit log failed", error?.message));
        sendJson(response, 200, { ok: true, authType: "email", email: user.email, quota: await readQuota(user.email) });
        return;
      }

      const ok = requireAccess(request);
      if (ok) {
        await recordVisit({ method: "code", email: null, request })
          .catch((error) => console.error("AllAIs visit log failed", error?.message));
      }
      sendJson(response, ok ? 200 : 401, {
        ok,
        message: ok ? "Access granted" : "Invalid access code"
      });
      return;
    }

    if (path === "/chat" && request.method === "POST") {
      const emailUser = await verifyEmailUser(request);
      if (!emailUser && !requireAccess(request)) {
        sendJson(response, 401, { error: "Unauthorized" });
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

      // El código de equipo no tiene límite diario; el acceso por email sí.
      let quotaRef = null;
      let quota = null;
      if (emailUser) {
        const consumed = await consumeQuota(emailUser.email);
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
        throw error;
      }

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
