---
title: Architecture
description: How sensor-humor is built and why
sidebar:
  order: 5
---

## Design decision: Comedy Sidekick (Mode B)

Three options were evaluated:

- **A) Personality injection** — reshape every LLM output to be funnier. Hardest, highest drift risk.
- **B) Comedy sidekick** — distinct voice that returns structured comedy on demand. Clean separation.
- **C) Comedy toolkit** — stateless material generator. Easiest but flattest.

sensor-humor implements **Mode B**. The host LLM stays unchanged and calls tools when it wants humor. The sidekick returns JSON; the host decides what to do with it.

## System diagram

```
Host LLM (Claude, Cursor, etc.)
  | calls MCP tool
  v
sensor-humor MCP server (TypeScript, stdio)
  | builds prompt from mood + session state + user input
  v
Ollama (qwen2.5:7b-instruct, local)
  | returns JSON (schema-enforced via format param)
  v
sensor-humor validates -> updates session -> returns to host
  | host optionally calls
  v
mcp-voice-soundboard (Piper backend)
  | maps mood -> prosody preset -> SynthesisConfig
  v
Piper TTS (local ONNX) -> audio output
```

## Key components

### MCP server (`src/index.ts`)
Registers 7 tools with `@modelcontextprotocol/sdk`. Runs on stdio transport. Each tool call flows through the same pipeline: resolve mood, build prompt, call Ollama, validate, update session, return.

### Session (`src/session.ts`)
In-memory singleton. Tracks mood, running gags (tagged setups with usage counts), recent bits (ring buffer, max 20), catchphrases (Map), and turn counter. Dies when server stops — no persistence by design.

### Prompt loader (`src/prompts/`)
Versioned system prompts per mood. `base.ts` provides safety rules, banned patterns, and length constraints. Mood files add voice flavor. Loader resolves `SENSOR_HUMOR_PROMPT_VERSION` env var with v1 fallback.

### Ollama client (`src/ollama.ts`)
Wraps the Ollama chat API with JSON schema enforcement (`format` parameter), Zod validation, and 1-retry logic. Inference settings: temperature 0.55, mirostat 2, tau 5.0, num_predict varies by tool (40-75 tokens).

### Tools (`src/tools/`)
Each tool assembles its prompt (base + mood + state summary + user input + technique guidance), calls Ollama, post-validates (banned patterns, length, label presence for roast), and updates session state.

## Inference tuning

The comedy quality depends heavily on inference settings, not just prompts:

| Setting | Value | Why |
|---------|-------|-----|
| temperature | 0.55 | Low enough for consistency, high enough to avoid rote repetition |
| mirostat | 2 | Keeps perplexity stable, reduces creativity bursts that lead to metaphor leaks |
| mirostat_tau | 5.0 | Target perplexity — balanced between flat and wild |
| num_predict | 40-75 | Hard token cap by tool type (heckle short, roast longer) |

## Why qwen2.5:7b-instruct

- Strong JSON schema adherence (critical for structured comedy output)
- Concise output tendency (comedy needs punch, not prose)
- Good instruction following on ban lists (metaphors, hedging, banned starters)
- Fast inference on consumer hardware (~1-2s per call after warm-up)
- 7B fits comfortably in 16GB VRAM alongside other tools

## Session state design

Comedy has a shelf life. Inside jokes from a 2-hour session shouldn't persist to tomorrow. The in-memory session is deliberate:

- **Ring buffer (max 20)** for recent bits prevents unbounded growth
- **Turn counter** on gags lets callbacks check freshness
- **Tag-based matching** for callbacks is deterministic (keyword scan, not vibes)
- **Catchphrase Map** tracks usage count so the most-used phrase wins on callback
