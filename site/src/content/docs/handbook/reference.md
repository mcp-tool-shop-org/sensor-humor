---
title: Tool Reference
description: Complete API reference for all 7 sensor-humor tools
sidebar:
  order: 3
---

## mood.set

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

## mood.get

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

## catchphrase.generate

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

## catchphrase.callback

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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENSOR_HUMOR_DEBUG` | `false` | Verbose logging of prompts, responses, and session updates |
| `SENSOR_HUMOR_OBSERVE` | `false` | Full chain trace including voice params |
| `SENSOR_HUMOR_PROMPT_VERSION` | `1` | Prompt set version for A/B testing |

## Session State

All tools share a single in-memory session per server instance:

- **mood** — current active mood
- **running_gags** — tagged setups with usage counts and last-used turn
- **recent_bits** — ring buffer (max 20) of recent outputs for callback eligibility
- **catchphrases** — phrase-to-count map
- **turn_counter** — incremented on every tool call

The session resets when the server stops. No persistence across restarts.
