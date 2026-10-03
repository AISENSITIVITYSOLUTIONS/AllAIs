# API keys de AllAIs

AllAIs usa un backend propio para proteger las claves privadas de cada proveedor de IA. Las API keys deben guardarse siempre en el archivo `.env`, en la raiz del proyecto, y nunca deben enviarse al navegador.

## Donde poner las claves

Abre el archivo:

```txt
.env
```

Y completa las variables correspondientes:

```env
# OpenAI / ChatGPT
OPENAI_API_KEY=tu_clave_de_openai
OPENAI_MODEL=gpt-4.1-mini

# Anthropic / Claude
ANTHROPIC_API_KEY=tu_clave_de_anthropic
ANTHROPIC_MODEL=claude-3-5-haiku-20241022

# Google Gemini
GEMINI_API_KEY=tu_clave_de_gemini
GEMINI_MODEL=gemini-1.5-pro

# DeepSeek
DEEPSEEK_API_KEY=tu_clave_de_deepseek
DEEPSEEK_MODEL=deepseek-chat

# Qwen / Alibaba DashScope
QWEN_API_KEY=tu_clave_de_qwen
QWEN_MODEL=qwen-plus
```

Tambien puedes revisar `.env.example` para ver una plantilla segura sin claves reales.

## Reglas de seguridad

Las claves nunca deben ponerse en:

- el navegador;
- `index.html`;
- `app.js`;
- GitHub;
- mensajes de chat;
- capturas de pantalla;
- codigo frontend;
- consola del navegador.

## Como funciona en esta app

El frontend de AllAIs llama al backend local:

```txt
Frontend -> Backend de AllAIs -> API privada del proveedor
```

Esto permite que la clave privada viva solo en el servidor. El navegador nunca debe conocer `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` ni `QWEN_API_KEY`.

## Si una clave se expuso

Si una API key fue pegada en un chat, captura, GitHub o cualquier lugar publico, debes entrar al panel del proveedor, revocarla y crear una nueva.
