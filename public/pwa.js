// App instalable: registro del service worker y botón "Instalar".
//  - Android / Chrome / Edge: evento beforeinstallprompt (instalación de un toque).
//  - iPhone / iPad: no existe ese evento; se muestran los pasos Compartir → Agregar a inicio.
//    Dentro de navegadores internos (WhatsApp, Instagram, Facebook) primero hay que abrir Safari.
(function () {
  const COPY = {
    es: { app: "Instalar la app", phone: "Instalar en tu teléfono", title: "Instala AllAIs", ok: "Entendido",
      steps: ["Toca <strong>Compartir</strong> en la barra de Safari.", "Elige <strong>Agregar a inicio</strong>.", "Toca <strong>Agregar</strong>. AllAIs queda con su ícono en tu pantalla de inicio."],
      inApp: "Primero abre esta página en <strong>Safari</strong>: toca el menú de la app (⋯ o ↗) y elige <strong>Abrir en Safari</strong>." },
    en: { app: "Install the app", phone: "Install on your phone", title: "Install AllAIs", ok: "Got it",
      steps: ["Tap <strong>Share</strong> in Safari's toolbar.", "Choose <strong>Add to Home Screen</strong>.", "Tap <strong>Add</strong>. AllAIs appears on your home screen."],
      inApp: "First open this page in <strong>Safari</strong>: tap the app menu (⋯ or ↗) and choose <strong>Open in Safari</strong>." },
    fr: { app: "Installer l'app", phone: "Installer sur votre téléphone", title: "Installer AllAIs", ok: "Compris",
      steps: ["Touchez <strong>Partager</strong> dans la barre de Safari.", "Choisissez <strong>Sur l'écran d'accueil</strong>.", "Touchez <strong>Ajouter</strong>. AllAIs apparaît sur votre écran d'accueil."],
      inApp: "Ouvrez d'abord cette page dans <strong>Safari</strong> : touchez le menu de l'app (⋯ ou ↗) et choisissez <strong>Ouvrir dans Safari</strong>." }
  };
  const lang = () => {
    const value = (document.documentElement.lang || "es").slice(0, 2).toLowerCase();
    return COPY[value] ? value : "es";
  };
  const track = (name, params) => { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); };

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\//i.test(navigator.userAgent);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("AllAIs service worker", error));
    });
  }

  const start = () => {
    // Hay dos botones: bajo el logo (barra lateral, escritorio) y sobre el título (celular).
    const buttons = [...document.querySelectorAll("[data-install]")];
    const sheet = document.getElementById("installSheet");
    if (!buttons.length || !sheet) return;
    const show = (on) => buttons.forEach((button) => { button.hidden = !on; });
    let deferred = null;

    const refreshCopy = () => {
      const t = COPY[lang()];
      buttons.forEach((button) => {
        const label = button.querySelector(".install-cta-label");
        if (label) label.textContent = t[button.dataset.installVariant] || t.app;
        button.setAttribute("aria-label", label ? label.textContent : t.title);
      });
    };
    refreshCopy();
    new MutationObserver(refreshCopy).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

    if (isStandalone()) {
      document.documentElement.classList.add("is-standalone");
      return;
    }
    if (isIOS()) show(true);

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferred = event;
      show(true);
    });
    window.addEventListener("appinstalled", () => {
      deferred = null;
      show(false);
      track("pwa_installed");
    });

    const openSheet = () => {
      const t = COPY[lang()];
      const inApp = isInAppBrowser();
      sheet.querySelector("#installSheetTitle").textContent = t.title;
      sheet.querySelector("#installSheetClose").textContent = t.ok;
      const list = sheet.querySelector(".install-steps");
      const steps = inApp ? [t.inApp, ...t.steps] : t.steps;
      list.innerHTML = steps.map((html, i) => `<li><span class="install-step-n">${i + 1}</span><p>${html}</p></li>`).join("");
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("is-in"));
      sheet.querySelector("#installSheetClose").focus();
      track("pwa_ios_instructions", { in_app: inApp });
    };
    const closeSheet = () => {
      sheet.classList.remove("is-in");
      sheet.hidden = true;
    };
    sheet.querySelector("#installSheetClose").addEventListener("click", closeSheet);
    sheet.addEventListener("click", (event) => { if (event.target === sheet) closeSheet(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !sheet.hidden) closeSheet(); });

    buttons.forEach((button) => button.addEventListener("click", async () => {
      track("pwa_install_click", { prompt: Boolean(deferred), place: button.dataset.installVariant });
      if (deferred) {
        deferred.prompt();
        const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
        if (outcome === "accepted") show(false);
        deferred = null;
        return;
      }
      if (isIOS()) openSheet();
    }));
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
