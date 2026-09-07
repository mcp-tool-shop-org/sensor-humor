<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

MCP, uno strumento che dota il tuo LLM di un simpatico compagno comico: personalità basata sull'umore, richiami consapevoli della sessione, gag ricorrenti, battute, insulti e frasi ad effetto, il tutto con integrazione vocale tramite Piper TTS (controllo della prosodia).

Progettato per gli sviluppatori: commenti delicati su potenziali problemi nel codice, messaggi di errore asciutti e laconici, escalation caotica in caso di errori di compilazione. Non sovrascrive mai il tono dell'LLM host, ma offre una voce distinta che interviene quando viene chiamata.

## Funzionalità

- 6 umori, ciascuno ottimizzato con un prompt di riempimento per ottenere risultati prevedibili e di alta qualità.
- Stato della sessione: gag ricorrenti, buffer ad anello delle ultime battute (massimo 20), mappa delle frasi ad effetto, che possono essere salvate su disco (`SENSOR_HUMOR_PERSIST`) in modo che i richiami sopravvivano a un riavvio del server.
- 11 strumenti: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, running_gag, debug_status, debug_chain, session_reset.
- Backend Ollama locale (qwen2.5:7b predefinito, configurabile tramite `SENSOR_HUMOR_MODEL`).
- Abbinamento vocale: mcp-voice-soundboard con Piper TTS (controlli della prosodia: length_scale, noise_scale, noise_w_scale, volume).
- Deterministico: applicazione dello schema JSON, convalida, riprova in caso di output non valido, applicazione dell'ereditarietà dell'umore.

## Umore

Ogni umore utilizza un prompt di riempimento che forza il modello a mantenere una forma prevedibile e di alta qualità.

- **dry** (asciutto) — laconico, minimalista, palesemente ovvio (predefinito).
- **roast** (insulto affettuoso) — commenti pungenti e affettuosi, etichette di verdetto/diagnosi.
- **cynic** (cinico) — realismo disilluso e taciturno ("Ovviamente:", "Prevedibilmente:").
- **cheeky** (sfacciato) — scherzoso e malizioso ("Oh, tesoro", "Mossa audace").
- **chaotic** (caotico) — frase coerente, seguita da un improvviso colpo di scena assurdo ("Si dice che...").
- **zoomer** — sarcasmo Gen-Z, perennemente online (reazione, frecciatina, MAIUSCOLO, tag).

Tutti gli umori ereditano la voce e la prosodia tramite mcp-voice-soundboard (si consiglia Piper).

## Requisiti

- Node.js 18+
- Ollama in esecuzione localmente con `qwen2.5:7b` scaricato (o impostare `SENSOR_HUMOR_MODEL` per un modello diverso).
- mcp-voice-soundboard installato e in esecuzione (si consiglia il backend Piper, opzionale).
- @modelcontextprotocol/sdk

## Installazione

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Un'immagine container viene pubblicata su GHCR ad ogni rilascio. sensor-humor comunica tramite MCP su stdio, quindi eseguilo in modo interattivo e puntalo su un Ollama accessibile:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### Configura il tuo client MCP

Registra sensor-humor come server stdio nella configurazione MCP del tuo client. Per Claude Code / Claude Desktop (`claude_desktop_config.json`) o qualsiasi configurazione in formato `mcpServers`:

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

Il server legge la sua configurazione da questo blocco `env` (o dalla shell che lo avvia); non carica automaticamente un file `.env`. Consulta [`.env.example`](.env.example) per tutte le variabili supportate. Se hai installato il pacchetto a livello globale, usa `"command": "sensor-humor"` senza `args`.

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
- Aggiungi entrambi i server.
- Prova la catena:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

È stata restituita una battuta. Se [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) è anch'esso configurato, `voice_speak(mood: "roast")` la pronuncia con la prosodia Piper appropriata all'umore.

## Strumenti

Tutti gli strumenti ereditano l'umore corrente dalla sessione.

