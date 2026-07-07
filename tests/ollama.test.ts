import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

const mockChat = vi.fn();
// The most recent custom `fetch` wrapper handed to the Ollama constructor. Abort is driven
// solely by this wrapper (buildClientConfig merges controller.signal into every fetch init),
// so tests that assert on cancellation inspect the wrapper, not the chat() request. (server-002)
let lastClientFetch: typeof fetch | undefined;

// Mock the ollama module before any imports that use it
vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation((config?: { fetch?: typeof fetch }) => {
    lastClientFetch = config?.fetch;
    return { chat: mockChat };
  }),
}));

// Must import AFTER mock setup
const { generateComedy, getTemperature, getMaxRetries, hasApiKey, getOllamaStats, resetOllamaStats } =
  await import('../src/ollama.js');

const TestSchema = z.object({
  text: z.string(),
});

type TestResult = z.infer<typeof TestSchema>;

const TEST_JSON_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
};

const fallback: TestResult = { text: 'fallback' };

function makeOptions() {
  return {
    systemPrompt: 'system',
    userPrompt: 'user',
    schema: TestSchema,
    jsonSchema: TEST_JSON_SCHEMA,
  };
}

describe('generateComedy', () => {
  beforeEach(() => {
    mockChat.mockReset();
    resetOllamaStats();
  });

  afterEach(() => {
    // Guard against a thrown assertion leaking the timeout env into later tests (TEST-09).
    delete process.env.SENSOR_HUMOR_TIMEOUT_MS;
  });

  it('returns parsed data on success', async () => {
    mockChat.mockResolvedValue({
      message: { content: '{"text": "hello"}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('hello');
  });

  it('returns fallback on JSON parse error after retries', async () => {
    mockChat.mockResolvedValue({
      message: { content: 'not json at all' },
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
    // MAX_RETRIES=1 means 2 attempts
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('returns fallback on schema validation failure after retries', async () => {
    mockChat.mockResolvedValue({
      message: { content: '{"wrong_key": 123}' },
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
  });

  it('retries once before falling back — second attempt succeeds', async () => {
    mockChat
      .mockResolvedValueOnce({ message: { content: 'bad json' } })
      .mockResolvedValueOnce({
        message: { content: '{"text": "retry worked"}' },
        prompt_eval_count: 10,
        eval_count: 5,
      });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('retry worked');
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('strips trailing whitespace from string fields', async () => {
    mockChat.mockResolvedValue({
      message: { content: '{"text": "hello   "}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('hello');
  });

  it('returns fallback when response has null required fields', async () => {
    mockChat.mockResolvedValue({
      message: { content: '{"text": null}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
  });

  it('classifies a non-object JSON root as json-parse (NOT unknown), no TypeError escapes (server-001)', async () => {
    // A model/proxy can return a JSON root that is a bare string, null, or an array. The
    // post-parse whitespace-trim loop assumes a plain object; iterating these throws a
    // TypeError (Object.keys(null), or assigning to a read-only string index in ESM strict
    // mode) that classifyError would mislabel 'unknown', silently burning the retry and
    // landing on the fallback with the wrong degraded_reason. The root guard must convert
    // this into a truthful 'json-parse' reason instead.
    const nonObjectRoots = ['"just a string"', 'null', '[1,2]'];
    for (const content of nonObjectRoots) {
      mockChat.mockReset();
      mockChat.mockResolvedValue({
        message: { content },
        prompt_eval_count: 10,
        eval_count: 5,
      });

      const result = await generateComedy<TestResult>(makeOptions(), fallback);

      // Fallback returned...
      expect(result.data.text).toBe('fallback');
      // ...with a TRUTHFUL structural reason, never the catch-all 'unknown' that a leaked
      // TypeError would have produced.
      expect(result.fallback_reason).toBe('json-parse');
      expect(result.fallback_reason).not.toBe('unknown');
      // Both attempts ran (the bad root burned through the bounded retry, then fell back).
      expect(mockChat).toHaveBeenCalledTimes(2);
    }
  });

  it('preserves braces that are part of legitimate content (no lossy brace-stripping)', async () => {
    // A code-comedy tool legitimately produces output ending in '}', e.g. a roast of
    // "function(){}". JSON.parse already guarantees balanced delimiters, so the content
    // must survive intact — the old trailing-brace stripper corrupted it. (BK-02)
    mockChat.mockResolvedValue({
      message: { content: '{"text": "your empty handler function(){}"}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('your empty handler function(){}');
  });

  it('adds a NaN/invalid SENSOR_HUMOR_TIMEOUT_MS guard (does not collapse to instant timeout)', async () => {
    // A fat-fingered non-numeric timeout must fall back to the default, NOT make every
    // call time out instantly (BK-01).
    process.env.SENSOR_HUMOR_TIMEOUT_MS = 'abc';
    mockChat.mockResolvedValue({
      message: { content: '{"text": "still works"}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('still works');

    delete process.env.SENSOR_HUMOR_TIMEOUT_MS;
  });

  it('returns fallback on network error after retries', async () => {
    mockChat.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('returns fallback on timeout after retries', async () => {
    // Set a very short timeout for testing
    process.env.SENSOR_HUMOR_TIMEOUT_MS = '10';

    // Mock a chat that takes too long
    mockChat.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
    expect(result.fallback_reason).toBeDefined();

    // Clean up
    delete process.env.SENSOR_HUMOR_TIMEOUT_MS;
  }, 10000);

  it('aborts the underlying request via the fetch wrapper when the timeout wins, not merely racing it (A-BK-002)', async () => {
    // A hung backend must not leak the socket: when the timeout beats the chat, the
    // per-call AbortController has to fire so the request is cancelled, not just dropped.
    // Cancellation is threaded through the custom fetch wrapper (buildClientConfig), NOT a
    // request-level signal on chat() — that field is a no-op on non-streamed calls and was
    // removed. So we drive the wrapper as the real ollama client would: call it with a bare
    // init and capture the signal it merges in. (server-002)
    process.env.SENSOR_HUMOR_TIMEOUT_MS = '10';

    const seenSignals: AbortSignal[] = [];
    // On each attempt, exercise the client's fetch wrapper (simulating the ollama client
    // issuing its HTTP request) and hang forever (simulating a stuck backend). The wrapper
    // must merge the per-call AbortController's signal into the fetch init; when the timeout
    // wins, that captured signal must become aborted.
    mockChat.mockImplementation(() => {
      const wrapper = lastClientFetch;
      if (wrapper) {
        wrapper('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
        } as RequestInit as never).catch(() => {
          /* swallow — the abort rejects this in-flight fetch, which is exactly the point */
        });
      }
      return new Promise(() => {
        /* never resolves — the backend is hung */
      });
    });

    // Capture the signal the wrapper hands to the real fetch by stubbing global fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((_input: unknown, init?: RequestInit) => {
      if (init?.signal) seenSignals.push(init.signal);
      return new Promise(() => {
        /* the underlying request also hangs until aborted */
      });
    }) as typeof fetch);

    try {
      const result = await generateComedy<TestResult>(makeOptions(), fallback);

      // Fallback is still returned (timer-cleanup + fallback behavior preserved).
      expect(result.data.text).toBe('fallback');
      expect(result.fallback_reason).toBeDefined();

      // The fetch wrapper must have threaded a signal into the underlying fetch...
      expect(seenSignals.length).toBeGreaterThan(0);
      // ...and abort() must have fired on every attempt's signal when its timeout won.
      expect(seenSignals.every((s) => s.aborted)).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.SENSOR_HUMOR_TIMEOUT_MS;
    }
  }, 10000);

  it('hasApiKey reflects OLLAMA_API_KEY presence (for cloud auth)', () => {
    delete process.env.OLLAMA_API_KEY;
    expect(hasApiKey()).toBe(false);
    process.env.OLLAMA_API_KEY = 'sk-test-key';
    expect(hasApiKey()).toBe(true);
    delete process.env.OLLAMA_API_KEY;
  });

  it('getTemperature defaults, reads valid overrides, and guards invalid/out-of-range', () => {
    delete process.env.SENSOR_HUMOR_TEMPERATURE;
    expect(getTemperature()).toBe(0.55);
    process.env.SENSOR_HUMOR_TEMPERATURE = '0.8';
    expect(getTemperature()).toBe(0.8);
    for (const bad of ['abc', '-1', '5', '']) {
      process.env.SENSOR_HUMOR_TEMPERATURE = bad;
      expect(getTemperature()).toBe(0.55);
    }
    delete process.env.SENSOR_HUMOR_TEMPERATURE;
  });

  it('classifies error reasons into the fallback_reason tag (table-driven)', async () => {
    const respErr = (msg: string, status: number) =>
      Object.assign(new Error(msg), { name: 'ResponseError', status_code: status });
    const cases: Array<[Error, string]> = [
      [new Error('connect ECONNREFUSED 127.0.0.1:11434'), 'connection'],
      [new Error('getaddrinfo EAI_AGAIN ollama.com'), 'connection'],
      [respErr('model "nope" not found', 404), 'model-not-found'],
      [respErr('unauthorized', 401), 'auth'],
      [respErr('too many requests', 429), 'rate-limit'],
      [respErr('internal server error', 500), 'server'],
    ];
    for (const [err, expected] of cases) {
      mockChat.mockReset();
      mockChat.mockRejectedValue(err);
      const result = await generateComedy<TestResult>(makeOptions(), fallback);
      expect(result.data.text).toBe('fallback');
      expect(result.fallback_reason).toBe(expected);
    }
  });

  // b-server-001: cumulative counters alone can't answer "how bad is it right now". A computed
  // fallback_rate (lifetime) plus a recent-window rate must both be exposed and correct.
  describe('fallback_rate + fallback_rate_recent (b-server-001)', () => {
    it('fallback_rate is 0 when no calls have been made (division guard)', () => {
      resetOllamaStats();
      const stats = getOllamaStats();
      expect(stats.total_calls).toBe(0);
      expect(stats.fallback_rate).toBe(0);
      expect(stats.fallback_rate_recent).toBe(0);
    });

    it('computes the lifetime fallback_rate from total vs fallback calls', async () => {
      resetOllamaStats();
      // 2 successes, 2 fallbacks => 0.5 lifetime rate.
      mockChat.mockResolvedValue({ message: { content: '{"text": "ok"}' }, prompt_eval_count: 1, eval_count: 1 });
      await generateComedy<TestResult>(makeOptions(), fallback);
      await generateComedy<TestResult>(makeOptions(), fallback);
      mockChat.mockReset();
      mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
      await generateComedy<TestResult>(makeOptions(), fallback);
      await generateComedy<TestResult>(makeOptions(), fallback);

      const stats = getOllamaStats();
      expect(stats.total_calls).toBe(4);
      expect(stats.fallback_calls).toBe(2);
      expect(stats.fallback_rate).toBeCloseTo(0.5, 5);
    });

    it('fallback_rate_recent tracks a bounded window, so a fresh outage shows immediately', async () => {
      resetOllamaStats();
      // Prime a long healthy history well beyond the recent window.
      mockChat.mockResolvedValue({ message: { content: '{"text": "ok"}' }, prompt_eval_count: 1, eval_count: 1 });
      for (let i = 0; i < 30; i++) await generateComedy<TestResult>(makeOptions(), fallback);
      expect(getOllamaStats().fallback_rate_recent).toBe(0);

      // Now the backend dies. After 20 straight fallbacks the recent window is ALL fallbacks (1.0)
      // even though the lifetime rate is diluted by the 30 prior successes.
      mockChat.mockReset();
      mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
      for (let i = 0; i < 20; i++) await generateComedy<TestResult>(makeOptions(), fallback);

      const stats = getOllamaStats();
      expect(stats.fallback_rate_recent).toBe(1);
      // Lifetime rate is 20/50 = 0.4 — the window signal is strictly louder than the cumulative one.
      expect(stats.fallback_rate).toBeCloseTo(0.4, 5);
      expect(stats.fallback_rate_recent).toBeGreaterThan(stats.fallback_rate);
    });
  });

  // b-server-002: a sustained silent degradation must show as consecutive_fallbacks + last_success_ts,
  // and must emit ONE loud escalation on crossing the threshold (not per-call spam).
  describe('consecutive_fallbacks + last_success_ts + degrade-loudly (b-server-002)', () => {
    it('increments consecutive_fallbacks on each fallback and resets to 0 on a success', async () => {
      resetOllamaStats();
      mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
      await generateComedy<TestResult>(makeOptions(), fallback);
      await generateComedy<TestResult>(makeOptions(), fallback);
      expect(getOllamaStats().consecutive_fallbacks).toBe(2);

      // A success clears the streak.
      mockChat.mockReset();
      mockChat.mockResolvedValue({ message: { content: '{"text": "ok"}' }, prompt_eval_count: 1, eval_count: 1 });
      await generateComedy<TestResult>(makeOptions(), fallback);
      expect(getOllamaStats().consecutive_fallbacks).toBe(0);
    });

    it('stamps last_success_ts on a successful generate (undefined before any success)', async () => {
      resetOllamaStats();
      expect(getOllamaStats().last_success_ts).toBeUndefined();
      const before = Date.now();
      mockChat.mockResolvedValue({ message: { content: '{"text": "ok"}' }, prompt_eval_count: 1, eval_count: 1 });
      await generateComedy<TestResult>(makeOptions(), fallback);
      const stats = getOllamaStats();
      expect(stats.last_success_ts).toBeGreaterThanOrEqual(before);
      expect(stats.last_success_ts).toBeLessThanOrEqual(Date.now());
    });

    it('emits exactly ONE escalation line when the streak crosses the threshold (no per-call spam)', async () => {
      resetOllamaStats();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
        // Threshold is 5. Drive 8 consecutive fallbacks; the DEGRADED line must fire once, at the crossing.
        for (let i = 0; i < 8; i++) await generateComedy<TestResult>(makeOptions(), fallback);
        const degradedLines = spy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('DEGRADED'),
        );
        expect(degradedLines).toHaveLength(1);
        expect(degradedLines[0][0]).toContain('consecutive Ollama fallbacks');
      } finally {
        spy.mockRestore();
      }
    });

    it('re-arms the escalation after a success interrupts the streak (a new streak can alert again)', async () => {
      resetOllamaStats();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // First streak of 5 -> one alert.
        mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
        for (let i = 0; i < 5; i++) await generateComedy<TestResult>(makeOptions(), fallback);
        // A success resets the latch.
        mockChat.mockReset();
        mockChat.mockResolvedValue({ message: { content: '{"text": "ok"}' }, prompt_eval_count: 1, eval_count: 1 });
        await generateComedy<TestResult>(makeOptions(), fallback);
        // Second streak of 5 -> a SECOND alert (latch was cleared by the success).
        mockChat.mockReset();
        mockChat.mockRejectedValue(new Error('ECONNREFUSED'));
        for (let i = 0; i < 5; i++) await generateComedy<TestResult>(makeOptions(), fallback);

        const degradedLines = spy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('DEGRADED'),
        );
        expect(degradedLines).toHaveLength(2);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // b-server-005: MAX_RETRIES was a hardcoded const while every other knob is env-tunable.
  describe('getMaxRetries env knob (b-server-005)', () => {
    afterEach(() => {
      delete process.env.SENSOR_HUMOR_MAX_RETRIES;
    });

    it('defaults to 1, reads valid overrides in 0..3, and guards invalid/out-of-range', () => {
      delete process.env.SENSOR_HUMOR_MAX_RETRIES;
      expect(getMaxRetries()).toBe(1);
      for (const [val, want] of [['0', 0], ['2', 2], ['3', 3]] as Array<[string, number]>) {
        process.env.SENSOR_HUMOR_MAX_RETRIES = val;
        expect(getMaxRetries()).toBe(want);
      }
      // Invalid or out-of-range -> default.
      for (const bad of ['abc', '-1', '4', '99', '']) {
        process.env.SENSOR_HUMOR_MAX_RETRIES = bad;
        expect(getMaxRetries()).toBe(1);
      }
    });

    it('SENSOR_HUMOR_MAX_RETRIES=0 makes generateComedy attempt exactly once (no retry)', async () => {
      resetOllamaStats();
      process.env.SENSOR_HUMOR_MAX_RETRIES = '0';
      mockChat.mockResolvedValue({ message: { content: 'not json' } });
      const result = await generateComedy<TestResult>(makeOptions(), fallback);
      expect(result.data.text).toBe('fallback');
      // Zero retries => a single attempt, not the default two.
      expect(mockChat).toHaveBeenCalledTimes(1);
    });

    it('SENSOR_HUMOR_MAX_RETRIES=3 allows up to four attempts before falling back', async () => {
      resetOllamaStats();
      process.env.SENSOR_HUMOR_MAX_RETRIES = '3';
      mockChat.mockResolvedValue({ message: { content: 'still not json' } });
      const result = await generateComedy<TestResult>(makeOptions(), fallback);
      expect(result.data.text).toBe('fallback');
      // 3 retries after the first attempt => 4 total.
      expect(mockChat).toHaveBeenCalledTimes(4);
    });
  });
});
