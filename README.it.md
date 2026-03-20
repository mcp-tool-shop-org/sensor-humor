<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP (Model Context Protocol) che fornisce al vostro LLM (Large Language Model) un assistente comico persistente: personalità basata sull'umore, callback sensibili alla sessione, battute ricorrenti, insulti, provocazioni e frasi ad effetto, il tutto con integrazione vocale tramite Piper TTS (con controllo della prosodia).

Progettato per sviluppatori: commenti sarcastici sul codice, messaggi di errore secchi e impersonali, caos totale in caso di errori di compilazione. Non sovrascrive mai il tono dell'LLM ospite, ma utilizza una voce distinta che interviene quando viene chiamata.

## Funzionalità

- 6 umori: asciutto (predefinito), sarcastico, assurdo, positivo, cinico, folle
- Stato della sessione: battute ricorrenti, buffer circolare delle ultime battute (massimo 20), mappa delle frasi ad effetto
- Strumenti: mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback
- Backend Ollama locale (si consiglia qwen2.5:7b-instruct)
- Abbinamento vocale: mcp-voice-soundboard con Piper TTS (parametri della prosodia: length_scale, noise_scale, noise_w_scale, volume)
- Deterministico: applicazione dello schema JSON, validazione, riprova in caso di output errato, logging di debug

## Requisiti

- Node.js 18+
- Ollama in esecuzione localmente con `qwen2.5:7b-instruct` installato
- mcp-voice-soundboard installato e in esecuzione (si consiglia il backend Piper)
- @modelcontextprotocol/sdk

## Installazione

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Guida rapida

1. Avviare Ollama:

```bash
ollama run qwen2.5:7b-instruct
```

2. Avviare il server MCP di sensor-humor (trasporto stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Avviare il voice-soundboard (modalità Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Nel vostro client MCP (Claude Code, Cursor, ecc.):
- Aggiungere entrambi i server
- Testare la catena:

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

Viene restituito un insulto testuale, quindi `voice_speak(mood: "roast")` lo pronuncia con energia sarcastica e sicura.

## Strumenti

Tutti gli strumenti ereditano l'umore corrente dalla sessione.

| Strumento | Firma | Descrizione |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Impostare l'umore attivo (asciutto, sarcastico, assurdo, positivo, cinico, folle) |
| `mood.get` | `()` | Umore corrente + conteggio delle battute |
| `comic_timing` | `(text, technique?)` | Riscrivere con un tono comico (regola delle tre, depistaggio, escalation, richiamo, understatement, automatico) |
| `roast` | `(target, context?)` | Insulto affettuoso con schema di verdetto/etichetta, restituisce un livello di severità da 1 a 5. Contesto: codice, errore, idea, situazione |
| `heckle` | `(target)` | Osservazione pungente |
| `catchphrase.generate` | `(context?)` | Creare una battuta riutilizzabile (memorizzata nella sessione) |
| `catchphrase.callback` | `()` | Riutilizzare la frase ad effetto più utilizzata (o nulla) |

## Prosodia dell'umore (Voce Piper)

Ogni umore è associato a una voce Piper distinta e a una configurazione della prosodia:

| Umore | Voce | length_scale | noise_scale | noise_w_scale | volume | Caratteristica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| asciutto | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Appannato, stanco, metronòmico |
| sarcastico | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo sicuro |
| assurdo | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Erratico, imprevedibile |
| positivo | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Energia calorosa e gentile da papà |
| cinico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Monologo stanco |
| folle | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | Veloce, forte, caotico |

## Variabili d'ambiente

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Osservabilità e Debug

- Ogni chiamata a uno strumento registra: prompt inviato, risposta grezza di Ollama, output analizzato, aggiornamento della sessione
- Voce: i log di debug mostrano i parametri Piper applicati per ogni umore
- Impostare `SENSOR_HUMOR_DEBUG=true` per visualizzare tutto

## Note sulla qualità

- Tasso di successo comico: ~70-75% nelle sessioni reali (l'umore asciutto è il migliore, seguito da quello sarcastico)
- Deterministico: applicazione dello schema JSON, 1 riprova in caso di output non valido, validazione post-esecuzione per schemi vietati
- Voce: Piper offre una vera separazione della prosodia (non solo velocità); Kokoro è solo velocità
- Non adatto a bot di produzione, solo come strumento per sviluppatori. L'umorismo è soggettivo; regolare i prompt se necessario.

## Architettura

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

## Sviluppo

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

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
