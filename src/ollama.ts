/**
 * Ollama client wrapper for sensor-humor.
 * Handles chat completion with JSON schema enforcement,
 * retry logic, and debug logging.
 */

import { createHash } from 'node:crypto';
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
/** Default retry budget (one retry after the first attempt). Env-overridable via getMaxRetries(). */
const DEFAULT_MAX_RETRIES = 1;
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

/**
 * Resolve the retry budget, env-overridable via SENSOR_HUMOR_MAX_RETRIES (clamped 0..3).
 * Every other generation knob (timeout, temperature) is env-tunable; this one was a hardcoded
 * const. 0 disables retries (single attempt); the ceiling of 3 caps worst-case latency on a
 * flapping backend. Invalid/absent falls back to the default with a debug-gated log.
 */
export function getMaxRetries(): number {
  const env = process.env.SENSOR_HUMOR_MAX_RETRIES;
  if (env === undefined) return DEFAULT_MAX_RETRIES;
  const n = Number.parseInt(env, 10);
  if (!Number.isFinite(n) || n < 0 || n > 3) {
    if (isDebug()) {
      console.error(
        `[sensor-humor] Invalid SENSOR_HUMOR_MAX_RETRIES="${env}" (want 0..3); falling back to ${DEFAULT_MAX_RETRIES}`,
      );
    }
    return DEFAULT_MAX_RETRIES;
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

/**
 * Full-trace capture flag (ROADMAP v2.0 "Chain Trace Tool"). Read here directly from the env — the
 * same knob session.fullTraceEnabled() reads — so generateComedy can decide whether to attach the
 * heavy raw_output field without importing from session.ts (avoids coupling; mirrors isDebug()).
 */
export function isFullTrace(): boolean {
  return process.env.SENSOR_HUMOR_FULL_TRACE === 'true';
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

/** Size of the recent-outcome ring — enough to reflect a current-window fallback rate without
 *  smearing a fresh outage across the whole cumulative history. */
const RECENT_WINDOW = 20;
/** How many consecutive fallbacks before we escalate ONCE to stderr (degrade loudly, not per-call). */
const CONSECUTIVE_FALLBACK_ALERT = 5;

/** Lightweight in-process generation stats, surfaced by the debug_status tool. */
export interface OllamaStats {
  total_calls: number;
  fallback_calls: number;
  /** Count of safety-filter substitutions (slur/simile/meta-leak) across all tools — a distinct
   *  degradation class from backend fallbacks, and the key content-trust signal for an operator. */
  safety_filter_fires: number;
  /** fallback_calls / total_calls over the whole process lifetime (0 when total_calls===0). A
   *  cumulative counter alone can't answer "how bad is it right now" — this is the lifetime ratio. */
  fallback_rate: number;
  /** Fallback ratio over the last ~RECENT_WINDOW calls only, so a fresh outage shows immediately
   *  instead of being diluted by a long healthy history (0 when the window is empty). */
  fallback_rate_recent: number;
  /** Fallbacks since the last successful generate — resets to 0 on any success. A sustained,
   *  silent degradation shows here as a climbing number even while total counts look fine. */
  consecutive_fallbacks: number;
  /** Epoch ms of the last successful (non-fallback) generate, or undefined if none yet. */
  last_success_ts?: number;
  last_fallback_reason?: DegradedReason;
  last_latency_ms?: number;
}

interface InternalStats {
  total_calls: number;
  fallback_calls: number;
  safety_filter_fires: number;
  consecutive_fallbacks: number;
  last_success_ts?: number;
  last_fallback_reason?: DegradedReason;
  last_latency_ms?: number;
}

const _stats: InternalStats = {
  total_calls: 0,
  fallback_calls: 0,
  safety_filter_fires: 0,
  consecutive_fallbacks: 0,
};

/** Ring of the last RECENT_WINDOW call outcomes (true = fell back). Kept separate from the
 *  cumulative counters so fallback_rate_recent reflects the current window, not all of history. */
const _recentOutcomes: boolean[] = [];
/** Have we already emitted the escalation line for the CURRENT consecutive-fallback streak?
 *  Latches so we warn once on crossing the threshold, not on every subsequent fallback (no spam);
 *  cleared on the next success. */
let _consecutiveAlertFired = false;

function pushOutcome(fellBack: boolean): void {
  _recentOutcomes.push(fellBack);
  if (_recentOutcomes.length > RECENT_WINDOW) _recentOutcomes.shift();
}

/** Record a fallback outcome and drive the consecutive-fallback escalation (degrade loudly). */
function recordFallback(reason: DegradedReason): void {
  _stats.fallback_calls++;
  _stats.last_fallback_reason = reason;
  _stats.consecutive_fallbacks++;
  pushOutcome(true);
  // Escalate exactly once when the streak first crosses the threshold — one loud line, not
  // per-call spam. The latch resets on the next success so a new streak can alert again.
  if (_stats.consecutive_fallbacks >= CONSECUTIVE_FALLBACK_ALERT && !_consecutiveAlertFired) {
    _consecutiveAlertFired = true;
    console.error(
      `[sensor-humor] DEGRADED: ${_stats.consecutive_fallbacks} consecutive Ollama fallbacks ` +
        `(last reason: ${reason}). Comedy tools are serving canned fallbacks — check the backend ` +
        `(model pulled? OLLAMA_HOST reachable?). Set SENSOR_HUMOR_DEBUG=true for per-call detail.`,
    );
  }
}

/** Record a successful generate: reset the degradation streak and stamp the success time. */
function recordSuccess(latencyMs: number): void {
  _stats.last_latency_ms = latencyMs;
  _stats.last_success_ts = Date.now();
  _stats.consecutive_fallbacks = 0;
  _consecutiveAlertFired = false;
  pushOutcome(false);
}

/** Read a snapshot of generation stats (does not perform any live Ollama call). */
export function getOllamaStats(): OllamaStats {
  const fallback_rate = _stats.total_calls === 0 ? 0 : _stats.fallback_calls / _stats.total_calls;
  const fallback_rate_recent =
    _recentOutcomes.length === 0
      ? 0
      : _recentOutcomes.filter((b) => b).length / _recentOutcomes.length;
  return {
    total_calls: _stats.total_calls,
    fallback_calls: _stats.fallback_calls,
    safety_filter_fires: _stats.safety_filter_fires,
    fallback_rate,
    fallback_rate_recent,
    consecutive_fallbacks: _stats.consecutive_fallbacks,
    last_success_ts: _stats.last_success_ts,
    last_fallback_reason: _stats.last_fallback_reason,
    last_latency_ms: _stats.last_latency_ms,
  };
}

/** Reset all in-process generation stats. Test-only seam so ring-window and streak assertions
 *  start from a known-clean baseline (the counters are module-global and otherwise accrete). */
export function resetOllamaStats(): void {
  _stats.total_calls = 0;
  _stats.fallback_calls = 0;
  _stats.safety_filter_fires = 0;
  _stats.consecutive_fallbacks = 0;
  _stats.last_success_ts = undefined;
  _stats.last_fallback_reason = undefined;
  _stats.last_latency_ms = undefined;
  _recentOutcomes.length = 0;
  _consecutiveAlertFired = false;
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

/**
 * Short, stable fingerprint of the ACTIVE prompt for a generation (ROADMAP v2.0 trace's
 * prompt_hash). Binds the resolved model + temperature + the full system prompt (which already
 * carries base + mood + session state), so two runs' outputs are attributable to a
 * prompt-vs-model change deterministically. Mirrors the sha256(...).slice(0,12) idiom used by
 * debug_status in index.ts. Exported so callers/tests can reproduce or assert it.
 */
export function promptFingerprint(systemPrompt: string): string {
  return createHash('sha256')
    .update(`${getModel()}|${getTemperature()}|${systemPrompt}`)
    .digest('hex')
    .slice(0, 12);
}

export interface GenerateComedyResult<T> {
  data: T;
  metadata?: GenerationMetadata;
  fallback_reason?: DegradedReason;
  /**
   * ── Additive trace metadata (ROADMAP v2.0 "Chain Trace Tool") ──
   * The generation facts only the client knows, threaded back so each comedy tool can record ONE
   * trace entry without re-deriving them. All optional so existing callers/destructuring and a
   * mocked generateComedy (which returns just { data }) are unaffected.
   */
  /** Number of attempts actually used (1 = succeeded first try, no retry). */
  retries?: number;
  /** Fingerprint of the active prompt (see promptFingerprint) — the trace's prompt_hash. */
  prompt_fingerprint?: string;
  /** End-to-end latency of the winning (or last) attempt, in ms. */
  latency_ms?: number;
  /**
   * Raw model output string, captured ONLY under SENSOR_HUMOR_FULL_TRACE so the trace ring stays
   * small by default. Undefined on the happy path when full-trace is off, and on fallback.
   */
  raw_output?: string;
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
  const maxRetries = getMaxRetries();
  const debug = isDebug();
  const fullTrace = isFullTrace();
  // Fingerprint the active prompt once — it's stable across attempts (systemPrompt is fixed for
  // this call), and is the trace's prompt_hash. Always computed (cheap, and the light trace fields
  // are always populated). (ROADMAP v2.0 "Chain Trace Tool")
  const fingerprint = promptFingerprint(systemPrompt);
  _stats.total_calls++;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startMs = Date.now();

    if (debug) {
      console.error(`[sensor-humor] Attempt ${attempt + 1}/${maxRetries + 1}`);
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
      // Abort is driven solely by the custom fetch wrapper in buildClientConfig, which merges
      // controller.signal into every fetch init. A request-level `signal` on chat() is a no-op
      // on non-streamed calls (the ollama client never reads it), so it is deliberately omitted
      // here — do NOT re-add it and do NOT remove the fetch wrapper, or timeout cancellation
      // silently breaks (A-BK-002 / server-002).
      const chatPromise = client.chat({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: jsonSchema,
        options: {
          temperature,
          top_p: DEFAULT_TOP_P,
          top_k: DEFAULT_TOP_K,
          mirostat: DEFAULT_MIROSTAT,
          mirostat_tau: DEFAULT_MIROSTAT_TAU,
          num_predict: numPredict ?? MAX_PREDICT,
        },
      });
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

      // Guard the JSON root before the trim loop. A model/proxy can return a bare string,
      // null, or an array as the top-level value; Object.keys(null) throws, and assigning
      // to a string's read-only index throws in ESM strict mode. Either TypeError would be
      // classified 'unknown', mislabeling a structurally-invalid response and burning the
      // retry with the wrong degraded_reason. Throw a SyntaxError so classifyError reports
      // 'json-parse' truthfully — a non-object root is a structural parse failure. (server-001)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SyntaxError('Model returned non-object JSON');
      }

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

      recordSuccess(latencyMs);
      return {
        data: validated,
        metadata,
        // Additive trace metadata (ROADMAP v2.0). retries = attempts USED (1-based); raw_output is
        // attached only under full-trace to keep the default trace ring small.
        retries: attempt + 1,
        prompt_fingerprint: fingerprint,
        latency_ms: latencyMs,
        ...(fullTrace ? { raw_output: raw } : {}),
      };
    } catch (err) {
      const errType = classifyError(err);
      if (debug) {
        console.error(`[sensor-humor] Attempt ${attempt + 1} failed [${errType}]:`, (err as Error).message);
      }
      if (attempt === maxRetries) {
        if (debug) {
          console.error(`[sensor-humor] All retries exhausted (last: ${errType}), returning fallback`);
        }
        recordFallback(errType);
        // Attach trace metadata to the fallback too, so a degraded call still records a full trace
        // entry. retries = attempts made (attempt + 1); no raw_output (there was no valid output).
        return {
          data: fallback,
          fallback_reason: errType,
          retries: attempt + 1,
          prompt_fingerprint: fingerprint,
        };
      }
      // A throttled (429) or 5xx response retried instantly just re-hits the same limit; honor
      // the classification with a short backoff before the bounded retry. (BK-B-07)
      if (errType === 'rate-limit' || errType === 'server') {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
      }
    }
  }

  // TypeScript exhaustiveness guard — loop always returns or falls through to the catch block's return
  recordFallback('exhausted');
  return {
    data: fallback,
    fallback_reason: 'exhausted',
    retries: maxRetries + 1,
    prompt_fingerprint: fingerprint,
  };
}
