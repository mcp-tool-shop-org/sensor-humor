# sensor-humor Roadmap

**Current:** v1.0.2 — shipped 2026-03-31
**Quality baseline:** 6 moods at 70%+, 160 tests, simile post-validation, harsh filter safe fallback, mood-specific fallbacks, Piper prosody, live sessions addictive with voice on.

Everything below must meaningfully move quality, determinism, debuggability, developer time, or end-user edge. Nothing else gets in.

---

## v1.1 — Tarball Hygiene + CI Gate (1 day)

The v1.0.0 publish shipped 1.6MB because voice-demos/, scripts/, debug.log, and stale dist files leaked into the tarball. Fix before any more publishes.

- [x] Add `.npmignore` (exclude voice-demos/, scripts/, debug.log, site/, tests/, .github/, *.prompt.ts source) (2026-03-31)
- [ ] Add `npm pack --dry-run` verification to CI (fail if tarball > 200KB)
- [ ] Clean stale dist/ files from deleted moods (absurdist, sardonic, wholesome, unhinged)
- [x] Patch bump to v1.0.1, publish clean tarball (shipped 2026-03-25)

**Gate:** `npm pack --dry-run` shows < 200KB, no .wav files, no scripts.

---

## v1.2 — Prompt Stability Lock (2-3 days)

The prompt war taught us that small wording changes cause 20%+ swings. Lock what works.

- [ ] Snapshot all 6 mood prompts as v1 frozen (no edits without scorecard proof)
- [ ] Add prompt fingerprint to debug_status output (hash of active prompt text)
- [ ] Add `SENSOR_HUMOR_PROMPT_VERSION=2` scaffolding — v2 prompts load alongside v1, switchable per-session
- [ ] Regression scorecard script: 10 calls per mood, automated pass/fail against pattern rules, runs in CI
- [ ] If any mood drifts below 65% on regression, CI fails

**Gate:** `npm test` includes regression scorecard against frozen prompt snapshots.

---

## v2.0 — The Session Upgrade (4-6 weeks, ~15h/week)

### Priority 1: Persistent Session (2 days)

In-memory session dies on server stop. For long coding marathons, callbacks to turn-47 on turn-120 after restart is the killer feature.

