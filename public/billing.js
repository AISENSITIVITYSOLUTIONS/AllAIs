// Suscripciones de AllAIs con Mercado Pago. Solo interfaz: el cobro y el estado viven en la función /billing.
// Los montos mostrados deben coincidir con las variables MP_PRICE_* de functions/.env; el servidor es quien cobra.
//
// Los identificadores (lanzamiento, profesional_1..3) son los del backend y no cambian.
// Los nombres comerciales viven solo aquí.

const ICONS = {
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  chart: '<path d="M5 20V11"/><path d="M12 20V4"/><path d="M19 20v-6"/>'
};

const PLANS = [
  {
    id: "profesional_1",
    name: "Esencial",
    price: 199,
    tagline: "Resuelve tus tareas del día a día.",
    icon: "cube",
    features: [
      "300 consultas al mes",
      "Chat con los modelos habilitados",
      "Redacción, resumen y traducción",
      "Carga individual de documentos",
      "Exportación en PDF"
    ]
  },
  {
    id: "profesional_2",
    name: "Profesional",
    price: 299,
    tagline: "Investiga, compara y entrega mejor.",
    icon: "layers",
    featured: true,
    features: [
      "600 consultas al mes",
      "Todo lo incluido en Esencial",
      "Búsqueda web con fuentes",
      "Comparación de dos modelos",
      "Exportación en Word y PDF"
    ]
  },
  {
    id: "profesional_3",
    name: "Avanzado",
    price: 399,
    tagline: "Aborda proyectos más exigentes.",
    icon: "chart",
    features: [
      "1000 consultas al mes",
      "Todo lo incluido en Profesional",
      "Comparación de tres modelos",
      "Análisis de CSV y JSON",
      "Trabajo con varios documentos"
    ]
  }
];

// Lanzamiento ofrece el mismo cupo que Esencial a precio promocional, no es un nivel aparte.
// Por eso lleva fecha límite: sin ella, el plan más barato sería el de mejor relación.
// Cierre de la promoción: cubre todo el 10 de noviembre de 2026 y termina a la
// medianoche siguiente, hora de la Ciudad de México (UTC-6 todo el año).
// Esta fecha solo decide lo que se muestra; quien autoriza la contratación es el
// backend (functions/plans.js), con la misma fecha. Si alguien edita esta línea
// en su navegador, el servidor rechaza el plan igual.
const PROMO_ENDS_AT = Date.UTC(2026, 10, 11, 6, 0, 0);
const promoOpen = () => Date.now() < PROMO_ENDS_AT;

const LAUNCH = {
  id: "lanzamiento",
  name: "Lanzamiento",
  price: 99,
  note: "300 consultas al mes, 10 al día.",
  deadline: "Precio válido si contratas antes del 10 de noviembre de 2026."
};

const ALL_PLANS = [...PLANS, LAUNCH];
const PLAN_NAME = Object.fromEntries(ALL_PLANS.map((plan) => [plan.id, plan.name]));

const STATUS_TEXT = {
  none: "",
  pending: "Tu suscripción está pendiente. Confirma tu tarjeta para activar la prueba.",
  active: "Tu suscripción está activa.",
  paused: "Tu suscripción está pausada.",
  cancelled: "Tu suscripción fue cancelada. Puedes contratar de nuevo cuando quieras.",
  unknown: "Estamos revisando tu suscripción."
};

const HEAD_NEW = {
  title: 'Elige el plan que impulse <em>tu trabajo</em>',
  sub: "Desde tus primeras ideas hasta proyectos de mayor alcance."
};
const HEAD_LIVE = {
  title: 'Tu suscripción en <em>AllAIs</em>',
  sub: "Cambia de plan cuando quieras. La tarjeta registrada no se vuelve a pedir."
};
const CANCEL_LABEL = "Cancelar suscripción";

// Paleta propia del panel: es una superficie de producto y se mantiene oscura en ambos temas,
// para que el contraste de la propuesta no dependa del tema de la app.
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

