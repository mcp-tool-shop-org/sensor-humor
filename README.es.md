<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

Herramienta MCP que le proporciona a su LLM un compañero cómico persistente: personalidad basada en el estado de ánimo, funciones de llamada con conocimiento de la sesión, chistes recurrentes, burlas, comentarios sarcásticos y frases pegadizas, todo ello con integración de voz mediante Piper TTS (con control de la prosodia).

Diseñada para desarrolladores: críticas suaves sobre problemas en el código, mensajes de error secos y lacónicos, escalada caótica ante fallos en la compilación. Nunca sobrescribe el tono del LLM principal; voz distinta que interviene cuando se le llama.

## Características

- 6 estados de ánimo, cada uno ajustado con una plantilla de prompt para completar espacios en blanco, lo que garantiza resultados predecibles y de alta calidad.
- Estado de la sesión: chistes recurrentes, búfer de fragmentos recientes (máximo 20), mapa de frases pegadizas; opcionalmente se guarda en el disco (`SENSOR_HUMOR_PERSIST`) para que las funciones de llamada sobrevivan a un reinicio del servidor.
- 9 herramientas: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset.
- Backend local de Ollama (qwen2.5:7b por defecto, configurable mediante `SENSOR_HUMOR_MODEL`).
- Emparejamiento de voz: mcp-voice-soundboard con Piper TTS (controles de prosodia: length_scale, noise_scale, noise_w_scale, volume).
- Determinista: aplicación del esquema JSON, validación, reintento en caso de resultados incorrectos, se aplica la herencia del estado de ánimo.

## Estados de ánimo

Cada estado de ánimo utiliza una plantilla de prompt para completar espacios en blanco que obliga al modelo a adoptar una forma predecible y de alta calidad.

- **dry** (seco): lacónico, minimalista, dolorosamente obvio (por defecto).
- **roast** (burla): burlas afectuosas y punzantes, etiquetas de veredicto/diagnóstico.
- **cynic** (cínico): realismo taciturno y despiadado ("Por supuesto:", "Predeciblemente:").
- **cheeky** (descarado): travesura juguetona ("Oh, cariño", "Movimiento audaz").
- **chaotic** (caótico): frase con sentido, seguida de un giro absurdo repentino ("Según se informa...").
- **zoomer** (de la Generación Z): sarcasmo despiadado y excesivamente conectado a Internet (reacción, comentario mordaz, BLOQUE DE MAYÚSCULAS, etiqueta).

Todos los estados de ánimo heredan la voz y la prosodia mediante mcp-voice-soundboard (se recomienda Piper).

## Requisitos

- Node.js 18+
- Ollama en ejecución localmente con `qwen2.5:7b` descargado (o establezca `SENSOR_HUMOR_MODEL` para un modelo diferente).
- mcp-voice-soundboard instalado y en ejecución (se recomienda el backend de Piper, opcional).
- @modelcontextprotocol/sdk

## Instalación

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Se publica una imagen de contenedor en GHCR con cada versión. sensor-humor utiliza MCP a través de stdio, por lo que ejecútelo de forma interactiva y diríjalo a un Ollama accesible:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## Inicio rápido

1. Inicie Ollama:

```bash
ollama pull qwen2.5:7b
```

