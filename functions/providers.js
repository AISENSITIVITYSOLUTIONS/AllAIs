const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const GEMINI_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

const QWEN_DEFAULT_BASE_URL =
  "https://ws-cxspccc12vzxj16l.us-east-1.maas.aliyuncs.com/compatible-mode/v1";

function cleanSecret(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function cleanModel(value, fallback) {
  return String(value || fallback || "").trim();
}

function buildMessages(payload) {
  const language = payload.language || "es";
  const mode = payload.mode || "general";
  const prompt = payload.prompt || "";

  return [
    {
      role: "system",
      content: `Responde en idioma ${language}. Modo de trabajo: ${mode}. Sé claro, útil y profesional.`
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

function buildChatEndpoint(baseUrl) {
  let value = String(baseUrl || "")
    .replace(/^\uFEFF/, "")
    .trim();

  const markdownUrl = value.match(/\((https?:\/\/[^)]+)\)/);
  if (markdownUrl) {
    value = markdownUrl[1];
  }

  const bracketUrl = value.match(/\[(https?:\/\/[^\]]+)\]/);
  if (bracketUrl) {
    value = bracketUrl[1];
  }

  return `${value.replace(/\/+$/, "")}/chat/completions`;
}

async function parseResponse(response) {
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  if (!response.ok) {
    const message =
      data.error?.message ||
      data.message ||
      data.detail ||
      JSON.stringify(data);

    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }

  return data;
}

async function callOpenAICompatible(
  endpoint,
  apiKey,
  model,
  payload,
  extraBody = {}
) {
  const cleanApiKey = cleanSecret(apiKey);

  if (!cleanApiKey) {
    throw new Error("Falta configurar la API key del proveedor seleccionado.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(payload),
      temperature: 0.7,
      max_tokens: 1200,
      ...extraBody
    })
  });

  const data = await parseResponse(response);

  return {
    text: data.choices?.[0]?.message?.content || "Sin respuesta.",
    raw: data
  };
}

async function callQwenStreaming(payload) {
  const apiKey = cleanSecret(process.env.QWEN_API_KEY);

  if (!apiKey) {
    throw new Error("Falta configurar la API key de Qwen.");
  }

  const model = cleanModel(process.env.QWEN_MODEL, "qwen-flash-2025-07-28");
  const endpoint = buildChatEndpoint(
    process.env.QWEN_BASE_URL || QWEN_DEFAULT_BASE_URL
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(payload),
      temperature: 0.7,
      max_tokens: 1200,
      stream: true,
      extra_body: {
        enable_thinking: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Qwen no devolvió un stream válido.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let answer = "";
  let reasoning = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || !line.startsWith("data:")) {
        continue;
      }

      const data = line.replace(/^data:\s*/, "");

      if (data === "[DONE]") {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        continue;
      }

      const delta = parsed.choices?.[0]?.delta || {};

      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
      }

      if (delta.content) {
        answer += delta.content;
      }
    }
  }

  return {
    text: answer || reasoning || "Sin respuesta.",
    raw: {
      model,
      reasoning,
      answer
    }
  };
}

async function callAnthropic(payload) {
  const apiKey = cleanSecret(process.env.ANTHROPIC_API_KEY);

  if (!apiKey) {
    throw new Error("Falta configurar la API key de Claude.");
  }

  const model = cleanModel(
    process.env.ANTHROPIC_MODEL,
    "claude-3-5-sonnet-latest"
  );

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.7,
      system: `Responde en idioma ${payload.language || "es"}. Modo de trabajo: ${
        payload.mode || "general"
      }. Sé claro, útil y profesional.`,
      messages: [
        {
          role: "user",
          content: payload.prompt || ""
        }
      ]
    })
  });

  const data = await parseResponse(response);

  return {
    text:
      data.content
        ?.map((item) => item.text)
        .filter(Boolean)
        .join("\n") || "Sin respuesta.",
    raw: data
  };
}

async function callGemini(payload) {
  const apiKey = cleanSecret(process.env.GEMINI_API_KEY);

  if (!apiKey) {
    throw new Error("Falta configurar la API key de Gemini.");
  }

  const model = cleanModel(process.env.GEMINI_MODEL, "gemini-3.8-flash");
  const endpoint = `${GEMINI_ENDPOINT_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: `Responde en idioma ${payload.language || "es"}. Modo de trabajo: ${
              payload.mode || "general"
            }. Sé claro, útil y profesional.`
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: payload.prompt || ""
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1200
      }
    })
  });

  const data = await parseResponse(response);

  return {
    text:
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join("\n") || "Sin respuesta.",
    raw: data
  };
}

const providers = {
  openai: {
    name: "ChatGPT / OpenAI",
    description:
      "Uso general, redacción, análisis, síntesis, código y asistentes robustos.",
    call: (payload) =>
      callOpenAICompatible(
        OPENAI_CHAT_ENDPOINT,
        process.env.OPENAI_API_KEY,
        cleanModel(process.env.OPENAI_MODEL, "gpt-4o-mini"),
        payload
      )
  },

  claude: {
    name: "Claude",
    description:
      "Lectura larga, razonamiento editorial, análisis fino y escritura sobria.",
    call: callAnthropic
  },

  gemini: {
    name: "Gemini",
    description:
      "Modelo de Google para razonamiento general, síntesis y tareas multimodales.",
    call: callGemini
  },

  deepseek: {
    name: "DeepSeek",
    description:
      "Modelo eficiente para programación, razonamiento técnico y análisis estructurado.",
    call: (payload) =>
      callOpenAICompatible(
        DEEPSEEK_ENDPOINT,
        process.env.DEEPSEEK_API_KEY,
        cleanModel(process.env.DEEPSEEK_MODEL, "deepseek-chat"),
        payload
      )
  },

  qwen: {
    name: "Qwen",
    description:
      "Modelo asiático competitivo para flujos multilingües y operación económica.",
    call: callQwenStreaming
  }
};

function listProviders() {
  return Object.entries(providers).map(([id, provider]) => ({
    id,
    name: provider.name,
    description: provider.description
  }));
}

function getProvider(providerId) {
  return providers[providerId] || providers.openai;
}

async function callProvider(providerId, payload) {
  const provider = getProvider(providerId);
  return provider.call(payload);
}

module.exports = {
  listProviders,
  callProvider,
  getProvider,
  buildChatEndpoint
};