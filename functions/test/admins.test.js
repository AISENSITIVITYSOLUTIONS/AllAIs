const test = require("node:test");
const assert = require("node:assert/strict");
const { isAdminEmail, adminEmails, panelRole } = require("../admins");

test("el dueño es administrador aunque ADMIN_EMAILS no exista", () => {
  assert.equal(isAdminEmail("fdealbam@nni.ai", {}), true);
  assert.equal(isAdminEmail("AeelenMirandaGtz@gmail.com", {}), true);
});

test("el dueño es administrador aunque ADMIN_EMAILS tenga otro valor", () => {
  assert.equal(isAdminEmail("FdeAlbaM@nni.ai", { ADMIN_EMAILS: "otra@persona.com" }), true);
  assert.equal(isAdminEmail("otra@persona.com", { ADMIN_EMAILS: "otra@persona.com" }), true);
});

test("ADMIN_EMAILS con basura de formato (RTF, BOM, CRLF) sigue funcionando", () => {
  const env = { ADMIN_EMAILS: "\uFEFFextra@nni.ai,\\par\r\n" };
  assert.ok(adminEmails(env).includes("extra@nni.ai"));
});

test("un correo cualquiera no es administrador", () => {
  assert.equal(isAdminEmail("alguien@gmail.com", {}), false);
  assert.equal(isAdminEmail(null, {}), false);
});

test("el lector del panel ve el reporte pero no es administrador", () => {
  assert.equal(panelRole("GFriner@hotmail.com", {}), "viewer");
  assert.equal(isAdminEmail("gfriner@hotmail.com", {}), false);
});

test("los administradores conservan el panel completo y nadie más entra", () => {
  assert.equal(panelRole("fdealbam@nni.ai", {}), "admin");
  assert.equal(panelRole("fdealbam@gmail.com", {}), "admin");
  assert.equal(panelRole("aeelenmirandagtz@gmail.com", {}), "admin");
  assert.equal(panelRole("alguien@hotmail.com", {}), null);
  assert.equal(panelRole(null, {}), null);
});
