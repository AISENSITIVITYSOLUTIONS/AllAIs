const state = {
  accessCode: "",
  authMode: "",
  email: "",
  quota: null,
  language: localStorage.getItem("nni_language") || "es",
  providers: [],
  selectedTask: "write",
  selectedProvider: "openai",
  history: [],
  attachments: [],
  pendingAttachmentKind: "file"
};

const $ = (selector) => document.querySelector(selector);
const cleanAccessCode = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "").trim();
const isEmailValue = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
const CONSENT_KEY = "allais_privacy_consent";
const isAuthenticated = () => Boolean(state.accessCode || state.authMode === "email");
const API_BASE = "/api";

function trackEvent(eventName, params = {}) {
  if (typeof window.gtag !== "function") return;

  window.gtag("event", eventName, {
    app_name: "AllAIs",
    ...params
  });
}

const elements = {
  providerList: $("#providerList"),
  taskGrid: $("#taskGrid"),
  taskMoreButton: $("#taskMoreButton"),
  taskMoreMenu: $("#taskMoreMenu"),
  promptForm: $("#promptForm"),
  promptInput: $("#promptInput"),
  attachButton: $("#attachButton"),
  attachmentMenu: $("#attachmentMenu"),
  attachmentInput: $("#attachmentInput"),
  attachmentList: $("#attachmentList"),
  conversation: $("#conversation"),
  webSearchToggle: $("#webSearchToggle"),
  webSearchLabel: $("#webSearchLabel"),
  loginButton: $("#loginButton"),
  loginBox: $("#loginBox"),
  accessCodeInput: $("#accessCodeInput"),
  accessLabel: $("#accessLabel"),
  accessHint: $("#accessHint"),
  consentRow: $("#consentRow"),
  consentCheckbox: $("#consentCheckbox"),
  consentText: $("#consentText"),
  quotaNote: $("#quotaNote"),
  googleButton: $("#googleButton"),
  googleLabel: $("#googleLabel"),
  authDivider: $("#authDivider"),
  authDividerText: $("#authDividerText"),
  limitNote: $("#limitNote"),
  authDialog: $("#authDialog"),
  authClose: $("#authClose"),
  authTitle: $("#authTitle"),
  authSubtitle: $("#authSubtitle"),
  accountButton: $("#accountButton"),
  accountName: $("#accountName"),
  accountStatus: $("#accountStatus"),
  accountAvatar: $("#accountAvatar"),
  topbarAccount: $("#topbarAccount"),
  sessionState: $("#sessionState"),
  sendButton: $("#sendButton"),
  sendLabel: $("#sendLabel"),
  heroSubtitle: $("#heroSubtitle"),
  composerHint: $("#composerHint"),
  formatChips: $("#formatChips"),
  topbarModel: $("#topbarModel"),
  themeToggle: $("#themeToggle"),
  menuButton: $("#menuButton"),
  sidebarClose: $("#sidebarClose"),
  sidebarScrim: $("#sidebarScrim"),
  newChatButton: $("#newChatButton"),
  languageButtons: document.querySelectorAll(".language-button"),
  accessPanelLabel: $("#accessPanelLabel"),
  providersPanelLabel: $("#providersPanelLabel"),
  platformPanelLabel: $("#platformPanelLabel"),
  platformDescription: $("#platformDescription"),
  heroTitle: $("#heroTitle"),
  selectedProviderNote: $("#selectedProviderNote")
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

const secondaryTaskIds = new Set(["summarize", "strategy", "code", "other"]);

const translations = {
  es: {
    newChat: "Nueva consulta",
    access: "Acceso",
    accessPlaceholder: "tu@email.com",
    accessLabel: "Registra tu email para acceso",
    google: "Continuar con Google",
    googleError: "No se pudo iniciar sesión con Google. Intenta de nuevo o usa tu email.",
    orEmail: "o con tu email",
    limitNote: (n) => `Tienes un límite de ${n} consultas diarias.`,
    guest: "Invitado",
    guestStatus: "Sin sesión · consultas desactivadas",
    teamAccount: "Invitado con código promocional",
    sessionActive: "Sesión activa",
    signIn: "Iniciar sesión",
    signOut: "Cerrar sesión",
    accountLabel: "Tu cuenta",
    authTitle: "Entra a AllAIs",
    authSubtitle: "Entra con tu cuenta de Google o con tu email. No necesitas contraseña.",
    accessHint: "¿Tienes tu código promocional? También puedes entrar con él.",
    consentHtml: 'Acepto el <a href="/privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a>',
    consentNeeded: "Acepta el aviso de privacidad para continuar.",
    sendingLink: "Enviando enlace…",
    linkSent: (email) => `Te enviamos un enlace a ${email}. Ábrelo en este dispositivo para entrar.`,
    linkError: "No pudimos enviar el enlace. Revisa el correo e inténtalo de nuevo.",
    linkExpired: "El enlace expiró o ya se usó. Escribe tu email para recibir uno nuevo.",
    confirmEmailPrompt: "Confirma el email con el que solicitaste el enlace:",
    signedInAs: (email) => `Sesión iniciada como ${email}`,
    quotaRemaining: (n) => (n === 1 ? "Te queda 1 consulta hoy" : `Te quedan ${n} consultas hoy`),
    quotaEmptyNote: (time) => `Sin consultas por hoy · se renuevan ${time}`,
    quotaExhausted: (limit, time) => `Alcanzaste tu límite de ${limit} consultas de hoy. Se renovará ${time}.`,
    resetTomorrow: (time) => `mañana a las ${time}`,
    resetToday: (time) => `hoy a las ${time}`,
    showCode: "Mostrar código",
    hideCode: "Ocultar código",
    enter: "Entrar",
    exit: "Salir",
    signedOut: "Sesión no iniciada",
    savedLocally: "Código eliminado al abrir. Inicia sesión para continuar.",
    invalidCode: "Código inválido",
    welcome: "Bienvenido. Sesión iniciada.",
    needAccess: "Registra tu email (o tu código promocional) antes de enviar.",
    providers: "Modelos conectables",
    platform: "Plataforma",
    platformDescription: "Un gateway profesional para operar modelos de IA sin exponer claves privadas ni perder control del uso.",
    heroTitle: "¿Qué quieres hacer?",
    heroSubtitle: "Elige el tipo de tarea, describe tu objetivo y AllAIs lo envía al modelo que selecciones.",
    composerHint: "Enter envía; Shift + Enter agrega una línea.",
    themeToggle: "Cambiar tema claro u oscuro",
    openPanel: "Abrir panel",
    closePanel: "Cerrar panel",
    attach: "Agregar archivos",
    copyPrompt: "Copiar prompt",
    copyResponse: "Copiar respuesta",
    copied: "Copiado",
    thinking: "Generando respuesta",
    send: "Enviar",
    processing: "Procesando...",
    webSearch: "Buscar en la web",
    moreTasks: "Más",
    exportWord: "Word",
    exportPdf: "PDF",
    showMore: "Mostrar más",
    showLess: "Mostrar menos",
    returnToComposer: "Ir al cuadro de escritura",
    addFiles: "Agregar archivos",
    addImages: "Agregar imágenes",
    addVideos: "Agregar videos",
    analyzeAttachments: "Analiza los archivos adjuntos.",
    attachmentTooLarge: "El archivo supera 10 MB o el total de 12 MB por consulta.",
    attachmentReadError: "No se pudo leer el archivo. Prueba con otro formato.",
    attachmentTextTooLong: "El texto del archivo supera el límite de 200,000 caracteres. Divide el archivo e inténtalo otra vez.",
    unsupportedAttachment: "Este formato no está habilitado para el modelo seleccionado.",
    notSupported: "No disponible para este modelo",
    removeAttachment: "Quitar archivo",
    sources: "Fuentes consultadas",
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
    accessPlaceholder: "you@email.com",
    accessLabel: "Register your email to get access",
    google: "Continue with Google",
    googleError: "Couldn't sign in with Google. Try again or use your email.",
    orEmail: "or with your email",
    limitNote: (n) => `You have a limit of ${n} queries per day.`,
    guest: "Guest",
    guestStatus: "Not signed in · queries disabled",
    teamAccount: "Guest with promo code",
    sessionActive: "Signed in",
    signIn: "Sign in",
    signOut: "Sign out",
    accountLabel: "Your account",
    authTitle: "Sign in to AllAIs",
    authSubtitle: "Sign in with your Google account or your email. No password needed.",
    accessHint: "Have a promo code? You can also sign in with it.",
    consentHtml: 'I accept the <a href="/privacidad.html" target="_blank" rel="noopener">privacy notice</a>',
    consentNeeded: "Accept the privacy notice to continue.",
    sendingLink: "Sending link…",
    linkSent: (email) => `We sent a link to ${email}. Open it on this device to sign in.`,
    linkError: "We couldn't send the link. Check the email address and try again.",
    linkExpired: "The link expired or was already used. Enter your email to get a new one.",
    confirmEmailPrompt: "Confirm the email you used to request the link:",
    signedInAs: (email) => `Signed in as ${email}`,
    quotaRemaining: (n) => (n === 1 ? "1 query left today" : `${n} queries left today`),
    quotaEmptyNote: (time) => `No queries left today · renews ${time}`,
    quotaExhausted: (limit, time) => `You reached your limit of ${limit} queries for today. It renews ${time}.`,
    resetTomorrow: (time) => `tomorrow at ${time}`,
    resetToday: (time) => `today at ${time}`,
    showCode: "Show code",
    hideCode: "Hide code",
    enter: "Enter",
    exit: "Sign out",
    signedOut: "Session not started",
    savedLocally: "Access code cleared on open. Sign in to continue.",
    invalidCode: "Invalid code",
    welcome: "Welcome. Session started.",
    needAccess: "Register your email (or promo code) before sending.",
    providers: "Connectable models",
    platform: "Platform",
    platformDescription: "A professional gateway to operate AI models without exposing private keys or losing usage control.",
    heroTitle: "What do you want to do?",
    heroSubtitle: "Pick a task type, describe your goal and AllAIs sends it to the model you choose.",
    composerHint: "Enter sends; Shift + Enter adds a line.",
    themeToggle: "Switch light or dark theme",
    openPanel: "Open panel",
    closePanel: "Close panel",
    attach: "Add files",
    copyPrompt: "Copy prompt",
    copyResponse: "Copy response",
    copied: "Copied",
    thinking: "Generating response",
    send: "Send",
    processing: "Processing...",
    webSearch: "Search the web",
    moreTasks: "More",
    exportWord: "Word",
    exportPdf: "PDF",
    showMore: "Show more",
    showLess: "Show less",
    returnToComposer: "Go to message composer",
    addFiles: "Add files",
    addImages: "Add images",
    addVideos: "Add videos",
    analyzeAttachments: "Analyze the attached files.",
    attachmentTooLarge: "The file exceeds 10 MB or the 12 MB total per request.",
    attachmentReadError: "The file could not be read. Try another format.",
    attachmentTextTooLong: "The file text exceeds the 200,000-character limit. Split the file and try again.",
    unsupportedAttachment: "This file type is not enabled for the selected model.",
    notSupported: "Unavailable for this model",
    removeAttachment: "Remove file",
    sources: "Sources consulted",
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
    accessPlaceholder: "vous@email.com",
    accessLabel: "Inscrivez votre email pour accéder",
    google: "Continuer avec Google",
    googleError: "Impossible de se connecter avec Google. Réessayez ou utilisez votre email.",
    orEmail: "ou avec votre email",
    limitNote: (n) => `Vous avez une limite de ${n} requêtes par jour.`,
    guest: "Invité",
    guestStatus: "Non connecté · requêtes désactivées",
    teamAccount: "Invité avec code promotionnel",
    sessionActive: "Session active",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
    accountLabel: "Votre compte",
    authTitle: "Accéder à AllAIs",
    authSubtitle: "Connectez-vous avec votre compte Google ou votre email. Aucun mot de passe nécessaire.",
    accessHint: "Vous avez un code promotionnel ? Vous pouvez aussi l'utiliser pour entrer.",
    consentHtml: 'J\'accepte l\'<a href="/privacidad.html" target="_blank" rel="noopener">avis de confidentialité</a>',
    consentNeeded: "Acceptez l'avis de confidentialité pour continuer.",
    sendingLink: "Envoi du lien…",
    linkSent: (email) => `Nous avons envoyé un lien à ${email}. Ouvrez-le sur cet appareil pour entrer.`,
    linkError: "Impossible d'envoyer le lien. Vérifiez l'adresse et réessayez.",
    linkExpired: "Le lien a expiré ou a déjà été utilisé. Saisissez votre email pour en recevoir un nouveau.",
    confirmEmailPrompt: "Confirmez l'email utilisé pour demander le lien :",
    signedInAs: (email) => `Connecté en tant que ${email}`,
    quotaRemaining: (n) => (n === 1 ? "Il vous reste 1 requête aujourd'hui" : `Il vous reste ${n} requêtes aujourd'hui`),
    quotaEmptyNote: (time) => `Plus de requêtes aujourd'hui · renouvellement ${time}`,
    quotaExhausted: (limit, time) => `Vous avez atteint votre limite de ${limit} requêtes pour aujourd'hui. Elle sera renouvelée ${time}.`,
    resetTomorrow: (time) => `demain à ${time}`,
    resetToday: (time) => `aujourd'hui à ${time}`,
    showCode: "Afficher le code",
    hideCode: "Masquer le code",
    enter: "Entrer",
    exit: "Sortir",
    signedOut: "Session non démarrée",
    savedLocally: "Code d'accès effacé à l'ouverture. Connectez-vous pour continuer.",
    invalidCode: "Code invalide",
    welcome: "Bienvenue. Session démarrée.",
    needAccess: "Inscrivez votre email (ou code promotionnel) avant d'envoyer.",
    providers: "Modèles connectables",
    platform: "Plateforme",
    platformDescription: "Une passerelle professionnelle pour utiliser des modèles d'IA sans exposer les clés privées ni perdre le contrôle de l'usage.",
    heroTitle: "Que voulez-vous faire ?",
    heroSubtitle: "Choisissez le type de tâche, décrivez votre objectif et AllAIs l'envoie au modèle sélectionné.",
    composerHint: "Entrée envoie ; Maj + Entrée ajoute une ligne.",
    themeToggle: "Basculer le thème clair ou sombre",
    openPanel: "Ouvrir le panneau",
    closePanel: "Fermer le panneau",
    attach: "Ajouter des fichiers",
    copyPrompt: "Copier le prompt",
    copyResponse: "Copier la réponse",
    copied: "Copié",
    thinking: "Génération de la réponse",
    send: "Envoyer",
    processing: "Traitement...",
    webSearch: "Rechercher sur le web",
    moreTasks: "Plus",
    exportWord: "Word",
    exportPdf: "PDF",
    showMore: "Afficher plus",
    showLess: "Afficher moins",
    returnToComposer: "Aller à la zone de saisie",
    addFiles: "Ajouter des fichiers",
    addImages: "Ajouter des images",
    addVideos: "Ajouter des vidéos",
    analyzeAttachments: "Analyse les fichiers joints.",
    attachmentTooLarge: "Le fichier dépasse 10 Mo ou le total de 12 Mo par requête.",
    attachmentReadError: "Impossible de lire le fichier. Essayez un autre format.",
    attachmentTextTooLong: "Le texte dépasse la limite de 200 000 caractères. Divisez le fichier et réessayez.",
    unsupportedAttachment: "Ce type de fichier n'est pas activé pour le modèle sélectionné.",
    notSupported: "Indisponible pour ce modèle",
    removeAttachment: "Supprimer le fichier",
    sources: "Sources consultées",
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

const providerTranslations = {
  es: {
    openai: {
      name: "ChatGPT / OpenAI",
      description: "Uso general, redacción, análisis, síntesis, código y asistentes robustos."
    },
    claude: {
      name: "Claude",
      description: "Lectura larga, razonamiento editorial, análisis fino y escritura sobria."
    },
    gemini: {
      name: "Gemini",
      description: "Modelo de Google para razonamiento general, síntesis y tareas multimodales."
    },
    deepseek: {
      name: "DeepSeek",
      description: "Modelo eficiente para programación, razonamiento técnico y análisis estructurado."
    }
  },
  en: {
    openai: {
      name: "ChatGPT / OpenAI",
      description: "General use, writing, analysis, synthesis, coding and reliable assistants."
    },
    claude: {
      name: "Claude",
      description: "Long reading, editorial reasoning, fine-grained analysis and sober writing."
    },
    gemini: {
      name: "Gemini",
      description: "Google model for general reasoning, synthesis and multimodal tasks."
    },
    deepseek: {
      name: "DeepSeek",
      description: "Efficient model for programming, technical reasoning and structured analysis."
    }
  },
  fr: {
    openai: {
      name: "ChatGPT / OpenAI",
      description: "Usage général, rédaction, analyse, synthèse, code et assistants fiables."
    },
    claude: {
      name: "Claude",
      description: "Lecture longue, raisonnement éditorial, analyse fine et écriture sobre."
    },
    gemini: {
      name: "Gemini",
      description: "Modèle de Google pour le raisonnement général, la synthèse et les tâches multimodales."
    },
    deepseek: {
      name: "DeepSeek",
      description: "Modèle efficace pour la programmation, le raisonnement technique et l'analyse structurée."
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
  state.selectedTask = taskId;

  document.querySelectorAll(".task-card[data-task]").forEach((button) => {
    button.classList.toggle("active", button.dataset.task === taskId);
    const taskCopy = copy.tasks[button.dataset.task];
    if (taskCopy) {
      button.querySelector("strong").textContent = taskCopy.label;
    }
  });

  document.querySelectorAll(".task-more-option[data-task]").forEach((button) => {
    const taskCopy = copy.tasks[button.dataset.task];
    button.classList.toggle("active", button.dataset.task === taskId);
    if (taskCopy) {
      button.textContent = taskCopy.label;
    }
  });

  if (elements.taskMoreButton) {
    const activeMoreTask = secondaryTaskIds.has(taskId);
    elements.taskMoreButton.classList.toggle("active", activeMoreTask);
    elements.taskMoreButton.querySelector("strong").textContent = activeMoreTask ? task.label : copy.moreTasks;
  }

  closeTaskMoreMenu();
  renderFormatChips(task);
  elements.promptInput.placeholder = task.placeholder;
  resizePromptInput();
}

function renderFormatChips(task) {
  if (!elements.formatChips) return;
  elements.formatChips.replaceChildren();
  for (const option of task.options || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "format-chip";
    chip.textContent = option;
    chip.addEventListener("click", () => {
      const allOptions = Object.values(translations[state.language].tasks).flatMap((item) => item.options || []);
      let current = elements.promptInput.value;
      const prefix = allOptions.find((item) => current.startsWith(`${item}: `));
      if (prefix) current = current.slice(prefix.length + 2);
      elements.promptInput.value = `${option}: ${current}`;
      elements.promptInput.focus();
      elements.promptInput.setSelectionRange(elements.promptInput.value.length, elements.promptInput.value.length);
      resizePromptInput();
      trackEvent("format_chip_selected", { task: state.selectedTask, format: option });
    });
    elements.formatChips.append(chip);
  }
}

function closeTaskMoreMenu() {
  if (!elements.taskMoreMenu || !elements.taskMoreButton) return;
  elements.taskMoreMenu.hidden = true;
  elements.taskMoreButton.setAttribute("aria-expanded", "false");
}

function toggleTaskMoreMenu() {
  if (!elements.taskMoreMenu || !elements.taskMoreButton) return;
  const open = elements.taskMoreMenu.hidden;
  elements.taskMoreMenu.hidden = !open;
  elements.taskMoreButton.setAttribute("aria-expanded", String(open));
}

function setSessionState(ok, message) {
  elements.sessionState.textContent = message;
  elements.sessionState.className = ok === null ? "session-state" : ok ? "session-state success" : "session-state error";
}

function clearAccessError() {
  elements.loginBox.classList.remove("invalid-code");
  elements.accessCodeInput.removeAttribute("aria-invalid");
}

function showAccessError(message) {
  setSessionState(false, message);
  elements.loginBox.classList.remove("invalid-code");
  void elements.loginBox.offsetWidth;
  elements.loginBox.classList.add("invalid-code");
  elements.accessCodeInput.setAttribute("aria-invalid", "true");
  elements.accessCodeInput.focus({ preventScroll: false });
}

function setLanguage(language) {
  const previousLanguage = state.language;
  state.language = translations[language] ? language : "es";
  localStorage.setItem("nni_language", state.language);
  if (previousLanguage !== state.language) {
    trackEvent("language_changed", {
      language: state.language
    });
  }

  const copy = translations[state.language];
  document.documentElement.lang = state.language;
  elements.newChatButton.innerHTML = `
    <span class="new-chat-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M5 19h11.5" />
        <path d="M5 19V7.5A2.5 2.5 0 0 1 7.5 5H14" />
        <path d="M9.2 14.8 18.4 5.6a1.7 1.7 0 0 1 2.4 2.4l-9.2 9.2-3.1.7.7-3.1Z" />
      </svg>
    </span>
    ${copy.newChat}
  `;
  elements.providersPanelLabel.textContent = copy.providers;
  elements.platformPanelLabel.textContent = copy.platform;
  elements.platformDescription.textContent = copy.platformDescription;
  elements.heroTitle.textContent = copy.heroTitle;
  elements.heroSubtitle.textContent = copy.heroSubtitle;
  elements.composerHint.textContent = copy.composerHint;
  elements.webSearchLabel.textContent = copy.webSearch;
  elements.accessCodeInput.placeholder = copy.accessPlaceholder;
  if (!elements.sendButton.disabled) elements.sendLabel.textContent = copy.send;
  elements.themeToggle.setAttribute("aria-label", copy.themeToggle);
  elements.themeToggle.setAttribute("title", copy.themeToggle);
  elements.menuButton.setAttribute("aria-label", copy.openPanel);
  elements.sidebarClose.setAttribute("aria-label", copy.closePanel);
  elements.attachButton.setAttribute("aria-label", copy.attach);
  elements.attachButton.setAttribute("title", copy.attach);
  elements.accessLabel.textContent = copy.accessLabel;
  elements.accessHint.textContent = copy.accessHint;
  elements.googleLabel.textContent = copy.google;
  elements.authDividerText.textContent = copy.orEmail;
  elements.limitNote.textContent = copy.limitNote(state.quota?.limit || 20);
  elements.consentText.innerHTML = copy.consentHtml;
  elements.loginButton.textContent = isAuthenticated() ? copy.exit : copy.enter;
  renderQuota();
  renderAccount();

  updateTaskUI(state.selectedTask);
  renderProviders();

  elements.languageButtons.forEach((button) => {
    const active = button.dataset.lang === state.language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncAttachmentMenu();
  renderAttachmentList();

  if (!isAuthenticated() && !elements.sessionState.classList.contains("error")) {
    setSessionState(false, copy.signedOut);
  } else if (state.authMode === "email") {
    setSessionState(true, copy.signedInAs(state.email));
  }
}

function logout() {
  const copy = translations[state.language];
  if (state.authMode === "email" && window.AllAIsAuth) {
    window.AllAIsAuth.signOut().catch(() => {});
  }
  state.accessCode = "";
  state.authMode = "";
  state.email = "";
  state.quota = null;
  clearAccessError();
  elements.loginBox.classList.remove("authenticated");
  elements.accessCodeInput.value = "";
  elements.loginButton.textContent = copy.enter;
  syncConsentVisibility();
  renderQuota();
  renderAccount();
  setSessionState(null, copy.signedOut);
}

function openAuthDialog() {
  const dialog = elements.authDialog;
  if (!dialog || dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  document.body.classList.add("auth-open");
  window.setTimeout(() => {
    if (!isAuthenticated()) elements.accessCodeInput.focus({ preventScroll: true });
    else elements.loginButton.focus({ preventScroll: true });
  }, 60);
}

function closeAuthDialog() {
  const dialog = elements.authDialog;
  if (!dialog || !dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  document.body.classList.remove("auth-open");
}

function renderAccount() {
  const copy = translations[state.language];
  const signed = isAuthenticated();
  const name = state.authMode === "email" ? state.email : state.authMode === "code" ? copy.teamAccount : copy.guest;
  elements.accountName.textContent = name;
  elements.accountStatus.textContent = signed ? copy.sessionActive : copy.guestStatus;
  elements.accountStatus.classList.toggle("is-active", signed);
  elements.accountButton.textContent = signed ? copy.signOut : copy.signIn;
  elements.accountAvatar.textContent = signed ? (state.email || "N").charAt(0).toUpperCase() : "";
  elements.limitNote.textContent = copy.limitNote(state.quota?.limit || 20);
  elements.accountAvatar.classList.toggle("is-guest", !signed);
  elements.googleButton.hidden = signed;
  elements.authDivider.hidden = signed;
  document.getElementById("googleConsent").hidden = signed;
  elements.topbarAccount.classList.toggle("is-signed", signed);
  elements.topbarAccount.setAttribute("aria-label", signed ? `${copy.accountLabel}: ${name}` : copy.signIn);
  elements.topbarAccount.querySelector(".topbar-account-label").textContent = signed ? (state.email ? state.email.charAt(0).toUpperCase() : "N") : copy.signIn;
  elements.authTitle.textContent = signed ? copy.accountLabel : copy.authTitle;
  elements.authSubtitle.textContent = signed ? copy.signedInAs(name) : copy.authSubtitle;
}

function syncConsentVisibility() {
  const show = !isAuthenticated() && isEmailValue(elements.accessCodeInput.value);
  elements.consentRow.hidden = !show;
}

function formatResetTime(resetAt) {
  const copy = translations[state.language];
  const reset = new Date(resetAt);
  if (Number.isNaN(reset.getTime())) return "";
  const locale = { es: "es-MX", en: "en-US", fr: "fr-FR" }[state.language] || "es-MX";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(reset);
  const sameDay = reset.toDateString() === new Date().toDateString();
  return sameDay ? copy.resetToday(time) : copy.resetTomorrow(time);
}

function renderQuota() {
  const note = elements.quotaNote;
  if (!note) return;
  const quota = state.quota;
  if (!state.authMode || !quota) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  const copy = translations[state.language];
  note.hidden = false;
  note.classList.toggle("exhausted", quota.remaining <= 0);
  note.textContent = quota.remaining > 0
    ? copy.quotaRemaining(quota.remaining)
    : copy.quotaEmptyNote(formatResetTime(quota.resetAt));
}

function clientContext() {
  const params = new URLSearchParams(window.location.search);
  const utm = ["utm_source", "utm_medium", "utm_campaign"]
    .map((key) => (params.get(key) ? `${key}=${params.get(key)}` : ""))
    .filter(Boolean)
    .join("&");
  return {
    referrer: document.referrer || "",
    utm,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    language: navigator.language || ""
  };
}

async function authHeaders() {
  const headers = { "content-type": "application/json" };
  if (state.authMode === "email" && window.AllAIsAuth) {
    const token = await window.AllAIsAuth.idToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

async function startEmailSession() {
  const copy = translations[state.language];
  state.authMode = "email";
  const response = await fetch(`${API_BASE}/session`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      authType: "email",
      consent: localStorage.getItem(CONSENT_KEY) === "1",
      client: clientContext()
    })
  });
  const data = await readApiJson(response);
  if (!response.ok || !data.ok) {
    state.authMode = "";
    throw new Error(data.message || "session_failed");
  }
  state.email = data.email;
  state.quota = data.quota || null;
  clearAccessError();
  elements.accessCodeInput.value = "";
  elements.loginBox.classList.add("authenticated");
  elements.loginButton.textContent = copy.exit;
  syncConsentVisibility();
  renderQuota();
  renderAccount();
  setSessionState(true, copy.signedInAs(state.email));
  trackEvent("email_session_started");
  closeAuthDialog();
}

async function signInWithGoogle() {
  const copy = translations[state.language];
  if (!window.AllAIsAuth) {
    showAccessError(copy.googleError);
    return;
  }
  clearAccessError();
  elements.googleButton.disabled = true;
  try {
    localStorage.setItem(CONSENT_KEY, "1");
    const user = await window.AllAIsAuth.signInWithGoogle(state.language);
    if (user) await startEmailSession();
    trackEvent("google_sign_in");
  } catch (error) {
    console.warn("AllAIs Google sign-in", error);
    showAccessError(copy.googleError);
  } finally {
    elements.googleButton.disabled = false;
  }
}

async function restoreEmailSession() {
  if (!window.AllAIsAuth) return;
  const copy = translations[state.language];
  try {
    const linkedUser = await window.AllAIsAuth.completeLinkIfPresent(() => window.prompt(copy.confirmEmailPrompt) || "");
    const user = linkedUser || (await window.AllAIsAuth.currentUser());
    if (user) await startEmailSession();
  } catch (error) {
    console.warn("AllAIs email session", error);
    if (/expired|invalid-action-code|invalid-email/i.test(String(error?.code || error?.message))) {
      showAccessError(copy.linkExpired);
    }
  }
}

function drawAttentionToAccess() {
  closeSidebar();
  openAuthDialog();
  elements.loginBox.classList.remove("needs-attention");
  void elements.loginBox.offsetWidth;
  elements.loginBox.classList.add("needs-attention");
  elements.accessCodeInput.focus({ preventScroll: false });
  window.setTimeout(() => {
    elements.loginBox.classList.remove("needs-attention");
  }, 1600);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 200_000;
const TEXT_FILE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html", "xml", "log", "yaml", "yml"]);

function selectedCapabilities() {
  const provider = state.providers.find((item) => item.id === state.selectedProvider);
  if (provider?.capabilities) return provider.capabilities;
  return {
    files: true,
    images: ["openai", "claude", "gemini"].includes(state.selectedProvider),
    pdf: ["claude", "gemini"].includes(state.selectedProvider),
    videos: state.selectedProvider === "gemini"
  };
}

function syncAttachmentMenu() {
  if (!elements.attachmentMenu) return;
  const copy = translations[state.language];
  const capabilities = selectedCapabilities();
  const labels = { file: copy.addFiles, image: copy.addImages, video: copy.addVideos };
  for (const button of elements.attachmentMenu.querySelectorAll("[data-attachment-kind]")) {
    const kind = button.dataset.attachmentKind;
    const enabled = kind === "file" ? capabilities.files !== false : kind === "image" ? capabilities.images === true : capabilities.videos === true;
    button.textContent = enabled ? labels[kind] : `${labels[kind]} — ${copy.notSupported}`;
    button.disabled = !enabled;
    button.title = enabled ? "" : copy.unsupportedAttachment;
    button.setAttribute("aria-disabled", String(!enabled));
  }
}

function renderAttachmentList() {
  if (!elements.attachmentList) return;
  elements.attachmentList.replaceChildren();
  elements.attachmentList.hidden = state.attachments.length === 0;
  const icons = { text: "TXT", pdf: "PDF", image: "IMG", video: "VID" };
  for (const attachment of state.attachments) {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    const icon = document.createElement("span");
    icon.className = "attachment-kind-icon";
    icon.textContent = icons[attachment.kind] || "FILE";
    const filename = document.createElement("span");
    filename.className = "attachment-filename";
    filename.textContent = attachment.name;
    filename.title = attachment.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-attachment";
    remove.dataset.removeAttachment = attachment.id;
    remove.setAttribute("aria-label", `${translations[state.language].removeAttachment}: ${attachment.name}`);
    remove.textContent = "×";
    chip.append(icon, filename, remove);
    elements.attachmentList.append(chip);
  }
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function extractDocxText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let endRecord = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) {
    if (view.getUint32(offset, true) === 0x06054b50) endRecord = offset;
  }
  if (endRecord < 0) throw new Error("Invalid DOCX archive.");
  const directorySize = view.getUint32(endRecord + 12, true);
  let cursor = view.getUint32(endRecord + 16, true);
  const directoryEnd = cursor + directorySize;
  while (cursor < directoryEnd && view.getUint32(cursor, true) === 0x02014b50) {
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === "word/document.xml") {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      let xmlBytes;
      if (method === 0) xmlBytes = compressed;
      else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const reader = stream.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > 2_000_000) { await reader.cancel(); throw new Error("DOCX content exceeds the safe extraction limit."); }
          chunks.push(value);
        }
        xmlBytes = new Uint8Array(total);
        let writeOffset = 0;
        for (const chunk of chunks) { xmlBytes.set(chunk, writeOffset); writeOffset += chunk.length; }
      } else throw new Error("Unsupported DOCX compression.");
      const xml = new DOMParser().parseFromString(decoder.decode(xmlBytes), "application/xml");
      const paragraphs = [...xml.getElementsByTagNameNS("*", "p")].map((paragraph) =>
        [...paragraph.getElementsByTagNameNS("*", "t")].map((node) => node.textContent || "").join("")
      ).filter(Boolean);
      return paragraphs.join("\n");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("DOCX document body was not found.");
}

async function prepareAttachment(file, kind) {
  const copy = translations[state.language];
  const capabilities = selectedCapabilities();
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(copy.attachmentTooLarge);
  const totalAttachmentBytes = state.attachments.reduce((sum, item) => sum + item.size, 0) + file.size;
  if (state.attachments.length >= 5 || totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error(copy.attachmentTooLarge);
  const extension = file.name.split(".").pop().toLowerCase();
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (kind === "image" && capabilities.images && /^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    return { id, name: file.name, kind, mimeType: file.type, size: file.size, data: bytesToBase64(await file.arrayBuffer()) };
  }
  if (kind === "video" && capabilities.videos && ["video/mp4", "video/webm"].includes(file.type)) {
    return { id, name: file.name, kind, mimeType: file.type, size: file.size, data: bytesToBase64(await file.arrayBuffer()) };
  }
  if (kind !== "file") throw new Error(copy.unsupportedAttachment);
  if (TEXT_FILE_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    const text = await file.text();
    if (text.length > MAX_ATTACHMENT_TEXT_CHARS) throw new Error(copy.attachmentTextTooLong);
    return { id, name: file.name, kind: "text", mimeType: "text/plain", size: file.size, text };
  }
  if (extension === "docx") {
    const text = await extractDocxText(file);
    if (!text.trim()) throw new Error(copy.attachmentReadError);
    if (text.length > MAX_ATTACHMENT_TEXT_CHARS) throw new Error(copy.attachmentTextTooLong);
    return { id, name: file.name, kind: "text", mimeType: "text/plain", size: file.size, text };
  }
  if (file.type === "application/pdf" && capabilities.pdf) {
    return { id, name: file.name, kind: "pdf", mimeType: file.type, size: file.size, data: bytesToBase64(await file.arrayBuffer()) };
  }
  throw new Error(copy.unsupportedAttachment);
}

function openAttachmentPicker(kind) {
  const capabilities = selectedCapabilities();
  state.pendingAttachmentKind = kind;
  const accepts = {
    file: [".txt", ".md", ".csv", ".json", ".html", ".xml", ".log", ".yaml", ".yml", ".docx", ...(capabilities.pdf ? [".pdf"] : [])].join(","),
    image: "image/png,image/jpeg,image/webp,image/gif",
    video: "video/mp4,video/webm"
  };
  elements.attachmentInput.accept = accepts[kind];
  elements.attachmentInput.value = "";
  elements.attachmentMenu.hidden = true;
  elements.attachButton.setAttribute("aria-expanded", "false");
  elements.attachmentInput.click();
}

function appendInlineMarkdown(parent, text) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];
    const content = token.slice(1, -1).replace(/^[*_]|[*_]$/g, "");
    const node = document.createElement(token.startsWith("`") ? "code" : (token.startsWith("**") || token.startsWith("__")) ? "strong" : "em");
    node.textContent = content;
    parent.append(node);
    lastIndex = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(lastIndex)));
}

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
}

function docxRuns(text, options = {}, hyperlinks = []) {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g;
  const run = (value, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
  let xml = ""; let offset = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > offset) xml += run(text.slice(offset, match.index), options.bold ? "<w:b/>" : "");
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      let relation = hyperlinks.find((item) => item.url === link[2]);
      if (!relation) { relation = { id: `rIdHyper${hyperlinks.length + 1}`, url: link[2] }; hyperlinks.push(relation); }
      xml += `<w:hyperlink r:id="${relation.id}" w:history="1"><w:r><w:rPr><w:color w:val="176B87"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${xmlEscape(link[1])}</w:t></w:r></w:hyperlink>`;
    } else {
      const strong = token.startsWith("**") || token.startsWith("__");
      const italic = !strong && (token.startsWith("*") || token.startsWith("_"));
      const code = token.startsWith("`");
      const trim = strong ? 2 : 1;
      const value = token.slice(trim, -trim);
      const props = [options.bold || strong ? "<w:b/>" : "", italic ? "<w:i/>" : "", code ? "<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/><w:color w:val=\"52606D\"/>" : ""].join("");
      xml += run(value, props);
    }
    offset = match.index + token.length;
  }
  if (offset < text.length) xml += run(text.slice(offset), options.bold ? "<w:b/>" : "");
  return xml || "<w:r><w:t></w:t></w:r>";
}

