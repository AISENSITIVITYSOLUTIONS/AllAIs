const state = {
  accessCode: "",
  language: localStorage.getItem("nni_language") || "es",
  providers: [],
  selectedTask: "write"
};

const $ = (selector) => document.querySelector(selector);
const cleanAccessCode = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "").trim();

const elements = {
  providerList: $("#providerList"),
  providerSelect: $("#providerSelect"),
  modeSelect: $("#modeSelect"),
  taskGrid: $("#taskGrid"),
  promptForm: $("#promptForm"),
  promptInput: $("#promptInput"),
  temperatureInput: $("#temperatureInput"),
  temperatureValue: $("#temperatureValue"),
  conversation: $("#conversation"),
  loginButton: $("#loginButton"),
  loginBox: $("#loginBox"),
  accessCodeInput: $("#accessCodeInput"),
  toggleAccessVisibility: $("#toggleAccessVisibility"),
  sessionState: $("#sessionState"),
  sendButton: $("#sendButton"),
  newChatButton: $("#newChatButton"),
  languageButtons: document.querySelectorAll(".language-button"),
  accessPanelLabel: $("#accessPanelLabel"),
  providersPanelLabel: $("#providersPanelLabel"),
  platformPanelLabel: $("#platformPanelLabel"),
  platformDescription: $("#platformDescription"),
  heroTitle: $("#heroTitle"),
  advancedSummary: $("#advancedSummary"),
  providerLabel: $("#providerLabel"),
  modeLabel: $("#modeLabel"),
  temperatureLabel: $("#temperatureLabel")
};

const taskConfig = {
  write: {
    mode: "general",
  },
  learn: {
    mode: "education",
  },
  research: {
    mode: "research",
  },
  analyze: {
    mode: "security",
  },
  summarize: {
    mode: "general",
  },
  strategy: {
    mode: "market",
  },
  code: {
    mode: "general",
  },
  other: {
    mode: "general"
  }
};

