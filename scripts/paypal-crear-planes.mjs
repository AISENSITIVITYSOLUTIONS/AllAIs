#!/usr/bin/env node

// Script para crear planes de suscripción en PayPal.
//
// Uso:
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_ENV=sandbox node paypal-crear-planes.mjs
//
// El script crea 4 planes de suscripción en PayPal (lanzamiento, profesional_1..3)
// con cobro recurrente mensual en MXN. Los ids (P-XXXX) se imprimen al final.
// Guarda los ids en functions/.env como PAYPAL_PLAN_<PLAN>.
//
// Una vez creados, no es necesario re-crear los planes: los ids son permanentes.

import fetch from "node:fetch";

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const env = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();

if (!clientId || !clientSecret) {
  console.error("Error: PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET son requeridos.");
  process.exit(1);
}

const host = env === "production"
  ? "https://api.paypal.com"
  : "https://api.sandbox.paypal.com";

// Configuración de los 4 planes de AllAIs.
const plansConfig = [
  {
    id: "lanzamiento",
    name: "Lanzamiento",
    description: "Precio especial de lanzamiento — 300 consultas al mes.",
    price: "99.00"  // MXN
  },
  {
    id: "profesional_1",
    name: "Esencial",
    description: "300 consultas al mes — resuelve tus tareas del día a día.",
    price: "199.00"  // MXN
  },
  {
    id: "profesional_2",
    name: "Profesional",
    description: "600 consultas al mes — investiga, compara y entrega mejor.",
    price: "299.00"  // MXN
  },
  {
    id: "profesional_3",
    name: "Avanzado",
    description: "1000 consultas al mes — aborda proyectos más exigentes.",
    price: "399.00"  // MXN
  }
];

// Obtén token de acceso OAuth de PayPal.
async function getToken() {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${host}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) {
    throw new Error(`OAuth falló: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.access_token;
}

// Crea un producto en PayPal (por una sola vez; después reutiliza el id).
async function createProduct(token, planConfig) {
  const response = await fetch(`${host}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: planConfig.name,
      description: planConfig.description,
      type: "SERVICE",
      category: "SOFTWARE"
    })
  });
  if (!response.ok) {
    throw new Error(`createProduct falló: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.id;
}

// Crea un plan de suscripción (por una sola vez; después reutiliza el id).
async function createBillingPlan(token, productId, planConfig) {
  const response = await fetch(`${host}/v1/billing/plans`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    body: JSON.stringify({
      product_id: productId,
      name: planConfig.name,
      description: planConfig.description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,  // 0 = infinito
          pricing_scheme: {
            fixed_price: {
              value: planConfig.price,
              currency_code: "MXN"
            }
          }
        }
      ],
      payment_preferences: {
        setup_fee_failure_action: "CANCEL",
        payment_failure_action: "SUSPEND"  // pausar en fallos de cobro
      }
    })
  });
  if (!response.ok) {
    throw new Error(`createBillingPlan falló: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.id;
}

// Flujo principal.
async function main() {
  console.log(`🚀 Creando planes en PayPal (${env})...\n`);

  let token;
  try {
    token = await getToken();
    console.log("✅ Token de acceso obtenido.\n");
  } catch (error) {
    console.error("❌ Error al obtener token:", error.message);
    process.exit(1);
  }

  const results = [];

  for (const plan of plansConfig) {
    console.log(`Creando plan: ${plan.name}...`);
    try {
      const productId = await createProduct(token, plan);
      console.log(`  ✅ Producto creado: ${productId}`);

      const planId = await createBillingPlan(token, productId, plan);
      console.log(`  ✅ Plan de suscripción creado: ${planId}`);

      results.push({ allais_id: plan.id, paypal_id: planId, name: plan.name });
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      process.exit(1);
    }
  }

  console.log("\n✅ Todos los planes creados.\n");
  console.log("Agrega estos ids a functions/.env:\n");
  for (const result of results) {
    console.log(`PAYPAL_PLAN_${result.allais_id.toUpperCase()}=${result.paypal_id}`);
  }
  console.log("\nTambién configura estas variables:");
  console.log("PAYPAL_ENV=sandbox (o 'production' si usas credenciales de producción)");
  console.log("PAYPAL_WEBHOOK_ID=<webhook-id-from-paypal-dashboard>");
}

main().catch(console.error);
