---
title: Beginner's Guide
description: New to sensor-humor? Start here for a plain-language walkthrough.
sidebar:
  order: 99
---

## What is sensor-humor?

sensor-humor is an MCP server that adds a comedy sidekick to your AI coding assistant. When connected, your LLM gains access to tools that generate jokes, roasts, heckles, and catchphrases -- all in a configurable comedic voice. It runs locally using Ollama for text generation and optionally Piper TTS for spoken output.

It does not change how your LLM behaves by default. The host LLM calls sensor-humor tools only when it wants humor, gets structured JSON back, and decides whether to use it. You can stop calling the tools at any time to turn it off.

## Who is it for?

- Developers who want lighthearted commentary during coding sessions
- Teams looking for a shared comedic sidekick that roasts bad code patterns
- Anyone experimenting with MCP tool integration and wants a fun, self-contained example

No comedy writing experience required. The moods and prompts handle all the creative direction.

## Key concepts

### Moods

sensor-humor has 6 moods that control the comedic voice:

| Mood | In one sentence |
|------|----------------|
| **dry** (default) | Flat, deadpan observations stated like devastating news |
| **roast** | Affectionate burns with verdict/diagnosis labels |
| **chaotic** | Normal setup followed by one absurd escalation |
| **cheeky** | Playful teasing with warm openers |
| **cynic** | Bitter, jaded realism -- nothing surprises you |
| **zoomer** | Gen-Z snark with caps blocks and slang |

Switch moods at any time with `mood_set`. All tools adopt the active mood.

### Session state

Every server instance maintains an in-memory session that tracks:

- **Running gags** -- tagged setups that evolve as they get reused
- **Recent bits** -- the last 20 outputs, available for callbacks
- **Catchphrases** -- reusable phrases with usage counts
- **Turn counter** -- incremented on every tool call

The session resets when the server stops. This is intentional -- comedy has a shelf life, and yesterday's inside jokes should not persist.

### Tools

There are 8 tools available:

| Tool | What it does |
|------|-------------|
| `mood_set` | Switch the active mood |
| `mood_get` | Check current mood and session stats |
| `comic_timing` | Rewrite boring text with comedic delivery |
| `roast` | Deliver an affectionate burn with severity rating |
| `heckle` | Quick one-line jab |
| `catchphrase_generate` | Create a reusable recurring bit |
| `catchphrase_callback` | Recall the most-used catchphrase |
| `debug_status` | Inspect full session state and config |

## Prerequisites

Before you begin, make sure you have:

1. **Node.js 18 or later** -- check with `node --version`
2. **Ollama installed and running** -- download from [ollama.com](https://ollama.com) if needed
3. **An MCP client** -- Claude Code, Cursor, or any MCP-compatible host

## Step-by-step setup

### 1. Pull the comedy model

```bash
ollama pull qwen2.5:7b
```

This is the default model. It produces concise, schema-compliant comedy output. You can use a different model by setting the `SENSOR_HUMOR_MODEL` environment variable.

### 2. Install sensor-humor

```bash
npm install sensor-humor
```

Or for development:

```bash
git clone https://github.com/mcp-tool-shop-org/sensor-humor.git
cd sensor-humor
npm install
npm run build
```

### 3. Start the server

```bash
npm start
```

The server runs on stdio transport. Your MCP client connects to it as a local tool server. Add `SENSOR_HUMOR_DEBUG=true` before `npm start` to see detailed prompt and response logs.

### 4. Connect from your MCP client

Add sensor-humor as an MCP server in your client's configuration. The exact steps depend on your client -- consult your client's documentation for adding local stdio MCP servers.

### 5. Test it

In your MCP client, try:

```
mood_set(style: "dry")
comic_timing(text: "null pointer at line 42")
```

You should get back a flat, deadpan rewrite of your input as structured JSON.

## Common workflows

### Quick roast session

Set a mood, then roast whatever you are working on:

```
mood_set(style: "roast")
roast(target: "500-line switch statement with no default case", context: "code")
```

The roast comes back with a verdict label and severity rating (1-5).

### Building running gags

Use `catchphrase_generate` to create a recurring bit, then `catchphrase_callback` to bring it back later:

```
catchphrase_generate(context: "deploying to production on Friday")
# ... later in the session ...
catchphrase_callback()
```

The callback returns the most-used catchphrase from the session.

### Trying different comedy techniques

The `comic_timing` tool supports specific techniques:

- **rule-of-three** -- two normal items, then one that breaks the pattern
- **misdirection** -- set up an expectation, deliver something different
- **escalation** -- start reasonable, get progressively more absurd
- **callback** -- reference earlier material from this session
- **understatement** -- describe something dramatic as completely mundane
- **auto** -- let the sidekick choose the best technique

```
comic_timing(text: "the build failed again", technique: "escalation")
```

## Troubleshooting

### "Connection refused" or Ollama errors

Make sure Ollama is running. Start it with `ollama serve` or check that the Ollama desktop app is active. If Ollama is on a non-default host, set `OLLAMA_HOST` (default: `http://127.0.0.1:11434`).

### Output is generic or repetitive

Try switching moods. Each mood has a distinct prompt skeleton that forces the model into a different comedic shape. The `chaotic` and `zoomer` moods tend to produce the most varied output.

### JSON parse errors in debug logs

The model occasionally produces malformed JSON. sensor-humor retries once automatically and falls back to a safe default if both attempts fail. If this happens frequently, try a different model with stronger JSON schema adherence.

### Comedy quality seems low

Comedy quality depends on the model. The default `qwen2.5:7b` was chosen for its balance of speed, instruction following, and conciseness. Larger models (13B+) may produce higher quality output at the cost of latency.
