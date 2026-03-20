---
title: sensor-humor Handbook
description: Complete guide to the MCP comedy sidekick
sidebar:
  order: 0
---

sensor-humor is an MCP tool that gives your LLM a persistent comedic sidekick. It provides mood-based personality, session-aware callbacks, running gags, roasts, heckles, and catchphrases — with optional voice integration via Piper TTS.

## What it does

Instead of making the host LLM funnier directly, sensor-humor acts as a **comedy sidekick** — a distinct voice that chimes in when called. The host LLM decides when to request humor, gets structured JSON back, and weaves it into its response (or doesn't).

This separation means:
- The host LLM stays precise and serious by default
- Comedy is deterministic and observable (JSON schema enforced, logged, validated)
- Session state (gags, callbacks, catchphrases) is managed independently
- You can toggle it off instantly — just stop calling the tools

## How it works

1. **You set a mood** (dry, roast, absurdist, wholesome, sardonic, unhinged)
2. **You call a tool** (comic_timing, roast, heckle, catchphrase)
3. **sensor-humor builds a prompt** from the mood's system prompt + session state summary + your input
4. **A local Ollama model** (qwen2.5:7b-instruct) generates the comedy under strict JSON schema
5. **sensor-humor validates** the output, updates session state, and returns clean structured data
6. **Optionally**, the output is spoken via Piper TTS with mood-specific prosody

## What makes it different

Most humor tools are joke databases or prompt wrappers. sensor-humor is a **comedy director** that manages:

- **Continuity** — callbacks to earlier bits, running gags that evolve, catchphrases that recur
- **Voice** — each mood has a distinct personality anchor, not just different words
- **Prosody** — when paired with Piper TTS, dry sounds flat, roast sounds sarcastic, unhinged sounds chaotic
- **Determinism** — every output is schema-validated, length-capped, and checked for banned patterns
