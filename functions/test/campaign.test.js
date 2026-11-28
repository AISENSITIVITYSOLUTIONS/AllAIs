// Pruebas de los correos de campaña: a quién se escribe, una sola vez por
// plantilla, baja de un clic y ventanas de fecha de cada plantilla.

const test = require("node:test");
const assert = require("node:assert/strict");
const { TEMPLATES, mailingId, render, selectRecipients, runCampaign, unsubscribe } = require("../campaign");

// Firestore mínimo: colecciones en memoria con get(), doc().set(merge) y where(==).
function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  const col = (name) => { if (!data.has(name)) data.set(name, new Map()); return data.get(name); };
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v;
    return out;
  };
  const snap = (name, id) => ({ id, data: () => col(name).get(id), get: (f) => col(name).get(id)?.[f], ref: { set: async (v) => col(name).set(id, merge(col(name).get(id) || {}, v)) } });
  const list = (name, ids) => ({ empty: !ids.length, docs: ids.map((id) => snap(name, id)), forEach: (fn) => ids.forEach((id) => fn(snap(name, id))) });
  return {
    data,
    collection: (name) => ({
      get: async () => list(name, [...col(name).keys()]),
      doc: (id) => snap(name, id).ref,
      where: (field, _op, value) => ({ limit: () => ({ get: async () => list(name, [...col(name).keys()].filter((id) => col(name).get(id)[field] === value)) }) })
    })
  };
}

const ENV = { SMTP_HOST: "smtp.example.com", SMTP_USER: "hola@nni.ai", SMTP_PASS: "x" };
const NOV = new Date("2026-11-28T18:00:00Z");
const DIC = new Date("2026-12-02T18:00:00Z");

function escenario() {
  const db = fakeDb({
    visitors: { "ana@example.com": { email: "ana@example.com" }, "beto@example.com": { email: "beto@example.com" }, "paga@example.com": { email: "paga@example.com" }, "fdealbam@nni.ai": { email: "fdealbam@nni.ai" }, "baja@example.com": { email: "baja@example.com" } },
    subscriptions: { u9: { email: "paga@example.com", status: "active" } },
    mailing: { [mailingId("baja@example.com")]: { email: "baja@example.com", token: "a".repeat(32), optOut: true } }
  });
  const outbox = [];
  const transport = { sendMail: async (mail) => { outbox.push(mail); } };
  return { db, outbox, transport };
}

test("no se escribe a administradores, suscriptores ni a quien se dio de baja", () => {
  const r = selectRecipients(["Ana@Example.com", "ana@example.com", "admin@nni.ai", "paga@example.com", "baja@example.com", "sin-arroba"], {
    templateId: "aviso_limite",
    admins: new Set(["admin@nni.ai"]),
    subscribers: new Set(["paga@example.com"]),
    state: new Map([[mailingId("baja@example.com"), { optOut: true }]])
  });
  assert.deepEqual(r.batch, ["ana@example.com"]);
  assert.deepEqual(r.skipped, { invalid: 1, admin: 1, subscriber: 1, optOut: 1, alreadySent: 0 });
});

test("la simulación no envía ni escribe nada y devuelve la vista previa", async () => {
  const { db, outbox, transport } = escenario();
  const r = await runCampaign({ db, templateId: "aviso_limite", admins: ["fdealbam@nni.ai"], env: ENV, transport, now: NOV });
  assert.equal(r.dryRun, true);
  assert.equal(r.wouldSend, 2);
  assert.equal(outbox.length, 0);
  assert.equal(db.data.get("mailing").size, 1);
  assert.match(r.preview.text, /date de baja aquí/);
});

test("el envío real llega una sola vez por plantilla y lleva baja de un clic", async () => {
  const { db, outbox, transport } = escenario();
  const r = await runCampaign({ db, templateId: "aviso_limite", dryRun: false, admins: ["fdealbam@nni.ai"], env: ENV, transport, now: NOV });
  assert.equal(r.sent, 2);
  assert.deepEqual(outbox.map((m) => m.to).sort(), ["ana@example.com", "beto@example.com"]);
  for (const mail of outbox) {
    assert.match(mail.headers["List-Unsubscribe"], /^<https:\/\/allais\.nni\.ai\/api\/baja\?u=[a-f0-9]{32}>$/);
    assert.ok(mail.html.includes("date de baja aquí"));
    assert.ok(!mail.headers["List-Unsubscribe"].includes("@"), "el enlace no expone el correo");
  }
  const otra = await runCampaign({ db, templateId: "aviso_limite", dryRun: false, admins: ["fdealbam@nni.ai"], env: ENV, transport, now: NOV });
  assert.equal(otra.sent, 0);
  assert.equal(otra.skipped.alreadySent, 2);
  assert.equal(outbox.length, 2);
});

test("la baja detiene todos los correos siguientes", async () => {
  const { db, outbox, transport } = escenario();
  await runCampaign({ db, templateId: "aviso_limite", dryRun: false, env: ENV, transport, now: NOV, admins: ["fdealbam@nni.ai"] });
  const token = db.data.get("mailing").get(mailingId("ana@example.com")).token;
  assert.equal(await unsubscribe({ db, token }), true);
  assert.equal(await unsubscribe({ db, token: "no-existe" }), false);
  const r = await runCampaign({ db, templateId: "fundador_abre", dryRun: false, env: ENV, transport, now: DIC, admins: ["fdealbam@nni.ai"], left: 97 });
  assert.deepEqual(outbox.slice(2).map((m) => m.to), ["beto@example.com"]);
  assert.equal(r.skipped.optOut, 2);
  assert.match(outbox[2].text, /Quedan 97 lugares de 100/);
});

test("cada plantilla solo se envía dentro de su fecha", async () => {
  const { db, transport } = escenario();
  await assert.rejects(runCampaign({ db, templateId: "aviso_limite", dryRun: false, env: ENV, transport, now: DIC }), /fuera de su fecha/);
  await assert.rejects(runCampaign({ db, templateId: "fundador_abre", dryRun: false, env: ENV, transport, now: NOV }), /fuera de su fecha/);
  const sim = await runCampaign({ db, templateId: "fundador_abre", env: ENV, transport, now: NOV });
  assert.equal(sim.inWindow, false);
});

test("sin correo saliente configurado no se envía; la prueba va solo al administrador", async () => {
  const { db, outbox, transport } = escenario();
  await assert.rejects(runCampaign({ db, templateId: "aviso_limite", dryRun: false, env: {}, now: NOV }), /Falta configurar/);
  const r = await runCampaign({ db, templateId: "aviso_limite", testTo: "fdealbam@nni.ai", env: ENV, transport, now: NOV });
  assert.equal(r.test, true);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].subject, /^\[Prueba\]/);
  assert.equal(db.data.get("mailing").size, 1, "la prueba no registra envíos");
});

test("un rechazo repetido del proveedor detiene el lote", async () => {
  const { db } = escenario();
  let intentos = 0;
  const transport = { sendMail: async () => { intentos += 1; throw new Error("Daily sending quota exceeded"); } };
  const r = await runCampaign({ db, templateId: "aviso_limite", dryRun: false, env: ENV, transport, now: NOV, admins: [] });
  assert.equal(r.sent, 0);
  assert.equal(intentos, 3);
});

test("las tres plantillas se generan en texto y HTML", () => {
  for (const id of Object.keys(TEMPLATES)) {
    const mail = render(id, { unsubscribeUrl: "https://allais.nni.ai/api/baja?u=x", left: 12 });
    assert.ok(mail.subject && mail.text.includes("allais.nni.ai/?plan=lanzamiento") && mail.html.includes("</html>"));
  }
});
