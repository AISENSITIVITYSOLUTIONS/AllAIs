// Lista los planes de suscripción de PayPal en el entorno configurado en
// functions/.env (producción o sandbox). Uso, desde la carpeta functions/:
//   node paypal-plans-list.js
// No cambia nada: solo consulta y muestra los planes y su estado.
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const text = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const prod = String(env.PAYPAL_ENV || "sandbox").toLowerCase() === "production";
  const host = prod ? "https://api.paypal.com" : "https://api.sandbox.paypal.com";
  console.log("PAYPAL_ENV =", JSON.stringify(env.PAYPAL_ENV), "-> host:", host);

  // Preferir credenciales pasadas por variables de entorno (PP_ID/PP_SECRET),
  // que es como inyectamos las de Secret Manager; si no, caer al .env local.
  const clientId = (process.env.PP_ID || env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = (process.env.PP_SECRET || env.PAYPAL_CLIENT_SECRET || "").trim();
  console.log("Client ID: len =", clientId.length, "head =", clientId.slice(0, 6));
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokRes = await fetch(`${host}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const tok = await tokRes.json();
  if (!tok.access_token) { console.error("OAuth FALLO:", JSON.stringify(tok)); process.exit(1); }
  console.log("OAuth OK. Consultando planes...\n");

  const res = await fetch(`${host}/v1/billing/plans?page_size=20&total_required=true`, {
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" }
  });
  const data = await res.json();
  const plans = data.plans || [];
  if (!plans.length) { console.log(">>> NO hay planes en este entorno. Hay que crearlos."); return; }
  console.log(`Planes encontrados (${plans.length}):`);
  for (const p of plans) console.log(`  ${p.id}  [${p.status}]  ${p.name || ""}`);
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
