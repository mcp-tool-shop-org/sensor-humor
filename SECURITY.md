# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This tool runs over MCP stdio transport and is local-first.

- **Data touched:** User-provided text for comedic rewriting (in-memory; persisted to disk only when `SENSOR_HUMOR_PERSIST=true`)
- **Network egress:** Connects to Ollama at `OLLAMA_HOST` (default local `http://127.0.0.1:11434`). Pointing it at a remote/cloud Ollama is the operator's explicit choice
- **Secrets:** none required for local use. If `OLLAMA_API_KEY` is set (for a remote/cloud host), it is read from the environment and sent only as a `Bearer` header to `OLLAMA_HOST` — never logged, persisted, or echoed (`debug_status` reports only whether a key is set)
- **No telemetry** is collected or sent
- **File system:** none by default. With `SENSOR_HUMOR_PERSIST=true`, reads/writes one file — `~/.sensor-humor/session.json` (override dir via `SENSOR_HUMOR_SESSION_DIR`) — containing only session comedy state, no credentials. Auto-expires after 24h
- **Session state is in-memory by default** — dies when the server process stops unless persistence is enabled
- **Output safety (floor, not guarantee):** comedy output passes a deterministic term-list regex as a terminal gate on every tool, after input is Unicode-normalized (NFKC + zero-width strip + homoglyph fold). This defeats common obfuscation (zero-width insertion, homoglyphs, fullwidth) but is **not** a learned moderation classifier — it does not cover novel/coded slurs, ASCII-art / spatial obfuscation, full Unicode-confusable coverage, or semantic/jailbreak-class attacks. Best-effort floor for a local dev-humor tool, not a guarantee for untrusted public input
- **Tool errors** return a structured `{code, message, hint, retryable}` shape; *input-schema* validation (e.g. a bad `mood`) is rejected by the MCP SDK before the handler and returns the SDK's standard `InvalidParams` error
