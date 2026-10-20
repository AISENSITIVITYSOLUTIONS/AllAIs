/*
 * AllAIs — Datos para la demo embebida del paso 4 del onboarding (Tarea #5b)
 * ===========================================================================
 *
 * Las 4 respuestas del prompt "Una poesía sobre la primavera" / "A poem about
 * spring" / "Un poème sur le printemps" para los 4 proveedores principales,
 * en los 3 idiomas de la app (ES/EN/FR).
 *
 * Son textos PRE-GENERADOS redactados para capturar el carácter de voz de
 * cada modelo. No son llamadas en vivo a los proveedores (el visitante aún
 * no está autenticado y no debemos consumir API ni cuota).
 *
 * Felipe puede editar cualquiera de las 12 poesías aquí sin tocar código:
 * cada entrada es un simple array de versos. La UI respeta los saltos de
 * línea del array.
 */

window.AllAIsOnboardingDemoData = {
  prompt: {
    es: "Una poesía sobre la primavera",
    en: "A poem about spring",
    fr: "Un poème sur le printemps"
  },
  cta_caption: {
    es: "Así se ve una comparación en AllAIs. Pregunta, compara, decide.",
    en: "This is a comparison in AllAIs. Ask, compare, decide.",
    fr: "Voilà une comparaison dans AllAIs. Demandez, comparez, décidez."
  },
  prompt_label: {
    es: "Tu pregunta",
    en: "Your prompt",
    fr: "Votre requête"
  },
  providers: [
    {
      id: "chatgpt",
      name: "ChatGPT",
      brand_color: "#10a37f",
      verses: {
        es: [
          "La primavera asoma",
          "entre pétalos tibios,",
          "y abre el cielo despacio",
          "con dedos de sol y nido."
        ],
        en: [
          "Spring arrives on tiptoe",
          "between warm petals,",
          "opening the sky slowly",
          "with fingers of sun and nest."
        ],
        fr: [
          "Le printemps paraît",
          "entre les pétales tièdes,",
          "ouvrant le ciel lentement",
          "de doigts de soleil et de nid."
        ]
      }
    },
    {
      id: "claude",
      name: "Claude",
      brand_color: "#c15f3c",
      verses: {
        es: [
          "No llega la primavera:",
          "se recuerda.",
          "El jardín guarda la cita",
          "que el invierno le dejó."
        ],
        en: [
          "Spring does not come:",
          "it remembers.",
          "The garden keeps the promise",
          "winter left behind."
        ],
        fr: [
          "Le printemps n'arrive pas :",
          "il se souvient.",
          "Le jardin garde la promesse",
          "que l'hiver lui a laissée."
        ]
      }
    },
    {
      id: "gemini",
      name: "Gemini",
      brand_color: "#4285f4",
      verses: {
        es: [
          "Verde, luz, aroma.",
          "La estación escribe",
          "su gramática del aire.",
          "Todo empieza otra vez."
        ],
        en: [
          "Green, light, aroma.",
          "The season writes",
          "its grammar of air.",
          "Everything begins again."
        ],
        fr: [
          "Vert, lumière, parfum.",
          "La saison écrit",
          "sa grammaire de l'air.",
          "Tout recommence."
        ]
      }
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      brand_color: "#5967ff",
      verses: {
        es: [
          "La primavera parte el frío",
          "como un cuchillo caliente.",
          "Las ramas estrenan nombre.",
          "La ciudad respira flor."
        ],
        en: [
          "Spring cuts the cold",
          "like a warm knife.",
          "The branches wear new names.",
          "The city breathes blossom."
        ],
        fr: [
          "Le printemps tranche le froid",
          "comme un couteau chaud.",
          "Les branches portent un nom neuf.",
          "La ville respire la fleur."
        ]
      }
    }
  ]
};
