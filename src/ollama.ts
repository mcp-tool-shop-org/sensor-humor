/**
 * Ollama client wrapper for sensor-humor.
 * Handles chat completion with JSON schema enforcement,
 * retry logic, and debug logging.
 */

import { Ollama } from 'ollama';
import type { z } from 'zod';
import type { DegradedReason, GenerationMetadata } from './types.js';

const DEFAULT_MODEL = 'qwen2.5:7b';
const DEFAULT_TEMPERATURE = 0.55;
const DEFAULT_TOP_P = 0.85;
const DEFAULT_TOP_K = 40;
const DEFAULT_MIROSTAT = 2;
const DEFAULT_MIROSTAT_TAU = 5.0;
const MAX_PREDICT = 60;
const MAX_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Backoff before retrying a throttled/5xx response — an instant retry just re-hits the limit. */
const RETRY_BACKOFF_MS = 400;

export function getTimeoutMs(): number {
  const env = process.env.SENSOR_HUMOR_TIMEOUT_MS;
  if (env === undefined) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(env, 10);
  if (!Number.isFinite(n) || n <= 0) {
    if (isDebug()) {
      console.error(
        `[sensor-humor] Invalid SENSOR_HUMOR_TIMEOUT_MS="${env}"; falling back to ${DEFAULT_TIMEOUT_MS}ms`,
      );
    }
    return DEFAULT_TIMEOUT_MS;
  }
  return n;
}

/** Resolve the generation temperature, env-overridable for A/B sweeps (clamped 0.0-2.0). */
export function getTemperature(): number {
  const env = process.env.SENSOR_HUMOR_TEMPERATURE;
  if (env === undefined) return DEFAULT_TEMPERATURE;
  const n = Number.parseFloat(env);
  if (!Number.isFinite(n) || n < 0 || n > 2) {
    if (isDebug()) {
      console.error(
        `[sensor-humor] Invalid SENSOR_HUMOR_TEMPERATURE="${env}"; falling back to ${DEFAULT_TEMPERATURE}`,
      );
    }
    return DEFAULT_TEMPERATURE;
  }
  return n;
}

function classifyError(err: unknown): DegradedReason {
  if (err instanceof SyntaxError) return 'json-parse';
  if (err instanceof Error) {
    const msg = err.message;
    // HTTP errors from the ollama client surface as ResponseError with a status_code.
    if (err.name === 'ResponseError') {
      const status = (err as { status_code?: number }).status_code;
      if (status === 401 || status === 403) return 'auth';
      if (status === 429) return 'rate-limit';
      if (typeof status === 'number' && status >= 500) return 'server';
      if (/not found/i.test(msg)) return 'model-not-found';
      return 'http';
    }
    if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET/.test(msg)) return 'connection';
    if (/Ollama timeout after|timeout|abort/i.test(msg)) return 'timeout';
    if (err.name === 'ZodError' || /ZodError/.test(msg)) return 'validation';
  }
  return 'unknown';
}

const DEFAULT_HOST = 'http://127.0.0.1:11434';

export function getModel(): string {
  const env = process.env.SENSOR_HUMOR_MODEL;
  if (env === undefined) return DEFAULT_MODEL;
  const trimmed = env.trim();
  if (trimmed === '') {
    // An empty/whitespace model would surface later as an opaque model-not-found; name it now.
    if (isDebug()) {
      console.error(`[sensor-humor] SENSOR_HUMOR_MODEL is empty/whitespace; using default "${DEFAULT_MODEL}"`);
    }
    return DEFAULT_MODEL;
  }
  return trimmed;
}

export function getOllamaHost(): string {
  const env = process.env.OLLAMA_HOST;
  if (env === undefined) return DEFAULT_HOST;
  const trimmed = env.trim();
  if (trimmed === '') return DEFAULT_HOST;
  try {
    new URL(trimmed); // validate so a malformed host fails loudly here, not as an opaque connection error
  } catch {
    if (isDebug()) {
      console.error(`[sensor-humor] Invalid OLLAMA_HOST="${env}"; using default "${DEFAULT_HOST}"`);
    }
    return DEFAULT_HOST;
  }
  return trimmed;
}

export function isDebug(): boolean {
  return process.env.SENSOR_HUMOR_DEBUG === 'true';
}

