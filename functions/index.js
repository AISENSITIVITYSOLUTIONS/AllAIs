const { onRequest } = require("firebase-functions/v2/https");
const { listProviders, callProvider } = require("./providers");

const runtimeOptions = {
  region: "us-central1",
  secrets: [
    "NNI_ACCESS_CODE",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "QWEN_API_KEY",
    "QWEN_BASE_URL",
    "QWEN_MODEL"
  ]
};

function sendJson(response, status, body) {
  response.status(status).set("cache-control", "no-store").json(body);
}

function requireAccess(request) {
  const expected = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
  const accessCode = String(request.body?.accessCode || "").replace(/[^\x20-\x7E]/g, "").trim();
  return accessCode && accessCode === expected;
}

exports.api = onRequest(runtimeOptions, async (request, response) => {
  try {
    const path = request.path.replace(/^\/api/, "") || "/";

    if (path === "/providers" && request.method === "GET") {
      sendJson(response, 200, { providers: listProviders() });
      return;
    }

    if (path === "/session" && request.method === "POST") {
      const expected = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
      const ok = request.body?.accessCode === expected;
      sendJson(response, ok ? 200 : 401, {
        ok,
        message: ok ? "Access granted" : "Invalid access code"
      });
      return;
    }

    if (path === "/chat" && request.method === "POST") {
      if (!requireAccess(request)) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const prompt = String(request.body?.prompt || "").trim();
      const provider = String(request.body?.provider || "openai");
      const system = String(request.body?.system || "").trim();
      const temperature = Math.min(Math.max(Number(request.body?.temperature ?? 0.4), 0), 1.2);

      if (!prompt) {
        sendJson(response, 400, { error: "Prompt is required." });
        return;
      }

      const startedAt = Date.now();
      const result = await callProvider(provider, { prompt, system, temperature });

      sendJson(response, 200, {
        provider,
        model: result.rawModel,
        answer: result.text,
        usage: result.usage,
        elapsedMs: Date.now() - startedAt
      });
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected server error." });
  }
});




// redeploy qwen secret refresh
// qwen secret refresh

// force qwen redeploy 2026-10-04

// force qwen turbo model 2026-10-04

// force qwen flash model 2026-10-04
