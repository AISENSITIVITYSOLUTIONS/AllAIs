// Correos de campaña a las cuentas registradas (Ola 1 de ALLAIS_16).
//
// Reglas:
//   - Inerte sin SMTP configurado (SMTP_HOST, SMTP_USER, SMTP_PASS en functions/.env).
//   - Cada destinatario recibe cada plantilla una sola vez (mailing/<id>.sent.<plantilla>).
//   - Todo correo lleva enlace de baja de un clic; quien se da de baja no vuelve a
//     recibir ninguno (mailing/<id>.optOut).
//   - No se escribe a administradores ni a quien ya tiene suscripción activa o pendiente.
//   - Envío por lotes: el llamador decide cuántos por llamada, para respetar el
//     límite diario del proveedor de correo.
//
// La selección de destinatarios y las plantillas son lógica pura, probada aparte.

const crypto = require("node:crypto");

const { LAUNCH_TRIAL_ENDS_AT, PROMO_ENDS_AT } = require("./plans");

const SITE = "https://allais.nni.ai";
const COLLECTION = "mailing";

function mailingId(email) {
  return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 40);
}

function isConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function link(campaign) {
  return `${SITE}/?plan=lanzamiento&utm_source=correo&utm_medium=email&utm_campaign=${campaign}`;
}

const seatsLine = (left) => (Number.isFinite(left) && left > 0
  ? (left === 1 ? "Queda 1 lugar de 100." : `Quedan ${left} lugares de 100.`)
  : "Son 100 lugares.");

// Cada plantilla: asunto, párrafos y texto del botón. `left` = lugares de fundador libres.
const TEMPLATES = {
  aviso_limite: {
    label: "1 · Cambio en el acceso gratuito + últimas horas de noviembre",
    until: LAUNCH_TRIAL_ENDS_AT, // habla de la oferta de noviembre: no se envía después
    subject: "Cambia tu acceso gratuito a AllAIs",
    cta: "Activar mi prueba sin cobro",
    paragraphs: () => [
      "Te registraste en AllAIs, la plataforma que envía una misma pregunta a ChatGPT, Claude, Gemini y DeepSeek y te muestra las cuatro respuestas lado a lado.",
      "Te avisamos de un cambio: el acceso gratuito ahora incluye 12 consultas de cortesía. Al agotarlas, la cuenta gratuita queda en 2 consultas al día.",
      "Si quieres seguir comparando modelos sin ese límite, hasta el 30 de noviembre puedes activar el plan de $99 MXN al mes (en lugar de $199) registrando tu tarjeta: no se cobra nada hasta el 1 de diciembre y cancelas cuando quieras."
    ]
  },
  fundador_abre: {
    label: "2 · Abre Precio fundador",
    from: LAUNCH_TRIAL_ENDS_AT, until: PROMO_ENDS_AT,
    subject: "Precio fundador de AllAIs: $99 al mes, 100 lugares",
    cta: "Quiero mi lugar de fundador",
    paragraphs: ({ left }) => [
      "Abrimos el Precio fundador de AllAIs: $99 MXN al mes, en lugar de $199, para los primeros 100 suscriptores. El precio se conserva mientras mantengas tu suscripción.",
      `${seatsLine(left)} La oferta cierra al ocuparse los lugares o el 31 de diciembre de 2026, lo que ocurra primero.`,
      "Incluye 300 consultas al mes con ChatGPT, Claude, Gemini y DeepSeek, y 10 imágenes. Los primeros 3 días son de prueba: registras tu tarjeta con Mercado Pago, no se cobra nada hoy y puedes cancelar sin cargo."
    ]
  },
  fundador_quedan: {
    label: "3 · Quedan N lugares",
    from: LAUNCH_TRIAL_ENDS_AT, until: PROMO_ENDS_AT,
    subject: "Precio fundador de AllAIs: lugares disponibles",
    cta: "Tomar mi lugar",
    paragraphs: ({ left }) => [
      `${seatsLine(left)} Después, el plan más económico de AllAIs será de $199 MXN al mes.`,
      "Con el Precio fundador pagas $99 MXN al mes por usar ChatGPT, Claude, Gemini y DeepSeek en un solo lugar y comparar sus respuestas antes de decidir.",
      "Tienes 3 días de prueba: registras tu tarjeta, no se cobra nada hoy y cancelas cuando quieras."
    ]
  }
};