/** True when an Ollama API key is configured (for a remote/cloud OLLAMA_HOST). */
export function hasApiKey(): boolean {
  return !!process.env.OLLAMA_API_KEY;
}

/**
 * Build the Ollama client config (host + optional cloud auth header), optionally
 * threading a per-call AbortSignal into a custom fetch. The ollama client does NOT
 * forward a signal to the underlying fetch on non-streamed requests, so to make a
 * call genuinely abortable (not merely raced) we wrap fetch and merge the signal
 * into every request init. The key is never logged, persisted, or echoed. (A-BK-002)
 */
function buildClientConfig(signal?: AbortSignal): ConstructorParameters<typeof Ollama>[0] {
  const apiKey = process.env.OLLAMA_API_KEY;
  return {
    host: getOllamaHost(),
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    ...(signal
      ? {
          fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
            fetch(input, { ...init, signal })) as typeof fetch,
        }
      : {}),
  };
}

/**
 * A client bound to a single call's AbortController. Every live path builds a fresh client per
 * call so the abort signal can be threaded into the custom fetch (the ollama client does not
 * forward a signal to fetch on non-streamed requests) — there is no shared cached client. (A-BK-002)
 */
function getAbortableClient(signal: AbortSignal): Ollama {
  return new Ollama(buildClientConfig(signal));
}

/** Lightweight in-process generation stats, surfaced by the debug_status tool. */
export interface OllamaStats {
  total_calls: number;
  fallback_calls: number;
  /** Count of safety-filter substitutions (slur/simile/meta-leak) across all tools — a distinct
   *  degradation class from backend fallbacks, and the key content-trust signal for an operator. */
  safety_filter_fires: number;
  last_fallback_reason?: DegradedReason;
  last_latency_ms?: number;
}

const _stats: OllamaStats = { total_calls: 0, fallback_calls: 0, safety_filter_fires: 0 };

/** Read a snapshot of generation stats (does not perform any live Ollama call). */
export function getOllamaStats(): OllamaStats {
  return { ..._stats };
}

/**
 * Record that a tool-layer safety gate substituted a line (slur/simile/meta-leak). The tools call
 * this when a terminal gate fires, so debug_status can surface how often the safety floor is firing
 * — invisible otherwise, since these substitutions happen above the generateComedy layer.
 */
export function recordSafetyFilterFire(): void {
  _stats.safety_filter_fires++;
}

/** Best-effort liveness probe: is Ollama reachable, and is the configured model pulled? */
export async function probeOllama(
  timeoutMs = 3000,
): Promise<{ reachable: boolean; model_available: boolean; model: string; reason?: string }> {
  const model = getModel();
  try {
    // Per-call AbortController so the timeout branch cancels the underlying list()
    // request instead of leaking the socket on a hung backend. (A-BK-002)
    const controller = new AbortController();
    const client = getAbortableClient(controller.signal);
    let handle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject(new Error(`Ollama timeout after ${timeoutMs}ms`)), timeoutMs);
      handle.unref?.();
    });
    let res: Awaited<ReturnType<typeof client.list>>;
    try {
      res = await Promise.race([client.list(), timeout]);
    } finally {
      clearTimeout(handle);
      // Cancel the underlying request whether the timeout won or list() threw.
      controller.abort();
    }
    const names = (res.models ?? []).map((m) => (m as { name?: string; model?: string }).name ?? (m as { model?: string }).model ?? '');
    const model_available = names.some(
      (n) => n === model || n === `${model}:latest` || n.startsWith(`${model}:`),
    );
    return { reachable: true, model_available, model };
  } catch (err) {
    return { reachable: false, model_available: false, model, reason: classifyError(err) };
  }
}

export interface GenerateComedyOptions<T> {
  /** Full system prompt (base + mood + state context). */
  systemPrompt: string;
  /** User-facing prompt (the actual request). */
  userPrompt: string;
  /** Zod schema for structured output validation. */
  schema: z.ZodType<T>;
  /** JSON schema object to pass to Ollama format parameter. */
  jsonSchema: Record<string, unknown>;
  /** Override num_predict for this call (e.g., heckle uses 40). */
  numPredict?: number;
}

