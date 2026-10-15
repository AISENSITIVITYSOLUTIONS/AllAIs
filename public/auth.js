// Acceso de AllAIs por enlace al correo (Firebase Authentication, inicio de sesión sin contraseña).
// La configuración web se obtiene de Firebase Hosting (/__/firebase/init.json), así que no hay claves en el código.
const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const EMAIL_KEY = "allais_email_for_signin";

let authApi = null;
let auth = null;
let readyPromise = null;

function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const response = await fetch("/__/firebase/init.json");
      if (!response.ok) throw new Error("firebase-config-unavailable");
      const config = await response.json();
      const appModule = await import(`${SDK}/firebase-app.js`);
      authApi = await import(`${SDK}/firebase-auth.js`);
      const app = appModule.initializeApp(config);
      auth = authApi.getAuth(app);
      await authApi.setPersistence(auth, authApi.browserLocalPersistence);
      // Si el inicio con Google usó redirección (navegadores que bloquean ventanas), se completa aquí.
      await authApi.getRedirectResult(auth).catch(() => null);
      return auth;
    })();
  }
  return readyPromise;
}

window.AllAIsAuth = {
  async sendLink(email, language) {
    await ready();
    auth.languageCode = language || "es";
    await authApi.sendSignInLinkToEmail(auth, email, {
      // El correo viaja en el enlace para no pedirlo otra vez si se abre en otro navegador o dentro de la app de Gmail.
      url: `${window.location.origin}/?acceso=1&e=${encodeURIComponent(email)}`,
      handleCodeInApp: true
    });
    localStorage.setItem(EMAIL_KEY, email);
  },

  // Inicio de sesión con Google: ventana emergente y, si el navegador la bloquea, redirección.
  async signInWithGoogle(language) {
    await ready();
    auth.languageCode = language || "es";
    const provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const credential = await authApi.signInWithPopup(auth, provider);
      return credential.user;
    } catch (error) {
      const code = error?.code || "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await authApi.signInWithRedirect(auth, provider);
        return null;
      }
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
      throw error;
    }
  },

  async completeLinkIfPresent(askEmail) {
    await ready();
    if (!authApi.isSignInWithEmailLink(auth, window.location.href)) return null;
    const params = new URLSearchParams(window.location.search);
    let email = localStorage.getItem(EMAIL_KEY) || String(params.get("e") || "").trim().toLowerCase();
    if (!email) email = String((await askEmail()) || "").trim().toLowerCase();
    if (!email) return null;
    const credential = await authApi.signInWithEmailLink(auth, email, window.location.href);
    localStorage.removeItem(EMAIL_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    return credential.user;
  },

  async currentUser() {
    await ready();
    await auth.authStateReady();
    return auth.currentUser;
  },

  async idToken() {
    const user = await this.currentUser();
    return user ? user.getIdToken() : "";
  },

  async signOut() {
    await ready();
    await authApi.signOut(auth);
  }
};
