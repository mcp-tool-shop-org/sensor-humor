# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-06-30

### Fixed
- Dockerfile now copies `tsconfig.build.json` so the GHCR image builds. v1.2.0's `build` script
  became `tsc -p tsconfig.build.json` (to keep the dev-only scorecard out of the published dist),
  but the Docker build only copied `tsconfig.json`, so the v1.2.0 GHCR image failed. The npm
  package, GitHub Release, and Pages site for v1.2.0 were unaffected; this patch is npm-identical
  to 1.2.0 apart from the Docker build fix.

## [1.2.0] - 2026-06-30

Dogfood swarm: a research study-swarm grounded the design, then a full health pass
(bug/security + proactive + humanization) and a feature pass. 187 → 294 tests.

### Added
- **v1.2 Prompt Stability Lock** — a *form + safety* regression scorecard (explicitly NOT a
  "funniness" metric). A deterministic golden set + statistics run in `npm test`; `npm run
  scorecard` runs the live drift gate: per-mood conformance over N samples, gated on a **Wilson**
  score interval with a **three-valued PASS / FAIL / INCONCLUSIVE** verdict (FAIL only when the
  Wilson upper bound is below threshold) and **SPRT** early-stopping. The 6 v1 prompts are frozen
  (pinned by test — to change one, bump to a new version)
- **`SENSOR_HUMOR_PROMPT_VERSION=2` scaffolding** — v2 prompts load alongside v1, switchable
  per-session; `dry.v2` ships as the exemplar, other moods fall back to v1 per-mood
- `debug_status` now reports `safety_filter_fires` (how often the safety floor substituted a line),
  a `prompt_fingerprint` + `active_prompt_key` (drift attribution; exposes a silent prompt-version
  downgrade), and `unreachable_reason` (the classified cause when Ollama is down)

### Fixed
- **Safety (HIGH)** — `catchphrase_generate`/`catchphrase_callback` now run the terminal harsh/simile
  safety gate; previously model-generated (and persisted/replayed) catchphrases bypassed it entirely
- **Safety (HIGH)** — caller-input slur obfuscations are now de-obfuscated before the filter, so a
  zero-width, homoglyph, leetspeak (`r3tard`), intra-word-separator (`re-tard`), or combining-mark
  (`retárd`) slur in the caller's input can no longer be echoed back via a fallback
- `roast`/`heckle` now flag `degraded` on **any** safety substitution (an intermediate fallback as
  well as the terminal gate), and `comic_timing` includes a persistent prompt-leak in its terminal
  gate (substituted + flagged, not returned verbatim)
- Dirty (slur/simile) entries are dropped from a tampered/legacy persisted session on load
- Ollama request timeout now aborts the underlying HTTP request (no leaked socket on a hung backend);
  a 429/5xx retries with a short backoff instead of instantly re-hitting the limit
- Corrupt persisted gag no longer crashes `comic_timing`; session writes are atomic (temp + rename)

### Changed
- **`degraded_reason` is now a closed, documented enum** a consuming agent can branch on
  exhaustively (`safety-filter` | `connection` | `timeout` | `model-not-found` | `auth` |
  `rate-limit` | `server` | `http` | `json-parse` | `validation` | `exhausted` | `unknown`);
  `catchphrase_callback` carries the degraded signal like the other tools
- Threat-model docs reframed honestly: the regex filter is a deterministic **floor** (now defeats the
  common obfuscations) with a documented **ceiling** — it is not a learned moderation classifier and
  does not cover out-of-list variants, ASCII-art, full Unicode-confusables, or semantic/jailbreak harm
- Running gags + catchphrases are now bounded (LRU); persisted-snapshot schema is version-guarded;
  model/host/prompt-version env vars are validated
- 187 → 294 tests

## [1.1.1] - 2026-06-20

### Fixed
- npm README rendering: the logo and CI badge did not render on npmjs.com (npm does not proxy the absolute brand-repo image URL or the GitHub Actions `badge.svg`). The logo is now a repo-local `logo.png` referenced relatively, and the CI badge uses shields.io — both render on npm and GitHub.

## [1.1.0] - 2026-06-20

Comprehensive dogfood swarm: health pass (bug/security + proactive + humanization), a feature wave, and the full treatment.