export interface GenerateComedyResult<T> {
  data: T;
  metadata?: GenerationMetadata;
  fallback_reason?: DegradedReason;
}

/**
 * Call Ollama with structured JSON output.
 * Retries once on parse/validation failure, then falls back to a safe default.
 */
export async function generateComedy<T>(
  options: GenerateComedyOptions<T>,
  fallback: T,
): Promise<GenerateComedyResult<T>> {
  const { systemPrompt, userPrompt, schema, jsonSchema, numPredict } = options;
  const model = getModel();
  const temperature = getTemperature();
  const debug = isDebug();
  _stats.total_calls++;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();

    if (debug) {
      console.error(`[sensor-humor] Attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
      console.error(`[sensor-humor] Model: ${model}`);
      console.error(`[sensor-humor] System prompt:\n${systemPrompt}`);
      console.error(`[sensor-humor] User prompt:\n${userPrompt}`);
    }

    // Per-attempt AbortController so a winning timeout cancels the underlying socket
    // instead of leaking it on a hung backend. The signal is threaded both onto the
    // request and into the client's fetch (the ollama client does not forward a signal
    // to fetch on non-streamed calls). (A-BK-002)
    const controller = new AbortController();
    const client = getAbortableClient(controller.signal);
    try {
      const timeoutMs = getTimeoutMs();
      const chatPromise = client.chat({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: jsonSchema,
        signal: controller.signal,
        options: {
          temperature,
          top_p: DEFAULT_TOP_P,
          top_k: DEFAULT_TOP_K,
          mirostat: DEFAULT_MIROSTAT,
          mirostat_tau: DEFAULT_MIROSTAT_TAU,
          num_predict: numPredict ?? MAX_PREDICT,
        },
      } as Parameters<typeof client.chat>[0]);
      // The timeout timer is cleared in the finally below so a winning chat
      // never leaves a dangling timer holding the event loop open (BK-03).
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Ollama timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
        timeoutHandle.unref?.();
      });
      let response: Awaited<typeof chatPromise>;
      try {
        response = await Promise.race([chatPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
        // Cancel the underlying request whether the timeout won or chat() rejected,
        // so a hung backend never leaks the socket past this call.
        controller.abort();
      }

      const raw = response.message.content;
      const latencyMs = Date.now() - startMs;

      if (debug) {
        console.error(`[sensor-humor] Raw response:\n${raw}`);
        console.error(`[sensor-humor] Latency: ${latencyMs}ms`);
      }

      const parsed = JSON.parse(raw);

      // Trim surrounding whitespace from string fields. JSON.parse already guarantees
      // balanced delimiters, so we must NOT strip trailing braces — doing so silently
      // corrupted legitimate output ending in '}' (e.g. a roast of "function(){}"). (BK-02)
      for (const key of Object.keys(parsed)) {
        if (typeof parsed[key] === 'string') {
          parsed[key] = parsed[key].trim();
        }
      }

      const validated = schema.parse(parsed) as T;

      const metadata: GenerationMetadata | undefined = debug
        ? {
            model,
            temperature,
            tokens_in: response.prompt_eval_count ?? 0,
            tokens_out: response.eval_count ?? 0,
            latency_ms: latencyMs,
          }
        : undefined;

      _stats.last_latency_ms = latencyMs;
      return { data: validated, metadata };
    } catch (err) {
      const errType = classifyError(err);
      if (debug) {
        console.error(`[sensor-humor] Attempt ${attempt + 1} failed [${errType}]:`, (err as Error).message);
      }
      if (attempt === MAX_RETRIES) {
        if (debug) {
          console.error(`[sensor-humor] All retries exhausted (last: ${errType}), returning fallback`);
        }
        _stats.fallback_calls++;
        _stats.last_fallback_reason = errType;
        return { data: fallback, fallback_reason: errType };
      }
      // A throttled (429) or 5xx response retried instantly just re-hits the same limit; honor
      // the classification with a short backoff before the bounded retry. (BK-B-07)
      if (errType === 'rate-limit' || errType === 'server') {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
      }
    }
  }

  // TypeScript exhaustiveness guard — loop always returns or falls through to the catch block's return
  _stats.fallback_calls++;
  _stats.last_fallback_reason = 'exhausted';
  return { data: fallback, fallback_reason: 'exhausted' };
}
