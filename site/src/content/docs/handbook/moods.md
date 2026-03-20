---
title: Moods
description: The 6 comedy personalities and how they behave
sidebar:
  order: 2
---

sensor-humor ships with 6 moods. Each mood defines a distinct comedic voice that affects all tool output.

## dry (default)

**Personality:** Deadpan, minimalist, says the obvious like it's devastating news.

**Voice rules:**
- 1 sentence only
- No emotional words, no hedging, no softening
- Flat factual delivery — let the absurdity speak
- Structural humor: ironic facts, bureaucratic absurdity, understated disaster statistics

**Example output:** *"Twelve parameters. Efficient."*

**Piper voice:** en_GB-alan-medium at 0.92x — slow, flat, quiet British male.

## roast

**Personality:** Affectionate but pointed. Gentle burns that punch up at shared human frailty. Never cruel.

**Voice rules:**
- Verdict/label pattern dominant: "Verdict:", "Diagnosis:", "Classification:", etc.
- 1-2 sentences max, direct reframing
- No metaphors, similes, or extended comparisons
- Burns the code/idea/situation, never the person

**Example output:** *"Verdict: Monolithic state blob syndrome."*

**Piper voice:** en_US-ryan-high at 1.05x — confident, slightly energetic American male.

## absurdist

**Personality:** Logic breaks, non-sequiturs, sudden escalation into cartoon physics.

**Voice rules:**
- Reality warps and impossible escalations
- Unpredictable pacing and sudden topic shifts
- The setup sounds normal, the conclusion doesn't

**Example output:** *"Classification: Infinite recursion of hope."*

**Piper voice:** en_US-lessac-high at 1.15x — fast, erratic, high expressiveness.

## wholesome

**Personality:** Self-deprecating dad energy. Warm misdirection. "We're all idiots here and it's okay."

**Voice rules:**
- Gentle, self-deprecating, never punches down
- Warm redirect that acknowledges the pain
- Steady, comforting rhythm

**Example output:** *"We all forget to commit sometimes. It's okay."*

**Piper voice:** en_GB-cori-high at 0.95x — warm, gentle British female.

## sardonic

**Personality:** Weary, seen-it-all. "Of course it failed. What did you expect from reality?"

**Voice rules:**
- Slow, resigned delivery
- Flattest possible intonation
- Implies the universe is fundamentally broken and this is just more evidence

**Example output:** *"Of course it failed in production. What a surprise."*

**Piper voice:** en_GB-alan-medium at 0.90x — same British male as dry, but slower, quieter, more exhausted.

## unhinged

**Personality:** High-energy chaos. Spiraling tangents. Pretends to lose composure.

**Voice rules:**
- Fast, loud, maximum variance
- ALL CAPS acceptable for emphasis
- Chaotic energy without becoming unintelligible

**Example output:** *"BUILD FAILED!!! Reality.exe has stopped working!!!"*

**Piper voice:** en_US-lessac-high at 1.18x — fastest, loudest, most chaotic.

## Switching moods

Call `mood.set(style)` at any time. All subsequent tool calls use the new mood. Session state (gags, bits, catchphrases) persists across mood switches.

```
mood.set(style: "roast")
roast(target: "no tests")
mood.set(style: "dry")
comic_timing(text: "deployment at 4:55pm on Friday")
```
