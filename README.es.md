<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/sensor-humor"><img src="https://img.shields.io/npm/v/@mcptoolshop/sensor-humor?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

Herramienta MCP que le da a tu LLM un compañero cómico persistente: personalidad basada en el estado de ánimo, respuestas basadas en la sesión, chistes recurrentes, burlas, comentarios sarcásticos y frases pegadizas, todo con integración de voz a través de Piper TTS (con control de la prosodia).

Diseñada para desarrolladores: comentarios sutiles sobre problemas en el código, mensajes de error secos y lacónicos, escalada caótica en caso de fallos en la compilación. Nunca sobrescribe el tono del LLM principal: voz distinta que interviene cuando se le llama.

## Características

- 6 estados de ánimo, cada uno ajustado con una plantilla de texto incompleto para obtener resultados predecibles y de alta calidad.
- Estado de la sesión: chistes recurrentes, búfer de anillo de fragmentos recientes (máximo 20), mapa de frases pegadizas; opcionalmente, se guarda en el disco (`SENSOR_HUMOR_PERSIST`) para que las respuestas persistan incluso después de reiniciar el servidor.
- 11 herramientas: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, running_gag, debug_status, debug_chain, session_reset.
- Backend local de Ollama (qwen2.5:7b por defecto, configurable a través de `SENSOR_HUMOR_MODEL`).
- Emparejamiento de voz: mcp-voice-soundboard con Piper TTS (controles de prosodia: length_scale, noise_scale, noise_w_scale, volume).
- Determinista: aplicación de esquema JSON, validación, reintento en caso de resultados incorrectos, aplicación de la herencia del estado de ánimo.

## Estados de ánimo

Cada estado de ánimo utiliza una plantilla de texto incompleto que obliga al modelo a adoptar una forma predecible y de alta calidad.

- **dry** (seco): lacónico, minimalista, dolorosamente obvio (por defecto).
- **roast** (burla): burlas afectuosas y directas, etiquetas de veredicto/diagnóstico.
- **cynic** (cínico): realismo taciturno y despiadado ("Por supuesto:", "Predeciblemente:").
- **cheeky** (descarado): travesuras juguetonas ("Oh, cariño", "Movimiento audaz").
- **chaotic** (caótico): oración con sentido, seguida de un giro absurdo repentino ("Según se informa...").
- **zoomer** (generación Z): sarcasmo despiadado y conectado a Internet de la generación Z (reacción, comentario, BLOQUE DE MAYÚSCULAS, etiqueta).

Todos los estados de ánimo heredan la voz y la prosodia a través de mcp-voice-soundboard (se recomienda Piper).

## Requisitos

- Node.js 18+
- Ollama en ejecución localmente con `qwen2.5:7b` descargado (o establece `SENSOR_HUMOR_MODEL` para un modelo diferente).
- mcp-voice-soundboard instalado y en ejecución (se recomienda el backend de Piper, opcional).
- @modelcontextprotocol/sdk

## Instalación

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Se publica una imagen de contenedor en GHCR en cada versión. sensor-humor utiliza MCP a través de stdio, por lo que ejecútalo de forma interactiva y conéctalo a un Ollama accesible:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### Configura tu cliente MCP

Registra sensor-humor como un servidor stdio en la configuración de MCP de tu cliente. Para Claude Code / Claude Desktop (`claude_desktop_config.json`) o cualquier configuración con formato `mcpServers`:

```json
{
  "mcpServers": {
    "sensor-humor": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/sensor-humor"],
      "env": {
        "SENSOR_HUMOR_MODEL": "qwen2.5:7b",
        "OLLAMA_HOST": "http://127.0.0.1:11434"
      }
    }
  }
}
```

El servidor lee su configuración de este bloque `env` (o del shell que lo inicia); **no** carga automáticamente un archivo `.env`. Consulta [`.env.example`](.env.example) para ver todas las variables admitidas. Si instalaste el paquete globalmente, usa `"command": "sensor-humor"` sin `args`.

## Inicio rápido

1. Inicia Ollama:

```bash
ollama pull qwen2.5:7b
```

