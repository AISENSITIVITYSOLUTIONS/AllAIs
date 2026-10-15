// Panel de administración de AllAIs: visitas, consumo y códigos promocionales.
const $ = (selector) => document.querySelector(selector);
const METHOD_NAMES = { google: "Google", email: "Enlace por email", code: "Código maestro", promo: "Código promocional" };
let days = 30;
let lastCodes = [];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtDay = (key) => new Date(`${key}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

async function api(path, options = {}) {
  const token = await window.AllAIsAuth.idToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Error del servidor"), { status: response.status });
  return data;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderBars(target, rows, labelFor = (k) => k) {
  target.replaceChildren();
  if (!rows.length) {
    target.append(el("p", "Sin datos en el periodo.", "empty"));
    return;
  }
  const max = Math.max(...rows.map((r) => r[1]));
  for (const [key, value] of rows) {
    const row = el("div", undefined, "row");
    const label = el("div", undefined, "label");
    label.style.setProperty("--w", `${Math.max(4, (value / max) * 100)}%`);
    label.append(el("span", labelFor(key)));
    label.title = labelFor(key);
    row.append(label, el("span", String(value), "n"));
    target.append(row);
  }
}

function renderChart(visitsByDay, queriesByDay) {
  const chart = $("#chart");
  chart.replaceChildren();
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 864e5);
    keys.push(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d));
  }
  const max = Math.max(1, ...keys.map((k) => Math.max(visitsByDay[k] || 0, queriesByDay[k] || 0)));
  for (const key of keys) {
    const v = visitsByDay[key] || 0;
    const q = queriesByDay[key] || 0;
    const a = el("div");
    a.style.height = `${(v / max) * 100}%`;
    a.title = `${fmtDay(key)}: ${v} visitas`;
    const b = el("div", undefined, "q");
    b.style.height = `${(q / max) * 100}%`;
    b.title = `${fmtDay(key)}: ${q} consultas`;
    chart.append(a, b);
  }
  $("#axisStart").textContent = fmtDay(keys[0]);
  $("#axisEnd").textContent = fmtDay(keys[keys.length - 1]);
}

function renderCodes(codes) {
  lastCodes = codes;
  const body = $("#codes");
  body.replaceChildren();
  if (!codes.length) {
    const tr = el("tr");
    const td = el("td", "Aún no hay códigos promocionales.", "empty");
    td.colSpan = 7;
    tr.append(td);
    body.append(tr);
    return;
  }
  for (const c of codes) {
    const tr = el("tr");
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const status = el("span", !c.active ? "Inactivo" : expired ? "Caducado" : "Activo", `pill ${c.active && !expired ? "on" : "off"}`);
    const toggle = el("button", c.active ? "Desactivar" : "Activar", "btn");
    toggle.type = "button";
    toggle.addEventListener("click", () => saveCode({ ...c, expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "", active: !c.active }));
    const cells = [
      el("td", c.code),
      el("td", c.label || "—"),
      el("td"),
      el("td", c.maxUses ? `${c.uses} / ${c.maxUses}` : `${c.uses}`, "num"),
      el("td", String(c.dailyLimit), "num"),
      el("td", c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("es-MX") : "Sin fecha"),
      el("td")
    ];
    cells[2].append(status);
    cells[6].append(toggle);
    tr.append(...cells);
    body.append(tr);
  }
}

function renderRecent(rows) {
  const body = $("#recent");
  body.replaceChildren();
  for (const r of rows) {
    const tr = el("tr");
    tr.append(
      el("td", fmtDate(r.at)),
      el("td", r.email || r.code || "—"),
      el("td", METHOD_NAMES[r.method] || r.method),
      el("td", [r.city, r.country].filter(Boolean).join(", ") || "Sin dato")
    );
    body.append(tr);
  }
}

async function load() {
  const data = await api(`/admin/stats?days=${days}`);
  $("#kVisits").textContent = data.totals.visits;
  $("#kPeople").textContent = data.totals.uniqueEmails;
  $("#kQueries").textContent = data.totals.queries;
  renderChart(data.visitsByDay, data.queriesByDay);
  renderBars($("#countries"), data.countries);
  renderBars($("#methods"), data.methods, (k) => METHOD_NAMES[k] || k);
  renderBars($("#topUsers"), data.topUsers, (k) => (k.startsWith("code:") ? `Código ${k.slice(5)}` : k));
  renderCodes(data.codes);
  renderRecent(data.recent);
}

async function saveCode(values) {
  $("#codeMsg").textContent = "Guardando…";
  try {
    const result = await api("/admin/codes", { method: "POST", body: JSON.stringify(values) });
    $("#codeMsg").textContent = `Código ${result.code} guardado.`;
    await load();
  } catch (error) {
    $("#codeMsg").textContent = error.message;
  }
}

async function enter() {
  const user = await window.AllAIsAuth.currentUser();
  if (!user) {
    $("#gate").hidden = false;
    $("#panel").hidden = true;
    $("#period").hidden = true;
    $("#signOut").hidden = true;
    return;
  }
  try {
    await load();
    $("#who").textContent = `Sesión: ${user.email}`;
    $("#gate").hidden = true;
    $("#panel").hidden = false;
    $("#period").hidden = false;
    $("#signOut").hidden = false;
  } catch (error) {
    $("#gate").hidden = false;
    $("#gateMsg").textContent = error.status === 403 ? `La cuenta ${user.email} no tiene acceso al panel.` : error.message;
    $("#signOut").hidden = false;
  }
}

$("#signIn").addEventListener("click", async () => {
  $("#gateMsg").textContent = "";
  try {
    await window.AllAIsAuth.signInWithGoogle("es");
    await enter();
  } catch {
    $("#gateMsg").textContent = "No se pudo iniciar sesión con Google.";
  }
});

$("#signOut").addEventListener("click", async () => {
  await window.AllAIsAuth.signOut();
  $("#gateMsg").textContent = "";
  await enter();
});

$("#period").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-days]");
  if (!button) return;
  days = Number(button.dataset.days);
  document.querySelectorAll("#period button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  await load();
});

$("#randomCode").addEventListener("click", () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  $("#codeForm").code.value = `${code.slice(0, 4)}-${code.slice(4)}`;
});

$("#codeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  await saveCode({
    code: form.code.value,
    label: form.label.value,
    maxUses: form.maxUses.value,
    dailyLimit: form.dailyLimit.value,
    expiresAt: form.expiresAt.value,
    active: form.active.checked
  });
  form.reset();
  form.dailyLimit.value = 50;
});

enter();