function docxParagraph(text, style, hyperlinks, options = {}) {
  const pPr = [`<w:pStyle w:val="${style}"/>`, options.pageBreak ? "<w:pageBreakBefore/>" : "", options.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>` : "", options.quote ? `<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2C8298"/></w:pBdr>` : ""].filter(Boolean).join("");
  return `<w:p><w:pPr>${pPr}</w:pPr>${docxRuns(text, { bold: options.bold }, hyperlinks)}</w:p>`;
}

function splitMarkdownTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function makeDocxBlob(markdown, sources = []) {
  const hyperlinks = [];
  const blocks = [];
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  let hasTitle = false;
  const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const tableXml = (rows) => {
    const columns = Math.max(...rows.map((row) => row.length));
    const width = Math.floor(9360 / columns);
    const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`;
    const trs = rows.map((row, rowIndex) => `<w:tr>${Array.from({ length: columns }, (_, index) => {
      const cell = row[index] || "";
      const fill = rowIndex === 0 ? "17324D" : rowIndex % 2 ? "F2F6F8" : "FFFFFF";
      const content = docxRuns(cell.replace(/\*\*/g, ""), { bold: rowIndex === 0 }, hyperlinks);
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:start w:w="110" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:end w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:pStyle w:val="${rowIndex === 0 ? "TableHeader" : "TableText"}"/></w:pPr>${content}</w:p></w:tc>`;
    }).join("")}</w:tr>`).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E0E5"/><w:left w:val="single" w:sz="4" w:color="D7E0E5"/><w:bottom w:val="single" w:sz="4" w:color="D7E0E5"/><w:right w:val="single" w:sz="4" w:color="D7E0E5"/><w:insideH w:val="single" w:sz="4" w:color="D7E0E5"/><w:insideV w:val="single" w:sz="4" w:color="D7E0E5"/></w:tblBorders></w:tblPr>${grid}${trs}</w:tbl>`;
  };

  if (!/^\s*#\s+\S/m.test(String(markdown || ""))) blocks.push(docxParagraph("Documento revisado", "Title", hyperlinks));
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*---+\s*$/.test(raw)) continue;
    if (raw.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const rows = [splitMarkdownTableRow(raw)]; i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitMarkdownTableRow(lines[i++]));
      i -= 1; blocks.push(tableXml(rows)); continue;
    }
    const heading = raw.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) hasTitle = true;
      const pageBreak = level >= 2 && /^(art[ií]culo|article)\s+\d+/i.test(heading[2]);
      blocks.push(docxParagraph(heading[2], level === 1 ? "Title" : `Heading${Math.min(level - 1, 3)}`, hyperlinks, { pageBreak }));
      continue;
    }
    const quote = raw.match(/^\s*>\s?(.*)$/);
    if (quote) { blocks.push(docxParagraph(quote[1], "Quote", hyperlinks, { shading: "EEF5F8", quote: true })); continue; }
    const item = raw.match(/^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.+)$/);
    if (item) {
      const text = item[2] ? `${item[2]}. ${item[3]}` : `•  ${item[3]}`;
      blocks.push(docxParagraph(text, "ListParagraph", hyperlinks)); continue;
    }
    blocks.push(docxParagraph(raw, "Normal", hyperlinks));
  }
  if (!hasTitle && blocks.length) blocks.unshift(docxParagraph("Documento revisado", "Title", hyperlinks));
  if (sources.length) {
    blocks.push(docxParagraph(translations[state.language].sources, "Heading1", hyperlinks));
    sources.forEach((source, index) => blocks.push(docxParagraph(`${index + 1}. ${source.title || source.url} — ${source.url}`, "Normal", hyperlinks)));
  }

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="263746"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="150" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="300"/><w:jc w:val="left"/><w:pBdr><w:bottom w:val="single" w:sz="16" w:space="10" w:color="2C8298"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="36"/><w:color w:val="17324D"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="30"/><w:color w:val="17324D"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="176B87"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="36566F"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/><w:spacing w:after="90"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="100" w:after="180"/></w:pPr><w:rPr><w:color w:val="36566F"/><w:i/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style></w:styles>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="8" w:color="D7E0E5"/></w:pBdr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="718096"/><w:sz w:val="18"/></w:rPr><w:t>AllAIs · Documento editado  |  Página </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const rels = [`<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`, `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`, ...hyperlinks.map((item) => `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(item.url)}" TargetMode="External"/>`)].join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${blocks.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:footer="540"/></w:sectPr></w:body></w:document>`;
  return zipStored({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    "word/document.xml": documentXml,
    "word/styles.xml": stylesXml,
    "word/footer1.xml": footerXml,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Documento profesional editado con AllAIs</dc:title><dc:creator>AllAIs</dc:creator></cp:coreProperties>`
  }, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

