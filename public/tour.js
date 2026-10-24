/*
 * AllAIs — Motor del onboarding tour (Tarea #5b del backlog v11)
 * ================================================================
 *
 * Tour nativo de 1 paso (solo la comparación de modelos) sin dependencias
 * externas. Es un método de entrada más ligero: muestra de inmediato el valor
 * real de AllAIs sin pedir nada. Decisiones:
 *
 *   - Nativo (sin Shepherd.js): el paso 4 es una ventana embebida de 4
 *     columnas con typewriter escalonado, no un tooltip clásico. Mantener
 *     Shepherd solo para los 4 tooltips simples añade peso sin ahorrar
 *     código.
 *   - localStorage para persistir "no volver a mostrar". sessionStorage no
 *     sirve porque un visitante que vuelve mañana no debe volver a verlo.
 *   - GA4 vía la función `trackEvent` global expuesta por app.js.
 *   - El tour se puede reabrir desde el chip discreto que aparece abajo
 *     a la derecha cuando ya fue cerrado al menos una vez.
 *
 * API pública:
 *   window.AllAIsTour.start()  — abre el tour desde el paso 1
 *   window.AllAIsTour.close()  — lo cierra inmediatamente
 *   window.AllAIsTour.reset()  — borra el flag y lo abre otra vez
 */

