/*
 * AllAIs — Pantalla "Elige tu plan" obligatoria (Tarea #4b, parte 2)
 * ===================================================================
 *
 * Se muestra después del registro, antes de usar la app. Destaca la "Prueba
 * de lanzamiento gratis" (trial-with-card: registra tarjeta hoy, primer cobro
 * el 11-nov) y ofrece los 4 planes de pago.
 *
 * MODO DEL GATE
 * -------------
 * GATE_MODE controla si el usuario puede entrar a la app sin elegir:
 *   - "soft": muestra un enlace "Explorar primero" que cierra el gate. Es el
 *     default MIENTRAS validamos el flujo real de Mercado Pago, para no
 *     bloquear registros si MP falla.
 *   - "hard": sin escape. Hay que elegir una opción para continuar. Felipe lo
 *     activa cambiando esta constante cuando el trial-with-card esté validado
 *     en producción.
 *
 * API pública:
 *   window.AllAIsPlanGate.maybeShow() — muestra el gate si el usuario no tiene
 *       plan ni lo ha elegido antes. Lo llama app.js tras el login.
 *   window.AllAIsPlanGate.show() / .hide() — control directo.
 */

(function () {
  const GATE_MODE = "soft"; // "soft" | "hard" — ver cabecera
  const STORAGE_KEY_CHOSEN = "allais_plan_chosen";

  const safeLS = {
    get(k) { try { return localStorage.getItem(k); } catch (_e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_e) { /* */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (_e) { /* */ } }
  };

  const emit = (name, params) => {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  };

  const detectLang = () => {
    const html = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
    const nav = (navigator.language || "es").slice(0, 2).toLowerCase();
    if (["es", "en", "fr"].includes(html)) return html;
    if (["es", "en", "fr"].includes(nav)) return nav;
    return "es";
  };

  // --------------------------------------------------------------------------
  //  Copy e información de planes
  // --------------------------------------------------------------------------
  const COPY = {
    es: {
      eyebrow: "Elige tu plan",
      title: "Elige tu plan para empezar",
      subtitle: "Prueba AllAIs sin pagar nada hoy. Registras tu tarjeta y decides cuándo empieza el cobro.",
      hero_badge: "La forma de empezar",
      hero_title: "🚀 Prueba de lanzamiento gratis",
      hero_after_prefix: "Gratis hasta el 10 de noviembre. Después,",
      hero_after_amount: "$99 MXN/mes",
      hero_after_suffix: "(precio de lanzamiento, congelado para ti).",
      hero_cta: "Empezar prueba gratis",
      hero_note: "Registras tu tarjeta con Mercado Pago. No se cobra nada hoy. Cancela antes del 11 de noviembre y no se te hará ningún cargo.",
      per_month: "MXN / mes",
      trial3: "3 días gratis, luego se cobra",
      recommended: "Recomendado",
      choose: (n) => `Elegir ${n}`,
      skip: "Prefiero explorar primero",
      legal: "Pagos seguros con Mercado Pago. Puedes cambiar o cancelar tu plan en cualquier momento desde \"Tu cuenta\".",
      working: "Un momento…",
      ok_mock: "Listo. Tu plan de prueba quedó activo.",
    },
    en: {
      eyebrow: "Choose your plan",
      title: "Choose a plan to get started",
      subtitle: "Try AllAIs without paying anything today. Add your card and decide when billing begins.",
      hero_badge: "The way to start",
      hero_title: "🚀 Free launch trial",
      hero_after_prefix: "Free until November 10. After that,",
      hero_after_amount: "$99 MXN/mo",
      hero_after_suffix: "(launch price, locked in for you).",
      hero_cta: "Start free trial",
      hero_note: "You add your card with Mercado Pago. Nothing is charged today. Cancel before November 11 and you won't be charged.",
      per_month: "MXN / mo",
      trial3: "3 free days, then billed",
      recommended: "Recommended",
      choose: (n) => `Choose ${n}`,
      skip: "I'd rather explore first",
      legal: "Secure payments with Mercado Pago. You can change or cancel your plan anytime from \"Your account\".",
      working: "One moment…",
      ok_mock: "Done. Your trial plan is active.",
    },
    fr: {
      eyebrow: "Choisissez votre offre",
      title: "Choisissez une offre pour commencer",
      subtitle: "Essayez AllAIs sans rien payer aujourd'hui. Enregistrez votre carte et choisissez quand le prélèvement commence.",
      hero_badge: "La façon de commencer",
      hero_title: "🚀 Essai de lancement gratuit",
      hero_after_prefix: "Gratuit jusqu'au 10 novembre. Ensuite,",
      hero_after_amount: "99 MXN/mois",
      hero_after_suffix: "(prix de lancement, bloqué pour vous).",
      hero_cta: "Commencer l'essai gratuit",
      hero_note: "Vous enregistrez votre carte avec Mercado Pago. Rien n'est prélevé aujourd'hui. Annulez avant le 11 novembre et vous ne serez pas débité.",
      per_month: "MXN / mois",
      trial3: "3 jours gratuits, puis facturé",
      recommended: "Recommandé",
      choose: (n) => `Choisir ${n}`,
      skip: "Je préfère explorer d'abord",
      legal: "Paiements sécurisés avec Mercado Pago. Vous pouvez changer ou annuler votre offre à tout moment depuis « Votre compte ».",
      working: "Un instant…",
      ok_mock: "C'est fait. Votre offre d'essai est active.",
    }
  };

  // Beneficios por plan, por idioma. El id coincide con el backend (plans.js).
  const HERO_FEATURES = {
    es: ["300 consultas al mes + 10 al día", "Los 4 modelos principales", "Cancela cuando quieras"],
    en: ["300 queries/month + 10/day", "All 4 main models", "Cancel anytime"],
    fr: ["300 requêtes/mois + 10/jour", "Les 4 modèles principaux", "Annulez quand vous voulez"]
  };

  const PAID_PLANS = [
    {
      id: "lanzamiento", name: "Lanzamiento", price: 99, trial3: true,
      features: {
        es: ["300 al mes + 10 al día", "Los 4 modelos", "Precio de lanzamiento"],
        en: ["300/mo + 10/day", "All 4 models", "Launch price"],
        fr: ["300/mois + 10/jour", "Les 4 modèles", "Prix de lancement"]
      }
    },
    {
      id: "profesional_1", name: "Esencial", price: 199, trial3: true,
      features: {
        es: ["300 consultas al mes", "Los 4 modelos", "Historial de conversación"],
        en: ["300 queries/month", "All 4 models", "Conversation history"],
        fr: ["300 requêtes/mois", "Les 4 modèles", "Historique des conversations"]
      }
    },
    {
      id: "profesional_2", name: "Profesional", price: 299, trial3: true, recommended: true,
      features: {
        es: ["600 consultas al mes", "Los 4 modelos", "Soporte prioritario"],
        en: ["600 queries/month", "All 4 models", "Priority support"],
        fr: ["600 requêtes/mois", "Les 4 modèles", "Support prioritaire"]
      }
    },
    {
      id: "profesional_3", name: "Avanzado", price: 399, trial3: true,
      features: {
        es: ["1 000 consultas al mes", "Los 4 modelos", "Soporte prioritario"],
        en: ["1,000 queries/month", "All 4 models", "Priority support"],
        fr: ["1 000 requêtes/mois", "Les 4 modèles", "Support prioritaire"]
      }
    }
  ];

  // --------------------------------------------------------------------------
  //  Construcción del DOM
  // --------------------------------------------------------------------------
  let overlay = null;
  let lang = "es";

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  };

  const setMsg = (text, kind) => {
    const box = overlay?.querySelector(".plan-gate-msg");
    if (!box) return;
    box.textContent = text || "";
    box.className = "plan-gate-msg" + (kind ? ` is-${kind}` : "");
  };

  const build = () => {
    const t = COPY[lang];
    overlay = el("div", { class: "plan-gate-overlay", role: "dialog", "aria-modal": "true", "aria-label": t.title, hidden: "" });
    const sheet = el("div", { class: "plan-gate-sheet" });

    // Cabecera
    const head = el("div", { class: "plan-gate-head" },
      el("p", { class: "eyebrow" }, t.eyebrow),
      el("h2", {}, t.title),
      el("p", {}, t.subtitle)
    );

    // Mensaje (errores / ok)
    const msg = el("div", { class: "plan-gate-msg" });

    // Hero: prueba de lanzamiento
    const heroLeft = el("div", {},
      el("h3", {}, t.hero_title),
      (() => {
        const price = el("div", { class: "hero-price" });
        price.append(el("span", { class: "big" }, "$0"), el("span", { class: "unit" }, "hoy"));
        return price;
      })(),
      el("p", { class: "hero-after", html: `${t.hero_after_prefix} <b>${t.hero_after_amount}</b> ${t.hero_after_suffix}` }),
      (() => {
        const ul = el("ul");
        HERO_FEATURES[lang].forEach((f) => ul.append(el("li", {}, f)));
        return ul;
      })()
    );
    const heroBtn = el("button", { type: "button", class: "plan-gate-btn is-primary" }, t.hero_cta);
    heroBtn.addEventListener("click", () => onChoose("lanzamiento", heroBtn, { launchFreeTrial: true }, "launch_trial"));
    const heroRight = el("div", { class: "hero-cta-wrap" },
      heroBtn,
      el("p", { class: "hero-note" }, t.hero_note)
    );
    const hero = el("div", { class: "plan-gate-hero" },
      el("span", { class: "hero-badge" }, t.hero_badge),
      heroLeft,
      heroRight
    );

    // Grid de planes de pago
    const grid = el("div", { class: "plan-gate-grid" });
    PAID_PLANS.forEach((p) => {
      const card = el("div", { class: "plan-gate-card" + (p.recommended ? " featured" : "") });
      if (p.recommended) card.append(el("span", { class: "card-badge" }, t.recommended));
      card.append(el("h4", {}, p.name));
      const price = el("div", { class: "card-price" });
      price.append(el("span", { class: "amt" }, `$${p.price}`), el("span", { class: "u" }, t.per_month));
      card.append(price);
      card.append(el("p", { class: "card-trial" }, t.trial3));
      const ul = el("ul");
      p.features[lang].forEach((f) => ul.append(el("li", {}, f)));
      card.append(ul);
      const btn = el("button", { type: "button", class: "plan-gate-btn" + (p.recommended ? " is-primary" : "") }, t.choose(p.name));
      btn.addEventListener("click", () => onChoose(p.id, btn, {}, "paid"));
      card.append(btn);
      grid.append(card);
    });

    // Pie
    const foot = el("div", { class: "plan-gate-foot" });
    if (GATE_MODE === "soft") {
      const skip = el("button", { type: "button", class: "gate-skip" }, t.skip);
      skip.addEventListener("click", () => {
        emit("plan_gate_skipped", { lang });
        hide();
      });
      foot.append(skip);
    }
    foot.append(el("p", { class: "gate-legal" }, t.legal));

    sheet.append(head, msg, hero, grid, foot);
    overlay.append(sheet);
    document.body.append(overlay);
  };

  // --------------------------------------------------------------------------
  //  Elección de un plan
  // --------------------------------------------------------------------------
  const onChoose = async (planId, button, opts, kind) => {
    const t = COPY[lang];
    if (!window.AllAIsBilling?.subscribe) {
      setMsg("No se pudo iniciar el cobro. Recarga la página e inténtalo de nuevo.", "error");
      return;
    }
    emit(kind === "launch_trial" ? "plan_gate_launch_trial_selected" : "plan_gate_paid_selected", { plan: planId, lang });

    // Marcamos la elección ANTES de contratar para que el gate no reaparezca
    // si el usuario vuelve de Mercado Pago. Si falla, lo desmarcamos abajo.
    safeLS.set(STORAGE_KEY_CHOSEN, "1");

    setMsg("", null);
    const result = await window.AllAIsBilling.subscribe(planId, button, opts);

    // redirected: el navegador ya se fue a MP (o al overlay de email) — no
    // tocamos el gate, desaparece con la navegación.
    if (!result || result.redirected) return;

    if (result.ok && result.mock) {
      setMsg(t.ok_mock, "ok");
      window.setTimeout(hide, 900);
      return;
    }
    if (result.ok) { hide(); return; }

    // Error o no-auth: desmarcamos para que pueda reintentar y mostramos aviso.
    safeLS.remove(STORAGE_KEY_CHOSEN);
    if (result.reason === "no_auth") {
      // El flujo de billing ya abrió el login; cerramos el gate para no taparlo.
      hide();
    } else if (result.error) {
      setMsg(result.error, "error");
    }
  };

  // --------------------------------------------------------------------------
  //  Mostrar / ocultar
  // --------------------------------------------------------------------------
  const show = () => {
    lang = detectLang();
    // Si el tour de onboarding sigue abierto (el usuario se registró desde el
    // paso 1), lo cerramos para no solapar dos modales.
    try { window.AllAIsTour?.close?.(); } catch (_e) { /* */ }
    if (!overlay) build();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    emit("plan_gate_shown", { lang, mode: GATE_MODE });
  };

  const hide = () => {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    window.setTimeout(() => { if (overlay) overlay.hidden = true; }, 240);
  };

  // Decide si mostrar: solo si el usuario no eligió antes y no tiene plan vivo.
  const maybeShow = async () => {
    if (safeLS.get(STORAGE_KEY_CHOSEN) === "1") return;
    // No competir con el diálogo de billing (deep-link ?plan= de /precios) ni
    // con el retorno del checkout de Mercado Pago (?pago=retorno).
    if (document.querySelector("#billingDialog[open]")) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("pago") === "retorno") return;
    } catch (_e) { /* */ }
    try {
      if (window.AllAIsBilling?.refreshStatus) {
        await window.AllAIsBilling.refreshStatus();
        if (window.AllAIsBilling.hasSubscription?.()) {
          // Ya tiene plan: no molestamos y recordamos que no hay que preguntar.
          safeLS.set(STORAGE_KEY_CHOSEN, "1");
          return;
        }
      }
    } catch (_e) { /* si el status falla, mostramos igual el gate */ }
    show();
  };

  window.AllAIsPlanGate = { maybeShow, show, hide };
})();