function zipStored(files, mimeType) {
  const encoder = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (bytes) => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  const u32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
  const localParts = []; const centralParts = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name); const data = encoder.encode(content); const crc = crc32(data);
    const local = new Uint8Array(30 + filename.length); const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, filename.length); u16(lv, 28, 0); local.set(filename, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + filename.length); const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, 0); u16(cv, 14, 0x21); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, filename.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset); central.set(filename, 46); centralParts.push(central); offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, centralParts.length); u16(ev, 10, centralParts.length); u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: mimeType });
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a"); const url = URL.createObjectURL(blob);
  link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printAsPdf(contentNode, sources = [], targetWindow = null) {
  const printWindow = targetWindow || window.open("", "_blank");
  if (!printWindow) { window.alert("Permite las ventanas emergentes para guardar la respuesta como PDF."); return; }
  const printableContent = contentNode.cloneNode(true);
  printableContent.classList.remove("prompt-collapsed", "prompt-expanded");
  printableContent.querySelectorAll(".prompt-expand").forEach((button) => button.remove());
  const sourcesHtml = sources.length ? `<h2>${xmlEscape(translations[state.language].sources)}</h2><ul>${sources.map((source) => `<li>${xmlEscape(source.title || source.url)} — ${xmlEscape(source.url)}</li>`).join("")}</ul>` : "";
  printWindow.document.write(`<!doctype html><html lang="${state.language}"><head><meta charset="utf-8"><title>AllAIs</title><style>body{font:12pt/1.6 Arial,sans-serif;color:#20242a;max-width:800px;margin:40px auto;padding:0 24px}h1{font-size:20pt}h2,h3,h4{margin:1.2em 0 .4em}li{margin:.25em 0}code{background:#eee;padding:2px 4px}</style></head><body><h1>Respuesta de AllAIs</h1>${printableContent.innerHTML}${sourcesHtml}</body></html>`);
  printWindow.document.close(); printWindow.focus(); window.setTimeout(() => printWindow.print(), 400);
}

