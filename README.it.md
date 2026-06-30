<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/sensor-humor"><img src="https://img.shields.io/npm/v/@mcptoolshop/sensor-humor?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

Strumento MCP che fornisce al tuo LLM un assistente comico persistente: personalità basata sull'umore, richiami consapevoli della sessione, gag ricorrenti, battute sarcastiche, commenti pungenti e frasi ad effetto, il tutto con integrazione vocale tramite Piper TTS (controllo della prosodia).

Progettato per gli sviluppatori: lievi critiche sui problemi del codice, messaggi di errore asciutti e impersonali, escalation caotica in caso di errori di compilazione. Non sovrascrive mai il tono dell'LLM host, ma offre una voce distinta che interviene quando viene chiamata.

## Funzionalità

- 6 umori, ciascuno ottimizzato con un prompt scheletrico da completare per ottenere risultati prevedibili e di alta qualità
- Stato della sessione: gag ricorrenti, buffer ad anello degli ultimi elementi (massimo 20), mappa delle frasi ad effetto, che possono essere salvate su disco (`SENSOR_HUMOR_PERSIST`) in modo che i richiami sopravvivano a un riavvio del server
- 9 strumenti: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Backend Ollama locale (qwen2.5:7b predefinito, configurabile tramite `SENSOR_HUMOR_MODEL`)
- Abbinamento vocale: mcp-voice-soundboard con Piper TTS (controlli della prosodia: length_scale, noise_scale, noise_w_scale, volume)
- Deterministico: applicazione dello schema JSON, convalida, ripetizione in caso di output non valido, ereditarietà dell'umore forzata

## Umore

Ogni umore utilizza un prompt scheletrico da completare che forza il modello a mantenere una forma prevedibile e di alta qualità.

- **dry** (asciutto) — impersonale, minimalista, palesemente ovvio (predefinito)
- **roast** (battuta sarcastica) — battute affettuose ma pungenti, etichette di verdetto/diagnosi
- **cynic** (cinico) — realismo disilluso e taciturno ("Certo:", "Come previsto:")
- **cheeky** (sfacciato) — scherzoso e malizioso ("Oh tesoro", "Mossa audace")
- **chaotic** (caotico) — frase coerente, seguita da un improvviso colpo di scena assurdo ("Si dice che...")
- **zoomer** — sarcasmo tipico della Gen Z, sempre online (reazione, frecciatina, MAIUSCOLO, tag)

Tutti gli umori ereditano la voce e la prosodia tramite mcp-voice-soundboard (consigliato Piper).

## Requisiti

- Node.js 18+
- Ollama in esecuzione localmente con `qwen2.5:7b` scaricato (o impostare `SENSOR_HUMOR_MODEL` per un modello diverso)
- mcp-voice-soundboard installato e in esecuzione (consigliato il backend Piper, opzionale)
- @modelcontextprotocol/sdk

## Installazione

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Un'immagine container viene pubblicata su GHCR ad ogni rilascio. sensor-humor comunica tramite MCP utilizzando stdio, quindi eseguilo in modo interattivo e collegalo a un Ollama accessibile:

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

Restituisce una battuta sarcastica testuale. Se anche [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) è configurato, `voice_speak(mood: "roast")` la pronuncia con la prosodia Piper appropriata all'umore.

## Strumenti

Tutti gli strumenti ereditano l'umore corrente dalla sessione.

| Strumento | Firma | Descrizione |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Imposta l'umore attivo (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Umore corrente + numero di gag |
| `comic_timing` | `(text, technique?)` | Rielabora con una consegna comica (regola dei tre, depistaggio, escalation, richiamo, sottostima, automatico) |
| `roast` | `(target, context?)` | Battuta sarcastica affettuosa nell'umore corrente, restituisce un livello di gravità da 1 a 5. Contesto: codice, errore, idea, situazione |
| `heckle` | `(target)` | Breve frecciatina pungente |
| `catchphrase_generate` | `(context?)` | Crea un elemento riutilizzabile (memorizzato nella sessione) |
| `catchphrase_callback` | `()` | Riutilizza la frase ad effetto più utilizzata (o null) |
| `debug_status` | `()` | Stato di salute del backend in tempo reale (Ollama accessibile, modello scaricato), configurazione risolta, conteggi di fallback e stato della sessione |
| `session_reset` | `()` | Reimposta tutto lo stato della sessione (umore, gag, elementi, frasi ad effetto, contatore dei turni) |

