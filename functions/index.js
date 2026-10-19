const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getAppCheck } = require("firebase-admin/app-check");
const crypto = require("node:crypto");
const { listProviders, callProvider } = require("./providers");
const { dayKey, nextDailyResetIso } = require("./plans");
const { resolveEntitlement } = require("./entitlements");
const { consumeUsage, readUsage, refundUsage } = require("./quota");

initializeApp();
const db = getFirestore();

const DAILY_QUERY_LIMIT = Number(process.env.DAILY_QUERY_LIMIT || 10);
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
    "QWEN_MODEL",
    "SHEETS_WEBHOOK_TOKEN"
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

// dayKey y nextDailyResetIso viven en plans.js: son la misma regla de fechas que
// usan las cuotas por plan, y duplicarlas aquí haría que se desalinearan.
const nextResetIso = () => nextDailyResetIso();

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
    const token = await getAuth().verifyIdToken(match[1]);
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

// ---------- Protección contra abuso ----------
// Límite de solicitudes por IP (la IP se guarda cifrada con hash, nunca en claro).
const RATE_LIMITS = {
  session: { max: Number(process.env.RATE_SESSION_PER_15MIN || 10), windowMs: 15 * 60 * 1000 },
  chat: { max: Number(process.env.RATE_CHAT_PER_MIN || 20), windowMs: 60 * 1000 }
};

async function rateLimited(request, kind) {
  const rule = RATE_LIMITS[kind];
  const ip = clientIp(request);
  if (!rule || !ip) return false;
  const bucket = Math.floor(Date.now() / rule.windowMs);
  const id = `${kind}_${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24)}_${bucket}`;
  const ref = db.collection("rateLimits").doc(id);
  try {
    const count = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const next = (snapshot.exists ? Number(snapshot.get("count") || 0) : 0) + 1;
      transaction.set(ref, { count: next, expiresAt: new Date(Date.now() + rule.windowMs * 2) }, { merge: true });
      return next;
    });
    return count > rule.max;
  } catch (error) {
    console.warn("AllAIs rate limit check failed", error?.message);
    return false;
  }
}

// Firebase App Check (reCAPTCHA v3). Se activa al definir APPCHECK_SITE_KEY; se exige con APPCHECK_ENFORCE=true.
async function appCheckOk(request) {
  const token = String(request.get("x-firebase-appcheck") || "");
  if (!token) return process.env.APPCHECK_ENFORCE !== "true";
  try {
    await getAppCheck().verifyToken(token);
    return true;
  } catch {
    return process.env.APPCHECK_ENFORCE !== "true";
  }
}

