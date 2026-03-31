# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |
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

This tool operates **locally only** via MCP stdio transport.

- **Data touched:** User-provided text for comedic rewriting (in-memory only, not persisted)
- **Network egress:** Connects to local Ollama instance only (default `http://127.0.0.1:11434`)
- **No secrets handling** — does not read, store, or transmit credentials
- **No telemetry** is collected or sent
- **No file system access** — reads no files, writes no files
- **Session state is in-memory only** — dies when the server process stops
