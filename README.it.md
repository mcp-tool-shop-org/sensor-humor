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

MCP è uno strumento che fornisce al tuo LLM un compagno comico persistente: personalità basata sull'umore, richiami consapevoli della sessione, gag ricorrenti, battute sarcastiche, commenti pungenti e frasi ad effetto, il tutto con integrazione vocale tramite Piper TTS (controllo della prosodia).

Progettato per gli sviluppatori: lievi critiche sui problemi del codice, messaggi di errore asciutti e impersonali, escalation caotica in caso di errori di compilazione. Non sovrascrive mai il tono dell'LLM host, ma offre una voce distinta che interviene quando viene chiamata.

## Funzionalità

- 6 umori, ciascuno ottimizzato con un modello di prompt a completamento per ottenere risultati prevedibili e di alta qualità
- Stato della sessione: gag ricorrenti, buffer ad anello degli ultimi elementi (massimo 20), mappa delle frasi ad effetto, che possono essere salvate su disco (`SENSOR_HUMOR_PERSIST`) in modo che i richiami sopravvivano a un riavvio del server
- 9 strumenti: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Backend Ollama locale (qwen2.5:7b predefinito, configurabile tramite `SENSOR_HUMOR_MODEL`)
- Abbinamento vocale: mcp-voice-soundboard con Piper TTS (controlli della prosodia: length_scale, noise_scale, noise_w_scale, volume)
- Deterministico: applicazione dello schema JSON, convalida, ripetizione in caso di output non valido, ereditarietà dell'umore forzata

## Umore

Ogni umore utilizza un modello di prompt a completamento che forza il modello ad adottare una forma prevedibile e di alta qualità.

- **dry** (asciutto) — impersonale, minimalista, palesemente ovvio (predefinito)
- **roast** (battuta sarcastica) — battute affettuose ma pungenti, etichette di verdetto/diagnosi
- **cynic** (cinico) — realismo disilluso e sommesso ("Certo:", "Come previsto:")
- **cheeky** (sfacciato) — malizia giocosa e scherzosa ("Oh tesoro", "Mossa audace")
- **chaotic** (caotico) — frase coerente, seguita da un improvviso colpo di scena assurdo ("Si dice che...")
- **zoomer** — sarcasmo tipico della Gen Z, sempre online e incline a commenti pungenti (reazione, battuta, testo in MAIUSCOLO, tag)

Tutti gli umori ereditano la voce + la prosodia tramite mcp-voice-soundboard (si consiglia Piper).

## Requisiti

- Node.js 18+
- Ollama in esecuzione localmente con `qwen2.5:7b` scaricato (o impostare `SENSOR_HUMOR_MODEL` per un modello diverso)
- mcp-voice-soundboard installato e in esecuzione (si consiglia il backend Piper, opzionale)
- @modelcontextprotocol/sdk

## Installazione

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Un'immagine container viene pubblicata su GHCR ad ogni rilascio. sensor-humor comunica tramite MCP su stdio, quindi eseguilo in modo interattivo e puntalo a un Ollama accessibile:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## Avvio rapido

1. Avvia Ollama:

```bash
ollama pull qwen2.5:7b
```