function renderMarkdown(content, container) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  let list = null;
  let listType = "";
  let paragraphLines = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const p = document.createElement("p");
    paragraphLines.forEach((line, index) => {
      if (index) p.append(document.createElement("br"));
      appendInlineMarkdown(p, line);
    });
    container.append(p);
    paragraphLines = [];
  };
  const closeList = () => { list = null; listType = ""; };

  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    const item = line.match(/^\s*(?:[-*+]\s+|(\d+)[.)]\s+)(.+)$/);
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (heading) {
      flushParagraph(); closeList();
      const h = document.createElement(`h${Math.min(heading[1].length + 2, 6)}`);
      appendInlineMarkdown(h, heading[2]); container.append(h); continue;
    }
    if (item) {
      flushParagraph();
      const nextType = item[1] ? "ol" : "ul";
      if (!list || listType !== nextType) {
        closeList(); list = document.createElement(nextType); listType = nextType; container.append(list);
      }
      const li = document.createElement("li"); appendInlineMarkdown(li, item[2]); list.append(li); continue;
    }
    closeList();
    paragraphLines.push(line);
  }
  flushParagraph();
}

function addPromptNavigationControls(role, content, responseContent, bubble) {
  if (role === "user" && (String(content).length > 280 || String(content).split(/\n/).length > 4)) {
    responseContent.classList.add("prompt-collapsed");
    const showMore = document.createElement("button");
    showMore.type = "button";
    showMore.className = "prompt-expand";
    showMore.innerHTML = `<span>${translations[state.language].showMore}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>`;
    showMore.setAttribute("aria-expanded", "false");
    showMore.addEventListener("click", () => {
      const expanded = responseContent.classList.toggle("prompt-expanded");
      showMore.querySelector("span").textContent = translations[state.language][expanded ? "showLess" : "showMore"];
      showMore.classList.toggle("expanded", expanded);
      showMore.setAttribute("aria-expanded", String(expanded));
    });
    responseContent.append(showMore);
  }

  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "return-to-composer";
  returnButton.setAttribute("aria-label", translations[state.language].returnToComposer);
  returnButton.setAttribute("title", translations[state.language].returnToComposer);
  returnButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>';
  returnButton.addEventListener("click", () => {
    elements.promptForm.scrollIntoView({ block: "center", behavior: "smooth" });
    elements.promptInput.focus({ preventScroll: true });
  });
  returnButton.dataset.messageRole = role;
  bubble.append(returnButton);
}

