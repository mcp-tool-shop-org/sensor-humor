---
title: Voice Integration
description: Piper TTS prosody mapping for spoken comedy
sidebar:
  order: 4
---

sensor-humor pairs with [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) to deliver spoken comedy with mood-appropriate prosody.

## How it works

Each mood maps to a Piper TTS voice and 4 prosody knobs:

| Knob | What it controls | Effect on comedy |
|------|-----------------|-----------------|
| `length_scale` | Speech speed (>1 = slower) | Dry/cynic drag; zoomer rushes |
| `noise_scale` | Expressiveness (0 = flat, 1 = animated) | Dry is monotone; chaotic is erratic |
| `noise_w_scale` | Phoneme timing variance (0 = metronomic, 1 = erratic) | Controls whether words land at even intervals |
| `volume` | Loudness | Cynic is quiet; zoomer is loud |

## Mood-to-voice mapping

| Mood | Piper Voice | length | noise | noise_w | vol |
|------|-------------|--------|-------|---------|-----|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 |

## Setup

1. Install Piper voice models:

```bash
# Download to your model directory
# Required: alan-medium, ryan-high, lessac-high, cori-high
```

2. Start voice-soundboard with Piper:

```bash
VOICE_SOUNDBOARD_ENGINE=piper \
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models \
npm start
```

3. After any sensor-humor tool call, speak the result:

```
voice_speak({ text: result.roast, mood: "roast" })
```

## Kokoro fallback

If `VOICE_SOUNDBOARD_ENGINE` is not set, the default Kokoro backend is used. Kokoro supports voice selection and speed control but not full prosody (noise_scale, noise_w_scale, volume are ignored). The comedy still works — just without the prosodic separation between moods.

## Why Piper over Kokoro

Kokoro strips SSML and only respects speed + voice selection. Piper's ONNX inference exposes all 4 prosody knobs natively via `SynthesisConfig`, giving real vocal differentiation:

- Dry and cynic use the same voice (alan) but cynic is measurably slower, flatter, and quieter
- Chaotic has high timing variance — words don't land at even intervals, which reads as erratic
- Roast has natural expressiveness that gives verdict labels a confident lift
- Zoomer is fast and loud — streamer energy with brisk pacing
