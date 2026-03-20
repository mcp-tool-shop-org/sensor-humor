<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP (Model Context Protocol) que le da a su LLM (Large Language Model) un compañero cómico persistente: personalidad basada en el estado de ánimo, llamadas de retorno sensibles al contexto de la sesión, chistes recurrentes, insultos, comentarios sarcásticos y frases hechas, todo con integración de voz a través de Piper TTS (con control de la prosodia).

Diseñado para desarrolladores: comentarios ingeniosos sobre código deficiente, mensajes de error secos y directos, caos descontrolado en caso de fallos de compilación. Nunca sobrescribe el tono del LLM principal; tiene una voz distintiva que se activa cuando se le solicita.

## Características

- 6 estados de ánimo: seco (por defecto), sarcástico, absurdo, amigable, cínico, descontrolado.
- Estado de la sesión: chistes recurrentes, búfer de anillo de fragmentos recientes (máximo 20), mapa de frases hechas.
- Herramientas: mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback.
- Backend local de Ollama (se recomienda qwen2.5:7b-instruct).
- Emparejamiento de voz: mcp-voice-soundboard con Piper TTS (controles de prosodia: length_scale, noise_scale, noise_w_scale, volume).
- Determinista: aplicación y validación de esquemas JSON, reintento en caso de resultados incorrectos, registro de depuración.

## Requisitos

- Node.js 18+.
- Ollama en ejecución localmente con `qwen2.5:7b-instruct` descargado.
- mcp-voice-soundboard instalado y en ejecución (se recomienda el backend de Piper).
- @modelcontextprotocol/sdk.

## Instalación

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Guía rápida

1. Inicie Ollama:

```bash
ollama run qwen2.5:7b-instruct
```

2. Inicie el servidor MCP de sensor-humor (transporte stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Inicie el panel de sonido de voz (modo Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. En su cliente MCP (Claude Code, Cursor, etc.):
- Agregue ambos servidores.
- Pruebe la cadena:

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

Se devuelve un comentario sarcástico, y luego `voice_speak(mood: "roast")` lo pronuncia con energía sarcástica y segura.

## Herramientas

Todas las herramientas heredan el estado de ánimo actual de la sesión.

| Herramienta | Firma | Descripción |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Establece el estado de ánimo activo (seco, sarcástico, absurdo, amigable, cínico, descontrolado). |
| `mood.get` | `()` | Estado de ánimo actual + contador de chistes. |
| `comic_timing` | `(text, technique?)` | Reescribe con una entrega cómica (regla de tres, desvío, escalada, llamada de retorno, subestimación, automático). |
| `roast` | `(target, context?)` | Comentario afectuoso con patrón de veredicto/etiqueta, devuelve la severidad del 1 al 5. Contexto: código, error, idea, situación. |
| `heckle` | `(target)` | Comentario breve y directo. |
| `catchphrase.generate` | `(context?)` | Crea un fragmento reutilizable (almacenado en la sesión). |
| `catchphrase.callback` | `()` | Reutiliza la frase hecha más utilizada (o nula). |

## Prosodia del estado de ánimo (Voz de Piper)

Cada estado de ánimo se asocia con una voz de Piper distinta y una configuración de prosodia:

| Estado de ánimo | Voz | length_scale | noise_scale | noise_w_scale | volume | Característica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| seco | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plano, cansado, metronómico. |
| sarcástico | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo seguro. |
| absurdo | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Errático, impredecible. |
| amigable | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Energía cálida y gentil de un padre. |
| cínico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Monotonía cansada del mundo. |
| descontrolado | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | Rápido, fuerte, caótico. |

## Variables de entorno

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observabilidad y depuración

- Cada llamada a una herramienta registra: la solicitud enviada, la respuesta bruta de Ollama, la salida analizada y la actualización de la sesión.
- Voz: los registros de depuración muestran los parámetros de Piper aplicados por estado de ánimo.
- Establezca `SENSOR_HUMOR_DEBUG=true` para ver todo.

## Notas de calidad

- Tasa de éxito cómico: ~70-75% en sesiones reales (el estado de ánimo "seco" es el más fuerte, seguido de cerca por el "sarcástico").
- Determinista: aplicación de esquemas JSON, 1 reintento en caso de salida no válida, validación posterior para patrones prohibidos.
- Voz: Piper proporciona una separación real de la prosodia (no solo la velocidad); Kokoro es solo de velocidad.
- No apto para bots de producción; solo es un complemento para desarrolladores. El humor es subjetivo; ajuste las solicitudes si es necesario.

## Arquitectura

```
Host LLM (Claude, etc.)
  | calls tool
  v
sensor-humor MCP server (TypeScript, stdio)
  | builds mood prompt + session state
  v
Ollama (qwen2.5:7b-instruct, local)
  | returns JSON (schema-enforced)
  v
sensor-humor validates -> updates session -> returns to host
  | host optionally calls
  v
mcp-voice-soundboard (Piper backend)
  | maps mood -> prosody preset
  v
Piper TTS (local ONNX) -> audio
```

## Desarrollo

```bash
# build
npm run build

# watch & rebuild
npm run dev

# run tests
npm test

# run with debug
SENSOR_HUMOR_DEBUG=true npm start
```

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