- [ ] Add `serialize()` / `deserialize()` to session.ts (JSON-safe: convert Map to entries)
- [ ] File-based persistence: `~/.sensor-humor/session.json` (write on every tick, read on startup)
- [ ] `SENSOR_HUMOR_PERSIST=true` env toggle — off by default, falls back to in-memory
- [ ] Session expiry: auto-clear if file > 24h old (stale gags aren't funny)
- [ ] Tests: serialize → deserialize roundtrip, catchphrase Map survives, ring buffer capped

**Gate:** Callback references turn-47 bits on turn-120 after full server restart.

### Priority 2: Chain Trace Tool (1 day)

When a roast lands weird, you should debug why in seconds — not grep through console logs.

- [ ] Add trace ring buffer to session (last 10 calls)
- [ ] Each trace entry: `{ turn, tool, mood, input, prompt_hash, ollama_raw, parsed_output, retries, validators_triggered, latency_ms }`
- [ ] `debug_chain(limit?)` tool returns last N traces as JSON
- [ ] Optional: `SENSOR_HUMOR_FULL_TRACE=true` adds full prompt text + Piper params to trace

**Gate:** One tool call reconstructs the full generation pipeline for any recent output.

### Priority 3: Per-Mood Model Selection (2 days)

qwen2.5:7b is the baseline, but some moods might benefit from different models. The A/B infrastructure already exists from the prompt war.

- [ ] `SENSOR_HUMOR_MODEL_MAP` env: JSON mapping mood→model (e.g. `{"zoomer":"llama3.1:8b","default":"qwen2.5:7b"}`)
- [ ] ollama.ts reads model from map at call time, falls back to default
- [ ] debug_status shows active model per mood
- [ ] Scorecard script accepts model param for targeted A/B

**Gate:** Each mood can run on its best model without code changes. Default still qwen2.5:7b.

### Priority 4: Voice Personality Sliders (2 days)

Fixed prosody per mood is good. User-tunable prosody per call is better.

- [ ] Add optional `voice_overrides` param to voice_speak: `{ energy?: number, sarcasm?: number, chaos?: number }`
- [ ] Map semantic sliders to Piper knobs: energy → length_scale (inverse) + volume, sarcasm → noise_scale, chaos → noise_w_scale
- [ ] Clamp all values to safe ranges (no unintelligible output)
- [ ] Log effective knobs in trace

**Gate:** `voice_speak(mood: "roast", voice_overrides: { sarcasm: 1.5 })` produces audibly different output vs default.

### Priority 5: Mood-Specific Technique Combos (1-2 days)

Let users dial precision: "give me a cheeky heckle with misdirection."

- [ ] Extend roast/heckle params with optional `technique` override
- [ ] Build mood×technique capability matrix (not all combos valid)
- [ ] Reject invalid combos with clear error: "cynic doesn't support escalation — try understatement or callback"
- [ ] Tests for valid/invalid combos

**Gate:** `roast(target, context, technique: "misdirection")` produces misdirection-shaped roast in current mood voice.

---

## v2.1 — Comedy Intelligence (speculative, 2-4 weeks)

Only pursue if v2.0 sessions prove the need. Not pre-approved.

### Adaptive Difficulty

- [ ] Track per-session hit/miss ratio (user reactions: 👍/👎 or implicit via catchphrase reuse)
- [ ] If hit rate drops, auto-simplify: shorter outputs, safer techniques, more label patterns
- [ ] If hit rate is high, allow riskier techniques: longer bits, callbacks, escalation chains
- [ ] Never auto-switch mood — that's user territory

### Callback Graph

- [ ] Replace flat ring buffer with tagged graph: bits connect to gags connect to catchphrases
- [ ] Enable multi-hop callbacks: "remember that deadbeef thing from earlier? well NOW it's..."
- [ ] Visualize in debug_chain output

### Ensemble Mood Blending

- [ ] `mood.blend(primary: "cynic", accent: "zoomer", ratio: 0.7)` — generates with primary skeleton but allows accent flavor
- [ ] Use primary mood's prompt + append accent's voice notes as soft guidance
- [ ] Validate output against primary pattern (accent is flavor, not structure)

---

## Non-Priorities (explicit pushback)

These are not planned for any version unless proven necessary by real usage data.

| Idea | Why not |
|------|---------|
| Larger models (14b, 70b) | Only if we hit a hard ceiling on new moods. 7B with skeleton prompts is the moat. |
| RAG memory | Ring buffer + tags sufficient. Prove need with session data first. |
| Multilingual comedy | English-only. Comedy doesn't translate; prompts would need full rewrites per language. |
| UI dashboard | CLI/MCP debug tools first. If debug_chain isn't enough, then consider. |
| Cloud TTS (Azure, ElevenLabs) | Piper local is the moat. No latency, no API keys, no cost. |
| Plugin marketplace | One tool, one voice. Don't fragment before proving the core loop. |
| Streaming responses | Comedy needs the full bit before delivery. Streaming kills timing. |

---

## Lessons from v1.0 (carry forward)

1. **Skeleton prompts > ban lists.** Fill-in-the-blank patterns forced 7B models to 70%+ where soft constraints plateaued at 20-40%.
2. **Post-validation is non-negotiable.** Prompt bans alone don't prevent simile/metaphor leaks. Regex + retry + fallback is the deterministic gate.
3. **Scorecard before ship.** 10 calls, pattern-matched, hit rate calculated. No vibes-based quality assessment.
4. **Model A/B before prompt A/B.** When prompts plateau, the model is the variable — not more prompt words.
5. **Replace, don't compromise.** Unhinged at 0% became zoomer at 80%. Wholesome at 20% became cheeky at 90%. Never ship a mood that fails its own definition.
6. **Voice makes comedy stick.** Piper prosody turned "good text" into "addictive experience." The 4 knobs per mood are worth the integration cost.

---

*Last updated: 2026-03-31 — swarm health pass*
