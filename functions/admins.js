// Administradores de AllAIs.
//
// Los correos de OWNER_EMAILS siempre son administradores, sin depender de la
// configuración del entorno: así un .env mal guardado o una variable sobrescrita
// en Cloud Run no deja al dueño sin acceso. ADMIN_EMAILS solo agrega correos.

const OWNER_EMAILS = ["fdealbam@nni.ai", "fdealbam@gmail.com"];

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

module.exports = { OWNER_EMAILS, adminEmails, isAdminEmail };