2. Inicie el servidor MCP de sensor-humor (transporte stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Inicie voice-soundboard (modo Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. En su cliente MCP (Claude Code, Cursor, etc.):
- Agregue ambos servidores.
- Pruebe la cadena:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Se devolvió una burla en formato de texto. Si también está configurado [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard), `voice_speak(mood: "roast")` la reproducirá con la prosodia de Piper adecuada para el estado de ánimo.

## Herramientas

Todas las herramientas heredan el estado de ánimo actual de la sesión.

| Herramienta | Firma | Descripción |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Establece el estado de ánimo activo (dry, roast, chaotic, cheeky, cynic, zoomer). |
| `mood_get` | `()` | Estado de ánimo actual + recuento de chistes. |
| `comic_timing` | `(text, technique?)` | Reescribe con una entrega cómica (regla de tres, desvío de la atención, escalada, función de llamada, atenuación, automático). |
| `roast` | `(target, context?)` | Burla afectuosa en la voz del estado de ánimo actual; devuelve una gravedad de 1 a 5. Contexto: código, error, idea, situación. |
| `heckle` | `(target)` | Comentario mordaz y breve. |
| `catchphrase_generate` | `(context?)` | Crea un fragmento reutilizable (almacenado en la sesión). |
| `catchphrase_callback` | `()` | Reutiliza la frase pegadiza más utilizada (o devuelve nulo). |
| `debug_status` | `()` | Estado de salud del backend en vivo (Ollama accesible, modelo descargado), configuración resuelta, recuentos de reserva y estado de la sesión. |
| `session_reset` | `()` | Restablece todo el estado de la sesión (estado de ánimo, chistes, fragmentos, frases pegadizas, contador de turnos). |

**Resultados degradados:** cuando Ollama no está accesible o el modelo no se ha descargado, las herramientas cómicas devuelven una línea pregrabada en voz alta más `degraded: true` y un `degraded_reason` (`connection`, `model-not-found`, `timeout`, `safety-filter`, ...) para que quien llama pueda distinguir un chiste real de una alternativa; una generación genuina del modelo no lleva ninguna marca `degraded`. Llame a `debug_status` para ver la accesibilidad en vivo, el modelo/host/tiempo de espera resueltos y los recuentos de reserva. `roast` y `heckle` también muestran el `mood` activo; `catchphrase_generate` devuelve `is_fresh` (`true` = recién creado, `false` = se reutilizó una frase pegadiza existente).

## Prosodia del estado de ánimo (voz de Piper)

Cada estado de ánimo se asigna a una voz y configuración de prosodia distintas de Piper:

| Estado de ánimo | Voz | length_scale | noise_scale | noise_w_scale | volume | Característica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plana, cansada, metronómica |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo seguro |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Presentador de noticias que transmite tonterías |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Cálida, juguetona y con un guiño |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Fría, plana, sin sorpresa |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rápida, fuerte, con la energía de un streamer |

## Variables de entorno

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_TIMEOUT_MS=30000          # Ollama call timeout in ms (default: 30000; invalid values fall back to default)
SENSOR_HUMOR_TEMPERATURE=0.55          # generation temperature, clamped 0.0-2.0 (default: 0.55)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (only v1 ships today; other values fall back to v1)
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
SENSOR_HUMOR_PERSIST=false             # persist session to ~/.sensor-humor/session.json (survives restart; 24h expiry)
SENSOR_HUMOR_SESSION_DIR=              # override the session directory (default: ~/.sensor-humor)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)
OLLAMA_API_KEY=                        # Bearer token for a remote/cloud Ollama (e.g. https://ollama.com); unset for local

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observabilidad y depuración

- Cada llamada a una herramienta registra: el prompt enviado, la respuesta sin procesar de Ollama, la salida analizada, la actualización de la sesión.
- Voz: los registros de depuración muestran los parámetros de Piper aplicados por estado de ánimo.
- Establezca `SENSOR_HUMOR_DEBUG=true` para ver todo.

## Notas sobre la calidad

- La calidad del humor proviene de la ingeniería de indicaciones basada en un esquema, no de un único parámetro del modelo; cada estado de ánimo impone una forma predecible. Mida la tasa de éxito en su propio modelo/hardware con `scripts/ab-scorecard.ts` (plantilla en SCORECARD.md)
- Filtro de símil/comparación: expresión regular de validación posterior + reintento, y luego un mecanismo de seguridad que utiliza un estado de ánimo diferente si persiste una fuga.
- El filtro de lenguaje ofensivo se ejecuta como una barrera final, por lo que los insultos no pueden llegar al usuario, incluso cuando un reintento tardío los vuelve a introducir.
- Determinista: aplicación del esquema JSON, reintento en caso de resultados incorrectos, aplicación de la herencia de estados de ánimo en todas las herramientas.
- Voz: Piper proporciona una separación de la prosodia (duración/ruido/volumen por estado de ánimo); Kokoro como alternativa solo ajusta la velocidad.
- Solo para uso interno durante el desarrollo. El humor es subjetivo; desactive cualquier estado de ánimo a través de variables de entorno o ajuste las indicaciones si es necesario.

## Seguridad y confianza

- **Local por defecto:** se comunica con Ollama en `localhost` a través de HTTP. `OLLAMA_HOST` puede apuntar a otra ubicación (por ejemplo, un Ollama remoto/en la nube); esa es la única salida externa y es una elección explícita del operador.
- **Sistema de archivos:** ninguno por defecto. Con `SENSOR_HUMOR_PERSIST=true`, lee/escribe un archivo, `~/.sensor-humor/session.json` (cambie el directorio con `SENSOR_HUMOR_SESSION_DIR`), que contiene solo el estado del humor de su sesión (fragmentos, chistes, frases pegadizas); no se guardan credenciales. El archivo caduca automáticamente después de 24 horas.
- **Secretos:** ninguno por defecto. Si apunta `OLLAMA_HOST` a un Ollama remoto/en la nube, establezca `OLLAMA_API_KEY`; se lee desde el entorno y se envía solo como una cabecera `Bearer` al host; nunca se registra, guarda ni muestra (`debug_status` informa solo si se ha establecido una clave, no su valor).
- **Sin telemetría:** no se recopila ni se envía nada.
- **El estado de la sesión está en memoria por defecto:** desaparece cuando se detiene el proceso del servidor; opte por la persistencia en disco con `SENSOR_HUMOR_PERSIST`.
- **Sanitización de entradas:** todo el texto proporcionado por el usuario se sanitiza antes de la inyección de indicaciones (se eliminan los saltos de línea, se limita la longitud y se eliminan los caracteres de control).
- **Filtrado de salidas:** filtro de lenguaje ofensivo (lista de términos codificada en base64) con reintento + una barrera de seguridad final evita que los insultos lleguen al usuario, incluso en un reintento tardío o a partir de entradas que contengan insultos.

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
