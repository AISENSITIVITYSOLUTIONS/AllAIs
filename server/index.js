const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { listProviders, callProvider } = require("./providers");

loadEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function requireAccess(request) {
  const expected = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
  const accessCode = request.headers["x-nni-access-code"];
  return accessCode && accessCode === expected;
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extension] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  });
}

async function handleApi(request, response) {
  if (request.url === "/api/providers" && request.method === "GET") {
    sendJson(response, 200, { providers: listProviders() });
    return;
  }

  if (request.url === "/api/session" && request.method === "POST") {
    const body = await readBody(request);
    const expected = process.env.NNI_ACCESS_CODE || "NNI-DEMO-2026";
    sendJson(response, body.accessCode === expected ? 200 : 401, {
      ok: body.accessCode === expected,
      message: body.accessCode === expected ? "Access granted" : "Invalid access code"
    });
    return;
  }

  if (request.url === "/api/chat" && request.method === "POST") {
    if (!requireAccess(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const body = await readBody(request);
    const prompt = String(body.prompt || "").trim();
    const provider = String(body.provider || "openai");
    const system = String(body.system || "").trim();
    const temperature = Math.min(Math.max(Number(body.temperature ?? 0.4), 0), 1.2);

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
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NNI AI Platform running at http://${HOST}:${PORT}`);
});