function render(templateId, { unsubscribeUrl, left = null } = {}) {
  const template = TEMPLATES[templateId];
  if (!template) throw Object.assign(new Error("Plantilla no válida."), { status: 400 });
  const paragraphs = template.paragraphs({ left });
  const url = link(templateId);
  const footer = "Recibes este mensaje porque te registraste en AllAIs (allais.nni.ai), de AI Sensitivity Solutions, S.A.S. de C.V.";
  const text = [
    "Hola:", "", ...paragraphs.flatMap((p) => [p, ""]),
    `${template.cta}: ${url}`, "",
    "Felipe de Alba", "AllAIs · NNI – Neural Network Initiative", "",
    footer, `Si no deseas recibir más correos de AllAIs, date de baja aquí: ${unsubscribeUrl}`
  ].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#1c2536">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px">
<tr><td style="padding:20px 26px 6px;font-size:18px;font-weight:bold;color:#0a1628">AllAIs</td></tr>
<tr><td style="padding:0 26px;font-size:15px;line-height:1.55"><p>Hola:</p>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
<p style="margin:22px 0"><a href="${url}" style="background:#0a1628;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;display:inline-block">${escapeHtml(template.cta)}</a></p>
<p>Felipe de Alba<br>AllAIs · NNI – Neural Network Initiative</p></td></tr>
<tr><td style="padding:14px 26px 20px;font-size:12px;line-height:1.5;color:#6b7689;border-top:1px solid #e6eaf0">${escapeHtml(footer)}<br>
Si no deseas recibir más correos de AllAIs, <a href="${unsubscribeUrl}" style="color:#6b7689">date de baja aquí</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: template.subject, text, html };
}

/**
 * Decide a quién se le escribe. Lógica pura.
 * @param {string[]} emails       Correos registrados.
 * @param {object}   exclusions   admins:Set, subscribers:Set, state:Map<id,{optOut,sent}>.
 */
function selectRecipients(emails, { templateId, admins = new Set(), subscribers = new Set(), state = new Map(), limit = 50 }) {
  const seen = new Set();
  const skipped = { invalid: 0, admin: 0, subscriber: 0, optOut: 0, alreadySent: 0 };
  const pending = [];
  for (const raw of emails) {
    const email = String(raw || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || seen.has(email)) { if (!seen.has(email)) skipped.invalid += 1; continue; }
    seen.add(email);
    if (admins.has(email)) { skipped.admin += 1; continue; }
    if (subscribers.has(email)) { skipped.subscriber += 1; continue; }
    const record = state.get(mailingId(email));
    if (record?.optOut) { skipped.optOut += 1; continue; }
    if (record?.sent && record.sent[templateId]) { skipped.alreadySent += 1; continue; }
    pending.push(email);
  }
  return { batch: pending.slice(0, Math.max(0, limit)), pending: pending.length, skipped, total: seen.size };
}

function unsubscribeUrl(token) {
  return `${SITE}/api/baja?u=${token}`;
}

