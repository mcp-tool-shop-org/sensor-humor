---
title: Getting Started
description: Install and run sensor-humor in 5 minutes
sidebar:
  order: 1
---

## Prerequisites

- **Node.js 18+**
- **Ollama** running locally with `qwen2.5:7b-instruct` pulled
- An MCP client (Claude Code, Cursor, or any MCP-compatible host)

Optional for voice:
- **mcp-voice-soundboard** with Piper backend
- Piper ONNX voice models (en_GB-alan-medium, en_US-ryan-high, en_US-lessac-high, en_GB-cori-high)

## Install

```bash
npm install @mcp-tool-shop/sensor-humor
```

Or clone and link for development:

```bash
git clone https://github.com/mcp-tool-shop-org/sensor-humor.git
cd sensor-humor
npm install
npm run build
```

## Pull the comedy model

```bash
ollama pull qwen2.5:7b-instruct
```

This is the recommended model for comedy generation. It has strong instruction following, concise output, and solid JSON schema adherence.

## Start the server

```bash
SENSOR_HUMOR_DEBUG=true npm start
```

The server runs on stdio transport. Your MCP client connects to it as a local tool server.

## First test

In your MCP client:

```
mood.set(style: "dry")
```

You should get back:

```json
{
  "mood": "dry",
  "description": "Deadpan, minimalist, says the obvious like devastating news",
  "voice_notes": "Flat, weary, metronomic"
}
```

Then try:

```
comic_timing(text: "null pointer at 0xdeadbeef", technique: "understatement")
```

Expected: a flat, one-sentence rewrite like *"Pointer at deadbeef. Naturally."*

## Add voice (optional)

Start mcp-voice-soundboard with Piper:

```bash
cd mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

Then after any sensor-humor tool call, pipe the output to voice:

```
voice_speak({ text: result.roast, mood: "roast" })
```

The mood parameter maps to a Piper voice + prosody preset automatically.
