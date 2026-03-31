import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mockChat = vi.fn();

// Mock the ollama module before any imports that use it
vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
}));

// Must import AFTER mock setup
const { generateComedy } = await import('../src/ollama.js');

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

  it('strips trailing JSON artifact braces from string fields', async () => {
    mockChat.mockResolvedValue({
      message: { content: '{"text": "hello}}}"}' },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('hello');
  });

  it('returns fallback on network error after retries', async () => {
    mockChat.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await generateComedy<TestResult>(makeOptions(), fallback);
    expect(result.data.text).toBe('fallback');
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});
