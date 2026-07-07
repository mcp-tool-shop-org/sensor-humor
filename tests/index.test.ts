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

  it('registers all 9 tools', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    const toolRegistrations = src.match(/server\.tool\(/g);
    expect(toolRegistrations).not.toBeNull();
    expect(toolRegistrations!.length).toBe(9);
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
});
