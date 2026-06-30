<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP tool that gives your LLM a persistent comedic sidekick: mood-based personality, session-aware callbacks, running gags, roasts, heckles, and catchphrases — all with voice integration via Piper TTS (prosody-controlled).

Built for developers: gentle burns on code smells, dry deadpan error messages, chaotic escalation on build fails. Never overwrites host LLM tone — distinct voice that chimes in when called.

## Features

- 6 moods, each tuned with a fill-in-the-blank skeleton prompt for predictable, high-quality output
- Session state: running gags, recent bits ring buffer (max 20), catchphrase Map — optionally persisted to disk (`SENSOR_HUMOR_PERSIST`) so callbacks survive a server restart
- 9 tools: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Local Ollama backend (qwen2.5:7b default, configurable via `SENSOR_HUMOR_MODEL`)
- Voice pairing: mcp-voice-soundboard with Piper TTS (prosody knobs: length_scale, noise_scale, noise_w_scale, volume)
- Deterministic: JSON schema enforcement, validation, retry on bad output, mood inheritance enforced

## Moods

Each mood uses a fill-in-the-blank skeleton prompt that forces the model into a predictable, high-quality shape.

- **dry** — deadpan, minimalist, painfully obvious (default)
- **roast** — affectionate pointed burns, verdict/diagnosis labels
- **cynic** — jaded, quietly vicious realism ("Of course:", "Predictably:")
- **cheeky** — playful teasing mischief ("Oh honey", "Bold move")
- **chaotic** — grounded sentence, then sudden absurd twist ("Reportedly...")
- **zoomer** — terminally online savage Gen-Z snark (reaction, jab, CAPS BLOCK, tag)

All moods inherit voice + prosody via mcp-voice-soundboard (Piper recommended).

## Requirements

- Node.js 18+
- Ollama running locally with `qwen2.5:7b` pulled (or set `SENSOR_HUMOR_MODEL` for a different model)
- mcp-voice-soundboard installed & running (Piper backend recommended, optional)
- @modelcontextprotocol/sdk

## Install

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

A container image is published to GHCR on each release. sensor-humor speaks MCP over stdio, so run it interactively and point it at a reachable Ollama:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## Quick Start

1. Start Ollama:

```bash
ollama pull qwen2.5:7b
```

2. Start sensor-humor MCP server (stdio transport):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Start voice-soundboard (Piper mode):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. In your MCP client (Claude Code, Cursor, etc.):
   - Add both servers
   - Test chain:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Text roast returned. If [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) is also configured, `voice_speak(mood: "roast")` speaks it with mood-appropriate Piper prosody.

## Tools

All tools inherit current mood from session.