| Strumento | Firma | Descrizione |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Imposta l'umore attivo (dry, roast, chaotic, cheeky, cynic, zoomer). |
| `mood_get` | `()` | Umore corrente + numero di gag + `allowed_techniques` per l'umore attivo. |
| `comic_timing` | `(text, technique?)` | Rielabora con una consegna comica (regola dei tre, depistaggio, escalation, richiamo, understatement, auto). |
| `roast` | `(target, context?, technique?)` | Commento affettuoso con la voce dell'umore corrente, restituisce una gravità da 1 a 5. Contesto: codice, errore, idea, situazione. L'eventuale sovrapposizione di tecniche deve essere valida per l'umore corrente (le combinazioni non valide vengono rifiutate). |
| `heckle` | `(target, technique?)` | Breve frecciatina. Eventuale sovrapposizione di tecniche, stessa matrice umore × tecnica di roast. |
| `catchphrase_generate` | `(context?)` | Crea un elemento riutilizzabile (memorizzato nella sessione). |
| `catchphrase_callback` | `()` | Riutilizza la frase ad effetto più utilizzata (o null). |
| `running_gag` | `(setup, tag)` | Inserisci una gag ricorrente a cui il compagno può fare riferimento in seguito (con protezione). Diventa un candidato per il richiamo dopo `SENSOR_HUMOR_GAG_MIN_DISTANCE` turni; viene ritirato dopo `SENSOR_HUMOR_GAG_MAX_FIRES`. |
| `debug_status` | `()` | Stato di salute del backend live (Ollama raggiungibile, modello scaricato), configurazione risolta, conteggi di fallback/frequenza e stato della sessione. |
| `debug_chain` | `(limit?)` | Ultime N tracce per chiamata (strumento, umore, input, impronta del prompt, tentativi, validatori attivati, latenza): una singola chiamata ricostruisce la pipeline di generazione. |
| `session_reset` | `()` | Reimposta tutto lo stato della sessione (umore, gag, elementi, frasi ad effetto, tracce, contatore dei turni). |

**Output degradato (digitato, ramificabile a livello di macchina):** quando uno strumento non può restituire una generazione di modello autentica, restituisce una frase preregistrata con la voce, più `degraded: true` e un `degraded_reason` da un **insieme chiuso** su cui un agente che lo utilizza può ramificarsi in modo esaustivo: `safety-filter` (è stata sostituita un'imprecazione/similitudine/perdita di metadati) · `language` (il modello è passato dall'alfabeto latino ed è stata sostituita una frase in inglese: si tratta di una degradazione della conformità, non della sicurezza) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. Una generazione autentica non contiene **nessun** `degraded`; la sua assenza è il segnale positivo. **Tutti** gli strumenti comici lo includono, compreso `catchphrase_callback` (un richiamo sostituito per motivi di sicurezza viene contrassegnato, ma non viene mai presentato come autentico). `roast`/`heckle` fanno eco anche all'umore attivo `mood`; `catchphrase_generate` restituisce `is_fresh` (`true` = appena creato, `false` = una frase ad effetto esistente riutilizzata).

Chiama il numero `debug_status` per ottenere una risposta immediata sui problemi di salute: verifica della disponibilità in tempo reale (più `unreachable_reason` in caso di interruzione — `connection` rispetto a `auth` rispetto a `timeout`), modello/host/timeout risolti, statistiche di generazione che includono sia `fallback_calls` (backend) **che** `safety_filter_fires` (quanto spesso il limite di sicurezza ha sostituito una frase) e un valore `prompt_fingerprint` + `active_prompt_key` che collegano il testo del prompt *attivo* e il modello, in modo che la deriva dell'output sia attribuibile a una modifica del prompt rispetto al modello, e un aggiornamento silenzioso della versione del prompt (una versione v2 richiesta che è tornata alla v1) è visibile.

## Prosodia dell'umore (voce Piper)