// ---------- Panel de administración ----------
function adminEmails() {
  return String(process.env.ADMIN_EMAILS || "fdealbam@nni.ai,fdealbam@gmail.com")
    .split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

async function requireAdmin(request) {
  const user = await verifyEmailUser(request);
  if (!user || !adminEmails().includes(user.email)) return null;
  return user;
}

function toIso(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function adminStats(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceDay = dayKey(since);
  const [visitsSnap, usageSnap, codesSnap] = await Promise.all([
    db.collection("visits").where("at", ">=", since).orderBy("at", "desc").limit(5000).get(),
    db.collection("usage").where("day", ">=", sinceDay).limit(5000).get(),
    db.collection("promoCodes").limit(500).get()
  ]);

  const byDay = {};
  const byCountry = {};
  const byMethod = {};
  const emails = new Set();
  const recent = [];
  visitsSnap.forEach((doc) => {
    const v = doc.data();
    const at = v.at?.toDate ? v.at.toDate() : null;
    if (!at) return;
    const day = dayKey(at);
    byDay[day] = (byDay[day] || 0) + 1;
    const country = v.country || "Sin dato";
    byCountry[country] = (byCountry[country] || 0) + 1;
    const method = v.method || "otro";
    byMethod[method] = (byMethod[method] || 0) + 1;
    if (v.email) emails.add(v.email);
    if (recent.length < 50) recent.push({ at: at.toISOString(), email: v.email || "", code: v.code || "", method, country: v.country || "", city: v.city || "" });
  });

  const byHolder = {};
  const queriesByDay = {};
  usageSnap.forEach((doc) => {
    const u = doc.data();
    const holder = u.holder || u.email || doc.id.replace(/_\d{4}-\d{2}-\d{2}$/, "");
    const count = Number(u.count || 0);
    byHolder[holder] = (byHolder[holder] || 0) + count;
    queriesByDay[u.day] = (queriesByDay[u.day] || 0) + count;
  });

  const codes = [];
  codesSnap.forEach((doc) => {
    const c = doc.data();
    codes.push({ code: doc.id, label: c.label || "", active: c.active !== false, uses: Number(c.uses || 0), maxUses: c.maxUses || null, dailyLimit: c.dailyLimit || PROMO_DEFAULT_DAILY_LIMIT, expiresAt: toIso(c.expiresAt), createdAt: toIso(c.createdAt) });
  });
  codes.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return {
    days,
    totals: {
      visits: visitsSnap.size,
      uniqueEmails: emails.size,
      queries: Object.values(byHolder).reduce((sum, n) => sum + n, 0)
    },
    visitsByDay: byDay,
    queriesByDay,
    countries: sortDesc(byCountry).slice(0, 15),
    methods: sortDesc(byMethod),
    topUsers: sortDesc(byHolder).slice(0, 20),
    recent,
    codes
  };
}

async function saveCode(body, adminUser) {
  const id = cleanCode(body.code).toUpperCase().replace(/\s+/g, "-");
  if (!/^[A-Z0-9-]{4,40}$/.test(id)) throw Object.assign(new Error("El código debe tener de 4 a 40 letras, números o guiones."), { status: 400 });
  if (id === cleanCode(process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026").toUpperCase()) throw Object.assign(new Error("Ese código está reservado."), { status: 400 });
  const ref = db.collection("promoCodes").doc(id);
  const existing = await ref.get();
  const data = {
    label: cleanText(body.label, 120),
    active: body.active !== false,
    maxUses: body.maxUses ? Math.max(1, Math.floor(Number(body.maxUses))) : null,
    dailyLimit: body.dailyLimit ? Math.max(1, Math.floor(Number(body.dailyLimit))) : PROMO_DEFAULT_DAILY_LIMIT,
    expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T23:59:59-06:00`) : null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUser.email
  };
  if (!existing.exists) Object.assign(data, { uses: 0, createdAt: FieldValue.serverTimestamp(), createdBy: adminUser.email });
  await ref.set(data, { merge: true });
  return id;
}

// ---------- Registro en Google Sheets (Apps Script) ----------
// SHEETS_WEBHOOK_URL se configura en functions/.env. SHEETS_WEBHOOK_TOKEN va en Secret Manager
// (firebase functions:secrets:set SHEETS_WEBHOOK_TOKEN). Si falta la URL, no se envía nada.
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

// Una consulta que no llegó a entregarse se devuelve en todos los contadores
// que la registraron: el del ciclo y, si aplica, el del día.
// La resta vive en quota.js para no tener dos implementaciones del mismo descuento.
async function refundQuota(refs) {
  await refundUsage([].concat(refs || []).filter(Boolean), FieldValue.increment);
}

// Consulta a Mercado Pago usada para revalidar una suscripción guardada.
// Se carga de forma diferida para no acoplar el arranque de este módulo.
async function verifyPreapproval(preapprovalId) {
  const { fetchPreapproval } = require("./billing");
  return fetchPreapproval(preapprovalId);
}

// Derecho de uso de una cuenta: plan resuelto en el servidor a partir del uid.
async function entitlementFor(user) {
  return resolveEntitlement({
    db,
    uid: user.uid,
    freeDaily: DAILY_QUERY_LIMIT,
    verifyPreapproval
  });
}

// Estado de cuota para mostrar, sin consumir.
async function accountQuota(user) {
  const entitlement = await entitlementFor(user);
  const quota = await readUsage({ db, holder: user.email, uid: user.uid, entitlement });
  return { quota, plan: entitlement.planId, planName: entitlement.planName };
}


exports.api = onRequest(runtimeOptions, async (request, response) => {
  const origin = request.get("origin");
  if (allowedOrigins.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
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

    if (path === "/config" && request.method === "GET") {
      sendJson(response, 200, { appCheckSiteKey: process.env.APPCHECK_SITE_KEY || "", dailyLimit: DAILY_QUERY_LIMIT });
      return;
    }

    if ((path === "/session" || path === "/chat") && request.method === "POST") {
      if (!(await appCheckOk(request))) {
        sendJson(response, 401, { ok: false, error: "App verification failed.", code: "APP_CHECK" });
        return;
      }
      const limitedKind = path === "/chat" ? "chat" : (request.body?.authType === "email" ? null : "session");
      if (limitedKind && await rateLimited(request, limitedKind)) {
        sendJson(response, 429, { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", code: "RATE_LIMIT" });
        return;
      }
    }

    if (path.startsWith("/admin/")) {
      const adminUser = await requireAdmin(request);
      if (!adminUser) {
        sendJson(response, 403, { error: "Solo administradores." });
        return;
      }
      if (path === "/admin/stats" && request.method === "GET") {
        const days = Math.min(Math.max(Number(request.query?.days || 30), 1), 180);
        sendJson(response, 200, await adminStats(days));
        return;
      }
      if (path === "/admin/codes" && request.method === "POST") {
        try {
          const code = await saveCode(request.body || {}, adminUser);
          sendJson(response, 200, { ok: true, code });
        } catch (error) {
          sendJson(response, error.status || 500, { error: error.message });
        }
        return;
      }
    }

    if (path === "/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, service: "allais-api", version: "2026-10-15-streaming-codes-appcheck" });
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
        const account = await accountQuota(user);
        sendJson(response, 200, { ok: true, authType: "email", email: user.email, ...account });
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

      // El código maestro no tiene límite; las cuentas y los códigos promocionales sí.
      //
      // La cuenta con suscripción usa el cupo de su plan. El plan se resuelve en el
      // servidor a partir del uid del token: nunca se toma de la petición, porque el
      // navegador podría declarar cualquier plan.
      let quotaRef = [];
      let quota = null;
      if (emailUser) {
        const entitlement = await entitlementFor(emailUser);
        const consumed = await consumeUsage({
          db,
          holder: emailUser.email,
          uid: emailUser.uid,
          entitlement
        });
        if (!consumed.ok) {
          const monthly = consumed.blockedBy === "monthly";
          sendJson(response, 429, {
            error: monthly ? "Monthly query limit reached." : "Daily query limit reached.",
            code: monthly ? "MONTHLY_LIMIT" : "DAILY_LIMIT",
            plan: entitlement.planId,
            quota: consumed.quota
          });
          return;
        }
        quotaRef = consumed.refs;
        quota = consumed.quota;
      } else if (codeAccess.limit) {
        const consumed = await consumeQuota(`code:${codeAccess.code}`, codeAccess.limit);
        if (!consumed.ok) {
          sendJson(response, 429, { error: "Daily query limit reached.", code: "DAILY_LIMIT", quota: consumed.quota });
          return;
        }
        quotaRef = [consumed.ref];
        quota = consumed.quota;
      }

      const startedAt = Date.now();
      const payload = { prompt, system, temperature, history, documentRequest, documentTransform, webSearch, attachments };

      // Respuesta en tiempo real: líneas JSON (NDJSON) con fragmentos de texto y un cierre con metadatos.
      if (request.body?.stream === true) {
        response.status(200).set({
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no"
        });
        if (typeof response.flushHeaders === "function") response.flushHeaders();
        const writeLine = (event) => response.write(`${JSON.stringify(event)}\n`);
        let streamed = false;
        try {
          const result = await callProvider(provider, {
            ...payload,
            onDelta: (text) => {
              streamed = true;
              writeLine({ t: "delta", text });
            }
          });
          if (!streamed && result.text) writeLine({ t: "delta", text: result.text });
          writeLine({ t: "done", provider, model: result.rawModel, answer: result.text, sources: result.sources || [], elapsedMs: Date.now() - startedAt, ...(quota ? { quota } : {}) });
          await logToSheet("consulta", { email: emailUser?.email || "", codigo: codeAccess?.code || "", modelo: provider, resultado: "ok", restantes: quota ? quota.remaining : "" });
        } catch (error) {
          console.error("AllAIs stream error", { provider, message: error?.message });
          await refundQuota(quotaRef);
          if (quota) quota.remaining += 1;
          writeLine({ t: "error", error: error?.message || "No se pudo completar la consulta.", ...(quota ? { quota } : {}) });
          await logToSheet("consulta", { email: emailUser?.email || "", codigo: codeAccess?.code || "", modelo: provider, resultado: "error", detalle: cleanText(error?.message, 200) });
        }
        response.end();
        return;
      }

      let result;
      try {
        result = await callProvider(provider, payload);
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

// Cobros con Mercado Pago (módulo independiente).
exports.billing = require("./billing").billing;
