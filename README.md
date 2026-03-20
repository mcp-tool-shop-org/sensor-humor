<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP tool that gives your LLM a persistent comedic sidekick: mood-based personality, session-aware callbacks, running gags, roasts, heckles, and catchphrases — all with voice integration via Piper TTS (prosody-controlled).

Built for developers: gentle burns on code smells, dry deadpan error messages, unhinged chaos on build fails. Never overwrites host LLM tone — distinct voice that chimes in when called.

## Features

- 6 moods: dry (default), roast, absurdist, wholesome, sardonic, unhinged
- Session state: running gags, recent bits ring buffer (max 20), catchphrase Map
- Tools: mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback
- Local Ollama backend (qwen2.5:7b-instruct recommended)
- Voice pairing: mcp-voice-soundboard with Piper TTS (prosody knobs: length_scale, noise_scale, noise_w_scale, volume)
- Deterministic: JSON schema enforcement, validation, retry on bad output, debug logging

## Requirements

- Node.js 18+
- Ollama running locally with `qwen2.5:7b-instruct` pulled
- mcp-voice-soundboard installed & running (Piper backend recommended)
- @modelcontextprotocol/sdk

## Install

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Quick Start

1. Start Ollama:

```bash
ollama run qwen2.5:7b-instruct
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
mood.set(style: "roast")
roast(target: "800-line god function")
```

Text roast returned, then `voice_speak(mood: "roast")` speaks it with am_eric + confident sarcastic energy.

## Tools

All tools inherit current mood from session.

| Tool | Signature | Description |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Set active mood (dry, roast, absurdist, wholesome, sardonic, unhinged) |
| `mood.get` | `()` | Current mood + gag count |
| `comic_timing` | `(text, technique?)` | Rewrite with comedic delivery (rule-of-three, misdirection, escalation, callback, understatement, auto) |
| `roast` | `(target, context?)` | Affectionate burn with verdict/label pattern, returns severity 1-5. Context: code, error, idea, situation |
| `heckle` | `(target)` | Short pointed jab |
| `catchphrase.generate` | `(context?)` | Create reusable bit (stored in session) |
| `catchphrase.callback` | `()` | Reuse most-used catchphrase (or null) |

## Mood Prosody (Piper Voice)

Each mood maps to a distinct Piper voice + prosody configuration:

| Mood | Voice | length_scale | noise_scale | noise_w_scale | volume | Character |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Flat, weary, metronomic |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Confident sarcasm |
| absurdist | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Erratic, unpredictable |
| wholesome | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Warm, gentle dad energy |
| sardonic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | World-weary drawl |
| unhinged | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | Fast, loud, chaotic |

## Environment Variables

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observability & Debug

- Every tool call logs: prompt sent, raw Ollama response, parsed output, session update
- Voice: debug logs show Piper params applied per mood
- Set `SENSOR_HUMOR_DEBUG=true` to see everything

## Quality Notes

- Comedy hit rate: ~70-75% in real sessions (dry strongest, roast close behind)
- Deterministic: JSON schema enforcement, 1 retry on invalid output, post-validation for banned patterns
- Voice: Piper gives real prosody separation (not just speed); Kokoro fallback is speed-only
- Not for production bots — dev-tool sidekick only. Humor is subjective; tune prompts if needed

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
