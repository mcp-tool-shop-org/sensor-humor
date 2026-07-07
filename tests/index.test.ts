import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

describe('index module', () => {
  it('package.json version matches server version constant', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    // Anchor to the McpServer constructor so we read the SERVER version specifically.
    const src = readFileSync('src/index.ts', 'utf-8');
    const versionMatch = src.match(/new McpServer\(\{[\s\S]*?version:\s*'([^']+)'/);
    expect(versionMatch).not.toBeNull();
    expect(versionMatch![1]).toBe(pkg.version);
  });

  it('registers all 11 tools', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    const toolRegistrations = src.match(/server\.tool\(/g);
    expect(toolRegistrations).not.toBeNull();
    // 10 original + debug_chain (ROADMAP v2.0 "Chain Trace Tool").
    expect(toolRegistrations!.length).toBe(11);
  });

  it('registers the debug_chain trace tool', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain("'debug_chain'");
    // It returns the session's trace ring, newest-first.
    expect(src).toContain('session.getTraces(');
  });

  it('startup log message matches package version exactly', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain(`MCP server v${pkg.version} running on stdio`);
  });

  it('includes Ollama health check function', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain('checkOllamaHealth');
  });

  it('registers shutdown signal handlers', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain("process.on('SIGINT'");
    expect(src).toContain("process.on('SIGTERM'");
  });

  // b-server-004: the startup health check hid the AUTH case behind the generic "not reachable"
  // line. It must branch on probe.reason === 'auth' and name OLLAMA_API_KEY specifically.
  it('checkOllamaHealth branches on the auth reason and names OLLAMA_API_KEY', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toMatch(/probe\.reason\s*===\s*'auth'/);
    // The auth branch must name the actionable env var (mirrors ERROR_HINTS.auth).
    const authBranch = src.slice(src.indexOf("probe.reason === 'auth'"));
    expect(authBranch).toContain('OLLAMA_API_KEY');
  });

  // b-tools-003: debug_status previously dumped only running_gags_count. It must now surface gag
  // CONTENTS via the session.recentGags() accessor.
  it('debug_status surfaces running_gags contents via recentGags()', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain('session.recentGags()');
    expect(src).toMatch(/running_gags:\s*session\.recentGags\(\)/);
  });

  it('all four previously-bare handlers return the structured error shape on throw (A-BK-003)', async () => {
    // mood_get, catchphrase_callback, debug_status, and session_reset used to lack a
    // try/catch, so an unexpected throw leaked a raw SDK message instead of the studio
    // Structured Error Shape. Force each underlying call to throw and assert each handler
    // returns { isError, content:[ JSON {code,message,hint,retryable} ] } via toolError().

    // Capture every handler registered by index.ts without standing up real stdio.
    const handlers = new Map<string, (...args: unknown[]) => unknown>();

    vi.resetModules();

    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: vi.fn().mockImplementation(() => ({})),
    }));

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const toolSpy = vi
      .spyOn(McpServer.prototype, 'tool')
      .mockImplementation(function (this: unknown, name: string, ...rest: unknown[]) {
        // The handler is always the last argument across every tool() overload.
        handlers.set(name, rest[rest.length - 1] as (...args: unknown[]) => unknown);
        return {} as never;
      });
    // Don't actually connect a transport (would hang the test process).
    const connectSpy = vi
      .spyOn(McpServer.prototype, 'connect')
      .mockResolvedValue(undefined as never);

    // Force the dependencies each handler calls to throw, exercising the new catch arms.
    vi.doMock('../src/session.js', () => ({
      getSession: () => {
        throw new Error('boom: session backend exploded');
      },
      resetSession: () => {
        throw new Error('boom: reset failed');
      },
    }));
    vi.doMock('../src/tools/mood.js', () => ({
      moodSet: vi.fn(),
      moodGet: () => {
        throw new Error('boom: moodGet failed');
      },
    }));
    vi.doMock('../src/tools/catchphrase.js', () => ({
      catchphraseGenerate: vi.fn(),
      catchphraseCallback: () => {
        throw new Error('boom: callback failed');
      },
    }));

    await import('../src/index.js');

    const checkStructuredError = async (name: string) => {
      const handler = handlers.get(name);
      expect(handler, `handler for ${name} should be registered`).toBeDefined();
      const result = (await handler!({}, {})) as {
        isError?: boolean;
        content: Array<{ type: string; text: string }>;
      };
      expect(result.isError, `${name} must flag isError`).toBe(true);
      const body = JSON.parse(result.content[0].text);
      // Structured Error Shape: { code, message, hint, retryable }
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
      expect(typeof body.hint).toBe('string');
      expect(typeof body.retryable).toBe('boolean');
      // Never a raw stack trace.
      expect(body.message).not.toMatch(/\bat \w+.*\(.*:\d+:\d+\)/);
    };

    await checkStructuredError('mood_get');
    await checkStructuredError('catchphrase_callback');
    await checkStructuredError('debug_status');
    await checkStructuredError('session_reset');

    toolSpy.mockRestore();
    connectSpy.mockRestore();
    vi.doUnmock('../src/session.js');
    vi.doUnmock('../src/tools/mood.js');
    vi.doUnmock('../src/tools/catchphrase.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  });

  // Behavioral debug_status test: exercises the real handler with a real session and a stubbed
  // probe, asserting the NEW observability fields actually appear in the emitted JSON —
  // running_gags CONTENTS (b-tools-003), eviction counters (b-tools-006), and the generation
  // stats block carrying fallback_rate / consecutive_fallbacks (b-server-001 / b-server-002).
  it('debug_status output includes gag contents, eviction counters, and generation rate stats', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.resetModules();

    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: vi.fn().mockImplementation(() => ({})),
    }));

    // A real session seeded with a gag so recentGags() has content to surface.
    const { Session } = await import('../src/session.js');
    const realSession = new Session();
    realSession.tick();
    realSession.addGag('the deadbeef incident', 'deadbeef');
    vi.doMock('../src/session.js', async () => {
      const actual = await vi.importActual<typeof import('../src/session.js')>('../src/session.js');
      return { ...actual, getSession: () => realSession, resetSession: () => realSession };
    });

    // Stub the probe so no live Ollama call happens and the branch is deterministic.
    vi.doMock('../src/ollama.js', async () => {
      const actual = await vi.importActual<typeof import('../src/ollama.js')>('../src/ollama.js');
      return {
        ...actual,
        probeOllama: async () => ({ reachable: true, model_available: true, model: 'qwen2.5:7b' }),
      };
    });

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const toolSpy = vi
      .spyOn(McpServer.prototype, 'tool')
      .mockImplementation(function (this: unknown, name: string, ...rest: unknown[]) {
        handlers.set(name, rest[rest.length - 1] as (...args: unknown[]) => unknown);
        return {} as never;
      });
    const connectSpy = vi
      .spyOn(McpServer.prototype, 'connect')
      .mockResolvedValue(undefined as never);

    await import('../src/index.js');

    const handler = handlers.get('debug_status');
    expect(handler).toBeDefined();
    const result = (await handler!({}, {})) as { content: Array<{ text: string }> };
    const body = JSON.parse(result.content[0].text);

    // b-tools-003: gag CONTENTS (not just the count).
    expect(Array.isArray(body.running_gags)).toBe(true);
    expect(body.running_gags[0].tag).toBe('deadbeef');
    expect(body.running_gags[0].setup).toBe('the deadbeef incident');
    expect(body.running_gags[0]).toHaveProperty('used');
    expect(body.running_gags[0]).toHaveProperty('last_turn');

    // b-tools-006: eviction counters present in buffer_stats.
    expect(body.buffer_stats).toHaveProperty('gags_evicted');
    expect(body.buffer_stats).toHaveProperty('catchphrases_evicted');

    // b-server-001 / b-server-002: the generation block carries the new computed/streak fields.
    expect(body.generation).toHaveProperty('fallback_rate');
    expect(body.generation).toHaveProperty('fallback_rate_recent');
    expect(body.generation).toHaveProperty('consecutive_fallbacks');

    toolSpy.mockRestore();
    connectSpy.mockRestore();
    vi.doUnmock('../src/session.js');
    vi.doUnmock('../src/ollama.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  });

  // ROADMAP v2.0 "Chain Trace Tool" GATE: one debug_chain call reconstructs the generation
  // pipeline for a recent comedy output. Exercises the real handler against a real session seeded
  // with trace entries, asserting the emitted JSON carries the documented fields and that limit
  // returns the last N newest-first.
  it('debug_chain returns the trace ring newest-first as JSON and honors limit', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.resetModules();

    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: vi.fn().mockImplementation(() => ({})),
    }));

    // A real session seeded with three trace entries so getTraces() has content to surface.
    const { Session } = await import('../src/session.js');
    const realSession = new Session();
    for (let i = 1; i <= 3; i++) {
      realSession.tick();
      realSession.recordTrace({
        turn: realSession.turn_counter,
        tool: 'roast',
        mood: 'dry',
        input: `target ${i}`,
        prompt_fingerprint: `fp${i}`,
        retries: 1,
        validators_triggered: [],
        latency_ms: 10 * i,
      });
    }
    vi.doMock('../src/session.js', async () => {
      const actual = await vi.importActual<typeof import('../src/session.js')>('../src/session.js');
      return { ...actual, getSession: () => realSession, resetSession: () => realSession };
    });

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const toolSpy = vi
      .spyOn(McpServer.prototype, 'tool')
      .mockImplementation(function (this: unknown, name: string, ...rest: unknown[]) {
        handlers.set(name, rest[rest.length - 1] as (...args: unknown[]) => unknown);
        return {} as never;
      });
    const connectSpy = vi
      .spyOn(McpServer.prototype, 'connect')
      .mockResolvedValue(undefined as never);

    await import('../src/index.js');

    const handler = handlers.get('debug_chain');
    expect(handler).toBeDefined();

    // No limit => the full ring, newest-first (turn 3, then 2, then 1).
    const all = (await handler!({}, {})) as { content: Array<{ text: string }> };
    const allTraces = JSON.parse(all.content[0].text);
    expect(Array.isArray(allTraces)).toBe(true);
    expect(allTraces).toHaveLength(3);
    expect(allTraces[0].turn).toBe(3);
    expect(allTraces[2].turn).toBe(1);
    // Documented fields present — the pipeline is reconstructable from one call.
    expect(allTraces[0].tool).toBe('roast');
    expect(allTraces[0].mood).toBe('dry');
    expect(allTraces[0].input).toBe('target 3');
    expect(allTraces[0].prompt_fingerprint).toBe('fp3');
    expect(allTraces[0]).toHaveProperty('retries');
    expect(allTraces[0]).toHaveProperty('validators_triggered');
    expect(allTraces[0]).toHaveProperty('latency_ms');

    // limit=1 => just the newest.
    const one = (await handler!({ limit: 1 }, {})) as { content: Array<{ text: string }> };
    const oneTrace = JSON.parse(one.content[0].text);
    expect(oneTrace).toHaveLength(1);
    expect(oneTrace[0].turn).toBe(3);

    toolSpy.mockRestore();
    connectSpy.mockRestore();
    vi.doUnmock('../src/session.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  });
});