const translations = {
  es: {
    newChat: "Nueva consulta",
    access: "Acceso",
    accessPlaceholder: "Código de acceso",
    showCode: "Mostrar código",
    hideCode: "Ocultar código",
    enter: "Entrar",
    exit: "Salir",
    signedOut: "Sesión no iniciada",
    savedLocally: "Código eliminado al abrir. Inicia sesión para continuar.",
    invalidCode: "Código inválido",
    welcome: "Bienvenido. Sesión iniciada.",
    needAccess: "Ingresa el código de acceso antes de enviar.",
    providers: "Modelos conectables",
    platform: "Plataforma",
    platformDescription: "Un gateway profesional para operar modelos de IA sin exponer claves privadas ni perder control del uso.",
    heroTitle: "¿Qué quieres hacer?",
    advanced: "Opciones avanzadas",
    provider: "Modelo recomendado",
    mode: "Modo técnico",
    temperature: "Temperatura",
    send: "Continuar",
    processing: "Procesando...",
    userPrompt: "Tu prompt",
    error: "Error de conexion",
    emptyAnswer: "Sin respuesta.",
    providerFallback: "modelo",
    taskPrefix: "Tarea",
    objectivePrefix: "Objetivo del usuario",
    tasks: {
      write: {
        label: "Escribir",
        description: "Mensajes, emails, cartas, propuestas y textos.",
        placeholder: "Ejemplo: Necesito escribirle un mensaje a mi jefe para pedirle una reunión breve esta semana...",
        options: ["Mensaje", "Email", "Carta formal", "Publicación para redes", "Propuesta", "Texto académico", "Texto comercial"]
      },
      learn: {
        label: "Aprender",
        description: "Explicaciones claras por nivel de conocimiento.",
        placeholder: "Ejemplo: Explícame la Revolución Mexicana para un niño de 10 años...",
        options: ["Explicación simple", "Clase breve", "Guía paso a paso", "Ejemplo cotidiano", "Preguntas de repaso"]
      },
      research: {
        label: "Investigar",
        description: "Preguntas, hipótesis, métodos y revisión inicial.",
        placeholder: "Ejemplo: Ayúdame a formular preguntas de investigación sobre desigualdad urbana e IA...",
        options: ["Pregunta de investigación", "Hipótesis", "Marco conceptual", "Diseño metodológico", "Revisión inicial"]
      },
      analyze: {
        label: "Analizar",
        description: "Lectura crítica, patrones, riesgos y argumentos.",
        placeholder: "Ejemplo: Analiza este problema y distingue riesgos, patrones, actores y escenarios...",
        options: ["Análisis crítico", "Riesgos", "Escenarios", "Comparación", "Argumentos principales"]
      },
      summarize: {
        label: "Resumir",
        description: "Síntesis ejecutiva, académica o didáctica.",
        placeholder: "Ejemplo: Resume este texto en cinco ideas principales y una conclusión ejecutiva...",
        options: ["Resumen ejecutivo", "Resumen académico", "Síntesis breve", "Puntos clave", "Conclusiones"]
      },
      strategy: {
        label: "Crear estrategia",
        description: "Decisiones, mercados, comunicación y escenarios.",
        placeholder: "Ejemplo: Diseña una estrategia para presentar AllAIs a clientes profesionales...",
        options: ["Estrategia comercial", "Plan de acción", "Comunicación", "Mercado", "Decisión ejecutiva"]
      },
      code: {
        label: "Programar",
        description: "Ayuda técnica, depuración y explicación.",
        placeholder: "Ejemplo: Ayúdame a corregir este error de JavaScript y explícame qué pasó...",
        options: ["Corregir error", "Explicar código", "Crear función", "Mejorar interfaz", "Arquitectura"]
      },
      other: {
        label: "Otro",
        description: "Describe libremente lo que necesitas resolver.",
        placeholder: "Describe libremente lo que necesitas resolver...",
        options: ["Consulta general", "Exploración", "Idea inicial", "Ayuda puntual"]
      }
    },
    tones: {
      professional: "Profesional",
      academic: "Académico",
      strategic: "Estratégico",
      educational: "Educativo",
      brief: "Breve",
      detailed: "Detallado",
      child: "Para niño de 10 años",
      beginner: "Principiante",
      expert: "Experto"
    },
    toneInstructions: {
      professional: "Usa un tono profesional, claro y directo.",
      academic: "Usa un tono academico, riguroso y conceptualmente preciso.",
      strategic: "Usa un tono estrategico, ejecutivo y orientado a decisiones.",
      educational: "Usa un tono educativo, claro, gradual y facil de comprender.",
      brief: "Responde de forma breve, practica y sin rodeos.",
      detailed: "Responde con detalle, estructura y explicacion suficiente.",
      child: "Explica como si el lector tuviera 10 anos, con ejemplos sencillos.",
      beginner: "Explica para una persona principiante, evitando tecnicismos innecesarios.",
      expert: "Responde para una persona experta, con precision y profundidad."
    },
    modes: {
      market: "Ingeniería de mercados",
      research: "Investigación aplicada",
      education: "Educación y formación",
      security: "Inteligencia estratégica",
      general: "General"
    }
  },
  en: {
    newChat: "New request",
    access: "Access",
    accessPlaceholder: "Access code",
    showCode: "Show code",
    hideCode: "Hide code",
    enter: "Enter",
    exit: "Sign out",
    signedOut: "Session not started",
    savedLocally: "Access code cleared on open. Sign in to continue.",
    invalidCode: "Invalid code",
    welcome: "Welcome. Session started.",
    needAccess: "Enter the access code before sending.",
    providers: "Connectable models",
    platform: "Platform",
    platformDescription: "A professional gateway to operate AI models without exposing private keys or losing usage control.",
    heroTitle: "What do you want to do?",
    advanced: "Advanced options",
    provider: "Recommended model",
    mode: "Technical mode",
    temperature: "Temperature",
    send: "Continue",
    processing: "Processing...",
    userPrompt: "Your prompt",
    error: "Connection error",
    emptyAnswer: "No response.",
    providerFallback: "model",
    taskPrefix: "Task",
    objectivePrefix: "User objective",
    tasks: {
      write: {
        label: "Write",
        description: "Messages, emails, letters, proposals and texts.",
        placeholder: "Example: I need to write my boss a message asking for a short meeting this week...",
        options: ["Message", "Email", "Formal letter", "Social post", "Proposal", "Academic text", "Commercial text"]
      },
      learn: {
        label: "Learn",
        description: "Clear explanations by knowledge level.",
        placeholder: "Example: Explain the Mexican Revolution to a 10-year-old child...",
        options: ["Simple explanation", "Short lesson", "Step-by-step guide", "Everyday example", "Review questions"]
      },
      research: {
        label: "Research",
        description: "Questions, hypotheses, methods and initial review.",
        placeholder: "Example: Help me formulate research questions about urban inequality and AI...",
        options: ["Research question", "Hypothesis", "Conceptual framework", "Methodological design", "Initial review"]
      },
      analyze: {
        label: "Analyze",
        description: "Critical reading, patterns, risks and arguments.",
        placeholder: "Example: Analyze this problem and distinguish risks, patterns, actors and scenarios...",
        options: ["Critical analysis", "Risks", "Scenarios", "Comparison", "Main arguments"]
      },
      summarize: {
        label: "Summarize",
        description: "Executive, academic or didactic synthesis.",
        placeholder: "Example: Summarize this text in five main ideas and an executive conclusion...",
        options: ["Executive summary", "Academic summary", "Brief synthesis", "Key points", "Conclusions"]
      },
      strategy: {
        label: "Create strategy",
        description: "Decisions, markets, communication and scenarios.",
        placeholder: "Example: Design a strategy to present AllAIs to professional clients...",
        options: ["Commercial strategy", "Action plan", "Communication", "Market", "Executive decision"]
      },
      code: {
        label: "Code",
        description: "Technical help, debugging and explanation.",
        placeholder: "Example: Help me fix this JavaScript error and explain what happened...",
        options: ["Fix error", "Explain code", "Create function", "Improve interface", "Architecture"]
      },
      other: {
        label: "Other",
        description: "Freely describe what you need to solve.",
        placeholder: "Freely describe what you need to solve...",
        options: ["General request", "Exploration", "Initial idea", "Quick help"]
      }
    },
    tones: {
      professional: "Professional",
      academic: "Academic",
      strategic: "Strategic",
      educational: "Educational",
      brief: "Brief",
      detailed: "Detailed",
      child: "For a 10-year-old child",
      beginner: "Beginner",
      expert: "Expert"
    },
    toneInstructions: {
      professional: "Use a professional, clear and direct tone.",
      academic: "Use an academic, rigorous and conceptually precise tone.",
      strategic: "Use a strategic, executive and decision-oriented tone.",
      educational: "Use an educational, clear and gradual tone.",
      brief: "Respond briefly, practically and directly.",
      detailed: "Respond with detail, structure and sufficient explanation.",
      child: "Explain as if the reader were 10 years old, with simple examples.",
      beginner: "Explain for a beginner, avoiding unnecessary jargon.",
      expert: "Respond for an expert, with precision and depth."
    },
    modes: {
      market: "Market engineering",
      research: "Applied research",
      education: "Education and training",
      security: "Strategic intelligence",
      general: "General"
    }
  },
  fr: {
    newChat: "Nouvelle demande",
    access: "Accès",
    accessPlaceholder: "Code d'accès",
    showCode: "Afficher le code",
    hideCode: "Masquer le code",
    enter: "Entrer",
    exit: "Sortir",
    signedOut: "Session non démarrée",
    savedLocally: "Code d'accès effacé à l'ouverture. Connectez-vous pour continuer.",
    invalidCode: "Code invalide",
    welcome: "Bienvenue. Session démarrée.",
    needAccess: "Entrez le code d'accès avant d'envoyer.",
    providers: "Modèles connectables",
    platform: "Plateforme",
    platformDescription: "Une passerelle professionnelle pour utiliser des modèles d'IA sans exposer les clés privées ni perdre le contrôle de l'usage.",
    heroTitle: "Que voulez-vous faire ?",
    advanced: "Options avancées",
    provider: "Modèle recommandé",
    mode: "Mode technique",
    temperature: "Température",
    send: "Continuer",
    processing: "Traitement...",
    userPrompt: "Votre demande",
    error: "Erreur de connexion",
    emptyAnswer: "Aucune réponse.",
    providerFallback: "modèle",
    taskPrefix: "Tâche",
    objectivePrefix: "Objectif de l'utilisateur",
    tasks: {
      write: {
        label: "Écrire",
        description: "Messages, emails, lettres, propositions et textes.",
        placeholder: "Exemple : Je dois écrire un message à mon responsable pour demander une courte réunion cette semaine...",
        options: ["Message", "Email", "Lettre formelle", "Publication réseaux sociaux", "Proposition", "Texte académique", "Texte commercial"]
      },
      learn: {
        label: "Apprendre",
        description: "Explications claires selon le niveau de connaissance.",
        placeholder: "Exemple : Explique-moi la Révolution mexicaine pour un enfant de 10 ans...",
        options: ["Explication simple", "Courte leçon", "Guide étape par étape", "Exemple quotidien", "Questions de révision"]
      },
      research: {
        label: "Rechercher",
        description: "Questions, hypothèses, méthodes et première revue.",
        placeholder: "Exemple : Aide-moi à formuler des questions de recherche sur les inégalités urbaines et l'IA...",
        options: ["Question de recherche", "Hypothèse", "Cadre conceptuel", "Design méthodologique", "Revue initiale"]
      },
      analyze: {
        label: "Analyser",
        description: "Lecture critique, tendances, risques et arguments.",
        placeholder: "Exemple : Analyse ce problème et distingue les risques, les tendances, les acteurs et les scénarios...",
        options: ["Analyse critique", "Risques", "Scénarios", "Comparaison", "Arguments principaux"]
      },
      summarize: {
        label: "Résumer",
        description: "Synthèse exécutive, académique ou pédagogique.",
        placeholder: "Exemple : Résume ce texte en cinq idées principales et une conclusion exécutive...",
        options: ["Résumé exécutif", "Résumé académique", "Synthèse brève", "Points clés", "Conclusions"]
      },
      strategy: {
        label: "Créer une stratégie",
        description: "Décisions, marchés, communication et scénarios.",
        placeholder: "Exemple : Conçois une stratégie pour présenter AllAIs à des clients professionnels...",
        options: ["Stratégie commerciale", "Plan d'action", "Communication", "Marché", "Décision exécutive"]
      },
      code: {
        label: "Code",
        description: "Aide technique, débogage et explication.",
        placeholder: "Exemple : Aide-moi à corriger cette erreur JavaScript et explique ce qui s'est passé...",
        options: ["Corriger une erreur", "Expliquer du code", "Créer une fonction", "Améliorer l'interface", "Architecture"]
      },
      other: {
        label: "Autre",
        description: "Décrivez librement ce que vous devez résoudre.",
        placeholder: "Décrivez librement ce que vous devez résoudre...",
        options: ["Demande générale", "Exploration", "Idée initiale", "Aide rapide"]
      }
    },
    tones: {
      professional: "Professionnel",
      academic: "Académique",
      strategic: "Stratégique",
      educational: "Pédagogique",
      brief: "Bref",
      detailed: "Détaillé",
      child: "Pour un enfant de 10 ans",
      beginner: "Débutant",
      expert: "Expert"
    },
    toneInstructions: {
      professional: "Utilise un ton professionnel, clair et direct.",
      academic: "Utilise un ton académique, rigoureux et conceptuellement précis.",
      strategic: "Utilise un ton stratégique, exécutif et orienté décision.",
      educational: "Utilise un ton pédagogique, clair et progressif.",
      brief: "Réponds brièvement, de façon pratique et directe.",
      detailed: "Réponds avec détail, structure et explication suffisante.",
      child: "Explique comme si le lecteur avait 10 ans, avec des exemples simples.",
      beginner: "Explique pour une personne débutante, sans jargon inutile.",
      expert: "Réponds pour une personne experte, avec précision et profondeur."
    },
    modes: {
      market: "Ingénierie des marchés",
      research: "Recherche appliquée",
      education: "Éducation et formation",
      security: "Intelligence stratégique",
      general: "Général"
    }
  }
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

function updateTaskUI(taskId) {
  const copy = translations[state.language];
  const task = copy.tasks[taskId] || copy.tasks.other;
  const config = taskConfig[taskId] || taskConfig.other;
  state.selectedTask = taskId;

  document.querySelectorAll(".task-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.task === taskId);
    const taskCopy = copy.tasks[button.dataset.task];
    if (taskCopy) {
      button.querySelector("strong").textContent = taskCopy.label;
    }
  });

  elements.promptInput.placeholder = task.placeholder;
  elements.modeSelect.value = config.mode;
}