| Tool | Signature | Description |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Set active mood (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Current mood + gag count |
| `comic_timing` | `(text, technique?)` | Rewrite with comedic delivery (rule-of-three, misdirection, escalation, callback, understatement, auto) |
| `roast` | `(target, context?)` | Affectionate burn in current mood voice, returns severity 1-5. Context: code, error, idea, situation |
| `heckle` | `(target)` | Short pointed jab |
| `catchphrase_generate` | `(context?)` | Create reusable bit (stored in session) |
| `catchphrase_callback` | `()` | Reuse most-used catchphrase (or null) |
| `debug_status` | `()` | Live backend health (Ollama reachable, model pulled), resolved config, fallback counts, and session state |
| `session_reset` | `()` | Reset all session state (mood, gags, bits, catchphrases, turn counter) |

**Degraded output (typed, machine-branchable):** when a tool can't return a genuine model generation it returns an in-voice canned line plus `degraded: true` and a `degraded_reason` from a **closed set** a consuming agent can branch on exhaustively: `safety-filter` (a slur/simile/meta-leak was substituted) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. A genuine generation carries **no** `degraded` flag — its absence is the positive signal. **All** comedy tools carry this, including `catchphrase_callback` (a safety-substituted recall is flagged, never passed off as a genuine one). `roast`/`heckle` also echo the active `mood`; `catchphrase_generate` returns `is_fresh` (`true` = newly minted, `false` = an existing session catchphrase reused).

Call `debug_status` for a one-call health answer: live reachability (plus `unreachable_reason` when down — `connection` vs `auth` vs `timeout`), the resolved model/host/timeout, generation stats including both `fallback_calls` (backend) **and** `safety_filter_fires` (how often the safety floor substituted a line), and a `prompt_fingerprint` + `active_prompt_key` that bind the *active* prompt text + model so output drift is attributable to a prompt-vs-model change — and a silent prompt-version downgrade (a requested v2 that fell back to v1) is visible.

## Mood Prosody (Piper Voice)

Each mood maps to a distinct Piper voice + prosody configuration:

| Mood | Voice | length_scale | noise_scale | noise_w_scale | volume | Character |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Flat, weary, metronomic |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Confident sarcasm |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | News anchor delivering nonsense |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Warm, teasing, playful wink |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Cold, flat, zero surprise |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Fast, loud, streamer energy |

## Environment Variables

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

## Observability & Debug

- Every tool call logs: prompt sent, raw Ollama response, parsed output, session update
- Voice: debug logs show Piper params applied per mood
- Set `SENSOR_HUMOR_DEBUG=true` to see everything

## Quality Notes

- Comedy quality comes from skeleton-based prompt engineering, not one model knob — each mood forces a predictable shape. Measure hit rate on your own model/hardware with `scripts/ab-scorecard.ts` (template in SCORECARD.md)
- Prompt-stability regression gate (v1.2): the v1 mood prompts are **frozen** (pinned by `tests/scorecard-frozen-prompts.ts` — to change one, bump to `v2`, never edit in place). A deterministic **form + safety** golden set + statistics run in `npm test` (no backend); `npm run scorecard` runs the live statistical drift check — per-mood hit-rate gated on a Wilson interval with a three-valued PASS / FAIL / INCONCLUSIVE verdict and SPRT early-stopping. It measures structural conformance + safety, **not** funniness (automated humor scoring is unreliable — best LLM-vs-human correlation ≈0.2)
- Simile/comparison filter: post-validation regex + retry, then a mood-voiced safe fallback if a leak persists
- Harsh-language filter: a deterministic term-list regex runs as a *terminal gate* on **every** comedy tool (including catchphrases), re-checked after every retry and applied before any fallback is interpolated. The detection path de-obfuscates first — NFKC + zero-width/bidi strip + homoglyph fold + leetspeak fold + intra-word-separator strip + combining-mark strip — so the common evasions (zero-width insertion, Cyrillic/Greek look-alikes, fullwidth, `r3tard`, `re-tard`, `retárd`) can't slip a slur past the word boundary. This is a deterministic **floor**, not a guardrail — see Security & Trust for the honest ceiling
- Deterministic: JSON schema enforcement, retry on bad output, mood inheritance enforced across all tools
- Voice: Piper gives prosody separation (length/noise/volume per mood); Kokoro fallback is speed-only
- Dev-tool sidekick only. Humor is subjective; disable any mood via env or tune prompts if needed

## Security & Trust

- **Local by default** — talks to Ollama on `localhost` via HTTP. `OLLAMA_HOST` may point elsewhere (e.g. a remote/cloud Ollama); that is the only external egress and is the operator's explicit choice
- **File system** — none by default. With `SENSOR_HUMOR_PERSIST=true` it reads/writes one file, `~/.sensor-humor/session.json` (override the directory with `SENSOR_HUMOR_SESSION_DIR`), containing only your session's comedy state (bits, gags, catchphrases) — no credentials. The file auto-expires after 24h
- **Secrets** — none by default. If you point `OLLAMA_HOST` at a remote/cloud Ollama, set `OLLAMA_API_KEY`; it is read from the environment and sent only as a `Bearer` header to that host — never logged, persisted, or echoed (`debug_status` reports only *whether* a key is set, never its value)
- **No telemetry** — nothing is collected or sent
- **Session state is in-memory by default** — dies when the server process stops; opt into disk persistence with `SENSOR_HUMOR_PERSIST`
- **Input sanitization** — all user-provided text is normalized and sanitized before prompt injection: Unicode NFKC fold, zero-width/bidi/format chars stripped, common homoglyphs folded to ASCII, newlines stripped, control chars removed, length capped
- **Output filtering (deterministic floor + honest ceiling)** — a base64-stored term-list regex runs as a terminal safety gate on every comedy tool (re-checked after each retry, applied before any fallback), and a caller-input fallback collapses to a static, input-free line rather than echo a banned token. The detection path de-obfuscates first, so the common evasions are defeated: zero-width/bidi insertion, homoglyphs (Cyrillic/Greek/fullwidth), leetspeak (`r3tard`), intra-word separators (`re-tard`, `r.e.t.a.r.d`), and combining diacritics (`retárd`). Dirty entries are also dropped from a tampered/legacy persisted session on load. **What it does NOT do:** it is a deterministic term-list filter, not a learned classifier — it does not defend against out-of-list/novel slur variants, single-letter spacing (`r e t a r d`), ASCII-art / spatial obfuscation, full Unicode-confusable coverage, or semantic/jailbreak-class attacks. Treat it as a best-effort floor for a local dev-humor tool, not a moderation guarantee for untrusted public input
- **Tool error shape** — runtime/tool errors return the studio Structured Error Shape (`{code, message, hint, retryable}`); note that *input-schema* validation errors (e.g. an invalid `mood`) are caught by the MCP SDK before the handler runs and surface as the SDK's standard `InvalidParams` error, not this shape

## Architecture

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

## Development

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

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
