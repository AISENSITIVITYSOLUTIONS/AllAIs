// Suscripciones de AllAIs con Mercado Pago. Solo interfaz: el cobro y el estado viven en la función /billing.
// Los montos mostrados deben coincidir con las variables MP_PRICE_* de functions/.env; el servidor es quien cobra.
const PLANS = [
  { id: "lanzamiento", name: "Lanzamiento", price: 99, note: "Precio de lanzamiento" },
  { id: "profesional_1", name: "Profesional 1", price: 199, note: "" },
  { id: "profesional_2", name: "Profesional 2", price: 299, note: "" },
  { id: "profesional_3", name: "Profesional 3", price: 399, note: "" }
];

const STATUS_TEXT = {
  none: "",
  pending: "Tu suscripción está pendiente. Confirma tu tarjeta para activar la prueba.",
  active: "Tu suscripción está activa.",
  paused: "Tu suscripción está pausada.",
  cancelled: "Tu suscripción fue cancelada.",
  unknown: "Estamos revisando tu suscripción."
};

function node(tag, attrs = {}, text = "") {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
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

let dialog = null;

function buildDialog() {
  dialog = node("dialog", { class: "auth-dialog billing-dialog", id: "billingDialog", "aria-labelledby": "billingTitle" });

  const card = node("div", { class: "auth-card" });
  const close = node("button", { type: "button", class: "icon-button auth-close", "aria-label": "Cerrar" });
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
  close.addEventListener("click", () => dialog.close());

  const title = node("h2", { id: "billingTitle" }, "Suscríbete a AllAIs");
  const intro = node("p", {}, "Elige el plan que mejor te convenga. Tienes 3 días de prueba gratuita y tu primer cobro es al cuarto día.");
  const status = node("p", { id: "billingStatus", role: "status" }, "");
  const list = node("div", { id: "billingPlans", style: "display:grid;gap:10px;margin-top:14px;" });

  for (const plan of PLANS) {
    const button = node("button", { type: "button", class: "google-button billing-plan", "data-plan": plan.id });
    const label = node("span", {}, `${plan.name} · $${plan.price} MXN al mes`);
    button.append(label);
    if (plan.note) button.append(node("small", { style: "display:block;opacity:.7;" }, plan.note));
    button.addEventListener("click", () => subscribe(plan.id, button));
    list.append(button);
  }

  const error = node("p", { id: "billingMessage", role: "alert", style: "color:#b42318;min-height:1em;margin:10px 0 0;" }, "");
  const legal = node("p", { style: "font-size:.8rem;opacity:.7;margin:12px 0 0;" },
    "Los pagos los procesa Mercado Pago. Puedes cancelar cuando quieras.");

  card.append(close, title, intro, status, list, error, legal);
  dialog.append(card);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

function setMessage(text) {
  const message = document.getElementById("billingMessage");
  if (message) message.textContent = text || "";
}

async function refreshStatus() {
  const statusEl = document.getElementById("billingStatus");
  const buttons = document.querySelectorAll(".billing-plan");
  if (!statusEl) return;

  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    statusEl.textContent = "Inicia sesión para elegir un plan.";
    buttons.forEach((b) => { b.disabled = true; });
    return;
  }

  try {
    const data = await billingRequest("/status");
    statusEl.textContent = STATUS_TEXT[data.status] || "";
    const blocked = data.status === "active" || data.status === "pending";
    buttons.forEach((b) => { b.disabled = blocked; });
  } catch (error) {
    statusEl.textContent = "";
    setMessage(error.message);
  }
}

async function subscribe(planId, button) {
  setMessage("");
  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    dialog.close();
    document.getElementById("accountButton")?.click();
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

function mountButton() {
  const anchor = document.querySelector(".panel-account");
  if (!anchor || document.getElementById("billingOpen")) return;
  const open = node("button", { type: "button", id: "billingOpen", class: "account-button billing-open" }, "Suscríbete aquí!");
  open.addEventListener("click", () => {
    dialog.showModal();
    refreshStatus();
  });
  anchor.after(open);
}

// Al volver de Mercado Pago (back_url), se abre el diálogo para mostrar el estado.
function handleReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") !== "retorno") return;
  window.history.replaceState(null, "", window.location.pathname);
  dialog.showModal();
  refreshStatus();
}

function start() {
  buildDialog();
  mountButton();
  handleReturn();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