function setSessionState(ok, message) {
  elements.sessionState.textContent = message;
  elements.sessionState.className = ok ? "session-state success" : "session-state error";
}

function renderSelect(select, options, selectedValue) {
  select.innerHTML = "";
  for (const [value, label] of Object.entries(options)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = selectedValue;
}

function setLanguage(language) {
  state.language = translations[language] ? language : "es";
  localStorage.setItem("nni_language", state.language);

  const copy = translations[state.language];
  document.documentElement.lang = state.language;
  elements.newChatButton.innerHTML = `<span>+</span> ${copy.newChat}`;
  elements.accessPanelLabel.textContent = copy.access;
  elements.providersPanelLabel.textContent = copy.providers;
  elements.platformPanelLabel.textContent = copy.platform;
  elements.platformDescription.textContent = copy.platformDescription;
  elements.heroTitle.textContent = copy.heroTitle;
  elements.accessCodeInput.placeholder = copy.accessPlaceholder;
  elements.advancedSummary.textContent = copy.advanced;
  elements.providerLabel.textContent = copy.provider;
  elements.modeLabel.textContent = copy.mode;
  elements.temperatureLabel.textContent = copy.temperature;
  elements.sendButton.textContent = copy.send;
  elements.loginButton.textContent = state.accessCode ? copy.exit : copy.enter;
  elements.toggleAccessVisibility.setAttribute(
    "aria-label",
    elements.accessCodeInput.type === "password" ? copy.showCode : copy.hideCode
  );

  renderSelect(elements.modeSelect, copy.modes, elements.modeSelect.value || "general");
  updateTaskUI(state.selectedTask);

  elements.languageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.language);
  });

  if (!state.accessCode && !elements.sessionState.classList.contains("error")) {
    setSessionState(false, copy.signedOut);
  }
}

