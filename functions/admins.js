// Administradores de AllAIs.
//
// Los correos de OWNER_EMAILS siempre son administradores, sin depender de la
// configuración del entorno: así un .env mal guardado o una variable sobrescrita
// en Cloud Run no deja al dueño sin acceso. ADMIN_EMAILS solo agrega correos.

const OWNER_EMAILS = ["fdealbam@nni.ai", "fdealbam@gmail.com", "aeelenmirandagtz@gmail.com"];

// Lectores del panel: solo consultan el reporte de visitas y consumo en
// /admin.html. No son administradores: no reciben el modo administrador de la
// app (modelos, cuota, cobros) ni pueden ver o crear códigos promocionales.
const PANEL_VIEWER_EMAILS = ["gfriner@hotmail.com"];

function adminEmails(env = process.env) {
  const extra = String(env.ADMIN_EMAILS || "")
    .split(/[\s,;]+/)
    .map((item) => item.replace(/[^a-z0-9@._+-]/gi, "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...OWNER_EMAILS, ...extra])];
}

function isAdminEmail(email, env = process.env) {
  if (!email) return false;
  return adminEmails(env).includes(String(email).trim().toLowerCase());
}

function isPanelViewerEmail(email) {
  if (!email) return false;
  return PANEL_VIEWER_EMAILS.includes(String(email).trim().toLowerCase());
}

// Rol en el panel: "admin", "viewer" o null (sin acceso). La lista es cerrada:
// cualquier correo fuera de OWNER_EMAILS, ADMIN_EMAILS y PANEL_VIEWER_EMAILS queda fuera.
function panelRole(email, env = process.env) {
  if (isAdminEmail(email, env)) return "admin";
  if (isPanelViewerEmail(email)) return "viewer";
  return null;
}

module.exports = { OWNER_EMAILS, PANEL_VIEWER_EMAILS, adminEmails, isAdminEmail, isPanelViewerEmail, panelRole };
