// Suscripciones de AllAIs con Mercado Pago. Solo interfaz: el cobro y el estado viven en la función /billing.
// Los montos mostrados deben coincidir con las variables MP_PRICE_* de functions/.env; el servidor es quien cobra.
const PLANS = [
  { id: "lanzamiento", name: "Lanzamiento", price: 99 },
  { id: "profesional_1", name: "Profesional 1", price: 199 },
  { id: "profesional_2", name: "Profesional 2", price: 299 },
  { id: "profesional_3", name: "Profesional 3", price: 399 }
];

const STATUS_TEXT = {
  none: "Sin suscripción",
  pending: "Pendiente: confirma tu tarjeta para activar la prueba",
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
  unknown: "Estado en revisión"
};

function node(tag, attrs = {}, text = "") {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "style") Object.assign(element.style, value);
    else element.setAttribute(key, value);
  }
  if (text) element.textContent = text;
  return element;
}

async function billingRequest(path, options = {}) {
  const token = await window.AllAIsAuth.idToken();
  const response = await fetch(`/billing${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function mount() {
  const anchor = document.querySelector(".panel-account");
  if (!anchor || document.getElementById("billingPanel")) return;

  const panel = node("section", { id: "billingPanel", class: "panel panel-billing", "aria-label": "Suscripción" });
  const title = node("h2", { style: { margin: "0 0 6px", fontSize: "1.05rem" } }, "Suscripción");
  const status = node("p", { id: "billingStatus", style: { margin: "0 0 10px", opacity: "0.85" } }, "");
  const message = node("p", { id: "billingMessage", role: "status", style: { margin: "8px 0 0", color: "#b42318", minHeight: "1em" } }, "");
  const grid = node("div", { style: { display: "grid", gap: "8px" } });

  for (const plan of PLANS) {
    const button = node("button", { type: "button", "data-plan": plan.id, class: "billing-plan" }, `${plan.name} · $${plan.price} MXN/mes`);
    button.style.cssText = "padding:10px 12px;border-radius:10px;cursor:pointer;text-align:left;";
    button.addEventListener("click", () => subscribe(plan.id, button));
    grid.append(button);
  }

  const note = node("p", { style: { margin: "10px 0 0", fontSize: "0.85rem", opacity: "0.75" } },
    "3 días de prueba gratuita. Tu primer cobro será al cuarto día y después cada mes.");

  panel.append(title, status, grid, note, message);
  anchor.after(panel);
  refresh();
}

function setMessage(text) {
  const message = document.getElementById("billingMessage");
  if (message) message.textContent = text || "";
}

async function refresh() {
  const statusEl = document.getElementById("billingStatus");
  const buttons = document.querySelectorAll(".billing-plan");
  if (!statusEl) return;

  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    statusEl.textContent = "Inicia sesión para suscribirte.";
    buttons.forEach((b) => { b.disabled = false; });
    return;
  }

  try {
    const data = await billingRequest("/status");
    const label = STATUS_TEXT[data.status] || STATUS_TEXT.unknown;
    const trial = data.trialEndsAt ? ` · cobro desde ${formatDate(data.trialEndsAt)}` : "";
    statusEl.textContent = `${label}${trial}`;
    // Con una suscripción activa o pendiente no se permite contratar otra.
    const blocked = data.status === "active" || data.status === "pending";
    buttons.forEach((b) => { b.disabled = blocked; });
  } catch (error) {
    statusEl.textContent = "No pudimos cargar tu suscripción.";
    setMessage(error.message);
  }
}

async function subscribe(planId, button) {
  setMessage("");
  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    document.getElementById("accountButton")?.click();
    setMessage("Inicia sesión para suscribirte.");
    return;
  }
  button.disabled = true;
  try {
    const data = await billingRequest("/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: planId })
    });
    if (!data.initPoint) throw new Error("Mercado Pago no devolvió el enlace de pago.");
    window.location.href = data.initPoint;
  } catch (error) {
    setMessage(error.message);
    button.disabled = false;
  }
}

// Al volver de Mercado Pago (back_url), se consulta el estado otra vez.
function handleReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") !== "retorno") return;
  window.history.replaceState(null, "", window.location.pathname);
  refresh();
}

// Si cambia la sesión (inicio o cierre), se actualiza el panel.
let lastUid = null;
async function watchSession() {
  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  const uid = user ? user.uid : null;
  if (uid !== lastUid) {
    lastUid = uid;
    refresh();
  }
}

function start() {
  mount();
  handleReturn();
  watchSession();
  setInterval(watchSession, 3000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