Ogni umore corrisponde a una voce Piper e a una configurazione di prosodia distinte:

| Umore | Voce | length_scale | noise_scale | noise_w_scale | volume | Personaggio |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Piatt, stanco, metronomico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcastico e sicuro di sé |
| caotico | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Conduttore di notizie che racconta assurdità |
| sfacciato | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Caldo, scherzoso, ammiccante |
| cinico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Freddo, piatto, senza sorprese |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Veloce, forte, energia da streamer |

## Variabili d'ambiente

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

## Osservabilità e debug

- Ogni chiamata a uno strumento registra: prompt inviato, risposta grezza di Ollama, output analizzato, aggiornamento della sessione
- Voce: i log di debug mostrano i parametri di Piper applicati per ogni umore
- Imposta `SENSOR_HUMOR_DEBUG=true` per vedere tutto

## Note sulla qualità

- La qualità della comicità deriva dall'ingegneria dei prompt basata su schemi, non da una singola impostazione del modello: ogni umore impone una forma prevedibile. Misura il tasso di successo sul tuo modello/hardware con `scripts/ab-scorecard.ts` (modello in SCORECARD.md)
- Controllo di regressione della stabilità del prompt (v1.2): i prompt per l'umore della v1 sono **congelati** (fissati da `tests/scorecard-frozen-prompts.test.ts`; per modificarne uno, passa alla `v2`, non modificare mai direttamente). Un insieme **deterministico di forma + sicurezza** e statistiche vengono eseguiti in `npm test` (nessun backend); `npm run scorecard` esegue il controllo statistico della deriva in tempo reale: il tasso di successo per umore è limitato da un intervallo di Wilson con un verdetto a tre valori: PASS / FAIL / INCONCLUSIVE e arresto anticipato SPRT. Misura la conformità strutturale + la sicurezza, **non** la comicità (il punteggio automatizzato dell'umorismo è inaffidabile: la migliore correlazione LLM-vs-umano ≈ 0,2)
- Filtro di similitudine/comparazione: regex di post-validazione + riprova, quindi un fallback sicuro con la voce dell'umore se una perdita persiste
- Filtro di conformità linguistica: la comicità è in inglese, quindi un controllo non latino (una sequenza contigua di parole straniere **o** un elevato rapporto di lettere non latine, calcolato solo sulle lettere) segnala l'output con cambio di codice, ad esempio `qwen2.5:7b` che a metà frase passa al cinese. Post-validazione + una riprova con solo inglese, quindi un fallback in inglese senza input con `degraded_reason: language` (un *degrado di conformità*, distinto da `safety-filter`, quindi non incide sul contatore di attivazione del filtro di sicurezza). Solo rilevamento: le parole straniere latine accentate (`café`, `résumé`), la punteggiatura, le cifre e le emoji non lo attivano
- Filtro per linguaggio volgare: una regex deterministica di un elenco di termini viene eseguita come *controllo finale* su **ogni** strumento di comicità (incluse le frasi ad effetto), viene ricontrollata dopo ogni riprova e applicata prima che venga interpolato qualsiasi fallback. Il percorso di rilevamento prima esegue la de-offuscazione: NFKC + rimozione di caratteri a larghezza zero/bidi + piegatura di omoglifi + piegatura di leetspeak + rimozione di separatori intra-parola + rimozione di segni di combinazione, in modo che le comuni tecniche di elusione (inserimento a larghezza zero, caratteri cirillici/greci simili, caratteri a larghezza intera, `r3tard`, `re-tard`, `retárd`) non possano far passare un insulto oltre il confine della parola. Questo è un **limite** deterministico, non una barriera di sicurezza: vedi Sicurezza e affidabilità per il limite reale
- Deterministico: applicazione dello schema JSON, riprova in caso di output errato, applicazione dell'ereditarietà dell'umore in tutti gli strumenti
- Voce: Piper fornisce una separazione della prosodia (lunghezza/rumore/volume per umore); il fallback di Kokoro è solo per la velocità
- Solo strumento di supporto per lo sviluppo. L'umorismo è soggettivo; disabilita qualsiasi umore tramite variabile d'ambiente o modifica i prompt, se necessario