2. Avvia il server MCP di sensor-humor (trasporto stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Avvia voice-soundboard (modalità Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Nel tuo client MCP (Claude Code, Cursor, ecc.):
- Aggiungi entrambi i server
- Prova la catena:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

È stata restituita una battuta sarcastica in formato testo. Se anche [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) è configurato, `voice_speak(mood: "roast")` la pronuncia con la prosodia Piper appropriata all'umore.

## Strumenti

Tutti gli strumenti ereditano l'umore corrente dalla sessione.

| Strumento | Firma | Descrizione |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Imposta l'umore attivo (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Umore corrente + numero di gag |
| `comic_timing` | `(text, technique?)` | Rielabora con una presentazione comica (regola dei tre, depistaggio, escalation, richiamo, understatement, automatico) |
| `roast` | `(target, context?)` | Battuta sarcastica affettuosa nell'umore vocale corrente, restituisce un livello di gravità da 1 a 5. Contesto: codice, errore, idea, situazione |
| `heckle` | `(target)` | Breve battuta pungente |
| `catchphrase_generate` | `(context?)` | Crea un elemento riutilizzabile (memorizzato nella sessione) |
| `catchphrase_callback` | `()` | Riutilizza la frase ad effetto più utilizzata (o restituisce null) |
| `debug_status` | `()` | Stato di salute del backend in tempo reale (Ollama raggiungibile, modello scaricato), configurazione risolta, conteggi di fallback e stato della sessione |
| `session_reset` | `()` | Reimposta tutto lo stato della sessione (umore, gag, elementi, frasi ad effetto, contatore dei turni) |

**Output degradato:** quando Ollama non è raggiungibile o il modello non è scaricato, gli strumenti comici restituiscono una frase preregistrata con la voce appropriata più `degraded: true` e un `degraded_reason` (`connection`, `model-not-found`, `timeout`, `safety-filter`, ...) in modo che chi chiama possa distinguere una vera battuta da un fallback; una generazione di modello autentica non contiene il flag `degraded`. Chiama `debug_status` per visualizzare la raggiungibilità in tempo reale, il modello/host/timeout risolti e i conteggi di fallback. `roast` e `heckle` fanno eco anche all'`mood` attivo; `catchphrase_generate` restituisce `is_fresh` (`true` = appena creato, `false` = è stata riutilizzata una frase ad effetto esistente nella sessione).

## Prosodia dell'umore (voce Piper)

Ogni umore corrisponde a una voce Piper + configurazione della prosodia distinta:

| Umore | Voce | length_scale | noise_scale | noise_w_scale | volume | Caratteristica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Piatto, stanco, metronomico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sicuro sarcasmo |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Conduttore di notizie che racconta assurdità |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Caldo, scherzoso, ammiccante |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Freddo, piatto, nessuna sorpresa |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Veloce, forte, energia da streamer |

## Variabili d'ambiente

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

## Osservabilità e debug

- Ogni chiamata di strumento registra: prompt inviato, risposta grezza di Ollama, output analizzato, aggiornamento della sessione
- Voce: i log di debug mostrano i parametri Piper applicati per ogni umore
- Imposta `SENSOR_HUMOR_DEBUG=true` per visualizzare tutto

## Note sulla qualità

- La qualità dell’umorismo deriva da una progettazione dei prompt basata su schemi, non da un singolo parametro del modello: ogni emozione impone una forma prevedibile. Misura il tasso di successo sul tuo modello/hardware con `scripts/ab-scorecard.ts` (modello in SCORECARD.md)
- Filtro per similitudini/paragoni: espressione regolare post-validazione + riprova, quindi un meccanismo di sicurezza che utilizza un tono più neutro se persiste un problema
- Il filtro per linguaggio offensivo funziona come una barriera finale, in modo che le imprecazioni non possano raggiungere l’utente, anche quando una nuova riprova le reintroduce
- Deterministico: applicazione dello schema JSON, riprova in caso di output errato, ereditarietà delle emozioni applicata a tutti gli strumenti
- Voce: Piper fornisce la separazione della prosodia (durata/rumore/volume per emozione); Kokoro come alternativa utilizza solo la velocità
- Solo strumento di supporto per lo sviluppo. L’umorismo è soggettivo; disabilita qualsiasi emozione tramite variabile d’ambiente o modifica i prompt, se necessario

## Sicurezza e affidabilità

- **Localmente per impostazione predefinita:** comunica con Ollama su `localhost` tramite HTTP. `OLLAMA_HOST` può puntare a un altro indirizzo (ad esempio, un Ollama remoto/cloud); questa è l’unica connessione esterna ed è una scelta esplicita dell’operatore
- **File system:** nessuno per impostazione predefinita. Con `SENSOR_HUMOR_PERSIST=true`, legge e scrive un file, `~/.sensor-humor/session.json` (modifica la directory con `SENSOR_HUMOR_SESSION_DIR`), contenente solo lo stato dell’umorismo della tua sessione (battute, gag, frasi ad effetto), senza credenziali. Il file scade automaticamente dopo 24 ore
- **Segreti:** nessuno per impostazione predefinita. Se si punta `OLLAMA_HOST` a un Ollama remoto/cloud, impostare `OLLAMA_API_KEY`; viene letto dall’ambiente e inviato solo come intestazione `Bearer` all’host indicato; non viene mai registrato, memorizzato o visualizzato (`debug_status` indica solo *se* è stata impostata una chiave, non il suo valore)
- **Nessuna telemetria:** nulla viene raccolto o inviato
- **Lo stato della sessione è in memoria per impostazione predefinita:** si perde quando il processo del server si interrompe; è possibile attivare la persistenza su disco con `SENSOR_HUMOR_PERSIST`
- **Sanitizzazione dell’input:** tutto il testo fornito dall’utente viene sanificato prima dell’iniezione del prompt (vengono rimosse le nuove righe, viene limitata la lunghezza e vengono rimossi i caratteri di controllo)
- **Filtraggio dell’output:** filtro per linguaggio offensivo (elenco di termini codificato in base64) con riprova + una barriera finale di sicurezza impedisce alle imprecazioni di raggiungere l’utente, anche in caso di nuova riprova o input contenente imprecazioni

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