2. Inicia el servidor MCP de sensor-humor (transporte stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Inicia voice-soundboard (modo Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. En tu cliente MCP (Claude Code, Cursor, etc.):
- Agrega ambos servidores.
- Prueba la cadena:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Se devolvió una burla en texto. Si [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) también está configurado, `voice_speak(mood: "roast")` la pronunciará con la prosodia de Piper adecuada para el estado de ánimo.

## Herramientas

Todas las herramientas heredan el estado de ánimo actual de la sesión.

| Herramienta | Firma | Descripción |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Establece el estado de ánimo activo (dry, roast, chaotic, cheeky, cynic, zoomer). |
| `mood_get` | `()` | Estado de ánimo actual + recuento de chistes + `allowed_techniques` para el estado de ánimo activo. |
| `comic_timing` | `(text, technique?)` | Reescribe con una entrega cómica (regla de tres, desvío de la atención, escalada, respuesta, subestimación, automático). |
| `roast` | `(target, context?, technique?)` | Burla afectuosa con la voz del estado de ánimo actual, devuelve una gravedad de 1 a 5. Contexto: código, error, idea, situación. La técnica opcional debe ser válida para el estado de ánimo actual (las combinaciones no válidas se rechazan). |
| `heckle` | `(target, technique?)` | Comentario sarcástico y directo. Técnica opcional, la misma matriz de estado de ánimo × técnica que roast. |
| `catchphrase_generate` | `(context?)` | Crea un fragmento reutilizable (almacenado en la sesión). |
| `catchphrase_callback` | `()` | Reutiliza la frase pegadiza más utilizada (o devuelve nulo). |
| `running_gag` | `(setup, tag)` | Planta un chiste recurrente al que el compañero puede hacer referencia más adelante (con protección de seguridad). Se convierte en un candidato para la respuesta después de `SENSOR_HUMOR_GAG_MIN_DISTANCE` turnos; se retira después de `SENSOR_HUMOR_GAG_MAX_FIRES`. |
| `debug_status` | `()` | Estado de salud del backend en vivo (Ollama accesible, modelo descargado), configuración resuelta, recuentos de reserva/tasa y estado de la sesión. |
| `debug_chain` | `(limit?)` | Las últimas N trazas por llamada (herramienta, estado de ánimo, entrada, huella digital del prompt, reintentos, validadores activados, latencia); una llamada reconstruye la canalización de generación. |
| `session_reset` | `()` | Restablece todo el estado de la sesión (estado de ánimo, chistes, fragmentos, frases pegadizas, trazas, contador de turnos). |

**Salida degradada (con formato de texto, con ramificación a nivel de máquina):** cuando una herramienta no puede devolver una generación de modelo genuina, devuelve una línea predefinida con la voz correspondiente, más `degraded: true` y una `degraded_reason` de un **conjunto cerrado** sobre el que un agente consumidor puede realizar una ramificación exhaustiva: `safety-filter` (se sustituyó una blasfemia/símil/fuga de metadatos), `language` (el modelo cambió de código y utilizó un script diferente al latino, y se sustituyó por una línea en inglés; se trata de una degradación de la conformidad, no de la seguridad), `connection`, `timeout`, `model-not-found`, `auth`, `rate-limit`, `server`, `http`, `json-parse`, `validation`, `exhausted`, `unknown`. Una generación genuina **no** lleva la marca `degraded`; su ausencia es la señal positiva. **Todas** las herramientas cómicas llevan esta marca, incluida `catchphrase_callback` (se marca una respuesta sustituida por motivos de seguridad, pero nunca se presenta como una respuesta genuina). `roast`/`heckle` también reflejan el `mood` activo; `catchphrase_generate` devuelve `is_fresh` (`true` = recién creado, `false` = una frase pegadiza existente reutilizada).

Llame a `debug_status` para obtener una respuesta rápida sobre su salud: disponibilidad en tiempo real (más `unreachable_reason` cuando no está disponible — `connection` frente a `auth` frente a `timeout`), el modelo/host/tiempo de espera resuelto, estadísticas de generación que incluyen tanto `fallback_calls` (backend) **como** `safety_filter_fires` (con qué frecuencia el límite de seguridad sustituyó una línea) y un `prompt_fingerprint` + `active_prompt_key` que vinculan el texto del *prompt* activo + el modelo para que la desviación en la salida se pueda atribuir a un cambio en el prompt frente al modelo, y una reducción silenciosa de la versión del prompt (una versión v2 solicitada que vuelve a la v1) es visible.

## Prosodia del estado de ánimo (Voz Piper)

Cada estado de ánimo se asigna a una voz Piper + configuración de prosodia distinta:

| Estado de ánimo | Voz | length_scale | noise_scale | noise_w_scale | volumen | Personaje |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plano, cansado, metronómico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo seguro |
| caótico | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Presentador de noticias que dice tonterías |
| descarado | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Cálido, juguetón, guiño |
| cínico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Frío, plano, sin sorpresa |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rápido, fuerte, energía de streamer |

## Variables de entorno

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_TIMEOUT_MS=30000          # Ollama call timeout in ms (default: 30000; invalid values fall back to default)
SENSOR_HUMOR_TEMPERATURE=0.55          # generation temperature, clamped 0.0-2.0 (default: 0.55)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (dry.v2 is the exemplar; set 2 to load v2 where it exists, else per-mood v1 fallback)
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
SENSOR_HUMOR_PERSIST=false             # persist session to ~/.sensor-humor/session.json (survives restart; 24h expiry)
SENSOR_HUMOR_SESSION_DIR=              # override the session directory (default: ~/.sensor-humor)
SENSOR_HUMOR_MAX_RETRIES=1             # Ollama generation retries on bad output (0-3; default: 1)
SENSOR_HUMOR_GAG_MIN_DISTANCE=2        # turns before a planted running_gag is callback-eligible (default: 2)
SENSOR_HUMOR_GAG_MAX_FIRES=3           # times a running gag fires before it retires (default: 3)
SENSOR_HUMOR_FULL_TRACE=false          # debug_chain also captures full prompt/raw/parsed text (default: false)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)
OLLAMA_API_KEY=                        # Bearer token for a remote/cloud Ollama (e.g. https://ollama.com); unset for local

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observabilidad y depuración

- Cada llamada a la herramienta registra: prompt enviado, respuesta bruta de Ollama, salida analizada, actualización de la sesión
- Voz: los registros de depuración muestran los parámetros de Piper aplicados por estado de ánimo
- Establezca `SENSOR_HUMOR_DEBUG=true` para ver todo

## Notas de calidad

- La calidad de la comedia proviene de la ingeniería de prompts basada en un esquema, no de un único ajuste del modelo; cada estado de ánimo impone una forma predecible. Mida la tasa de éxito en su propio modelo/hardware con `scripts/ab-scorecard.ts` (plantilla en SCORECARD.md)
- Barrera de regresión de la estabilidad del prompt (v1.2): los prompts del estado de ánimo de la v1 están **congelados** (fijados por `tests/scorecard-frozen-prompts.test.ts`; para cambiar uno, actualice a `v2`, nunca edite en el mismo lugar). Un conjunto **de forma + seguridad** determinista + estadísticas se ejecutan en `npm test` (sin backend); `npm run scorecard` ejecuta la comprobación estadística en vivo de la desviación, con una tasa de éxito por estado de ánimo controlada mediante un intervalo de Wilson con un veredicto de tres valores: APROBADO / FALLIDO / INCONCLUSO y una parada temprana SPRT. Mide la conformidad estructural + la seguridad, **no** la diversión (la puntuación automatizada del humor no es fiable; la mejor correlación LLM frente a humano ≈ 0,2)
- Filtro de símil/comparación: regex de post-validación + reintento, luego una alternativa segura con la voz del estado de ánimo si persiste una fuga
- Filtro de conformidad del idioma: la comedia está en inglés, por lo que una barrera que no sea de un script latino (una secuencia continua de palabras extranjeras **o** una alta proporción de letras que no son latinas, calculada solo sobre las letras) marca la salida con cambios de código, por ejemplo, `qwen2.5:7b` que se introduce en chino a mitad de la línea. Post-validación + un reintento solo en inglés, luego una alternativa en inglés sin entrada con `degraded_reason: language` (una degradación de la *conformidad*, distinta de `safety-filter`, por lo que no se contabiliza en el contador de activación del filtro de seguridad). Solo detección: las palabras prestadas latinas acentuadas (`café`, `résumé`), la puntuación, los dígitos y los emojis nunca lo activan
- Filtro de lenguaje agresivo: un regex determinista de lista de términos se ejecuta como una *barrera terminal* en **cada** herramienta de comedia (incluidas las frases hechas), se vuelve a comprobar después de cada reintento y se aplica antes de interpolar cualquier alternativa. La ruta de detección primero desofusca: NFKC + eliminación de caracteres de ancho cero/bidireccionales + plegado de homoglifos + plegado de leetspeak + eliminación de separadores intra-palabra + eliminación de marcas de combinación, para que las evasiones comunes (inserción de ancho cero, similares cirílicos/griegos, ancho completo, `r3tard`, `re-tard`, `retárd`) no puedan dejar pasar un insulto más allá del límite de la palabra. Este es un **límite** determinista, no una barandilla; consulte Seguridad y confianza para conocer el límite real
- Determinista: aplicación del esquema JSON, reintento en caso de salida incorrecta, se aplica la herencia del estado de ánimo en todas las herramientas
- Voz: Piper proporciona separación de la prosodia (longitud/ruido/volumen por estado de ánimo); la alternativa de Kokoro es solo de velocidad
- Solo para herramientas de desarrollo. El humor es subjetivo; desactive cualquier estado de ánimo a través del entorno o ajuste los prompts si es necesario

## Seguridad y confianza

- **Local por defecto:** se comunica con Ollama en `localhost` a través de HTTP. `OLLAMA_HOST` puede apuntar a otra ubicación (por ejemplo, un Ollama remoto/en la nube); esta es la única salida externa y es la elección explícita del operador.
- **Sistema de archivos:** ninguno por defecto. Con `SENSOR_HUMOR_PERSIST=true`, lee/escribe un archivo, `~/.sensor-humor/session.json` (reemplaza el directorio con `SENSOR_HUMOR_SESSION_DIR`), que contiene solo el estado de la sesión de comedia (fragmentos, chistes, frases hechas), sin credenciales. El archivo caduca automáticamente después de 24 horas.
- **Secretos:** ninguno por defecto. Si apunta `OLLAMA_HOST` a un Ollama remoto/en la nube, establezca `OLLAMA_API_KEY`; se lee del entorno y se envía solo como una cabecera `Bearer` a ese host; nunca se registra, se guarda ni se repite (`debug_status` solo informa si se ha establecido una clave, nunca su valor).
- **Sin telemetría:** no se recopila ni se envía nada.
- **El estado de la sesión se almacena en la memoria por defecto:** se pierde cuando se detiene el proceso del servidor; opte por la persistencia en el disco con `SENSOR_HUMOR_PERSIST`.
- **Sanitización de la entrada:** todo el texto proporcionado por el usuario se normaliza y se limpia antes de la inyección de indicaciones: Unicode NFKC, se eliminan los caracteres de ancho cero/bidireccionales/de formato, los homoglifos comunes se reducen a ASCII, se eliminan los saltos de línea, se eliminan los caracteres de control y se limita la longitud.
- **Filtrado de la salida (umbral determinista + límite honesto):** una lista de términos almacenada en base64 se ejecuta como una puerta de seguridad terminal en cada herramienta de comedia (se vuelve a comprobar después de cada reintento y se aplica antes de cualquier alternativa), y una alternativa de entrada del usuario se reduce a una línea estática y sin entrada en lugar de repetir un token prohibido. La ruta de detección primero elimina la ofuscación, por lo que se evitan las técnicas comunes: inserción de ancho cero/bidireccional, homoglifos (cirílico/griego/ancho completo), leetspeak (`r3tard`), separadores intra-palabra (`re-tard`, `r.e.t.a.r.d`) y diacríticos combinados (`retárd`). Las entradas incorrectas también se eliminan de una sesión persistente manipulada o heredada al cargar. **Lo que NO hace:** es un filtro de lista de términos determinista, no un clasificador aprendido; no defiende contra variantes de insultos fuera de la lista/nuevas, espaciado de una sola letra (`r e t a r d`), arte ASCII/ofuscación espacial, cobertura completa de Unicode confusa o ataques semánticos/de evasión de restricciones. Trátelo como un umbral de esfuerzo máximo para una herramienta de humor local, no como una garantía de moderación para entradas públicas no confiables.
- **Formato de error de la herramienta:** los errores de tiempo de ejecución/de la herramienta devuelven el formato de error estructurado del estudio (`{code, message, hint, retryable}`); tenga en cuenta que los errores de validación del *esquema de entrada* (por ejemplo, un `mood` no válido) son detectados por el SDK de MCP antes de que se ejecute el controlador y se muestran como el error estándar `InvalidParams` del SDK, no con este formato.

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
