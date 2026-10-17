// Suscripciones de AllAIs con Mercado Pago. Solo interfaz: el cobro y el estado viven en la función /billing.
// Los montos mostrados deben coincidir con las variables MP_PRICE_* de functions/.env; el servidor es quien cobra.
const PLANS = [
  { id: "lanzamiento", name: "Lanzamiento", price: 99, badge: "Precio de lanzamiento" },
  { id: "profesional_1", name: "Profesional 1", price: 199, badge: "" },
  { id: "profesional_2", name: "Profesional 2", price: 299, badge: "Recomendado" },
  { id: "profesional_3", name: "Profesional 3", price: 399, badge: "" }
];

const STATUS_TEXT = {
  none: "",
  pending: "Tu suscripción está pendiente. Confirma tu tarjeta para activar la prueba.",
  active: "Tu suscripción está activa.",
  paused: "Tu suscripción está pausada.",
  cancelled: "Tu suscripción fue cancelada.",
  unknown: "Estamos revisando tu suscripción."
};

const STYLES = `
.billing-cta {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: var(--radius-m);
  background: linear-gradient(120deg, #176b87, #2aa9c9, #17324d, #176b87);
  background-size: 300% 300%;
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: .01em;
  cursor: pointer;
  box-shadow: 0 10px 28px -10px rgba(42, 169, 201, .65);
  animation: billingFlow 6s ease infinite, billingPulse 2.4s ease-in-out infinite;
}
.billing-cta::after {
  content: "";
  position: absolute;
  top: 0; left: -75%;
  width: 50%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent);
  transform: skewX(-20deg);
  animation: billingShine 2.8s ease-in-out infinite;
}
.billing-cta:hover { transform: translateY(-1px); }
.billing-cta:focus-visible { outline: 3px solid var(--accent-ring); outline-offset: 3px; }
@keyframes billingFlow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes billingPulse {
  0%,100% { box-shadow: 0 10px 28px -10px rgba(42,169,201,.65), 0 0 0 0 rgba(42,169,201,.45); }
  50% { box-shadow: 0 12px 34px -8px rgba(42,169,201,.9), 0 0 0 8px rgba(42,169,201,0); }
}
@keyframes billingShine { 0%{left:-75%} 60%,100%{left:125%} }

.billing-dialog .auth-card {
  width: min(460px, 92vw);
  padding: 28px 26px 22px;
  border-radius: var(--radius-l);
  background:
    radial-gradient(120% 80% at 0% 0%, rgba(42,169,201,.22), transparent 55%),
    radial-gradient(120% 80% at 100% 100%, rgba(23,50,77,.25), transparent 60%),
    var(--surface);
  box-shadow: var(--shadow-menu);
}
.billing-dialog h2 {
  margin: 0 36px 6px 0;
  font-family: var(--font-read);
  font-size: 1.7rem;
  line-height: 1.15;
  color: var(--ink);
}
.billing-dialog .billing-intro { margin: 0; color: var(--ink-2); line-height: 1.5; font-size: .95rem; }
.billing-dialog .billing-status { min-height: 1.2em; margin: 10px 0 0; color: var(--accent); font-weight: 600; font-size: .9rem; }
.billing-plans { display: grid; gap: 10px; margin-top: 16px; }
.billing-plan {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  background: var(--surface-2);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.billing-plan:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 12px 24px -14px rgba(23,107,135,.55);
  background: var(--accent-soft);
}
.billing-plan:disabled { opacity: .5; cursor: not-allowed; }
.billing-plan:focus-visible { outline: 3px solid var(--accent-ring); outline-offset: 2px; }
.billing-plan .plan-name { display: block; font-weight: 700; font-size: 1rem; }
.billing-plan .plan-badge {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .02em;
}
.billing-plan .plan-price { font-size: 1.35rem; font-weight: 800; color: var(--accent-strong); white-space: nowrap; }
.billing-plan .plan-price small { font-size: .75rem; font-weight: 600; color: var(--ink-3); }
.billing-plan.is-featured { border-color: var(--accent); background: linear-gradient(180deg, var(--accent-soft), var(--surface-2)); }
.billing-legal { margin: 14px 0 0; font-size: .8rem; color: var(--ink-3); line-height: 1.4; }
.billing-error { min-height: 1.2em; margin: 8px 0 0; color: var(--danger); font-size: .9rem; }
.billing-dialog .auth-close { position: absolute; top: 14px; right: 14px; }
.billing-dialog { border: 0; background: transparent; padding: 0; }
.billing-dialog::backdrop { background: rgba(6,16,30,.55); backdrop-filter: blur(3px); }
`;

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

let dialog = null;

function injectStyles() {
  if (document.getElementById("billingStyles")) return;
  const style = node("style", { id: "billingStyles" });
  style.textContent = STYLES;
  document.head.append(style);
}

function buildDialog() {
  dialog = node("dialog", { class: "auth-dialog billing-dialog", id: "billingDialog", "aria-labelledby": "billingTitle" });

  const card = node("div", { class: "auth-card" });
  const close = node("button", { type: "button", class: "icon-button auth-close", "aria-label": "Cerrar" });
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
  close.addEventListener("click", () => dialog.close());

  const title = node("h2", { id: "billingTitle" }, "Elige tu plan");
  const intro = node("p", { class: "billing-intro" }, "Tienes 3 días de prueba gratuita. Tu primer cobro es al cuarto día y después cada mes.");
  const status = node("p", { id: "billingStatus", class: "billing-status", role: "status" }, "");
  const list = node("div", { class: "billing-plans", id: "billingPlans" });

  PLANS.forEach((plan, index) => {
    const button = node("button", { type: "button", class: "billing-plan" + (plan.id === "profesional_2" ? " is-featured" : ""), "data-plan": plan.id });
    const left = node("span", {});
    left.append(node("span", { class: "plan-name" }, plan.name));
    if (plan.badge) left.append(node("span", { class: "plan-badge" }, plan.badge));
    const price = node("span", { class: "plan-price" }, `$${plan.price}`);
    price.append(node("small", {}, " MXN/mes"));
    button.append(left, price);
    button.addEventListener("click", () => subscribe(plan.id, button));
    list.append(button);
  });

  const error = node("p", { id: "billingMessage", class: "billing-error", role: "alert" }, "");
  const legal = node("p", { class: "billing-legal" }, "Los pagos los procesa Mercado Pago. Puedes cancelar cuando quieras.");

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
  setMessage("");

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

// El botón ocupa el lugar del texto de "Plataforma" en la barra lateral.
function mountButton() {
  const panel = document.querySelector(".panel-platform");
  if (!panel || document.getElementById("billingOpen")) return;
  panel.querySelector("#platformPanelLabel")?.remove();
  panel.querySelector("#platformDescription")?.remove();
  const open = node("button", { type: "button", id: "billingOpen", class: "billing-cta" }, "Suscríbete aquí!");
  open.addEventListener("click", () => {
    dialog.showModal();
    refreshStatus();
  });
  panel.append(open);
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
  injectStyles();
  buildDialog();
  mountButton();
  handleReturn();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