function transportFromEnv(env = process.env) {
  const nodemailer = require("nodemailer");
  const port = Number(env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
}

/**
 * Ejecuta una campaña. dryRun (por defecto) no envía ni escribe nada: solo cuenta.
 * testTo envía una sola prueba a ese correo, sin registrar el envío.
 */
async function runCampaign({ db, templateId, dryRun = true, limit = 50, testTo = null, left = null, admins = [], env = process.env, transport = null, now = new Date() }) {
  const template = TEMPLATES[templateId];
  if (!template) throw Object.assign(new Error("Plantilla no válida."), { status: 400 });
  // Cada plantilla habla de una oferta con fecha: fuera de su ventana no se envía.
  const outOfWindow = (template.from && now.getTime() < template.from) || (template.until && now.getTime() >= template.until);
  if (outOfWindow && !dryRun) {
    throw Object.assign(new Error("Esta plantilla está fuera de su fecha de envío."), { status: 409 });
  }
  const from = env.MAIL_FROM || (env.SMTP_USER ? `AllAIs <${env.SMTP_USER}>` : "");
  const needTransport = Boolean(testTo) || !dryRun;
  if (needTransport && !transport && !isConfigured(env)) {
    throw Object.assign(new Error("Falta configurar el correo saliente (SMTP_HOST, SMTP_USER, SMTP_PASS)."), { status: 503 });
  }
  const mailer = needTransport ? (transport || transportFromEnv(env)) : null;

  if (testTo) {
    const mail = render(templateId, { unsubscribeUrl: unsubscribeUrl("prueba"), left });
    await mailer.sendMail({ from, to: testTo, subject: `[Prueba] ${mail.subject}`, text: mail.text, html: mail.html });
    return { ok: true, test: true, to: testTo };
  }

  const [visitors, subscriptions, mailing] = await Promise.all([
    db.collection("visitors").get(),
    db.collection("subscriptions").get(),
    db.collection(COLLECTION).get()
  ]);
  const emails = [];
  visitors.forEach((doc) => emails.push(doc.get("email") || doc.id));
  const subscribers = new Set();
  subscriptions.forEach((doc) => {
    if (["active", "pending"].includes(doc.get("status")) && doc.get("email")) subscribers.add(String(doc.get("email")).toLowerCase());
  });
  const state = new Map();
  mailing.forEach((doc) => state.set(doc.id, doc.data() || {}));

  const cap = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 100);
  const selection = selectRecipients(emails, { templateId, admins: new Set(admins.map((a) => a.toLowerCase())), subscribers, state, limit: cap });
  const summary = { ok: true, template: templateId, dryRun, inWindow: !outOfWindow, configured: Boolean(transport) || isConfigured(env), total: selection.total, pending: selection.pending, skipped: selection.skipped };
  if (dryRun) return { ...summary, wouldSend: selection.batch.length, preview: render(templateId, { unsubscribeUrl: unsubscribeUrl("vista-previa"), left }) };

  let sent = 0;
  const failed = [];
  for (const email of selection.batch) {
    const id = mailingId(email);
    const ref = db.collection(COLLECTION).doc(id);
    const token = state.get(id)?.token || crypto.randomUUID().replace(/-/g, "");
    const url = unsubscribeUrl(token);
    const mail = render(templateId, { unsubscribeUrl: url, left });
    try {
      // Se guarda el token antes de enviar: el enlace de baja debe funcionar siempre.
      await ref.set({ email, token }, { merge: true });
      await mailer.sendMail({
        from, to: email, subject: mail.subject, text: mail.text, html: mail.html,
        headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      });
      await ref.set({ sent: { [templateId]: now.toISOString() } }, { merge: true });
      sent += 1;
    } catch (error) {
      failed.push({ email, error: String(error?.message || error).slice(0, 160) });
      // Un rechazo del proveedor (límite alcanzado) suele repetirse: se detiene el lote.
      if (failed.length >= 3) break;
    }
  }
  return { ...summary, sent, failed, remaining: selection.pending - sent };
}

// Baja de un clic. Devuelve true si el token correspondía a un destinatario.
async function unsubscribe({ db, token, now = new Date() }) {
  const clean = String(token || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (clean.length < 16) return false;
  const snapshot = await db.collection(COLLECTION).where("token", "==", clean).limit(1).get();
  if (snapshot.empty) return false;
  await snapshot.docs[0].ref.set({ optOut: true, optOutAt: now.toISOString() }, { merge: true });
  return true;
}

function unsubscribePage(done) {
  const message = done
    ? "Listo. No recibirás más correos de AllAIs."
    : "No encontramos ese enlace de baja. Escríbenos a fdealbam@nni.ai y te damos de baja.";
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AllAIs · Baja de correos</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0a1628;color:#e6eefa;font-family:system-ui,Arial,sans-serif"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">AllAIs</h1><p>${message}</p><p><a href="${SITE}" style="color:#93c5fd">Volver a AllAIs</a></p></main></body></html>`;
}

module.exports = { TEMPLATES, COLLECTION, mailingId, isConfigured, render, selectRecipients, runCampaign, unsubscribe, unsubscribePage, unsubscribeUrl };
