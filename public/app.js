const state = {
  accessCode: localStorage.getItem("nni_access_code") || "",
  providers: []
};

const $ = (selector) => document.querySelector(selector);
const cleanAccessCode = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "").trim();

const elements = {
  providerList: $("#providerList"),
  providerSelect: $("#providerSelect"),
  modeSelect: $("#modeSelect"),
  promptForm: $("#promptForm"),
  promptInput: $("#promptInput"),
  temperatureInput: $("#temperatureInput"),
  temperatureValue: $("#temperatureValue"),
  conversation: $("#conversation"),
  loginButton: $("#loginButton"),
  accessCodeInput: $("#accessCodeInput"),
  sessionState: $("#sessionState"),
  sendButton: $("#sendButton"),
  newChatButton: $("#newChatButton")
};

const systemPrompts = {
  market:
    "Actua como estratega senior de ingenieria de mercados para NNI. Responde con claridad ejecutiva, criterio comercial y foco en conversion, reputacion y viabilidad operativa.",
  research:
    "Actua como investigador senior. Responde con rigor metodologico, cautela conceptual y estructura analitica.",
  education:
    "Actua como disenador instruccional experto. Convierte la respuesta en material claro, ensenable y adaptable a clase.",
  security:
    "Actua como analista de inteligencia estrategica. Prioriza riesgos, patrones, escenarios, evidencia y limites de inferencia.",
  general:
    "Actua como asistente profesional de NNI. Responde de forma sobria, precisa y util."
};

function setSessionState(ok, message) {
  elements.sessionState.textContent = message;
  elements.sessionState.className = ok ? "session-state success" : "session-state error";
}

function addMessage(role, content, meta = "") {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "T" : "N";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const strong = document.createElement("strong");
  strong.textContent = role === "user" ? "Tu prompt" : meta || "NNI Assistant";

  const paragraph = document.createElement("p");
  paragraph.textContent = content;

  bubble.append(strong, paragraph);
  article.append(avatar, bubble);
  elements.conversation.append(article);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

async function loadProviders() {
  const response = await fetch("/api/providers");
  const data = await response.json();
  state.providers = data.providers || [];

  elements.providerList.innerHTML = "";
  elements.providerSelect.innerHTML = "";

  for (const provider of state.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    elements.providerSelect.append(option);

    const card = document.createElement("div");
    card.className = "provider-card";
    card.innerHTML = `<strong>${provider.name}</strong><span>${provider.description}</span>`;
    elements.providerList.append(card);
  }
}

async function login() {
  const accessCode = cleanAccessCode(elements.accessCodeInput.value);
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessCode })
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    setSessionState(false, "Codigo invalido");
    return;
  }

  state.accessCode = accessCode;
  localStorage.setItem("nni_access_code", accessCode);
  setSessionState(true, "Sesion iniciada");
}

async function sendPrompt(event) {
  event.preventDefault();

  const prompt = elements.promptInput.value.trim();
  if (!prompt) return;
  if (!state.accessCode) {
    setSessionState(false, "Ingresa el codigo de acceso antes de enviar.");
    return;
  }

  const provider = elements.providerSelect.value;
  const providerName = elements.providerSelect.options[elements.providerSelect.selectedIndex]?.textContent;
  const temperature = Number(elements.temperatureInput.value);
  const system = systemPrompts[elements.modeSelect.value] || systemPrompts.general;

  addMessage("user", prompt);
  elements.promptInput.value = "";
  elements.sendButton.disabled = true;
  elements.sendButton.textContent = "Procesando...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accessCode: cleanAccessCode(state.accessCode),
        provider,
        prompt,
        system,
        temperature
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");

    addMessage("assistant", data.answer || "Sin respuesta.", `${providerName} · ${data.model || "modelo"}`);
  } catch (error) {
    addMessage("assistant", error.message, "Error de conexion");
  } finally {
    elements.sendButton.disabled = false;
    elements.sendButton.textContent = "Enviar";
  }
}

function resetChat() {
  elements.conversation.innerHTML = "";
  addMessage(
    "assistant",
    "Nueva consulta lista. Selecciona modo, modelo y escribe el prompt.",
    "NNI Assistant"
  );
}

function bindEvents() {
  elements.loginButton.addEventListener("click", login);
  elements.promptForm.addEventListener("submit", sendPrompt);
  elements.newChatButton.addEventListener("click", resetChat);
  elements.temperatureInput.addEventListener("input", () => {
    elements.temperatureValue.textContent = elements.temperatureInput.value;
  });
}

async function init() {
  bindEvents();
  await loadProviders();
  state.accessCode = cleanAccessCode(state.accessCode);
  elements.accessCodeInput.value = state.accessCode;
  setSessionState(Boolean(state.accessCode), state.accessCode ? "Codigo guardado localmente" : "Sesion no iniciada");
}

init();