function addMessage(role, content, meta = "", sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "T" : "N";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const responseContent = document.createElement("div");
  responseContent.className = "message-content";
  if (role === "assistant") {
    renderMarkdown(content, responseContent);
    if (sources.length) {
      const sourceBox = document.createElement("section");
      sourceBox.className = "source-list";
      const title = document.createElement("strong");
      title.textContent = translations[state.language].sources;
      const list = document.createElement("ol");
      for (const source of sources) {
        try {
          const url = new URL(source.url);
          if (url.protocol !== "https:") continue;
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.textContent = source.title || url.hostname;
          item.append(link); list.append(item);
        } catch { /* Ignore malformed source URLs. */ }
      }
      if (list.children.length) { sourceBox.append(title, list); responseContent.append(sourceBox); }
    }
  }
  else {
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    responseContent.append(paragraph);
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "copy-message";
  const copyLabel = role === "user" ? translations[state.language].copyPrompt : translations[state.language].copyResponse;
  copyButton.setAttribute("aria-label", copyLabel);
  copyButton.setAttribute("title", copyLabel);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <rect x="5" y="5" width="10" height="10" rx="2" />
    </svg>
  `;
  copyButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(content);
      trackEvent(role === "assistant" ? "response_copied" : "prompt_copied", {
        message_role: role
      });
      copyButton.classList.add("copied");
      copyButton.setAttribute("aria-label", translations[state.language].copied);
      copyButton.setAttribute("title", translations[state.language].copied);
      window.setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.setAttribute("aria-label", copyLabel);
        copyButton.setAttribute("title", copyLabel);
      }, 1200);
    } catch {
      copyButton.classList.add("copy-error");
      window.setTimeout(() => copyButton.classList.remove("copy-error"), 1200);
    }
  });

  if (role === "assistant") {
    const metaLine = document.createElement("strong");
    metaLine.className = "message-meta";
    metaLine.textContent = meta || "NNI Assistant";
    bubble.append(metaLine);
  }

  if (role === "user") bubble.append(copyButton);
  bubble.append(responseContent);
  addPromptNavigationControls(role, content, responseContent, bubble);
  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "export-actions";
    const docIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></svg>';
    const wordButton = document.createElement("button");
    wordButton.type = "button";
    wordButton.innerHTML = docIcon;
    wordButton.append(translations[state.language].exportWord);
    wordButton.addEventListener("click", () => downloadBlob(makeDocxBlob(content, sources), "respuesta-allais.docx"));
    const pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.innerHTML = docIcon;
    pdfButton.append(translations[state.language].exportPdf);
    pdfButton.addEventListener("click", () => printAsPdf(responseContent, sources));
    actions.append(copyButton, wordButton, pdfButton);
    bubble.append(actions);
  }
  article.append(avatar, bubble);
  elements.conversation.append(article);
  setConversationState();
  scrollConversationToEnd();
  return { article, responseContent };
}

function setConversationState() {
  document.body.classList.toggle("is-empty", !elements.conversation.querySelector(".message"));
}

function scrollConversationToEnd() {
  const scroller = elements.conversation.closest(".chat-card");
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

function addPendingMessage(label) {
  const article = document.createElement("article");
  article.className = "message assistant pending";
  article.setAttribute("aria-label", translations[state.language].thinking);
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "N";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const metaLine = document.createElement("strong");
  metaLine.className = "message-meta";
  metaLine.textContent = label;
  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  bubble.append(metaLine, content);
  article.append(avatar, bubble);
  elements.conversation.append(article);
  setConversationState();
  scrollConversationToEnd();
  return article;
}

function appendHistory(role, content) {
  state.history.push({ role, content: String(content || "") });
  // Bound request size while retaining complete recent turns.
  if (state.history.length > 30) state.history = state.history.slice(-30);
}

function providerDisplay(provider) {
  return providerTranslations[state.language]?.[provider.id] || {
    name: provider.name,
    description: provider.description
  };
}

function renderProviders() {
  elements.providerList.innerHTML = "";

  const monograms = { openai: "OA", claude: "Cl", gemini: "Ge", deepseek: "DS", qwen: "Qw" };
  for (const provider of state.providers) {
    const display = providerDisplay(provider);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "provider-card";
    card.dataset.provider = provider.id;
    card.setAttribute("role", "radio");
    const monogram = document.createElement("span");
    monogram.className = "provider-monogram";
    monogram.setAttribute("aria-hidden", "true");
    monogram.textContent = monograms[provider.id] || String(display.name || "?").slice(0, 2);
    const copyBox = document.createElement("span");
    copyBox.className = "provider-copy";
    const name = document.createElement("strong");
    name.textContent = display.name;
    const description = document.createElement("span");
    description.textContent = display.description;
    copyBox.append(name, description);
    card.append(monogram, copyBox);
    card.insertAdjacentHTML("beforeend", '<svg class="provider-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>');
    elements.providerList.append(card);
  }

  syncProviderCards();
}

function syncProviderCards() {
  document.querySelectorAll(".provider-card").forEach((card) => {
    const active = card.dataset.provider === state.selectedProvider;
    card.classList.toggle("active", active);
    card.setAttribute("aria-checked", String(active));
  });
  const provider = state.providers.find((item) => item.id === state.selectedProvider);
  const display = provider ? providerDisplay(provider) : null;
  if (elements.selectedProviderNote) {
    elements.selectedProviderNote.textContent = display?.name || "";
  }
  if (elements.topbarModel) elements.topbarModel.textContent = display?.name || "";
  syncAttachmentMenu();
}

function resizePromptInput() {
  const maxHeight = Math.min(300, Math.round(window.innerHeight * 0.42));
  elements.promptInput.style.height = "auto";
  elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, maxHeight)}px`;
  elements.promptInput.style.overflowY = elements.promptInput.scrollHeight > maxHeight ? "auto" : "hidden";
}

async function readApiJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const preview = text.trim().slice(0, 80);
    const looksLikeHtml = /<!doctype\s+html|<html[\s>]/i.test(preview);
    if (looksLikeHtml) {
      throw new Error("AllAIs no pudo completar la consulta en este momento. Intenta de nuevo en unos segundos; si el problema continúa, cambia de modelo o desactiva Buscar en la web.");
    }
    throw new Error(`La API devolvió una respuesta inválida (${response.status}): ${preview || response.statusText}`);
  }
}

