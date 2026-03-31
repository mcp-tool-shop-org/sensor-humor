<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP (Model Context Protocol) che fornisce al vostro LLM (Large Language Model) un assistente comico persistente: personalità basata sull'umore, callback sensibili alla sessione, battute ricorrenti, insulti, provocazioni e frasi ad effetto, il tutto con integrazione vocale tramite Piper TTS (controllo della prosodia).

Progettato per sviluppatori: commenti sarcastici sul codice, messaggi di errore secchi e impersonali, caos totale in caso di errori di compilazione. Non sovrascrive mai il tono dell'LLM ospite, ma utilizza una voce distinta che interviene quando viene chiamata.

## Funzionalità

- 6 modalità, tutte con un tasso di successo superiore al 70% nelle sessioni di sviluppo reali.
- Stato della sessione: battute ricorrenti, buffer circolare delle ultime battute (massimo 20), mappa delle frasi tipiche.
- 9 strumenti: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset.
- Backend Ollama locale (qwen2.5:7b predefinito, configurabile tramite `SENSOR_HUMOR_MODEL`).
- Associazione vocale: mcp-voice-soundboard con Piper TTS (controlli di prosodia: length_scale, noise_scale, noise_w_scale, volume).
- Deterministic: applicazione dello schema JSON, validazione, riprova in caso di output errato, ereditarietà della modalità forzata.

## Modalità

Ogni modalità utilizza un modello di prompt con spazi da riempire che forza il modello a generare output prevedibili e di alta qualità.

- **dry** — tono piatto, minimalista, ovvio (predefinito).
- **roast** — critiche affettuose e pungenti, etichette di verdetto/diagnosi.
- **cynic** — realismo cinico e silenziosamente cattivo ("Certo:", "Prevedibilmente:").
- **cheeky** — scherzi giocosi e maliziosi ("Oh, tesoro", "Mossa audace").
- **chaotic** — frase apparentemente normale, seguita da un colpo di scena assurdo ("Si dice che...").
- **zoomer** — cinismo spietato della Generazione Z, sempre online (reazione, frecciatina, MAIUSCOLO, tag).

Tutte le modalità ereditano la voce e la prosodia tramite mcp-voice-soundboard (Piper consigliato).

## Requisiti

- Node.js 18+.
- Ollama in esecuzione localmente con il modello `qwen2.5:7b` scaricato (o impostare `SENSOR_HUMOR_MODEL` per un modello diverso).
- mcp-voice-soundboard installato e in esecuzione (backend Piper consigliato, opzionale).
- @modelcontextprotocol/sdk.

## Installazione

```bash
npm install sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Guida rapida

1. Avviare Ollama:

```bash
ollama pull qwen2.5:7b
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
mood_set(style: "roast")
roast(target: "800-line god function")
```

Testo "roast" restituito. Se anche [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) è configurato, `voice_speak(mood: "roast")` lo pronuncia con la prosodia appropriata di Piper per la modalità.

## Strumenti

Tutti gli strumenti ereditano l'umore corrente dalla sessione.

| Strumento | Firma | Descrizione |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Imposta l'umore (serio, sarcastico, caotico, impertinente, cinico, "zoomer") |
| `mood_get` | `()` | Umore corrente + conteggio delle battute |
| `comic_timing` | `(text, technique?)` | Riscrivere con un tono comico (regola delle tre, depistaggio, escalation, richiamo, understatement, automatico) |
| `roast` | `(target, context?)` | Critica affettuosa nella voce della modalità corrente, restituisce un livello di severità da 1 a 5. Contesto: codice, errore, idea, situazione. |
| `heckle` | `(target)` | Osservazione pungente |
| `catchphrase_generate` | `(context?)` | Creare una battuta riutilizzabile (memorizzata nella sessione) |
| `catchphrase_callback` | `()` | Riutilizzare la frase ad effetto più utilizzata (o nulla) |
| `debug_status` | `()` | Visualizza lo stato corrente della sessione, la configurazione della modalità e il backend vocale. |
| `session_reset` | `()` | Ripristina tutti gli stati della sessione (modalità, battute, elementi, frasi tipiche, contatore di turni). |

## Prosodia dell'umore (Voce Piper)

Ogni umore è associato a una voce Piper distinta e a una configurazione della prosodia:

| Umore | Voce | length_scale | noise_scale | noise_w_scale | volume | Caratteristica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| asciutto | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Piatto, stanco, metronòmico |
| sarcastico | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo sicuro |
| Caotico | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Un conduttore di notizie che dice assurdità. |
| Impertinente | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Un'occhiata complice, giocosa e provocante. |
| Cinico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Freddo, piatto, nessuna sorpresa. |
| "Zoomer" (riferimento a una generazione giovane, spesso associata a dinamismo e tecnologia). | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Veloce, rumoroso, energia da "streamer". |

## Variabili d'ambiente

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Osservabilità e Debug

- Ogni chiamata a uno strumento registra: prompt inviato, risposta grezza di Ollama, output analizzato, aggiornamento della sessione
- Voce: i log di debug mostrano i parametri di Piper applicati per ogni umore
- Impostare `SENSOR_HUMOR_DEBUG=true` per visualizzare tutto

## Note sulla qualità

- Tasso di successo comico: 70-100% per modalità/strumento nelle sessioni di sviluppo reali (prompt basati su scheletro).
- Filtro di similitudini/confronti: espressione regolare di post-validazione + riprova/fallback per evitare errori in modalità "dry" o "cheeky".
- Tutte le modalità con un tasso di successo superiore al 70% nelle sessioni reali; "roast", "cynic" e "chaotic" spesso con un tasso del 90-100%.
- Deterministic: applicazione dello schema JSON, riprova in caso di output errato, ereditarietà della modalità forzata in tutti gli strumenti.
- Voce: Piper fornisce una separazione della prosodia (lunghezza/rumore/volume per modalità); Kokoro è un'alternativa più veloce.
- Solo strumento per sviluppatori. L'umorismo è soggettivo; disabilitare qualsiasi modalità tramite variabili d'ambiente o modificare i prompt se necessario.

## Sicurezza e Affidabilità

- **Solo locale** — comunica con Ollama su localhost tramite HTTP, senza connessioni in uscita verso la rete esterna.
- **Nessun accesso al file system** — non legge né scrive file.
- **Nessuna gestione di segreti** — non legge, memorizza né trasmette credenziali.
- **Nessuna telemetria** — non vengono raccolti né inviati dati.
- **Lo stato della sessione è solo in memoria** — viene perso quando il processo del server si interrompe.
- **Sanificazione dell'input** — tutto il testo fornito dall'utente viene sanificato prima dell'iniezione di prompt (rimozione delle nuove righe, limite di lunghezza, rimozione dei caratteri di controllo).
- **Filtraggio dell'output** — filtro per linguaggio offensivo (elenco di termini codificati in base64) con riprova + fallback sicuro per evitare che insulti raggiungano l'utente.

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

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