.billing-dialog {
  width: min(1120px, 94vw);
  max-height: 94vh;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
}
.billing-dialog::backdrop { background: rgba(4,10,22,.72); backdrop-filter: blur(4px); }

.billing-sheet {
  --bp-ink: #eef4fd;
  --bp-ink-2: #9db2ce;
  --bp-ink-3: #7d93b1;
  --bp-line: rgba(130,170,225,.20);
  --bp-panel: #112543;
  --bp-blue: #3b82f6;
  --bp-blue-2: #60a5fa;
  --bp-blue-3: #93c5fd;

  box-sizing: border-box;
  position: relative;
  max-height: 94vh;
  overflow-y: auto;
  padding: 34px 34px 24px;
  border: 1px solid var(--bp-line);
  border-radius: 24px;
  background:
    radial-gradient(90% 70% at 8% 0%, rgba(59,130,246,.20), transparent 60%),
    radial-gradient(80% 70% at 100% 100%, rgba(37,99,235,.18), transparent 60%),
    linear-gradient(160deg, #0d1e38, #091429 70%);
  color: var(--bp-ink);
  box-shadow: 0 40px 90px -30px rgba(0,0,0,.8);
  scrollbar-width: thin;
  scrollbar-color: rgba(130,170,225,.3) transparent;
}

.billing-close {
  position: absolute;
  top: 20px; right: 20px;
  display: grid;
  place-items: center;
  width: 40px; height: 40px;
  padding: 0;
  border: 1px solid var(--bp-line);
  border-radius: 12px;
  background: rgba(255,255,255,.04);
  color: var(--bp-ink-2);
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background .15s ease;
}
.billing-close:hover { color: var(--bp-ink); border-color: var(--bp-blue-2); background: rgba(59,130,246,.14); }
.billing-close svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; }

.billing-eyebrow { margin: 0 0 18px; font-size: .82rem; font-weight: 600; letter-spacing: .04em; color: var(--bp-ink-3); }
.billing-eyebrow b { color: var(--bp-ink); font-weight: 700; }
.billing-eyebrow b i { color: var(--bp-blue-2); font-style: normal; }

.billing-head { margin: 0 0 22px; text-align: center; }
.billing-head h2 {
  margin: 0 0 8px;
  font-family: inherit;
  font-size: clamp(1.5rem, 1rem + 1.7vw, 2.3rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -.02em;
  color: #fff;
}
.billing-head h2 em { font-style: normal; color: var(--bp-blue-3); }
.billing-head .billing-sub { margin: 0; font-size: 1rem; color: var(--bp-ink-2); }
.billing-head .billing-status { min-height: 1.1em; margin: 10px 0 0; font-size: .92rem; font-weight: 600; color: var(--bp-blue-3); }

.billing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: stretch; }

.billing-card {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px 22px;
  border: 1px solid var(--bp-line);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(23,47,82,.72), rgba(14,30,55,.72));
}
.billing-card.is-featured {
  /* Sobresale un poco por arriba y por abajo, como en la propuesta. */
  margin: -14px 0;
  padding-top: 44px;
  border-color: rgba(96,165,250,.55);
  background: linear-gradient(180deg, rgba(37,80,160,.5), rgba(14,32,66,.78));
  box-shadow: 0 0 0 1px rgba(96,165,250,.25), 0 24px 50px -24px rgba(59,130,246,.75);
}
.billing-ribbon {
  position: absolute;
  top: 0; left: 0; right: 0;
  padding: 7px 0;
  border-radius: 17px 17px 0 0;
  background: linear-gradient(90deg, var(--bp-blue), var(--bp-blue-2));
  color: #fff;
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .03em;
  text-align: center;
}