**Output degradato (testuale, con possibilità di ramificazione a livello di macchina):** quando uno strumento non può restituire una generazione autentica del modello, restituisce una frase predefinita con la voce appropriata più `degraded: true` e un `degraded_reason` da un **insieme chiuso** su cui un agente che lo utilizza può eseguire una ramificazione esaustiva: `safety-filter` (è stata sostituita un'imprecazione/similitudine/meta-leak), `connection`, `timeout`, `model-not-found`, `auth`, `rate-limit`, `server`, `http`, `json-parse`, `validation`, `exhausted`, `unknown`. Una generazione autentica non contiene **nessuna** flag `degraded`: la sua assenza è il segnale positivo. **Tutti** gli strumenti comici includono questo, incluso `catchphrase_callback` (un richiamo con sostituzione di sicurezza viene contrassegnato e non viene mai presentato come autentico). `roast`/`heckle` fanno eco anche all'`mood` attivo; `catchphrase_generate` restituisce `is_fresh` (`true` = appena creato, `false` = frase ad effetto esistente riutilizzata).

Chiama `debug_status` per ottenere una risposta sullo stato in un'unica chiamata: raggiungibilità in tempo reale (più `unreachable_reason` quando non è disponibile: `connection` vs `auth` vs `timeout`), il modello/host/timeout risolti, statistiche di generazione che includono sia `fallback_calls` (backend) **sia** `safety_filter_fires` (quante volte il filtro di sicurezza ha sostituito una frase), e un `prompt_fingerprint` + `active_prompt_key` che collegano il testo del prompt *attivo* + modello in modo che la deriva dell'output sia attribuibile a una modifica del prompt rispetto al modello, e una silenziosa retrocessione della versione del prompt (una versione 2 richiesta che è tornata alla versione 1) è visibile.

## Prosodia dell'umore (voce Piper)

Ogni umore corrisponde a una voce e a una configurazione di prosodia distinte di Piper:

| Umore | Voce | length_scale | noise_scale | noise_w_scale | volume | Caratteristica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Piatto, stanco, metronomico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sicuro sarcasmo |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Conduttore di notizie che racconta assurdità |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Caldo, giocoso, ammiccante sguardo |
| cinico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Freddo, piatto, nessuna sorpresa |
| appartenente alla Generazione Z | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Energia rapida, forte, tipica degli streamer |

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

- Ogni chiamata a uno strumento registra: prompt inviato, risposta grezza di Ollama, output analizzato, aggiornamento della sessione
- Voce: i log di debug mostrano i parametri di Piper applicati in base all'umore
- Imposta `SENSOR_HUMOR_DEBUG=true` per visualizzare tutto

## Note sulla qualità

- La qualità della comicità deriva dall'ingegneria dei prompt basata su uno "scheletro", non da una singola impostazione del modello: ogni umore impone una forma prevedibile. Misura il tasso di successo sul tuo modello/hardware con `scripts/ab-scorecard.ts` (modello in SCORECARD.md)
- Controllo della regressione sulla stabilità dei prompt (v1.2): i prompt per l'umore v1 sono **bloccati** (fissati da `tests/scorecard-frozen-prompts.ts`: per modificarne uno, passa alla versione `v2`, non modificare mai direttamente). Un insieme deterministico di **forma + sicurezza**, insieme a statistiche, viene eseguito in `npm test` (nessun backend); `npm run scorecard` esegue il controllo statistico del "drift" in tempo reale: per ogni umore, il tasso di successo è limitato da un intervallo di Wilson con una valutazione a tre valori: PASS / FAIL / INCONCLUSIVE e interruzione anticipata SPRT. Misura la conformità strutturale + sicurezza, **non** l'umorismo (la valutazione automatica dell'umorismo non è affidabile: la migliore correlazione tra LLM e umano ≈ 0,2)
- Filtro per similitudini/paragoni: regex di post-validazione + riprova, quindi un fallback sicuro basato sull'umore se persiste una "perdita"
- Filtro per linguaggio offensivo: una regex deterministica con un elenco di termini viene eseguita come *controllo finale* su **ogni** strumento comico (incluse le frasi ad effetto), ricontrollata dopo ogni riprova e applicata prima dell'interpolazione di qualsiasi fallback. Il percorso di rilevamento esegue prima la "de-offuscazione": NFKC + rimozione dei caratteri a larghezza zero/bidirezionali, piegatura degli omoglifi, piegatura del leetspeak, rimozione dei separatori intra-parola e dei segni combinati, in modo che le comuni tecniche di elusione (inserimento a larghezza zero, caratteri cirillici/greci simili, caratteri a larghezza intera, `r3tard`, `re-tard`, `retárd`) non possano far passare un insulto oltre il confine della parola. Questo è un **livello minimo** deterministico, non una "barriera di sicurezza": vedi Sicurezza e affidabilità per il limite massimo
- Deterministico: applicazione dello schema JSON, riprova in caso di output errato, ereditarietà dell'umore applicata a tutti gli strumenti
- Voce: Piper fornisce la separazione della prosodia (lunghezza/rumore/volume per umore); Kokoro fallback è solo velocità
- Solo come strumento ausiliario per lo sviluppo. L'umorismo è soggettivo; disabilita qualsiasi umore tramite variabile d'ambiente o modifica i prompt, se necessario

## Sicurezza e affidabilità

- **Locale per impostazione predefinita**: comunica con Ollama su `localhost` tramite HTTP. `OLLAMA_HOST` può puntare altrove (ad esempio, un Ollama remoto/cloud); questa è l'unica uscita esterna ed è la scelta esplicita dell'operatore
- **File system**: nessuno per impostazione predefinita. Con `SENSOR_HUMOR_PERSIST=true`, legge e scrive un file, `~/.sensor-humor/session.json` (sovrascrivi la directory con `SENSOR_HUMOR_SESSION_DIR`), contenente solo lo stato comico della tua sessione (battute, gag, frasi ad effetto): nessun dato di autenticazione. Il file scade automaticamente dopo 24 ore
- **Segreti**: nessuno per impostazione predefinita. Se punti `OLLAMA_HOST` a un Ollama remoto/cloud, imposta `OLLAMA_API_KEY`; viene letto dall'ambiente e inviato solo come intestazione `Bearer` all'host: non viene mai registrato, memorizzato o ripetuto (`debug_status` indica solo *se* è impostata una chiave, non il suo valore)
- **Nessuna telemetria**: nulla viene raccolto o inviato
- **Lo stato della sessione è in memoria per impostazione predefinita**: si perde quando il processo del server si interrompe; abilita la persistenza su disco con `SENSOR_HUMOR_PERSIST`
- **Sanitizzazione dell'input**: tutto il testo fornito dall'utente viene normalizzato e sanificato prima dell'iniezione del prompt: piegatura Unicode NFKC, rimozione dei caratteri a larghezza zero/bidirezionali/di formato, omoglifi comuni convertiti in ASCII, interruzioni di riga rimosse, caratteri di controllo rimossi, lunghezza limitata
- **Filtraggio dell'output (livello minimo deterministico + limite massimo onesto)**: una regex con un elenco di termini memorizzato in base64 viene eseguita come controllo finale sulla sicurezza su ogni strumento comico (ricontrollata dopo ogni riprova, applicata prima di qualsiasi fallback), e un fallback basato sull'input del chiamante si riduce a una riga statica, indipendente dall'input, anziché ripetere un token vietato. Il percorso di rilevamento esegue prima la "de-offuscazione", in modo che le comuni tecniche di elusione vengano neutralizzate: inserimento a larghezza zero/bidirezionale, omoglifi (cirillici/greci/a larghezza intera), leetspeak (`r3tard`), separatori intra-parola (`re-tard`, `r.e.t.a.r.d`) e diacritici combinati (`retárd`). Le voci "sporche" vengono anche eliminate da una sessione persistente compromessa o obsoleta al momento del caricamento. **Cosa NON fa**: è un filtro deterministico con un elenco di termini, non un classificatore appreso: non si difende contro varianti di insulti fuori lista/nuove, spaziature a carattere singolo (`r e t a r d`), offuscazione ASCII/spaziale, copertura Unicode completa o attacchi semantici/di "jailbreak". Consideralo come un livello minimo per uno strumento comico locale, non una garanzia di moderazione per input pubblici non affidabili
- **Forma dell'errore dello strumento**: gli errori di runtime/strumento restituiscono la forma strutturata degli errori dello studio (`{code, message, hint, retryable}`); nota che gli errori di *validazione dello schema di input* (ad esempio, un `mood` non valido) vengono rilevati dall'SDK MCP prima dell'esecuzione del gestore e si manifestano come l'errore standard `InvalidParams` dell'SDK, non con questa forma

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