async function loadProviders() {
  const response = await fetch(`${API_BASE}/providers`);
  const data = await readApiJson(response);
  state.providers = (data.providers || []).filter((provider) => !["qwen", "happyhorse"].includes(provider.id));

  if (!state.providers.some((provider) => provider.id === state.selectedProvider)) {
    state.selectedProvider = state.providers[0]?.id || "openai";
  }
  renderProviders();
}

async function login() {
  const copy = translations[state.language];

  if (isAuthenticated()) {
    logout();
    return;
  }

  const rawValue = elements.accessCodeInput.value.trim();
  clearAccessError();

  if (isEmailValue(rawValue)) {
    if (!elements.consentCheckbox.checked) {
      syncConsentVisibility();
      showAccessError(copy.consentNeeded);
      return;
    }
    if (!window.AllAIsAuth) {
      showAccessError(copy.linkError);
      return;
    }
    elements.loginButton.disabled = true;
    setSessionState(true, copy.sendingLink);
    try {
      localStorage.setItem(CONSENT_KEY, "1");
      await window.AllAIsAuth.sendLink(rawValue.toLowerCase(), state.language);
      setSessionState(true, copy.linkSent(rawValue.toLowerCase()));
      trackEvent("email_link_sent");
    } catch (error) {
      console.warn("AllAIs email link", error);
      trackEvent("email_link_failed");
      showAccessError(copy.linkError);
    } finally {
      elements.loginButton.disabled = false;
    }
    return;
  }

  const accessCode = cleanAccessCode(rawValue);
  const response = await fetch(`${API_BASE}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessCode, client: clientContext() })
  });
  const data = await readApiJson(response);

  if (!response.ok || !data.ok) {
    trackEvent("access_code_failed", {
      reason: "invalid_code"
    });
    showAccessError(data.message && data.message !== "Invalid access code" ? data.message : copy.invalidCode);
    return;
  }

  trackEvent("access_code_success");
  state.accessCode = accessCode;
  state.authMode = "code";
  state.quota = data.quota || null;
  renderQuota();
  renderAccount();
  window.setTimeout(closeAuthDialog, 700);
  clearAccessError();
  elements.accessCodeInput.value = "";
  elements.loginBox.classList.add("authenticated");
  elements.loginButton.textContent = copy.exit;
  setSessionState(true, copy.welcome);
}

async function sendPrompt(event) {
  event.preventDefault();

  const prompt = elements.promptInput.value.trim();
  const attachmentsAtSend = state.attachments.slice();
  if (!prompt && !attachmentsAtSend.length) return;
  if (!isAuthenticated()) {
    trackEvent("access_code_required", {
      action: "prompt_submit"
    });
    setSessionState(false, translations[state.language].needAccess);
    drawAttentionToAccess();
    return;
  }

  const copy = translations[state.language];
  if (state.authMode === "email" && state.quota && state.quota.remaining <= 0) {
    addMessage("assistant", copy.quotaExhausted(state.quota.limit, formatResetTime(state.quota.resetAt)), "AllAIs");
    return;
  }
  const capabilities = selectedCapabilities();
  if (attachmentsAtSend.some((item) => (item.kind === "image" && !capabilities.images) || (item.kind === "pdf" && !capabilities.pdf) || (item.kind === "video" && !capabilities.videos))) {
    trackEvent("app_error", {
      provider: state.selectedProvider,
      error_area: "unsupported_attachment"
    });
    window.alert(copy.unsupportedAttachment);
    return;
  }
  const requestText = prompt || copy.analyzeAttachments;
  const requestsOutputFile = /\b(gener\w*|cre\w*|elabor\w*|conviert\w*|export\w*|descarg\w*|guard\w*|haz\w*|dame|entr[eé]g\w*|r[eé]dact\w*|make|create|generate|deliver|provide|export|convert|save|download|cr[eé]e|g[eé]n[eé]re|convertis|fournis)\b/i.test(prompt)
    || /\b(en|como|in|as|au\s+format|en\s+format)\s+(?:un\s+)?(?:archivo\s+)?(word|docx|pdf)\b/i.test(prompt);
  const requestedWord = requestsOutputFile && /\b(word|\.docx?|documento\s+de\s+word|archivo\s+word)\b/i.test(prompt);
  const requestedPdf = requestsOutputFile && /\b(pdf|\.pdf|formato\s+pdf)\b/i.test(prompt);
  const documentRequest = requestedWord || requestedPdf;
  const documentTransform = documentRequest && /\b(convierte|transforma|mejora|mejorar|edita|editar|revisa|revisar|corrige|corregir|formatea|formato|diseña|profesional|elegante|sin\s+(?:borrar|eliminar|perder|omitir))\b/i.test(prompt);
  const documentFormats = [requestedWord && "docx", requestedPdf && "pdf"].filter(Boolean);
  const pendingPdfWindow = requestedPdf ? window.open("about:blank", "_blank") : null;
  const provider = state.selectedProvider;
  const providerItem = state.providers.find((item) => item.id === provider);
  const providerName = providerItem ? providerDisplay(providerItem).name : copy.providerFallback;
  const temperature = 0.4;
  const taskLabel = copy.tasks[state.selectedTask]?.label || copy.tasks.other.label;
  const taskMode = taskConfig[state.selectedTask]?.mode || "general";
  const systemBase = systemPrompts[taskMode] || systemPrompts.general;
  const fileInstruction = documentRequest
    ? " El usuario solicita un archivo. Redacta el contenido completo y final, no un esquema ni una lista de ideas. No digas que no puedes generar Word o PDF: la aplicación creará el archivo. Si pide tres páginas, escribe aproximadamente entre 1,200 y 1,500 palabras en prosa desarrollada, con introducción, secciones sustantivas y conclusión; no entregues solo un esquema. Respeta las fechas y matices pertinentes."
    : "";
  const transformInstruction = documentTransform
    ? " El usuario entregó un documento para edición sustantiva y diseño. Reescribe y mejora gramática, claridad, cohesión, jerarquía y presentación; conserva todos los datos, nombres, fechas, cifras, argumentos, ejemplos, referencias, DOI y enlaces. No resumas, no borres ni inventes información. Mantén las citas y URLs completas. Resalta conceptos y hallazgos con negritas, usa títulos y subtítulos semánticos, y convierte comparaciones en tablas solo si conservas íntegro su contenido. Analiza inconsistencias o afirmaciones que requieran verificación en una sección final claramente separada, sin corregir hechos por conjetura. Devuelve el documento ya editado en Markdown estructurado, no una explicación sobre cómo editarlo ni un prompt para otra IA."
    : "";
  const system = `${systemBase} La tarea del usuario es: ${taskLabel}.${fileInstruction}${transformInstruction}`;
  const enrichedPrompt = `${copy.taskPrefix}: ${taskLabel}\n\n${copy.objectivePrefix}:\n${requestText}`;
  const academicSearch = /\b(art[ií]culos? cient[ií]ficos?|literatura cient[ií]fica|papers?|publicaciones acad[eé]micas?|referencias bibliogr[aá]ficas?|revisi[oó]n bibliogr[aá]fica|estudios emp[ií]ricos?|metaan[aá]lisis|ensayos cl[ií]nicos?|pubmed|doi|apa\s*7)\b/i.test(prompt);
  const explicitSearch = /\b(busca|buscar|búscame|buscame|investiga|encuentra|localiza|find|search|recherche|cherche)\b.{0,70}\b(web|internet|fuentes|referencias|artículos|articulos|papers|articles|sources|estudios|literatura)\b/i.test(prompt);
  const autoWebSearch = explicitSearch || (academicSearch && !documentTransform);
  const webSearch = Boolean(elements.webSearchToggle.checked || autoWebSearch);
  if (autoWebSearch) elements.webSearchToggle.checked = true;

  const displayPrompt = attachmentsAtSend.length
    ? `${requestText}\n\n📎 ${attachmentsAtSend.map((item) => item.name).join(", ")}`
    : requestText;
  addMessage("user", displayPrompt, taskLabel);
  appendHistory("user", enrichedPrompt);
  elements.promptInput.value = "";
  resizePromptInput();
  elements.sendButton.disabled = true;
  elements.attachButton.disabled = true;
  elements.sendLabel.textContent = copy.processing;
  const pendingMessage = addPendingMessage(providerName);
  trackEvent("prompt_sent", {
    provider,
    language: state.language,
    task: state.selectedTask,
    web_search: webSearch,
    has_files: attachmentsAtSend.length > 0,
    file_count: attachmentsAtSend.length,
    requested_word: requestedWord,
    requested_pdf: requestedPdf
  });

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        accessCode: cleanAccessCode(state.accessCode),
        provider,
        prompt: enrichedPrompt,
        history: state.history.slice(0, -1),
        webSearch,
        documentRequest,
        documentTransform,
        documentFormats,
        attachments: attachmentsAtSend,
        system,
        temperature
      })
    });

    const data = await readApiJson(response);
    pendingMessage.remove();
    if (data.quota) {
      state.quota = data.quota;
      renderQuota();
    }
    if (response.status === 429 && data.code === "DAILY_LIMIT") {
      if (pendingPdfWindow && !pendingPdfWindow.closed) pendingPdfWindow.close();
      trackEvent("daily_limit_reached");
      addMessage("assistant", copy.quotaExhausted(data.quota?.limit || 20, formatResetTime(data.quota?.resetAt)), "AllAIs");
      state.history.pop();
      return;
    }
    if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");

    const answer = data.answer || copy.emptyAnswer;
    const rendered = addMessage("assistant", answer, `${providerName} · ${data.model || copy.providerFallback}`, data.sources || []);
    const documentTitle = answer.match(/^\s{0,3}#\s+(.+)$/m)?.[1] || requestText;
    const fileBaseName = (documentTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) || []).slice(0, 8).join("-").slice(0, 65) || "respuesta-allais";
    if (requestedWord) downloadBlob(makeDocxBlob(answer, data.sources || []), `${fileBaseName}-allais.docx`);
    if (requestedPdf && pendingPdfWindow) printAsPdf(rendered.responseContent, data.sources || [], pendingPdfWindow);
    appendHistory("assistant", answer);
    state.attachments = state.attachments.filter((item) => !attachmentsAtSend.some((sent) => sent.id === item.id));
    renderAttachmentList();
  } catch (error) {
    pendingMessage.remove();
    if (pendingPdfWindow && !pendingPdfWindow.closed) pendingPdfWindow.close();
    trackEvent("app_error", {
      provider,
      error_area: "chat_request",
      status: "failed"
    });
    addMessage("assistant", error.message, copy.error);
    state.history.pop();
  } finally {
    elements.sendButton.disabled = false;
    elements.attachButton.disabled = false;
    elements.sendLabel.textContent = translations[state.language].send;
    elements.promptInput.focus({ preventScroll: true });
  }
}

function resetChat() {
  state.history = [];
  state.attachments = [];
  renderAttachmentList();
  elements.webSearchToggle.checked = false;
  elements.conversation.innerHTML = "";
  setConversationState();
  updateTaskUI("write");
  closeSidebar();
  elements.promptInput.focus({ preventScroll: true });
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  elements.sidebarScrim.hidden = false;
  elements.menuButton.setAttribute("aria-expanded", "true");
  elements.sidebarClose.focus({ preventScroll: true });
}

function closeSidebar() {
  if (!document.body.classList.contains("sidebar-open")) return;
  document.body.classList.remove("sidebar-open");
  elements.sidebarScrim.hidden = true;
  elements.menuButton.setAttribute("aria-expanded", "false");
}

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("nni_theme", next); } catch { /* Storage unavailable. */ }
  trackEvent("theme_changed", { theme: next });
}

function bindEvents() {
  elements.menuButton.addEventListener("click", openSidebar);
  elements.sidebarClose.addEventListener("click", closeSidebar);
  elements.sidebarScrim.addEventListener("click", closeSidebar);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.loginButton.addEventListener("click", login);
  elements.accessCodeInput.addEventListener("input", syncConsentVisibility);
  elements.accessCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      login();
    }
  });
  elements.consentCheckbox.addEventListener("change", clearAccessError);
  elements.googleButton.addEventListener("click", signInWithGoogle);
  elements.accountButton.addEventListener("click", () => { closeSidebar(); openAuthDialog(); });
  elements.topbarAccount.addEventListener("click", openAuthDialog);
  elements.authClose.addEventListener("click", closeAuthDialog);
  elements.authDialog.addEventListener("click", (event) => {
    if (event.target === elements.authDialog) closeAuthDialog();
  });
  elements.promptForm.addEventListener("submit", sendPrompt);
  elements.promptInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    elements.promptForm.requestSubmit();
  });
  elements.promptInput.addEventListener("input", resizePromptInput);
  elements.accessCodeInput.addEventListener("input", clearAccessError);
  elements.attachButton.addEventListener("click", () => {
    const open = elements.attachmentMenu.hidden;
    elements.attachmentMenu.hidden = !open;
    elements.attachButton.setAttribute("aria-expanded", String(open));
  });
  elements.attachmentMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-attachment-kind]");
    if (!option || option.disabled) return;
    openAttachmentPicker(option.dataset.attachmentKind);
  });
  elements.attachmentInput.addEventListener("change", async () => {
    const copy = translations[state.language];
    for (const file of Array.from(elements.attachmentInput.files || [])) {
      try {
        const attachment = await prepareAttachment(file, state.pendingAttachmentKind);
        state.attachments.push(attachment);
        trackEvent("file_uploaded", {
          provider: state.selectedProvider,
          file_kind: attachment.kind,
          file_type: file.type || "unknown",
          file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
          attachment_count: state.attachments.length
        });
      } catch (error) {
        trackEvent("app_error", {
          provider: state.selectedProvider,
          error_area: "file_upload",
          file_type: file.type || "unknown"
        });
        window.alert(error.message || copy.attachmentReadError);
      }
    }
    renderAttachmentList();
  });
  elements.attachmentList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-attachment]");
    if (!remove) return;
    state.attachments = state.attachments.filter((item) => item.id !== remove.dataset.removeAttachment);
    renderAttachmentList();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".attachment-control")) {
      elements.attachmentMenu.hidden = true;
      elements.attachButton.setAttribute("aria-expanded", "false");
    }

    if (!event.target.closest(".task-more")) {
      closeTaskMoreMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.attachmentMenu.hidden) {
        elements.attachmentMenu.hidden = true;
        elements.attachButton.setAttribute("aria-expanded", "false");
        elements.attachButton.focus();
      }
      closeTaskMoreMenu();
      closeSidebar();
    }
  });
  elements.newChatButton.addEventListener("click", resetChat);
  elements.providerList.addEventListener("click", (event) => {
    const card = event.target.closest(".provider-card");
    if (!card) return;
    state.selectedProvider = card.dataset.provider;
    trackEvent("provider_selected", {
      provider: state.selectedProvider,
      language: state.language
    });
    syncProviderCards();
    closeSidebar();
  });
  elements.languageButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });

  elements.taskGrid.addEventListener("click", (event) => {
    const moreButton = event.target.closest("#taskMoreButton");
    if (moreButton) {
      toggleTaskMoreMenu();
      return;
    }

    const button = event.target.closest("[data-task]");
    if (!button || !elements.taskGrid.contains(button)) return;
    updateTaskUI(button.dataset.task);
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
  resizePromptInput();
  setSessionState(null, translations[state.language].signedOut);
  renderAccount();
  await restoreEmailSession();
  if (!isAuthenticated() && !sessionStorage.getItem("allais_auth_prompted")) {
    sessionStorage.setItem("allais_auth_prompted", "1");
    openAuthDialog();
  }
}

init();
