# Changelog

All notable changes to this project will be documented in this file.

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
