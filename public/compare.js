/*
 * AllAIs — Modo comparación multi-modelo (Tarea #9, fase 2)
 * ==========================================================
 *
 * Añade el modo "varios modelos a la vez": un prompt a 2-4 modelos y sus
 * respuestas en columnas, con streaming demultiplexado por `provider`. El
 * backend es POST /api/compare (fase 1). Módulo autónomo para no inflar el
 * app.js; se engancha al composer existente interceptando el submit.
 *
 * Decisiones:
 *   - Cada comparación es un "one-shot" (prompt -> N respuestas), sin historial
 *     multi-turno. Es lo habitual en comparadores y simplifica el estado.
 *   - Igual que el chat, en producción el streaming va directo a la función
 *     (Firebase Hosting bufferiza y rompería el tiempo real).
 */

(function () {
  const STREAM_HOSTS = new Set(["allais.nni.ai", "allais-nni.web.app", "allais-nni.firebaseapp.com"]);
  const COMPARE_ENDPOINT = STREAM_HOSTS.has(location.hostname)
    ? "https://api-6wsxvgd6ra-uc.a.run.app/compare"
    : "/api/compare";
  const CONSOLIDATE_ENDPOINT = STREAM_HOSTS.has(location.hostname)
    ? "https://api-6wsxvgd6ra-uc.a.run.app/consolidate"
    : "/api/consolidate";
  const PROVIDERS_ENDPOINT = "/api/providers";
  const MAX_MODELS = 4;
  const MIN_MODELS = 2;

  const state = { active: false, providers: [], selected: new Set(), busy: false };

  // --------------------------------------------------------------------------
  //  i18n mínimo
  // --------------------------------------------------------------------------
  const lang = () => {
    const l = (document.documentElement.lang || navigator.language || "es").slice(0, 2).toLowerCase();
    return ["es", "en", "fr"].includes(l) ? l : "es";
  };
  const T = {
    es: {
      toggle: "Comparar modelos", mode_single: "Un modelo", mode_multi: "Varios modelos",
      pick: "Elige 2 a 4 modelos para comparar",
      min: "Elige al menos 2 modelos.", need_auth: "Inicia sesión para comparar varios modelos.",
      sending: "Comparando…", your_prompt: "Tu pregunta", caption: "Pregunta, compara, decide.",
      err: "No se pudo completar.", consolidate: "Consolidar respuestas", consolidating: "Consolidando…",
      consolidated_title: "Síntesis de las respuestas", quota_note: (n) => `Esta comparación usa ${n} consultas de tu plan.`
    },
    en: {
      toggle: "Compare models", mode_single: "One model", mode_multi: "Several models",
      pick: "Pick 2 to 4 models to compare",
      min: "Pick at least 2 models.", need_auth: "Sign in to compare several models.",
      sending: "Comparing…", your_prompt: "Your prompt", caption: "Ask, compare, decide.",
      err: "Could not complete.", consolidate: "Consolidate answers", consolidating: "Consolidating…",
      consolidated_title: "Synthesis of the answers", quota_note: (n) => `This comparison uses ${n} queries from your plan.`
    },
    fr: {
      toggle: "Comparer les modèles", mode_single: "Un modèle", mode_multi: "Plusieurs modèles",
      pick: "Choisissez 2 à 4 modèles à comparer",
      min: "Choisissez au moins 2 modèles.", need_auth: "Connectez-vous pour comparer plusieurs modèles.",
      sending: "Comparaison…", your_prompt: "Votre requête", caption: "Demandez, comparez, décidez.",
      err: "Impossible de terminer.", consolidate: "Consolider les réponses", consolidating: "Consolidation…",
      consolidated_title: "Synthèse des réponses", quota_note: (n) => `Cette comparaison utilise ${n} requêtes de votre offre.`
    }
  };
  const t = (k, ...a) => { const v = (T[lang()] || T.es)[k]; return typeof v === "function" ? v(...a) : v; };

  // Colores de marca por proveedor (coinciden con la demo del tour).
  const BRAND = { openai: "#10a37f", claude: "#c15f3c", gemini: "#4285f4", deepseek: "#5967ff", qwen: "#9b5de5" };

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids) { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return n;
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // --------------------------------------------------------------------------
  //  Carga de proveedores disponibles
  // --------------------------------------------------------------------------
  async function loadProviders() {
    try {
      const r = await fetch(PROVIDERS_ENDPOINT);
      const d = await r.json();
      state.providers = (d.providers || []).map((p) => ({ id: p.id, name: p.name }));
    } catch (_e) {
      state.providers = [];
    }
    // Preselección: hasta 4 primeros.
    state.selected = new Set(state.providers.slice(0, MAX_MODELS).map((p) => p.id));
  }

  // --------------------------------------------------------------------------
  //  UI: toggle en el composer + panel selector de modelos
  // --------------------------------------------------------------------------
  let toggleBtn, selectorPanel;

  function mountUI() {
    const tools = document.querySelector(".composer-tools");
    const footer = document.querySelector(".composer-footer");
    if (!tools || document.getElementById("compareToggle")) return;

    toggleBtn = el("button", {
      type: "button", id: "compareToggle", class: "compare-toggle",
      role: "switch", "aria-checked": "false", title: t("toggle")
    },
      el("span", { class: "compare-toggle-dot", "aria-hidden": "true" }),
      el("span", { class: "compare-toggle-label" }, t("toggle"))
    );
    toggleBtn.addEventListener("click", () => setActive(!state.active));
    tools.append(toggleBtn);

    // Panel selector (oculto hasta activar). Va antes del footer.
    selectorPanel = el("div", { class: "compare-selector", id: "compareSelector", hidden: "" });
    const hint = el("span", { class: "compare-selector-hint" }, t("pick"));
    const chips = el("div", { class: "compare-chips", id: "compareChips" });
    selectorPanel.append(hint, chips);
    if (footer && footer.parentNode) footer.parentNode.insertBefore(selectorPanel, footer);
    renderChips();
  }

  function renderChips() {
    const chips = document.getElementById("compareChips");
    if (!chips) return;
    chips.innerHTML = "";
    state.providers.forEach((p) => {
      const on = state.selected.has(p.id);
      const chip = el("button", {
        type: "button",
        class: "compare-chip" + (on ? " is-on" : ""),
        "aria-pressed": on ? "true" : "false",
        "data-id": p.id
      },
        el("span", { class: "compare-chip-dot", style: `background:${BRAND[p.id] || "#8fd3ff"}` }),
        p.name
      );
      chip.addEventListener("click", () => toggleModel(p.id));
      chips.append(chip);
    });
    // Nota de cuota
    let note = document.getElementById("compareQuotaNote");
    if (!note) {
      note = el("span", { class: "compare-quota-note", id: "compareQuotaNote" });
      chips.parentNode.append(note);
    }
    note.textContent = t("quota_note", state.selected.size);
  }

  function toggleModel(id) {
    if (state.selected.has(id)) {
      if (state.selected.size <= MIN_MODELS) return; // no bajar de 2
      state.selected.delete(id);
    } else {
      if (state.selected.size >= MAX_MODELS) return; // no pasar de 4
      state.selected.add(id);
    }
    renderChips();
  }

  function setActive(on) {
    state.active = on;
    try { localStorage.setItem("allais_preferred_mode", on ? "multi" : "single"); } catch (_e) { /* */ }
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-on", on);
      toggleBtn.setAttribute("aria-checked", on ? "true" : "false");
    }
    if (selectorPanel) selectorPanel.hidden = !on;
    // Ocultar la nota de "ChatGPT / OpenAI" del modo single cuando está multi.
    const single = document.getElementById("selectedProviderNote");
    if (single) single.style.display = on ? "none" : "";
    document.body.classList.toggle("compare-mode", on);
  }

  // --------------------------------------------------------------------------
  //  Envío de la comparación
  // --------------------------------------------------------------------------
  function interceptSubmit() {
    const form = document.getElementById("promptForm");
    if (!form) return;
    // Captura: corre antes del listener de app.js. Si el modo multi está activo,
    // tomamos el control y evitamos el envío de un solo modelo.
    form.addEventListener("submit", (e) => {
      if (!state.active) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      runComparison();
    }, true);
  }

  async function currentUser() {
    try { return await window.AllAIsAuth?.currentUser?.(); } catch (_e) { return null; }
  }

  async function runComparison() {
    if (state.busy) return;
    const input = document.getElementById("promptInput");
    const prompt = (input?.value || "").trim();
    if (!prompt) return;
    if (state.selected.size < MIN_MODELS) { flashHint(t("min")); return; }

    const user = await currentUser();
    if (!user) { flashHint(t("need_auth")); document.getElementById("accountButton")?.click(); return; }

    const providerIds = state.providers.filter((p) => state.selected.has(p.id)).map((p) => p.id);
    state.busy = true;
    const sendBtn = document.getElementById("sendButton");
    const sendLabel = document.getElementById("sendLabel");
    const prevLabel = sendLabel ? sendLabel.textContent : "";
    if (sendBtn) sendBtn.disabled = true;
    if (sendLabel) sendLabel.textContent = t("sending");

    // Render del bloque de comparación.
    const block = buildCompareBlock(prompt, providerIds);
    input.value = "";
    if (typeof window.AllAIsApp?.resizePrompt === "function") window.AllAIsApp.resizePrompt();

    if (typeof window.gtag === "function") {
      window.gtag("event", "compare_sent", { models: providerIds.join(","), count: providerIds.length, language: lang() });
    }

    try {
      const token = await window.AllAIsAuth.idToken();
      const resp = await fetch(COMPARE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ providers: providerIds, prompt })
      });
      if (!resp.ok || !resp.body) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || t("err"));
      }
      await consumeStream(resp.body, block);
    } catch (error) {
      block.cols.forEach((c) => { if (!c.done) finishCol(c, error.message || t("err"), true); });
    } finally {
      state.busy = false;
      if (sendBtn) sendBtn.disabled = false;
      if (sendLabel) sendLabel.textContent = prevLabel;
    }
  }

  async function consumeStream(body, block) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (_e) { continue; }
        handleEvent(ev, block);
      }
    }
  }

  function handleEvent(ev, block) {
    const col = ev.provider ? block.byId[ev.provider] : null;
    if (ev.t === "delta" && col) {
      col.text += ev.text || "";
      col.bodyEl.innerHTML = renderText(col.text) + '<span class="compare-caret"></span>';
      scrollInto(block.el);
    } else if (ev.t === "done" && col) {
      col.text = ev.answer != null ? ev.answer : col.text;
      finishCol(col, col.text, false, ev.elapsedMs);
    } else if (ev.t === "error" && col) {
      finishCol(col, ev.error || t("err"), true);
    } else if (ev.t === "all_done") {
      block.cols.forEach((c) => { if (!c.done) finishCol(c, c.text, false); });
      // La cuota consumida llega en all_done: la reflejamos en la UI de app.js.
      if (ev.quota && typeof window.AllAIsApp?.setQuota === "function") {
        window.AllAIsApp.setQuota(ev.quota);
      }
      maybeAddConsolidate(block);
    }
  }

  // Fase 4: botón "Consolidar" bajo las columnas. Toma las respuestas buenas y
  // pide a Claude una síntesis crítica. El momento "wow": de varias opiniones a
  // una decisión.
  function maybeAddConsolidate(block) {
    const good = block.cols.filter((c) => c.done && !c.colEl.classList.contains("is-error") && c.text.trim());
    if (good.length < 2 || block.consolidateAdded) return;
    block.consolidateAdded = true;
    const btn = el("button", { type: "button", class: "compare-consolidate-btn" }, "✦ " + t("consolidate"));
    const wrap = el("div", { class: "compare-consolidate-wrap" }, btn);
    block.el.append(wrap);
    btn.addEventListener("click", () => runConsolidate(block, good, btn, wrap));
    scrollInto(block.el);
  }

  async function runConsolidate(block, good, btn, wrap) {
    if (block.consolidating) return;
    block.consolidating = true;
    btn.disabled = true;
    btn.textContent = t("consolidating");

    const panel = el("div", { class: "compare-consolidated" },
      el("div", { class: "compare-consolidated-head" },
        el("span", { class: "compare-consolidated-badge" }, "✦"),
        el("span", {}, t("consolidated_title"))
      )
    );
    const body = el("div", { class: "compare-consolidated-body" }, el("span", { class: "compare-caret" }));
    panel.append(body);
    wrap.replaceWith(panel);
    scrollInto(block.el);

    if (typeof window.gtag === "function") {
      window.gtag("event", "compare_consolidated", { count: good.length, language: lang() });
    }

    let text = "";
    try {
      const token = await window.AllAIsAuth.idToken();
      const resp = await fetch(CONSOLIDATE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          prompt: block.prompt,
          answers: good.map((c) => ({ provider: c.id, text: c.text }))
        })
      });
      if (!resp.ok || !resp.body) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || t("err"));
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let ev; try { ev = JSON.parse(line); } catch (_e) { continue; }
          if (ev.t === "delta") {
            text += ev.text || "";
            body.innerHTML = renderText(text) + '<span class="compare-caret"></span>';
            scrollInto(block.el);
          } else if (ev.t === "done") {
            text = ev.answer != null ? ev.answer : text;
            body.innerHTML = renderText(text);
            if (ev.quota && typeof window.AllAIsApp?.setQuota === "function") window.AllAIsApp.setQuota(ev.quota);
          } else if (ev.t === "error") {
            body.innerHTML = `<span class="compare-col-error">${esc(ev.error || t("err"))}</span>`;
          }
        }
      }
    } catch (error) {
      body.innerHTML = `<span class="compare-col-error">${esc(error.message || t("err"))}</span>`;
    } finally {
      block.consolidating = false;
    }
  }

  function finishCol(col, text, isError, elapsedMs) {
    col.done = true;
    col.colEl.classList.add("is-done");
    col.colEl.classList.toggle("is-error", !!isError);
    col.bodyEl.innerHTML = isError
      ? `<span class="compare-col-error">${esc(text)}</span>`
      : renderText(text);
    if (elapsedMs && col.timeEl) col.timeEl.textContent = `${(elapsedMs / 1000).toFixed(1)} s`;
  }

  // Render de texto: respeta saltos de línea; negritas de **texto** mínimas.
  function renderText(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function buildCompareBlock(prompt, providerIds) {
    const conversation = document.getElementById("conversation");
    const block = el("div", { class: "compare-block" });
    const head = el("div", { class: "compare-prompt" },
      el("span", { class: "compare-prompt-label" }, t("your_prompt")),
      el("span", { class: "compare-prompt-text" }, prompt)
    );
    const grid = el("div", { class: "compare-grid", "data-n": String(providerIds.length) });
    const byId = {};
    const cols = [];
    providerIds.forEach((pid) => {
      const prov = state.providers.find((p) => p.id === pid) || { id: pid, name: pid };
      const bodyEl = el("div", { class: "compare-col-body" }, el("span", { class: "compare-caret" }));
      const timeEl = el("span", { class: "compare-col-time" });
      const colEl = el("div", { class: "compare-col is-active" },
        el("div", { class: "compare-col-head" },
          el("span", { class: "compare-col-dot", style: `background:${BRAND[pid] || "#8fd3ff"}` }),
          el("span", { class: "compare-col-name" }, prov.name),
          timeEl
        ),
        bodyEl
      );
      grid.append(colEl);
      const rec = { id: pid, colEl, bodyEl, timeEl, text: "", done: false };
      byId[pid] = rec; cols.push(rec);
    });
    const caption = el("div", { class: "compare-caption" }, t("caption"));
    block.append(head, grid, caption);
    conversation.append(block);
    document.body.classList.remove("is-empty");
    scrollInto(block);
    return { el: block, grid, byId, cols, prompt };
  }

  function scrollInto(node) {
    const scroller = node.closest(".chat-card");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function flashHint(text) {
    const panel = document.getElementById("compareSelector");
    if (!panel) { window.alert(text); return; }
    let hint = panel.querySelector(".compare-selector-hint");
    if (hint) {
      const prev = hint.textContent;
      hint.textContent = text;
      hint.classList.add("is-warn");
      setTimeout(() => { hint.textContent = prev; hint.classList.remove("is-warn"); }, 2600);
    }
  }

  // --------------------------------------------------------------------------
  //  Arranque
  // --------------------------------------------------------------------------
  async function start() {
    await loadProviders();
    mountUI();
    interceptSubmit();
    window.AllAIsCompare = {
      setActive,
      isActive: () => state.active
    };
    // Fase 3: si el visitante eligió "varios modelos" en el hero (Tarea #5) o en
    // una sesión anterior, entramos directo en modo comparación.
    try {
      if (localStorage.getItem("allais_preferred_mode") === "multi") setActive(true);
    } catch (_e) { /* */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