function logout() {
  const copy = translations[state.language];
  state.accessCode = "";
  elements.loginBox.classList.remove("authenticated");
  elements.accessCodeInput.value = "";
  elements.accessCodeInput.type = "password";
  elements.loginButton.textContent = copy.enter;
  elements.toggleAccessVisibility.textContent = "👁";
  setSessionState(false, copy.signedOut);
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
  strong.textContent = role === "user" ? translations[state.language].userPrompt : meta || "NNI Assistant";

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
  const copy = translations[state.language];

  if (state.accessCode) {
    logout();
    return;
  }

  const accessCode = cleanAccessCode(elements.accessCodeInput.value);
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessCode })
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    setSessionState(false, copy.invalidCode);
    return;
  }

  state.accessCode = accessCode;
  elements.accessCodeInput.value = "";
  elements.loginBox.classList.add("authenticated");
  elements.loginButton.textContent = copy.exit;
  setSessionState(true, copy.welcome);
}

async function sendPrompt(event) {
  event.preventDefault();

  const prompt = elements.promptInput.value.trim();
  if (!prompt) return;
  if (!state.accessCode) {
    setSessionState(false, translations[state.language].needAccess);
    return;
  }

  const copy = translations[state.language];
  const provider = elements.providerSelect.value;
  const providerName = elements.providerSelect.options[elements.providerSelect.selectedIndex]?.textContent;
  const temperature = Number(elements.temperatureInput.value);
  const taskLabel = copy.tasks[state.selectedTask]?.label || copy.tasks.other.label;
  const systemBase = systemPrompts[elements.modeSelect.value] || systemPrompts.general;
  const system = `${systemBase} La tarea del usuario es: ${taskLabel}.`;
  const enrichedPrompt = `${copy.taskPrefix}: ${taskLabel}\n\n${copy.objectivePrefix}:\n${prompt}`;

  addMessage("user", prompt, taskLabel);
  elements.promptInput.value = "";
  elements.sendButton.disabled = true;
  elements.sendButton.textContent = copy.processing;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accessCode: cleanAccessCode(state.accessCode),
        provider,
        prompt: enrichedPrompt,
        system,
        temperature
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");

    addMessage("assistant", data.answer || copy.emptyAnswer, `${providerName} · ${data.model || copy.providerFallback}`);
  } catch (error) {
    addMessage("assistant", error.message, copy.error);
  } finally {
    elements.sendButton.disabled = false;
    elements.sendButton.textContent = copy.send;
  }
}

