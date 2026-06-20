import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

const mockChat = vi.fn();

// Mock the ollama module before any imports that use it
vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
}));

// Must import AFTER mock setup
const { generateComedy, getTemperature } = await import('../src/ollama.js');

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
});