### Added
- **Persistent session** — opt-in disk persistence (`SENSOR_HUMOR_PERSIST`) to `~/.sensor-humor/session.json` (override dir via `SENSOR_HUMOR_SESSION_DIR`). Callbacks survive a full server restart; the file auto-expires after 24h
- **Ollama Cloud auth** — `OLLAMA_API_KEY` sent as a `Bearer` header to a remote/cloud `OLLAMA_HOST`; never logged, persisted, or echoed
- **Degradation signal** — comedy tools return `degraded` + `degraded_reason` when output is a fallback (backend down) or a safety substitution, so a caller can tell a real joke from a canned one
- `debug_status` now reports live Ollama reachability, whether the model is pulled, resolved host/timeout/prompt-version, whether an API key is set, and generation stats (total/fallback calls, last reason, last latency)
- Startup health check verifies the configured model is **pulled**, not just that the daemon answers — prints the exact `ollama pull <model>` fix when it is missing
- `SENSOR_HUMOR_TEMPERATURE` env knob (clamped 0.0–2.0) for A/B sweeps
- CI `security` job: production-tree `npm audit` (critical gate) + TruffleHog OSS secret scan

### Fixed
- **Safety** — harsh/simile filters now run as a *terminal gate* after every retry, so a late retry (or a slur/simile in the caller's own input) can never reach the user
- `SENSOR_HUMOR_TIMEOUT_MS` guards NaN/non-numeric/≤0 values (a bad value no longer makes every call instant-timeout to a fallback)
- Removed the lossy trailing-brace stripper that corrupted output ending in `}`
- Ollama timeout timer is cleared on success (no dangling 30s timer holding the event loop open)
- `classifyError` now buckets HTTP / model-not-found / auth / rate-limit / server errors
- `sanitizeForPrompt` strips `\x7f` and the U+2028/U+2029 separators
- Graceful async shutdown (awaits transport close, double-signal guard, hard-exit safety net)

### Changed
- Tool errors return the structured shape (`code`/`message`/`hint`/`retryable`) with actionable hints instead of raw text
- `package.json` uses a `files` allowlist (+ repository/bugs/homepage); internal gate docs no longer ship in the npm tarball; CHANGELOG is restored to it
- Static fallback maps typed `Record<MoodStyle, string>` so a new mood fails the build until it has a fallback voice
- Docs: threat model now states file-system and secret access are conditional (persistence / cloud key); removed the unimplemented `SENSOR_HUMOR_OBSERVE` from the docs
- 160 → 187 tests

## [1.0.2] - 2026-03-31

### Added
- `session_reset` tool — reset all session state without restarting the server (9th tool)
- Ollama timeout with configurable `SENSOR_HUMOR_TIMEOUT_MS` (default 30s)
- Graceful shutdown on SIGINT/SIGTERM
- Startup Ollama health check (non-blocking)
- Error classification in Ollama retry loop (json-parse, connection, timeout, validation)
- Harsh filter safe fallback — slurs can never reach the user even after retry failure
- Mood-specific fallback text (cynic: "Of course:", cheeky: "Oh honey", etc.)
- Input sanitization via `sanitizeForPrompt()` on all tool inputs and session summaries
- HARSH_FILTER base64-encoded for clean source diffs
- Prompt map validation at startup
- Session `bufferStats()` method for debug introspection
- 160 tests (up from 92)

### Fixed
- Regex injection vulnerability in catchphrase word-boundary matching
- Deterministic catchphrase selection (fixed `>=` to `>` tiebreaker)
- Catchphrase dedup guard prevents duplicate generation
- Dead variable removal across tool files
- JSON artifact brace trimming in Ollama response cleanup

### Changed
- `findCallbackCandidates` uses word-boundary regex with escaping (was substring match)
- Mood state captured at function entry to prevent mid-execution drift
- `ROAST_LABEL_PATTERN` consolidated to single export (was duplicated)

## [1.0.1] - 2026-03-25

### Added
- CHANGELOG.md
- Version alignment test suite (3 tests)

### Changed
- SHA-pin CI workflow actions (checkout, setup-node, upload-pages-artifact, deploy-pages) for supply chain security

## [1.0.0] - 2026-02-27

### Changed
- Promoted to v1.0.0 — production-stable release
- Shipcheck audit pass: SECURITY.md, threat model, structured errors, operator docs

## [0.1.0] - 2026-02-22

### Added
- Initial release
- MCP comedy sidekick with Ollama-powered comedic personality
- 6 moods, stateful session gags
- Piper voice integration via mcp-voice-soundboard
- 7 tools for humor generation