(function () {
  const STORAGE_KEY_DISMISSED = "allais_tour_dismissed";
  const STORAGE_KEY_COMPLETED = "allais_tour_completed";

  // Delay inicial para no asustar al visitante que acaba de cargar la página.
  const AUTO_START_DELAY_MS = 1500;

  // Velocidad del typewriter (ms por carácter) y offset entre columnas (ms).
  const TYPEWRITER_MS_PER_CHAR = 42;
  const COLUMN_START_OFFSET_MS = 350;

  // --------------------------------------------------------------------------
  //  Helpers
  // --------------------------------------------------------------------------
  const safeLocalStorage = {
    get(key) { try { return localStorage.getItem(key); } catch (_e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_e) { /* silencio */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (_e) { /* silencio */ } }
  };

  const emit = (name, params) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  };

  const detectLang = () => {
    // Prioriza lo que la app ya decidió; si no, fallback al navegador.
    const html = document.documentElement.lang || "";
    const nav = (navigator.language || "es").slice(0, 2).toLowerCase();
    const first = html.slice(0, 2).toLowerCase();
    const picked = ["es", "en", "fr"].includes(first) ? first
                 : ["es", "en", "fr"].includes(nav)   ? nav
                 : "es";
    return picked;
  };

  // --------------------------------------------------------------------------
  //  Copy de los pasos del tour, en los 3 idiomas
  // --------------------------------------------------------------------------
  const COPY = {
    es: {
      eyebrow:  "Guía rápida",
      next:     "Siguiente",
      prev:     "Atrás",
      skip:     "Omitir",
      finish:   "Comenzar",
      step:     (n, total) => `Paso ${n} de ${total}`,
      reopen:   "Ver guía otra vez",
      close:    "Cerrar guía",
      steps: [
        { title: "Prueba la comparación",
          body:  "Esta es una comparación real: un prompt, cuatro modelos respondiendo lado a lado. Así es el modo \"varios modelos al mismo tiempo\" de AllAIs." }
      ]
    },
    en: {
      eyebrow:  "Quick tour",
      next:     "Next",
      prev:     "Back",
      skip:     "Skip",
      finish:   "Get started",
      step:     (n, total) => `Step ${n} of ${total}`,
      reopen:   "Show the tour again",
      close:    "Close tour",
      steps: [
        { title: "Try the comparison",
          body:  "This is a real comparison: one prompt, four models answering side by side. That's the \"several models at once\" mode of AllAIs." }
      ]
    },
    fr: {
      eyebrow:  "Visite rapide",
      next:     "Suivant",
      prev:     "Précédent",
      skip:     "Passer",
      finish:   "Commencer",
      step:     (n, total) => `Étape ${n} sur ${total}`,
      reopen:   "Revoir la visite",
      close:    "Fermer la visite",
      steps: [
        { title: "Essayez la comparaison",
          body:  "Voici une vraie comparaison : une requête, quatre modèles qui répondent côte à côte. Voilà le mode \"plusieurs modèles à la fois\" d'AllAIs." }
      ]
    }
  };

  // --------------------------------------------------------------------------
  //  Definición de los pasos (target y posición)
  // --------------------------------------------------------------------------
  //
  //  target:  selector del elemento a destacar; null = tooltip centrado.
  //  position: "auto" | "bottom" | "top" | "right" | "left" (según target).
  //  isDemo:  true solo para el paso 4 (ventana embebida).
  //
  const STEPS = [
    // Entrada ligera: un solo paso, la demo de comparación de modelos.
    { id: "try_compare",  target: null, position: "center", isDemo: true }
  ];

  // --------------------------------------------------------------------------
  //  Estado y nodos DOM
  // --------------------------------------------------------------------------
  let state = {
    index: 0,
    lang: "es",
    typewriterTimers: [],
    isOpen: false
  };

  let root, backdrop, highlight, panel;

  // --------------------------------------------------------------------------
  //  Posicionamiento del tooltip respecto al target
  // --------------------------------------------------------------------------
  const positionTooltip = (step) => {
    if (!panel) return;
    const target = step.target ? document.querySelector(step.target) : null;

    // Modo "center": tooltip o demo centrado en la ventana.
    if (!target || step.position === "center") {
      panel.removeAttribute("data-arrow");
      panel.style.left = "50%";
      panel.style.top = "50%";
      panel.style.transform = "translate(-50%, -50%)";
      // Para la demo, el "centro" ya lo da flex del contenedor; usamos top/left.
      hideHighlight();
      return;
    }

    const rect = target.getBoundingClientRect();
    showHighlight(rect);

    const panelW = panel.offsetWidth || 380;
    const panelH = panel.offsetHeight || 180;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top, arrow;
    switch (step.position) {
      case "bottom":
        left = Math.max(16, Math.min(rect.left, vw - panelW - 16));
        top  = Math.min(vh - panelH - 16, rect.bottom + gap);
        arrow = "top";
        break;
      case "top":
        left = Math.max(16, Math.min(rect.left, vw - panelW - 16));
        top  = Math.max(16, rect.top - panelH - gap);
        arrow = "bottom";
        break;
      case "right":
        left = Math.min(vw - panelW - 16, rect.right + gap);
        top  = Math.max(16, Math.min(rect.top, vh - panelH - 16));
        arrow = "left";
        break;
      case "left":
      default:
        left = Math.max(16, rect.left - panelW - gap);
        top  = Math.max(16, Math.min(rect.top, vh - panelH - 16));
        arrow = "right";
        break;
    }
    panel.style.transform = "none";
    panel.style.left = `${left}px`;
    panel.style.top  = `${top}px`;
    panel.setAttribute("data-arrow", arrow);
  };

  const showHighlight = (rect) => {
    if (!highlight) return;
    const pad = 6;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.top  = `${rect.top - pad}px`;
    highlight.style.width  = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;
    highlight.classList.add("is-visible");
  };
  const hideHighlight = () => { if (highlight) highlight.classList.remove("is-visible"); };

  // --------------------------------------------------------------------------
  //  Renderizado de un paso: tooltip normal
  // --------------------------------------------------------------------------
  const renderStep = (index) => {
    cancelTypewriter();
    state.index = index;
    const step = STEPS[index];
    const copy = COPY[state.lang];
    const total = STEPS.length;
    const stepCopy = copy.steps[index];

    // Si es la demo (paso 4), delegamos al render específico.
    if (step.isDemo) {
      renderDemo(step, index);
      return;
    }

    panel = buildTooltipPanel(stepCopy, copy, index, total);
    root.appendChild(panel);
    requestAnimationFrame(() => {
      panel.classList.add("is-visible");
      positionTooltip(step);
    });
  };

  const buildTooltipPanel = (stepCopy, copy, index, total) => {
    const el = document.createElement("div");
    el.className = "allais-tour-tooltip";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", stepCopy.title);
    el.innerHTML = `
      <button type="button" class="allais-tour-close" aria-label="${copy.close}">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <p class="tour-eyebrow">${copy.eyebrow} · ${copy.step(index + 1, total)}</p>
      <h3></h3>
      <p class="tour-body"></p>
      <div class="tour-actions">
        <div class="tour-progress"></div>
        <div class="tour-nav">
          ${index > 0 ? `<button type="button" class="allais-tour-btn is-ghost" data-action="prev">${copy.prev}</button>` : ""}
          <button type="button" class="allais-tour-btn is-primary" data-action="next">${index === total - 1 ? copy.finish : copy.next}</button>
        </div>
      </div>
    `;
    el.querySelector("h3").textContent = stepCopy.title;
    el.querySelector(".tour-body").textContent = stepCopy.body;

    const progress = el.querySelector(".tour-progress");
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement("span");
      dot.className = "tour-dot" + (i === index ? " is-current" : "");
      progress.appendChild(dot);
    }

    el.querySelector('[data-action="next"]').addEventListener("click", () => goNext());
    const prevBtn = el.querySelector('[data-action="prev"]');
    if (prevBtn) prevBtn.addEventListener("click", () => goPrev());
    el.querySelector(".allais-tour-close").addEventListener("click", () => close("skipped"));
    return el;
  };

  // --------------------------------------------------------------------------
  //  Renderizado del paso 4: demo embebida de 4 columnas con typewriter
  // --------------------------------------------------------------------------
  const renderDemo = (step, index) => {
    const copy = COPY[state.lang];
    const stepCopy = copy.steps[index];
    const data = window.AllAIsOnboardingDemoData;
    if (!data) {
      // Fallback defensivo: si el data file no cargó, saltamos al siguiente.
      goNext();
      return;
    }
    emit("onboarding_demo_viewed", { lang: state.lang });

    panel = document.createElement("div");
    panel.className = "allais-tour-demo";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", stepCopy.title);
    // El centrado (horizontal y vertical) lo da el `display:flex` de
    // .allais-tour-root — antes se forzaba aquí con position/top/left/
    // transform inline, lo que además pisaba la animación de entrada
    // (transform) definida en CSS por especificidad de estilo inline.

    panel.innerHTML = `
      <button type="button" class="allais-tour-close" aria-label="${copy.close}">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <div class="demo-head">
        <p class="tour-eyebrow">${STEPS.length > 1 ? `${copy.eyebrow} · ${copy.step(index + 1, STEPS.length)}` : copy.eyebrow}</p>
      </div>
      <div class="demo-prompt">
        <span class="label">${data.prompt_label[state.lang]}</span>
        <span class="text">${data.prompt[state.lang]}</span>
      </div>
      <div class="demo-grid"></div>
      <div class="demo-caption">${data.cta_caption[state.lang]}</div>
      <div class="demo-actions">
        <div class="tour-progress"></div>
        <div class="tour-nav">
          ${index > 0 ? `<button type="button" class="allais-tour-btn is-ghost" data-action="prev">${copy.prev}</button>` : ""}
          <button type="button" class="allais-tour-btn is-ghost" data-action="skip-typing">${copy.skip}</button>
          <button type="button" class="allais-tour-btn is-primary" data-action="next" disabled>${index === STEPS.length - 1 ? copy.finish : copy.next}</button>
        </div>
      </div>
    `;

    const progress = panel.querySelector(".tour-progress");
    if (STEPS.length > 1) {
      for (let i = 0; i < STEPS.length; i += 1) {
        const dot = document.createElement("span");
        dot.className = "tour-dot" + (i === index ? " is-current" : "");
        progress.appendChild(dot);
      }
    }

    const grid = panel.querySelector(".demo-grid");
    const columns = [];
    data.providers.forEach((p) => {
      const col = document.createElement("div");
      col.className = "demo-col";
      col.style.setProperty("--brand-color", p.brand_color);
      col.innerHTML = `
        <div class="col-head">
          <span class="col-badge"></span>
          <span class="col-name">${p.name}</span>
        </div>
        <div class="col-body"></div>
      `;
      grid.appendChild(col);
      columns.push({ el: col, body: col.querySelector(".col-body"), text: p.verses[state.lang].join("\n") });
    });

    root.appendChild(panel);
    requestAnimationFrame(() => {
      panel.classList.add("is-visible");
    });

    // Typewriter escalonado
    const nextBtn = panel.querySelector('[data-action="next"]');
    const skipBtn = panel.querySelector('[data-action="skip-typing"]');
    let doneCount = 0;
    const markDone = (col) => {
      col.el.classList.add("is-done");
      doneCount += 1;
      if (doneCount >= columns.length) {
        nextBtn.disabled = false;
        skipBtn.style.visibility = "hidden";
      }
    };

    columns.forEach((col, i) => {
      col.el.classList.add("is-active");
      col.body.innerHTML = '<span class="caret"></span>';
      const startDelay = i * COLUMN_START_OFFSET_MS;
      const t0 = setTimeout(() => typeInto(col, markDone), startDelay);
      state.typewriterTimers.push(t0);
    });

    skipBtn.addEventListener("click", () => {
      // Mostrar inmediatamente todo el texto, cancelar timers.
      cancelTypewriter();
      columns.forEach((col) => {
        col.body.innerHTML = escapeHtml(col.text);
        col.el.classList.add("is-done");
      });
      nextBtn.disabled = false;
      skipBtn.style.visibility = "hidden";
    });

    const prevBtn = panel.querySelector('[data-action="prev"]');
    if (prevBtn) prevBtn.addEventListener("click", () => goPrev());
    nextBtn.addEventListener("click", () => goNext());
    panel.querySelector(".allais-tour-close").addEventListener("click", () => close("skipped"));
  };

  const typeInto = (col, onDone) => {
    const full = col.text;
    let i = 0;
    const step = () => {
      i += 1;
      col.body.innerHTML = escapeHtml(full.slice(0, i)) + '<span class="caret"></span>';
      if (i < full.length) {
        const t = setTimeout(step, TYPEWRITER_MS_PER_CHAR + Math.random() * 25);
        state.typewriterTimers.push(t);
      } else {
        // Deja los versos sin el caret al terminar.
        col.body.innerHTML = escapeHtml(full);
        onDone(col);
      }
    };
    step();
  };

  const cancelTypewriter = () => {
    state.typewriterTimers.forEach(clearTimeout);
    state.typewriterTimers = [];
  };

  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");

  // --------------------------------------------------------------------------
  //  Navegación entre pasos
  // --------------------------------------------------------------------------
  const clearPanel = () => {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  };

  const goNext = () => {
    if (state.index >= STEPS.length - 1) {
      close("completed");
      return;
    }
    clearPanel();
    renderStep(state.index + 1);
  };
  const goPrev = () => {
    if (state.index <= 0) return;
    clearPanel();
    renderStep(state.index - 1);
  };

  // --------------------------------------------------------------------------
  //  Apertura / cierre
  // --------------------------------------------------------------------------
  const buildRoot = () => {
    root = document.createElement("div");
    root.className = "allais-tour-root";
    root.hidden = true;
    root.setAttribute("aria-live", "polite");

    backdrop = document.createElement("div");
    backdrop.className = "allais-tour-backdrop";
    backdrop.addEventListener("click", () => close("skipped"));

    highlight = document.createElement("div");
    highlight.className = "allais-tour-highlight";

    root.appendChild(backdrop);
    root.appendChild(highlight);
    document.body.appendChild(root);

    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize);
  };

  const onKeydown = (e) => {
    if (!state.isOpen) return;
    if (e.key === "Escape") close("skipped");
    else if (e.key === "ArrowRight") goNext();
    else if (e.key === "ArrowLeft")  goPrev();
  };
  const onResize = () => {
    if (!state.isOpen || !panel) return;
    const step = STEPS[state.index];
    if (!step.isDemo) positionTooltip(step);
  };

  const start = () => {
    if (!root) buildRoot();
    state.lang = detectLang();
    state.isOpen = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    emit("onboarding_tour_started", { lang: state.lang });
    renderStep(0);
    hideReopenChip();
  };

  // Temporizador que oculta la raiz tras la transicion de salida. Se guarda
  // para poder cancelarlo si la guia se reabre antes de que dispare.
  let hideTimer = null;

  const close = (reason) => {
    if (!state.isOpen) return;
    cancelTypewriter();
    clearPanel();
    hideHighlight();
    root.classList.remove("is-open");
    state.isOpen = false;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (root && !state.isOpen) root.hidden = true;
    }, 240);

    if (reason === "completed") {
      safeLocalStorage.set(STORAGE_KEY_COMPLETED, "1");
      emit("onboarding_tour_completed", { lang: state.lang });
    } else {
      // reason === "skipped"
      safeLocalStorage.set(STORAGE_KEY_DISMISSED, "1");
      emit("onboarding_tour_skipped", { lang: state.lang, step: state.index + 1 });
    }
    showReopenChip();
  };

  const reset = () => {
    safeLocalStorage.remove(STORAGE_KEY_DISMISSED);
    safeLocalStorage.remove(STORAGE_KEY_COMPLETED);
    start();
  };

  // --------------------------------------------------------------------------
  //  Chip discreto para reabrir el tour
  // --------------------------------------------------------------------------
  let reopenChip = null;
  const showReopenChip = () => {
    const copy = COPY[detectLang()];
    if (!reopenChip) {
      reopenChip = document.createElement("button");
      reopenChip.type = "button";
      reopenChip.className = "allais-tour-reopen";
      reopenChip.textContent = copy.reopen;
      reopenChip.addEventListener("click", () => reset());
      document.body.appendChild(reopenChip);
    } else {
      reopenChip.textContent = copy.reopen;
    }
    requestAnimationFrame(() => reopenChip.classList.add("is-visible"));
  };
  const hideReopenChip = () => {
    if (reopenChip) reopenChip.classList.remove("is-visible");
  };

  // --------------------------------------------------------------------------
  //  Auto-arranque en la primera visita
  // --------------------------------------------------------------------------
  const maybeAutoStart = () => {
    // No disparar si el visitante ya lo cerró o completó alguna vez.
    if (safeLocalStorage.get(STORAGE_KEY_DISMISSED) === "1" ||
        safeLocalStorage.get(STORAGE_KEY_COMPLETED) === "1") {
      // Mostramos solo el chip de reabrir, por si quiere revivirlo.
      setTimeout(showReopenChip, 1200);
      return;
    }
    // No disparar si el usuario ya está autenticado (es visita recurrente,
    // no necesita el onboarding) — se detecta por el DOM del sidebar.
    const sessionActive = document.getElementById("sessionState")?.classList.contains("is-active");
    if (sessionActive) {
      setTimeout(showReopenChip, 1200);
      return;
    }
    setTimeout(start, AUTO_START_DELAY_MS);
  };

  // --------------------------------------------------------------------------
  //  Expose API y auto-arranque
  // --------------------------------------------------------------------------
  window.AllAIsTour = { start, close, reset };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    maybeAutoStart();
  } else {
    document.addEventListener("DOMContentLoaded", maybeAutoStart, { once: true });
  }
})();
