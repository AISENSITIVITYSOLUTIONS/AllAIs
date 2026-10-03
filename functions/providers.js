const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_ENDPOINT = "https://api.anthropic.com/v1/models";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const QWEN_ENDPOINT = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

function buildMessages({ system, prompt }) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

function cleanSecret(value) {
  return String(value || "").replace(/[^\x20-\x7E]/g, "").trim();
}

function cleanModel(value) {
  return String(value || "").replace(/[^\x20-\x7E]/g, "").trim();
}

function uniqueValues(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

async function postJson(url, { headers, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }

  return data;
}

async function getJson(url, { headers }) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }

  return data;
}

function chooseAnthropicModel(models, preferredModel) {
  const ids = models
    .map((model) => model?.id || model?.name)
    .filter(Boolean);

  if (preferredModel && ids.includes(preferredModel)) {
    return preferredModel;
  }

  const priorities = [
    /sonnet/i,
    /haiku/i,
    /opus/i,
    /claude/i
  ];

  for (const priority of priorities) {
    const match = ids.find((id) => priority.test(id));
    if (match) return match;
  }

  return ids[0] || "";
}

async function callOpenAI({ prompt, system, temperature }) {
  const apiKey = cleanSecret(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const data = await postJson(OPENAI_CHAT_ENDPOINT, {
    headers: { authorization: `Bearer ${apiKey}` },
    body: {
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: buildMessages({ system, prompt }),
      temperature
    }
  });

  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage || null,
    rawModel: data.model
  };
}

async function callAnthropic({ prompt, system, temperature }) {
  const apiKey = cleanSecret(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  };

  const preferredModel = cleanModel(process.env.ANTHROPIC_MODEL);
  let model = preferredModel;

  try {
    const available = await getJson(ANTHROPIC_MODELS_ENDPOINT, { headers });
    const availableModels = Array.isArray(available?.data) ? available.data : [];
    model = chooseAnthropicModel(availableModels, preferredModel);
  } catch (error) {
    if (!model) {
      throw new Error(`Claude models could not be loaded: ${error.message}`);
    }
  }

  if (!model) {
    throw new Error("Claude API error: no Anthropic model is available for this API key.");
  }

  const data = await postJson(ANTHROPIC_ENDPOINT, {
    headers,
    body: {
      model,
      max_tokens: 1600,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }]
    }
  });

  return {
    text: data.content?.map((item) => item.text).filter(Boolean).join("\n") || "",
    usage: data.usage || null,
    rawModel: data.model || model
  };
}

async function callGemini({ prompt, system, temperature }) {
  const apiKey = cleanSecret(process.env.GEMINI_API_KEY);
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
  const data = await postJson(`${GEMINI_ENDPOINT_BASE}/${model}:generateContent?key=${apiKey}`, {
    body: {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    }
  });

  return {
    text: data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "",
    usage: data.usageMetadata || null,
    rawModel: model
  };
}

async function callOpenAICompatible(endpoint, apiKey, model, { prompt, system, temperature }) {
  apiKey = cleanSecret(apiKey);
  if (!apiKey) throw new Error("Provider API key is not configured.");

  const data = await postJson(endpoint, {
    headers: { authorization: `Bearer ${apiKey}` },
    body: {
      model,
      messages: buildMessages({ system, prompt }),
      temperature
    }
  });

  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage || null,
    rawModel: data.model || model
  };
}

const providerCatalog = {
  openai: {
    name: "ChatGPT / OpenAI",
    description: "Uso general, redacción, análisis, síntesis, código y asistentes robustos.",
    call: callOpenAI
  },
  claude: {
    name: "Claude",
    description: "Lectura larga, razonamiento editorial, análisis fino y escritura sobria.",
    call: callAnthropic
  },
  gemini: {
    name: "Gemini",
    description: "Integración con ecosistema Google, análisis amplio y trabajo multimodal.",
    call: callGemini
  },
  deepseek: {
    name: "DeepSeek",
    description: "Costo competitivo para tareas de razonamiento, código y producción masiva.",
    call: (payload) =>
      callOpenAICompatible(
        DEEPSEEK_ENDPOINT,
        process.env.DEEPSEEK_API_KEY,
        process.env.DEEPSEEK_MODEL || "deepseek-chat",
        payload
      )
  },
  qwen: {
    name: "Qwen",
    description: "Modelo asiático competitivo para flujos multilingües y operación económica.",
    call: (payload) =>
      callOpenAICompatible(
        QWEN_ENDPOINT,
        process.env.QWEN_API_KEY,
        process.env.QWEN_MODEL || "qwen-plus",
        payload
      )
  },
  happyhorse: {
    name: "Happy Horse",
    description: "Proveedor externo configurable. Agrega endpoint y contrato cuando tengas documentación.",
    call: async () => {
      throw new Error("Happy Horse requiere documentación de API: endpoint, headers y formato de respuesta.");
    }
  }
};

function listProviders() {
  return Object.entries(providerCatalog).map(([id, provider]) => ({
    id,
    name: provider.name,
    description: provider.description
  }));
}

async function callProvider(providerId, payload) {
  const provider = providerCatalog[providerId];
  if (!provider) throw new Error(`Unsupported provider: ${providerId}`);
  return provider.call(payload);
}

module.exports = { listProviders, callProvider };
