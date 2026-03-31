# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-03-31)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-03-31)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-03-31)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-03-31)

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: No dangerous actions (kill, delete, restart) — comedy text generation only
- [x] `[cli|mcp|desktop]` File operations constrained to known directories (2026-03-31) — no file operations at all
- [x] `[mcp]` Network egress off by default (2026-03-31) — local Ollama only, configurable via OLLAMA_HOST
- [x] `[mcp]` Stack traces never exposed — structured error results only (2026-03-31)

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` (2026-03-31)
- [ ] `[cli]` SKIP: Not a standalone CLI — runs as MCP stdio server
- [ ] `[cli]` SKIP: Not a standalone CLI
- [x] `[mcp]` Tool errors return structured results — server never crashes on bad input (2026-03-31)
- [x] `[mcp]` State/config corruption degrades gracefully (stale data over crash) (2026-03-31)
- [ ] `[desktop]` SKIP: Not a desktop app
- [ ] `[vscode]` SKIP: Not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-03-31)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-03-31)
- [x] `[all]` LICENSE file present and repo states support status (2026-03-31)
- [ ] `[cli]` SKIP: MCP stdio server, no --help
- [x] `[cli|mcp|desktop]` Logging levels defined: silent / normal / verbose / debug — secrets redacted at all levels (2026-03-31) — SENSOR_HUMOR_DEBUG controls verbose logging
- [x] `[mcp]` All tools documented with description + parameters (2026-03-31)
- [ ] `[complex]` SKIP: Not complex enough for HANDBOOK.md — single-process in-memory server

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-03-31)
- [x] `[all]` Version in manifest matches git tag (2026-03-31)
- [x] `[all]` Dependency scanning runs in CI (ecosystem-appropriate) (2026-03-31)
- [ ] `[all]` SKIP: Automated dependency updates not configured — manual monthly review
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-03-31)
- [x] `[npm]` `engines.node` set (2026-03-31) — >=18.0.0
- [x] `[npm]` Lockfile committed (2026-03-31)
- [ ] `[vsix]` SKIP: Not a VS Code extension
- [ ] `[desktop]` SKIP: Not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-03-31)
- [ ] `[all]` Translations (polyglot-mcp, 8 languages)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-03-31)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-03-31)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."

**Checking off:**
```
- [x] `[all]` SECURITY.md exists (2026-02-27)
```

**Skipping:**
```
- [ ] `[pypi]` SKIP: not a Python project
```
