# Changelog

All notable changes to this project will be documented in this file.

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