function resetChat() {
  elements.conversation.innerHTML = "";
  updateTaskUI("write");
}

function bindEvents() {
  elements.loginButton.addEventListener("click", login);
  elements.toggleAccessVisibility.addEventListener("click", () => {
    const copy = translations[state.language];
    const isPassword = elements.accessCodeInput.type === "password";
    elements.accessCodeInput.type = isPassword ? "text" : "password";
    elements.toggleAccessVisibility.textContent = isPassword ? "🙈" : "👁";
    elements.toggleAccessVisibility.setAttribute("aria-label", isPassword ? copy.hideCode : copy.showCode);
  });
  elements.promptForm.addEventListener("submit", sendPrompt);
  elements.newChatButton.addEventListener("click", resetChat);
  elements.languageButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  elements.taskGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".task-card");
    if (!button) return;
    updateTaskUI(button.dataset.task);
  });
  elements.temperatureInput.addEventListener("input", () => {
    elements.temperatureValue.textContent = elements.temperatureInput.value;
  });
}

async function init() {
  localStorage.removeItem("nni_access_code");
  state.accessCode = "";
  elements.accessCodeInput.value = "";
  bindEvents();
  await loadProviders();
  setLanguage(state.language);
  updateTaskUI(state.selectedTask);
  setSessionState(false, translations[state.language].signedOut);
}

init();
