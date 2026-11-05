const test = require("node:test");
const assert = require("node:assert/strict");
const { isAdminEmail, adminEmails } = require("../admins");

test("el dueño es administrador aunque ADMIN_EMAILS no exista", () => {
  assert.equal(isAdminEmail("fdealbam@nni.ai", {}), true);
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
