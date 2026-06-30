---
title: Tool Reference
description: Complete API reference for all 9 sensor-humor tools
sidebar:
  order: 3
---

## mood_set

Set the active comedy mood for the session.

**Input:**
- `style` (string, required) — one of: `dry`, `roast`, `chaotic`, `cheeky`, `cynic`, `zoomer`

**Output:**
```json
{
  "mood": "dry",
  "description": "Deadpan, minimalist, says the obvious like devastating news",
  "voice_notes": "Flat, weary, metronomic"
}
```

## mood_get

Read the current mood and session stats.

**Input:** none

**Output:**
```json
{
  "mood": "dry",
  "description": "Deadpan, minimalist, says the obvious like devastating news",
  "session_gag_count": 3
}
```

## comic_timing

The core tool. Takes dry text and rewrites it with comedic delivery in the current mood.

**Input:**
- `text` (string, required) — the dry statement to rewrite
- `technique` (string, optional) — one of: `rule-of-three`, `misdirection`, `escalation`, `callback`, `understatement`, `auto` (default: `auto`)

**Output:**
```json
{
  "rewrite": "Forty-seven builds. A new personal record.",
  "technique_used": "understatement",
  "callback_source": null
}
```

When `technique` is `callback` and session has eligible recent bits, `callback_source` contains the text being referenced.

## roast

Affectionate burn on code, errors, ideas, or situations. Uses the verdict/label pattern.

**Input:**
- `target` (string, required) — what to roast
- `context` (string, optional) — one of: `code`, `error`, `idea`, `situation`

**Output:**
```json
{
  "roast": "Verdict: Monolithic state blob syndrome.",
  "severity": 4,
  "mood": "roast"
}
```

Severity scale: 1 = mild pattern, 5 = architectural crime.

## heckle

Short, punchy reaction. The quick jab — no config needed.

**Input:**
- `target` (string, required) — what to heckle

**Output:**
```json
{
  "heckle": "var in 2026.",
  "mood": "dry"
}
```

Heckles are capped at ~20 words. They inherit the active mood.

## catchphrase_generate

Create a reusable catchphrase or recurring bit, stored in session.

**Input:**
- `context` (string, optional) — what inspired the catchphrase

**Output:**
```json
{
  "phrase": "Verdict: Bug lottery ticket.",
  "is_fresh": true
}
```

`is_fresh` is `true` on first generation, `false` when returning an existing phrase.

## catchphrase_callback

Retrieve and reuse the most-used catchphrase from the session.

**Input:** none

**Output:**
```json
{
  "phrase": "Verdict: Bug lottery ticket.",
  "use_count": 3
}
```

Returns `null` if no catchphrases exist in the session yet.

## debug_status

Dump the current session state, mood config, and voice backend. Useful for inspecting state without enabling debug env vars.

**Input:** none

**Output** (does a live, bounded backend probe — never throws):
```json
{
  "mood": "dry",
  "mood_description": "Deadpan, minimalist, says the obvious like it's devastating news",
  "voice_notes": "One flat sentence of devastating observation...",
  "turn_counter": 5,
  "recent_bits_count": 3,
  "running_gags_count": 1,
  "catchphrase_count": 1,
  "buffer_stats": { "recent_bits": 3, "max": 20, "running_gags": 1, "catchphrases": 1 },
  "catchphrases": { "Ship it and pray.": 2 },
  "voice_backend": "default (kokoro)",
  "model": "qwen2.5:7b",
  "ollama_host": "http://127.0.0.1:11434",
  "ollama_api_key_set": false,
  "timeout_ms": 30000,
  "prompt_version": "1",
  "active_prompt_key": "dry.v1",
  "prompt_fingerprint": "3fba259a39b6",
  "ollama_reachable": true,
  "model_available": true,
  "generation": { "total_calls": 12, "fallback_calls": 0, "safety_filter_fires": 0, "last_latency_ms": 380 },
  "debug": false
}
```

Notable fields: `generation.safety_filter_fires` counts how often the safety floor substituted a line (a distinct signal from backend `fallback_calls`); `prompt_fingerprint` + `active_prompt_key` bind the *active* prompt text + model so output drift is attributable (and a silent prompt-version downgrade is visible — `active_prompt_key` is the resolved version, not the requested one); when `ollama_reachable` is `false`, an `unreachable_reason` field gives the classified cause (`connection` / `auth` / `timeout`).

## session_reset

Reset all session state — mood returns to `dry`, gags/bits/catchphrases cleared, turn counter zeroed.

**Input:** none

**Output:**
```json
{ "reset": true, "mood": "dry", "turn_counter": 0 }
```

## Degraded output

When a tool can't return a genuine model generation it still returns a usable in-voice line, plus a machine-readable signal so a consuming agent never mistakes a fallback for a real one:

- `degraded: true`
- `degraded_reason` — a **closed enum** a consumer can branch on exhaustively: `safety-filter` (a slur/simile/meta-leak was substituted), `connection`, `timeout`, `model-not-found`, `auth`, `rate-limit`, `server`, `http`, `json-parse`, `validation`, `exhausted`, `unknown`.

A genuine generation carries **no** `degraded` flag — its absence is the positive signal. All comedy tools carry this, including `catchphrase_callback` (a safety-substituted recall is flagged, never passed off as genuine).

## Prompt stability (v1.2)

The v1 mood prompts are frozen and pinned by tests — to change one you bump to a new version (`SENSOR_HUMOR_PROMPT_VERSION=2` loads v2 prompts alongside v1, falling back to v1 per-mood). A regression scorecard guards drift: a deterministic **form + safety** golden set runs in `npm test`, and `npm run scorecard` runs the live statistical gate (per-mood conformance over N samples → a Wilson interval + three-valued PASS / FAIL / INCONCLUSIVE verdict + SPRT early-stopping). It measures structural conformance and safety, **not** "funniness."

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENSOR_HUMOR_DEBUG` | `false` | Verbose logging of prompts, responses, and session updates |
| `SENSOR_HUMOR_MODEL` | `qwen2.5:7b` | Ollama model to use for comedy generation |
| `SENSOR_HUMOR_TIMEOUT_MS` | `30000` | Per-call Ollama timeout in ms (invalid values fall back to the default) |
| `SENSOR_HUMOR_TEMPERATURE` | `0.55` | Generation temperature, clamped 0.0–2.0 (invalid values fall back to the default) |
| `SENSOR_HUMOR_PROMPT_VERSION` | `1` | Prompt set version. `dry.v2` ships as the exemplar; set `2` to load v2 prompts where they exist (other moods fall back to v1 per-mood). Malformed values fall back to v1 |
| `SENSOR_HUMOR_PERSIST` | `false` | Persist session to `~/.sensor-humor/session.json` so callbacks survive a restart (24h expiry) |
| `SENSOR_HUMOR_SESSION_DIR` | `~/.sensor-humor` | Override the directory for the persisted session file |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API endpoint (may point to a remote/cloud Ollama) |
| `OLLAMA_API_KEY` | _(unset)_ | Bearer token for a remote/cloud Ollama (e.g. `https://ollama.com`); sent only as an `Authorization` header, never logged |

## Session State

All tools share a single in-memory session per server instance:

- **mood** — current active mood
- **running_gags** — tagged setups with usage counts and last-used turn
- **recent_bits** — ring buffer (max 20) of recent outputs for callback eligibility
- **catchphrases** — phrase-to-count map
- **turn_counter** — incremented on every tool call

The session is in-memory by default and resets when the server stops. Set `SENSOR_HUMOR_PERSIST=true` to persist it to `~/.sensor-humor/session.json` (24h expiry) so callbacks survive a restart.