## Sicurezza e affidabilità

- **Locale per impostazione predefinita:** comunica con Ollama su `localhost` tramite HTTP. `OLLAMA_HOST` può puntare a un altro indirizzo (ad esempio, un Ollama remoto/cloud); questa è l'unica connessione esterna ed è una scelta esplicita dell'operatore.
- **File system:** nessuno per impostazione predefinita. Con `SENSOR_HUMOR_PERSIST=true` legge/scrive un file, `~/.sensor-humor/session.json` (sovrascrive la directory con `SENSOR_HUMOR_SESSION_DIR`), contenente solo lo stato della sessione relativo all'umorismo (battute, gag, frasi ad effetto), senza credenziali. Il file scade automaticamente dopo 24 ore.
- **Segreti:** nessuno per impostazione predefinita. Se si punta `OLLAMA_HOST` a un Ollama remoto/cloud, impostare `OLLAMA_API_KEY`; viene letto dall'ambiente e inviato solo come un'intestazione `Bearer` a tale host; non viene mai registrato, memorizzato o ripetuto (`debug_status` indica solo *se* è impostata una chiave, non il suo valore).
- **Nessuna telemetria:** non vengono raccolti o inviati dati.
- **Lo stato della sessione è memorizzato in memoria per impostazione predefinita:** si interrompe quando il processo del server si arresta; è possibile abilitare la persistenza su disco con `SENSOR_HUMOR_PERSIST`.
- **Sanitizzazione dell'input:** tutto il testo fornito dall'utente viene normalizzato e sanificato prima dell'iniezione del prompt: Unicode NFKC fold, rimozione di caratteri a larghezza zero/bidirezionali/di formattazione, omoglifi comuni convertiti in ASCII, rimozione di interruzioni di riga, rimozione di caratteri di controllo, limite di lunghezza.
- **Filtraggio dell'output (soglia deterministica + limite superiore onesto):** un elenco di termini memorizzato in formato base64 viene utilizzato come filtro di sicurezza finale su ogni strumento di umorismo (ricontrollato dopo ogni tentativo, applicato prima di qualsiasi fallback), e un fallback basato sull'input del chiamante si riduce a una riga statica, priva di input, anziché ripetere un token proibito. Il percorso di rilevamento prima esegue la de-offuscazione, in modo che le comuni tecniche di elusione vengano neutralizzate: inserimento di caratteri a larghezza zero/bidirezionali, omoglifi (cirillico/greco/a larghezza intera), leetspeak (`r3tard`), separatori intra-parola (`re-tard`, `r.e.t.a.r.d`) e diacritici combinati (`retárd`). Le voci non valide vengono inoltre eliminate da una sessione persistente compromessa o obsoleta al momento del caricamento. **Cosa NON fa:** è un filtro di elenco di termini deterministico, non un classificatore appreso; non si difende da varianti di insulti non presenti nell'elenco o nuove, spaziatura di una singola lettera (`r e t a r d`), ASCII-art/offuscamento spaziale, copertura completa di caratteri Unicode confondibili o attacchi semantici/di jailbreak. Considerarlo come una soglia minima per uno strumento di umorismo locale, non come una garanzia di moderazione per input pubblici non attendibili.
- **Formato degli errori dello strumento:** gli errori di runtime/strumento restituiscono il formato di errore strutturato dello studio (`{code, message, hint, retryable}`); si noti che gli errori di validazione dello *schema di input* (ad esempio, un `mood` non valido) vengono rilevati dall'SDK MCP prima dell'esecuzione dell'handler e vengono visualizzati come l'errore standard `InvalidParams` dell'SDK, non in questo formato.

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
