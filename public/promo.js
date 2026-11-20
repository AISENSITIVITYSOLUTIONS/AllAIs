/*
 * promo.js — Promoción de Lanzamiento y medición publicitaria (Meta Pixel).
 *
 * 1) Cuenta regresiva: barra compacta fija arriba hasta el cierre de la promo
 *    (30-nov-2026 23:59 CDMX = 2026-12-01T06:00Z, misma fecha que
 *    functions/plans.js). Al vencer desaparece sola. Se puede cerrar por sesión.
 *
 * 2) Meta Pixel: inerte mientras META_PIXEL_ID esté vacío. Con un ID, carga el
 *    píxel, envía PageView y replica los eventos de GA4 (window.gtag) como
 *    eventos estándar de Meta, sin tocar el resto del código.
 *
 * Debe cargarse justo después del bloque de gtag y antes de app.js/billing.js.
 */
(function () {
  "use strict";

  // ── Configuración ──────────────────────────────────────────────────────────
  const META_PIXEL_ID = "1193970816623468"; // Conjunto de datos "AllAIs" · portafolio AI Sensitivity Solutions
  const PROMO_ENDS_AT = Date.UTC(2026, 11, 1, 6, 0, 0);
  const ON_PRICING = /precios/.test(location.pathname);
  const PRICING_URL = ON_PRICING ? "/?plan=lanzamiento" : "/precios.html";

  // ── Meta Pixel ─────────────────────────────────────────────────────────────
  const GA_TO_META = {
    pricing_viewed: "ViewContent",
    pricing_page_view: "ViewContent",
    signup_intent: "Lead",
    email_link_sent: "Lead",
    // google_sign_in no se replica: siempre va seguido de email_session_started
    // y contaba doble. CompleteRegistration se envía una vez por navegador.
    email_session_started: "CompleteRegistration",
    pricing_click: "AddToCart",
    subscription_started: "InitiateCheckout",
    subscription_completed: "Subscribe"
  };

  function loadPixel(id) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function mirrorGtag() {
    const original = window.gtag;
    if (typeof original !== "function" || original.__metaMirror) return;
    const wrapped = function () {
      original.apply(this, arguments);
      try {
        if (arguments[0] !== "event" || typeof window.fbq !== "function") return;
        const metaEvent = GA_TO_META[arguments[1]];
        if (!metaEvent) return;
        if (metaEvent === "CompleteRegistration") {
          try {
            if (localStorage.getItem("allais_meta_reg") === "1") return;
            localStorage.setItem("allais_meta_reg", "1");
          } catch (_) { /* sin almacenamiento, se envía igual */ }
        }
        const p = arguments[2] || {};
        const data = { content_name: p.plan_name || p.plan || "AllAIs" };
        if (typeof p.value === "number" && p.value > 0) { data.value = p.value; data.currency = p.currency || "MXN"; }
        if (metaEvent === "Subscribe" && data.value) data.predicted_ltv = data.value * 6;
        window.fbq("track", metaEvent, data);
      } catch (_) { /* la medición nunca debe romper la app */ }
    };
    wrapped.__metaMirror = true;
    window.gtag = wrapped;
  }

  if (/^\d{8,20}$/.test(META_PIXEL_ID)) {
    loadPixel(META_PIXEL_ID);
    mirrorGtag();
  }

  // ── Cuenta regresiva ───────────────────────────────────────────────────────
  if (Date.now() >= PROMO_ENDS_AT) return;
  try { if (sessionStorage.getItem("allais_promo_bar") === "closed") return; } catch (_) {}

  const lang = (document.documentElement.lang || navigator.language || "es").slice(0, 2);
  const T = {
    es: { short: "<b>Mitad de precio</b>", msg: "<b>Precio de lanzamiento</b> · mitad de precio: $99 en lugar de $199", ends: "termina en", cta: ON_PRICING ? "Elegir Lanzamiento" : "Ver planes", close: "Cerrar aviso" },
    en: { short: "<b>Half price</b>", msg: "<b>Launch price</b> · half price: $99 instead of $199 MXN", ends: "ends in", cta: "See plans", close: "Close" },
    fr: { short: "<b>Moitié prix</b>", msg: "<b>Prix de lancement</b> · moitié prix : 99 $ au lieu de 199 $ MXN", ends: "se termine dans", cta: "Voir les offres", close: "Fermer" }
  }[lang] || null;
  const t = T || { short: "<b>Mitad de precio</b>", msg: "<b>Precio de lanzamiento</b> · mitad de precio: $99 en lugar de $199", ends: "termina en", cta: ON_PRICING ? "Elegir Lanzamiento" : "Ver planes", close: "Cerrar aviso" };

  const css = `
.promo-bar{position:sticky;top:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:10px;
  padding:6px 38px 6px 12px;font:500 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#E6EEFA;
  background:linear-gradient(90deg,#0A1628 0%,#11284A 50%,#0A1628 100%);border-bottom:1px solid rgba(96,165,250,.25);
  box-shadow:0 2px 10px rgba(0,0,0,.25);flex-wrap:wrap}
.promo-bar__short{display:none}
.promo-bar b{color:#93C5FD;font-weight:700}
.promo-bar__clock{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700;color:#FDE68A;letter-spacing:.02em}
.promo-bar__cta{color:#0A1628;background:#93C5FD;border-radius:999px;padding:3px 10px;font-weight:700;text-decoration:none;white-space:nowrap}
.promo-bar__cta:hover{background:#BFDBFE}
.promo-bar__x{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#9FB3CF;
  font-size:16px;line-height:1;cursor:pointer;padding:4px}
body.has-promo .app-shell{height:calc(100vh - var(--promo-h,0px));height:calc(100dvh - var(--promo-h,0px))}
@media (max-width:560px){.promo-bar{font-size:12px;gap:6px;flex-wrap:nowrap;padding-right:30px}.promo-bar__long,.promo-bar__sep{display:none}.promo-bar__short{display:inline}.promo-bar__cta{padding:3px 8px}}`;

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (d ? d + "d " : "") + pad(h) + "h " + pad(m) + "m " + pad(x) + "s";
  }

  function mount() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Promoción de lanzamiento");
    bar.innerHTML =
      `<span>🚀 <span class="promo-bar__long">${t.msg}</span><span class="promo-bar__short">${t.short}</span></span><span class="promo-bar__sep" aria-hidden="true">·</span>` +
      `<span>${t.ends} <span class="promo-bar__clock" aria-live="off"></span></span>` +
      `<a class="promo-bar__cta" href="${PRICING_URL}" data-track-cta="primary" data-cta-source="promo_bar" data-cta-location="countdown">${t.cta}</a>` +
      `<button type="button" class="promo-bar__x" aria-label="${t.close}">×</button>`;
    document.body.prepend(bar);
    document.body.classList.add("has-promo");
    const setH = () => document.documentElement.style.setProperty("--promo-h", bar.offsetHeight + "px");
    setH();
    if ("ResizeObserver" in window) new ResizeObserver(setH).observe(bar);
    const unmount = () => { bar.remove(); document.body.classList.remove("has-promo"); document.documentElement.style.removeProperty("--promo-h"); };

    const clock = bar.querySelector(".promo-bar__clock");
    const tick = () => {
      const left = PROMO_ENDS_AT - Date.now();
      if (left <= 0) { unmount(); clearInterval(timer); return; }
      clock.textContent = fmt(left);
    };
    const timer = setInterval(tick, 1000);
    tick();

    bar.querySelector(".promo-bar__x").addEventListener("click", () => {
      unmount(); clearInterval(timer);
      try { sessionStorage.setItem("allais_promo_bar", "closed"); } catch (_) {}
    });
    bar.querySelector(".promo-bar__cta").addEventListener("click", () => {
      if (typeof window.gtag === "function") window.gtag("event", "promo_bar_click", { app_name: "AllAIs" });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
