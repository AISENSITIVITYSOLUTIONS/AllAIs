const test = require("node:test");
const assert = require("node:assert/strict");

// Catálogo simulado de OpenRouter: un modelo curado económico, uno curado premium
// y uno fuera de la lista curada.
const CATALOG = {
  data: [
    { id: "openai/gpt-6-luna", name: "GPT-6 Luna", pricing: { prompt: "0", completion: "0.0000005" } },
    { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", pricing: { prompt: "0", completion: "0.00005" } },
    { id: "moonshotai/kimi-k3", name: "Kimi K3", pricing: { prompt: "0", completion: "0.0000025" } }
  ]
};

process.env.OPENROUTER_API_KEY = "test-key";
global.fetch = async () => ({ ok: true, json: async () => CATALOG });

const { openRouterCatalogFor, openRouterModelAllowed } = require("../providers");

test("el administrador recibe el catálogo completo", async () => {
  const models = await openRouterCatalogFor({ admin: true });
  assert.equal(models.length, 3);
});

test("los clientes solo reciben la lista curada", async () => {
  const ids = (await openRouterCatalogFor({ admin: false })).map((m) => m.id);
  assert.deepEqual(ids.sort(), ["anthropic/claude-opus-5.5", "openai/gpt-6-luna"]);
});

test("un cliente no puede usar un modelo fuera de la lista curada, aun con el plan más alto", async () => {
  const gate = await openRouterModelAllowed("moonshotai/kimi-k3", "profesional_3");
  assert.equal(gate.allowed, false);
  assert.equal(gate.adminOnly, true);
});

test("el administrador puede usar cualquier modelo, sin candado de plan", async () => {
  assert.equal((await openRouterModelAllowed("moonshotai/kimi-k3", null, { admin: true })).allowed, true);
  assert.equal((await openRouterModelAllowed("anthropic/claude-opus-5.5", null, { admin: true })).allowed, true);
});

test("los modelos curados siguen limitados por plan para los clientes", async () => {
  const free = await openRouterModelAllowed("anthropic/claude-opus-5.5", null);
  assert.equal(free.allowed, false);
  assert.equal(free.adminOnly, false);
  assert.equal((await openRouterModelAllowed("anthropic/claude-opus-5.5", "profesional_2")).allowed, true);
  assert.equal((await openRouterModelAllowed("openai/gpt-6-luna", null)).allowed, true);
});
