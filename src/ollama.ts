/**
 * Ollama client wrapper for sensor-humor.
 * Handles chat completion with JSON schema enforcement,
 * retry logic, and debug logging.
 */

import { Ollama } from 'ollama';
import type { z } from 'zod';
import type { GenerationMetadata } from './types.js';

const DEFAULT_MODEL = 'qwen2.5:7b';
const DEFAULT_TEMPERATURE = 0.55;
const DEFAULT_TOP_P = 0.85;
const DEFAULT_TOP_K = 40;
const DEFAULT_MIROSTAT = 2;
const DEFAULT_MIROSTAT_TAU = 5.0;
const MAX_PREDICT = 60;
const MAX_RETRIES = 1;

function getModel(): string {
  return process.env.SENSOR_HUMOR_MODEL ?? DEFAULT_MODEL;
}

function getOllamaHost(): string {
  return process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
}

function isDebug(): boolean {
  return process.env.SENSOR_HUMOR_DEBUG === 'true';
}

let _client: Ollama | null = null;

function getClient(): Ollama {
  if (!_client) {
    _client = new Ollama({ host: getOllamaHost() });
  }
  return _client;
}

export interface GenerateComedyOptions {
  /** Full system prompt (base + mood + state context). */
  systemPrompt: string;
  /** User-facing prompt (the actual request). */
  userPrompt: string;
  /** Zod schema for structured output validation. */
  schema: z.ZodType<unknown>;
  /** JSON schema object to pass to Ollama format parameter. */
  jsonSchema: Record<string, unknown>;
}

export interface GenerateComedyResult<T> {
  data: T;
  metadata?: GenerationMetadata;
}

/**
 * Call Ollama with structured JSON output.
 * Retries once on parse/validation failure, then falls back to a safe default.
 */
export async function generateComedy<T>(
  options: GenerateComedyOptions,
  fallback: T,
): Promise<GenerateComedyResult<T>> {
  const { systemPrompt, userPrompt, schema, jsonSchema } = options;
  const model = getModel();
  const debug = isDebug();
  const client = getClient();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();

    if (debug) {
      console.error(`[sensor-humor] Attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
      console.error(`[sensor-humor] Model: ${model}`);
      console.error(`[sensor-humor] System prompt:\n${systemPrompt}`);
      console.error(`[sensor-humor] User prompt:\n${userPrompt}`);
    }

    try {
      const response = await client.chat({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: jsonSchema,
        options: {
          temperature: DEFAULT_TEMPERATURE,
          top_p: DEFAULT_TOP_P,
          top_k: DEFAULT_TOP_K,
          mirostat: DEFAULT_MIROSTAT,
          mirostat_tau: DEFAULT_MIROSTAT_TAU,
          num_predict: MAX_PREDICT,
        },
      });

      const raw = response.message.content;
      const latencyMs = Date.now() - startMs;

      if (debug) {
        console.error(`[sensor-humor] Raw response:\n${raw}`);
        console.error(`[sensor-humor] Latency: ${latencyMs}ms`);
      }

      const parsed = JSON.parse(raw);
      const validated = schema.parse(parsed) as T;

      const metadata: GenerationMetadata | undefined = debug
        ? {
            model,
            temperature: DEFAULT_TEMPERATURE,
            tokens_in: response.prompt_eval_count ?? 0,
            tokens_out: response.eval_count ?? 0,
            latency_ms: latencyMs,
          }
        : undefined;

      return { data: validated, metadata };
    } catch (err) {
      if (debug) {
        console.error(`[sensor-humor] Attempt ${attempt + 1} failed:`, err);
      }
      if (attempt === MAX_RETRIES) {
        if (debug) {
          console.error('[sensor-humor] All retries exhausted, returning fallback');
        }
        return { data: fallback };
      }
    }
  }

  // Unreachable, but TypeScript wants it
  return { data: fallback };
}