.billing-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.billing-card h3 { margin: 0; font-family: inherit; font-size: 1.45rem; font-weight: 700; letter-spacing: -.01em; color: #fff; }
.billing-card .billing-tagline { margin: 4px 0 0; font-size: .9rem; line-height: 1.4; color: var(--bp-ink-2); }
.billing-icon { flex: none; width: 28px; height: 28px; stroke: var(--bp-blue-2); stroke-width: 1.7; fill: none; stroke-linecap: round; stroke-linejoin: round; }

.billing-price { display: flex; align-items: baseline; gap: 8px; margin: 16px 0 14px; }
.billing-price strong { font-size: 2.6rem; font-weight: 800; letter-spacing: -.03em; line-height: 1; color: #fff; }
.billing-price span { font-size: .95rem; font-weight: 500; color: var(--bp-ink-2); }

.billing-features { list-style: none; margin: 0 0 20px; padding: 18px 0 0; border-top: 1px solid var(--bp-line); display: grid; gap: 11px; }
.billing-features li { display: flex; align-items: flex-start; gap: 10px; font-size: .92rem; line-height: 1.35; color: var(--bp-ink); }
.billing-check { flex: none; width: 20px; height: 20px; margin-top: 1px; color: var(--bp-blue-2); }

.billing-choose {
  margin-top: auto;
  width: 100%;
  padding: 13px 16px;
  border: 1px solid rgba(147,197,253,.45);
  border-radius: 12px;
  background: transparent;
  color: var(--bp-ink);
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease;
}
.billing-choose:hover:not(:disabled) { background: rgba(59,130,246,.18); border-color: var(--bp-blue-2); transform: translateY(-1px); }
.billing-choose:focus-visible { outline: 3px solid rgba(96,165,250,.5); outline-offset: 2px; }
.billing-card.is-featured .billing-choose {
  border-color: transparent;
  background: linear-gradient(90deg, var(--bp-blue), var(--bp-blue-2));
  color: #fff;
  box-shadow: 0 14px 30px -14px rgba(59,130,246,.9);
}
.billing-card.is-featured .billing-choose:hover:not(:disabled) { filter: brightness(1.08); }
.billing-choose:disabled { cursor: default; }
.billing-card.is-current { border-color: var(--bp-blue-2); }
.billing-card.is-current .billing-choose {
  background: rgba(96,165,250,.16);
  border-color: var(--bp-blue-2);
  color: var(--bp-blue-3);
  box-shadow: none;
}
.billing-choose:disabled:not(.is-current-btn) { opacity: .45; }

.billing-launch {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 18px;
  padding: 18px 22px;
  border: 1px solid rgba(96,165,250,.38);
  border-radius: 16px;
  background: linear-gradient(90deg, rgba(37,99,235,.26), rgba(29,78,216,.14));
}
.billing-launch .billing-rocket { font-size: 1.5rem; line-height: 1; }
.billing-launch .billing-launch-title { font-size: 1.15rem; font-weight: 700; color: #fff; white-space: nowrap; }
.billing-launch .billing-launch-title b { color: var(--bp-blue-3); }
.billing-launch .billing-launch-title small { font-size: .85rem; font-weight: 600; color: var(--bp-blue-3); }
.billing-launch .billing-launch-note {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-left: 18px;
  border-left: 1px solid rgba(147,197,253,.3);
  font-size: .95rem;
  line-height: 1.4;
  color: var(--bp-ink-2);
}
.billing-launch .billing-launch-note b { color: var(--bp-blue-3); font-weight: 700; }
.billing-launch .billing-choose { width: auto; flex: none; margin: 0; padding: 10px 20px; font-size: .92rem; }

.billing-manage { display: flex; justify-content: center; margin-top: 16px; }
.billing-manage[hidden] { display: none; }
.billing-cancel {
  padding: 9px 18px;
  border: 1px solid var(--bp-line);
  border-radius: 12px;
  background: transparent;
  color: var(--bp-ink-3);
  font: inherit;
  font-size: .88rem;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}
.billing-cancel:hover:not(:disabled) { border-color: #f87171; color: #fca5a5; }
.billing-cancel.is-confirming { border-color: #f87171; color: #fca5a5; font-weight: 700; }
.billing-cancel:disabled { opacity: .5; cursor: not-allowed; }
.billing-cancel:focus-visible { outline: 3px solid rgba(248,113,113,.45); outline-offset: 2px; }

.billing-message { min-height: 1.2em; margin: 14px 0 0; text-align: center; font-size: .92rem; color: #fca5a5; }
.billing-message.is-ok { color: var(--bp-blue-3); font-weight: 600; }

.billing-foot { margin: 18px 0 0; padding-top: 16px; border-top: 1px solid var(--bp-line); text-align: center; }
.billing-foot p { margin: 0 0 5px; font-size: .82rem; line-height: 1.45; color: var(--bp-ink-3); }
.billing-foot p:last-child { margin: 0; }

@media (max-width: 900px) {
  .billing-grid { grid-template-columns: 1fr; }
  .billing-card.is-featured { order: -1; margin: 0; }
  .billing-sheet { padding: 28px 20px 20px; border-radius: 20px; }
  .billing-launch { flex-wrap: wrap; gap: 12px; }
  .billing-launch .billing-launch-note { flex-basis: 100%; padding-left: 0; border-left: 0; }
  .billing-launch .billing-choose { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .billing-cta { animation: none; }
  .billing-cta::after { animation: none; }
  .billing-choose:hover:not(:disabled) { transform: none; }
}
`;

function node(tag, attrs = {}, text = "") {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function svg(className, inner, viewBox = "0 0 24 24") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("viewBox", viewBox);
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("class", className);
  element.innerHTML = inner;
  return element;
}

function checkIcon() {
  return svg("billing-check", '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".2"/><path d="m8 12.4 2.6 2.6L16 9.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
}

// Dispara un evento a Google Analytics 4 si gtag está cargado.
// Se usa para marcar los puntos de embudo que importan para Google Ads:
// pricing_viewed, subscription_started (con value+currency), subscription_mock,
// subscription_completed (cuando el backend confirma activa), billing_return.
// Los nombres se importan en GA4 como conversiones; subscription_started dispara al
// obtener el init_point; subscription_completed dispara al confirmar el plan activo.
function trackEvent(name, params) {
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params || {});
  } catch (_) {
    // La analítica nunca debe romper el flujo de pago.
  }
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
// Estado vigente de la suscripción. Decide si un clic contrata o cambia de plan.
let current = { status: "none", plan: null };
// Guarda el último status enviado a updateCtaButton para evitar disparar
// subscription_completed más de una vez por sesión.
let _lastCtaStatus = null;

function hasLiveSubscription() {
  return current.status === "active" || current.status === "pending";
}

function injectStyles() {
  if (document.getElementById("billingStyles")) return;
  const style = node("style", { id: "billingStyles" });
  style.textContent = STYLES;
  document.head.append(style);
}

// Actualiza el botón de la barra lateral según el estado de suscripción.
// Si el estado pasa a "active" por primera vez en la sesión y venía de una
// transición real (el usuario acaba de contratar), dispara subscription_completed.
function updateCtaButton({ fromReturn = false, isMockSub = false, planId = null } = {}) {
  const btn = document.getElementById("billingOpen");
  if (!btn) return;

  const status = current.status;
  const name = PLAN_NAME[current.plan] || current.plan || "";

  // Emitir subscription_completed solo cuando el status cambia a active y
  // viene de un retorno de MP o de una suscripción mock — nunca al cargar la página.
  const isNewActivation = (fromReturn || isMockSub) && status === "active" && _lastCtaStatus !== "active";
  if (isNewActivation) {
    const chosenPlan = ALL_PLANS.find((p) => p.id === (planId || current.plan));
    trackEvent("subscription_completed", {
      plan: current.plan || planId,
      plan_name: chosenPlan ? chosenPlan.name : (current.plan || planId),
      value: isMockSub ? 0 : (chosenPlan ? chosenPlan.price : 0),
      currency: "MXN",
      is_trial: isMockSub || false
    });
  }
  _lastCtaStatus = status;

  if (status === "active") {
    btn.textContent = name ? `Plan ${name} ✓` : "Suscripción activa ✓";
    btn.style.animation = "none";
    btn.style.background = "linear-gradient(120deg, #166534, #15803d, #14532d)";
    btn.style.boxShadow = "0 8px 24px -8px rgba(21,128,61,.7)";
  } else if (status === "pending") {
    btn.textContent = "Completar suscripción →";
    btn.style.animation = "";
    btn.style.background = "";
    btn.style.boxShadow = "";
  } else {
    btn.textContent = "Suscríbete aquí!";
    btn.style.animation = "";
    btn.style.background = "";
    btn.style.boxShadow = "";
  }
}

function planCard(plan) {
  const card = node("article", { class: "billing-card" + (plan.featured ? " is-featured" : ""), "data-plan": plan.id });
  if (plan.featured) card.append(node("p", { class: "billing-ribbon" }, "Recomendado"));

  const top = node("div", { class: "billing-card-top" });
  const heading = node("div", {});
  heading.append(node("h3", {}, plan.name));
  heading.append(node("p", { class: "billing-tagline" }, plan.tagline));
  top.append(heading, svg("billing-icon", ICONS[plan.icon]));

  const price = node("div", { class: "billing-price" });
  price.append(node("strong", {}, `$${plan.price}`), node("span", {}, "MXN / mes"));

  const list = node("ul", { class: "billing-features" });
  plan.features.forEach((feature) => {
    const item = node("li", {});
    item.append(checkIcon(), node("span", {}, feature));
    list.append(item);
  });

  const choose = node("button", { type: "button", class: "billing-choose", "data-choose": plan.id }, `Elegir ${plan.name}`);
  choose.addEventListener("click", () => choosePlan(plan.id, choose));

  card.append(top, price, list, choose);
  return card;
}

function launchStrip() {
  const strip = node("div", { class: "billing-launch", "data-plan": LAUNCH.id });
  strip.append(node("span", { class: "billing-rocket", "aria-hidden": "true" }, "🚀"));

  const title = node("p", { class: "billing-launch-title" });
  title.append(document.createTextNode(`${LAUNCH.name} · `));
  const amount = node("b", {}, `$${LAUNCH.price}`);
  amount.append(node("small", {}, " MXN/mes"));
  title.append(amount);

  const note = node("p", { class: "billing-launch-note" });
  note.append(document.createTextNode(LAUNCH.note), node("b", {}, ` ${LAUNCH.deadline}`));

  const choose = node("button", { type: "button", class: "billing-choose", "data-choose": LAUNCH.id }, `Elegir ${LAUNCH.name}`);
  choose.addEventListener("click", () => choosePlan(LAUNCH.id, choose));

  strip.append(title, note, choose);
  return strip;
}

function buildDialog() {
  dialog = node("dialog", { class: "billing-dialog", id: "billingDialog", "aria-labelledby": "billingTitle" });
  const sheet = node("div", { class: "billing-sheet" });

  const close = node("button", { type: "button", class: "billing-close", "aria-label": "Cerrar" });
  close.append(svg("", '<path d="M6 6l12 12M18 6 6 18"/>'));
  close.addEventListener("click", () => dialog.close());

  const eyebrow = node("p", { class: "billing-eyebrow" });
  const brand = node("b", {});
  brand.append(document.createTextNode("All"), node("i", {}, "AI"), document.createTextNode("s"));
  eyebrow.append(brand, document.createTextNode(" · Propuesta de planes"));

  const head = node("header", { class: "billing-head" });
  const title = node("h2", { id: "billingTitle" });
  title.innerHTML = HEAD_NEW.title;
  const sub = node("p", { id: "billingSub", class: "billing-sub" }, HEAD_NEW.sub);
  const status = node("p", { id: "billingStatus", class: "billing-status", role: "status" }, "");
  head.append(title, sub, status);

  const grid = node("div", { class: "billing-grid" });
  PLANS.forEach((plan) => grid.append(planCard(plan)));

  const manage = node("div", { class: "billing-manage", id: "billingManage", hidden: "" });
  const cancel = node("button", { type: "button", class: "billing-cancel", id: "billingCancel" }, CANCEL_LABEL);
  cancel.addEventListener("click", () => cancelSubscription(cancel));
  manage.append(cancel);

  const message = node("p", { id: "billingMessage", class: "billing-message", role: "alert" }, "");

  const foot = node("footer", { class: "billing-foot" });
  foot.append(
    node("p", {}, "Propuesta comercial: funciones y cupos sujetos a validación técnica y de costos."),
    node("p", {}, "Cada consulta corresponde a una respuesta de un modelo; la búsqueda web y los archivos tienen límites propios."),
    node("p", {}, "Pagos seguros con Mercado Pago.")
  );

  sheet.append(close, eyebrow, head, grid, launchStrip(), manage, message, foot);
  dialog.append(sheet);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", resetCancel);
  document.body.append(dialog);
}

function setMessage(text, ok = false) {
  const message = document.getElementById("billingMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("is-ok", Boolean(text) && ok);
}

// La cancelación pide confirmación en dos pasos, sin usar confirm() del navegador.
function resetCancel() {
  const cancel = document.getElementById("billingCancel");
  if (!cancel) return;
  cancel.classList.remove("is-confirming");
  cancel.textContent = CANCEL_LABEL;
  cancel.disabled = false;
}

function paintPlans({ signedIn = true } = {}) {
  const live = signedIn && hasLiveSubscription();

  // Terminada la promoción, Lanzamiento desaparece de la pantalla. Quien ya lo
  // tenga contratado lo sigue viendo, porque conserva su precio.
  const launchVisible = promoOpen() || (live && current.plan === LAUNCH.id);
  const strip = document.querySelector(`.billing-launch[data-plan="${LAUNCH.id}"]`);
  if (strip) strip.hidden = !launchVisible;

  ALL_PLANS.forEach((plan) => {
    const button = document.querySelector(`[data-choose="${plan.id}"]`);
    const card = document.querySelector(`[data-plan="${plan.id}"]`);
    if (!button || !card) return;
    if (plan.id === LAUNCH.id && !launchVisible) return;

    const isCurrent = live && plan.id === current.plan;
    card.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-current-btn", isCurrent);
    // Con una suscripción vigente, los demás planes siguen pulsables: cambian de plan.
    button.disabled = !signedIn || isCurrent;
    button.textContent = isCurrent
      ? "Tu plan actual"
      : `${live ? "Cambiar a" : "Elegir"} ${plan.name}`;
  });

  document.getElementById("billingManage").hidden = !live;
  document.getElementById("billingTitle").innerHTML = live ? HEAD_LIVE.title : HEAD_NEW.title;
  document.getElementById("billingSub").textContent = live ? HEAD_LIVE.sub : HEAD_NEW.sub;
}

function statusLine(data) {
  const base = STATUS_TEXT[data.status] || "";
  const name = PLAN_NAME[data.plan];
  if (!name) return base;
  if (data.status === "active") return `Plan ${name}. Tu suscripción está activa.`;
  if (data.status === "pending") return `Plan ${name}. Falta confirmar tu tarjeta.`;
  return base;
}

// opts.fromReturn: true cuando se llama desde handleReturn (el usuario volvió de MP).
async function refreshStatus({ fromReturn = false } = {}) {
  const statusEl = document.getElementById("billingStatus");
  if (!statusEl) return;
  resetCancel();

  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    current = { status: "none", plan: null };
    statusEl.textContent = "Inicia sesión para elegir un plan.";
    paintPlans({ signedIn: false });
    updateCtaButton();
    return;
  }

  try {
    const data = await billingRequest("/status");
    current = { status: data.status, plan: data.plan || null };
    statusEl.textContent = statusLine(data);
    paintPlans();
    updateCtaButton({ fromReturn });
  } catch (error) {
    current = { status: "none", plan: null };
    statusEl.textContent = "";
    paintPlans();
    updateCtaButton();
    setMessage(error.message);
  }
}

// Un clic contrata si no hay suscripción, o cambia de plan si ya la hay.
async function choosePlan(planId, button) {
  setMessage("");
  const user = await window.AllAIsAuth.currentUser().catch(() => null);
  if (!user) {
    dialog.close();
    document.getElementById("accountButton")?.click();
    return;
  }

  const changing = hasLiveSubscription();
  const label = button.textContent;
  button.disabled = true;
  button.textContent = changing ? "Cambiando…" : "Un momento…";
  try {
    const data = await billingRequest(changing ? "/change" : "/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: planId })
    });

    if (changing) {
      await refreshStatus();
      setMessage(`Cambiaste al plan ${PLAN_NAME[planId]}.`, true);
      return;
    }
    if (data.mock) {
      // El aviso va después de refrescar: refreshStatus repinta los botones.
      trackEvent("subscription_mock", { plan: planId });
      await refreshStatus();
      // subscription_completed con is_trial=true para diferenciar prueba de pago real.
      updateCtaButton({ isMockSub: true, planId });
      setMessage("Suscripción de prueba activada (sin cobro).", true);
      return;
    }
    if (!data.initPoint) throw new Error("Mercado Pago no devolvió el enlace de pago.");
    // Conversión principal para Google Ads: value y currency habilitan optimización por ROAS.
    const chosenPlan = ALL_PLANS.find((p) => p.id === planId);
    trackEvent("subscription_started", {
      plan: planId,
      plan_name: chosenPlan ? chosenPlan.name : planId,
      value: chosenPlan ? chosenPlan.price : 0,
      currency: "MXN"
    });
    window.location.href = data.initPoint;
  } catch (error) {
    setMessage(error.message);
    button.textContent = label;
    button.disabled = false;
  }
}

async function cancelSubscription(button) {
  setMessage("");
  if (!button.classList.contains("is-confirming")) {
    button.classList.add("is-confirming");
    button.textContent = "¿Seguro? Pulsa para confirmar";
    return;
  }

  button.disabled = true;
  button.textContent = "Cancelando…";
  try {
    await billingRequest("/cancel", { method: "POST" });
    await refreshStatus();
    setMessage("Tu suscripción quedó cancelada.", true);
  } catch (error) {
    resetCancel();
    setMessage(error.message);
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
    setMessage("");
    trackEvent("pricing_viewed");
    dialog.showModal();
    refreshStatus();
  });
  panel.append(open);
}

// Al volver de Mercado Pago (back_url), se abre el diálogo para mostrar el estado.
function handleReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") !== "retorno") return;
  trackEvent("billing_return");
  window.history.replaceState(null, "", window.location.pathname);
  dialog.showModal();
  // fromReturn=true para que refreshStatus pueda emitir subscription_completed
  // si el webhook ya confirmó la suscripción antes de que el usuario regresara.
  refreshStatus({ fromReturn: true });
}

// API pública para que otras partes de la app abran el diálogo de planes sin
// depender de simular un click sobre #billingOpen. El click sintético falla en
// algunos contextos (por ejemplo cuando se dispara desde el handler de otro
// botón) y además deja al diálogo buscando una activación de usuario válida
// para `dialog.showModal()`. Esta API es idéntica a `window.AllAIsAuth`.
function publishPublicApi() {
  window.AllAIsBilling = window.AllAIsBilling || {};
  window.AllAIsBilling.openDialog = () => {
    if (!dialog) return;
    setMessage("");
    trackEvent("pricing_viewed");
    dialog.showModal();
    refreshStatus();
  };
}

function start() {
  injectStyles();
  buildDialog();
  publishPublicApi();
  mountButton();
  handleReturn();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
