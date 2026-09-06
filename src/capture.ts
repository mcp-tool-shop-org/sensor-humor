/**
 * Dataset capture sink (opt-in) — the "comedic-moods" flywheel.
 *
 * When SENSOR_HUMOR_CAPTURE names a file, every comedy generation is appended there as one
 * JSON-Lines row, building a durable training/eval dataset over time. OFF by default (env var unset
 * or empty ⇒ no-op), mirroring the SENSOR_HUMOR_PERSIST opt-in. Best-effort like Session.save(): an
 * I/O error is never thrown into a comedy tool call — capture must never crash the product. The first
 * failure (and sampled repeats) always goes to stderr so the operator learns the opted-in sink is
 * dead without SENSOR_HUMOR_DEBUG. lastError/failedCount live on captureStatus() for debug_status
 * to wire later.
 *
 * Deliberately SEPARATE from the in-memory forensic trace ring (session.recordTrace): the trace is a
 * small, transient live-debugging aid that is never persisted (its full-trace fields carry raw
 * prompt text). This sink is the opposite — a permanent, append-only dataset whose every row is a
 * self-contained, reproducible example: the final output line plus full generation provenance
 * (model, resolved prompt version, sampling settings, retry count, validator verdict). That
 * provenance is the PIN_PER_STEP standard expressed as data — a captured row can be replayed.
 *
 * The row contract (CAPTURE_SCHEMA + CaptureRow) is defined once in dataset/schema.ts (zod + inferred
 * type); imported + re-exported here so existing importers of './capture.js' are unaffected and the
 * writer can never drift from the validator.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getInferenceSettings, getModel } from './ollama.js';
import { getActivePromptKey } from './prompts/loader.js';
import type { TraceEntry } from './types.js';
import { CAPTURE_SCHEMA, type CaptureRow } from './dataset/schema.js';

// Re-export the row contract so './capture.js' stays the stable import site for CAPTURE_SCHEMA /
// CaptureRow even though the single source of truth now lives in dataset/schema.ts.
export { CAPTURE_SCHEMA };
export type { CaptureRow };

/**
 * Source stamp written onto every captured row. Live tool capture is user_input (fail-closed:
 * enrich must not treat a SENSOR_HUMOR_CAPTURE file as synthetic). The internal-seed sweep
 * sets SENSOR_HUMOR_CAPTURE_SOURCE=synthetic. Unknown / unset → user_input.
 */
export function captureSourceType(): 'synthetic' | 'user_input' {
  const env = process.env.SENSOR_HUMOR_CAPTURE_SOURCE;
  if (env === undefined) return 'user_input';
  const trimmed = env.trim();
  if (trimmed === 'synthetic' || trimmed === 'user_input') return trimmed;
  return 'user_input';
}

/**
 * The capture target file, or null when capture is disabled. Resolved lazily from
 * SENSOR_HUMOR_CAPTURE on each call (like sessionFilePath / getModel read their env each time) so a
 * wrapper or test can toggle it per-run. An unset OR whitespace-only value disables capture.
 */
export function captureTarget(): string | null {
  const env = process.env.SENSOR_HUMOR_CAPTURE;
  if (env === undefined) return null;
  const trimmed = env.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether opt-in dataset capture is active (SENSOR_HUMOR_CAPTURE names a file). */
export function captureEnabled(): boolean {
  return captureTarget() !== null;
}

/**
 * In-process snapshot of the capture sink. debug_status lives in engine/index.ts (out of this
 * domain) — export the snapshot so the coordinator can wire it later without this module throwing
 * into a comedy tool.
 */
export interface CaptureStatus {
  enabled: boolean;
  target: string | null;
  failedCount: number;
  lastError: string | null;
  lastFailedAt: number | null;
}

let failedCount = 0;
let lastError: string | null = null;
let lastFailedAt: number | null = null;

export function captureStatus(): CaptureStatus {
  return {
    enabled: captureEnabled(),
    target: captureTarget(),
    failedCount,
    lastError,
    lastFailedAt,
  };
}

/** First failure plus power-of-two repeats (1, 2, 4, 8, …) — visible without flooding stderr. */
function shouldLogCaptureFailure(count: number): boolean {
  return count > 0 && (count & (count - 1)) === 0;
}

function recordCaptureFailure(target: string, err: unknown): void {
  failedCount += 1;
  lastError = err instanceof Error ? err.message : String(err);
  lastFailedAt = Date.now();
  if (!shouldLogCaptureFailure(failedCount)) return;
  console.error(
    `[sensor-humor] capture failed (${failedCount}×) writing "${target}": ${lastError}. ` +
      'SENSOR_HUMOR_CAPTURE is on but the sink is dead — comedy still returned; this row was not saved. ' +
      `Operator: check that "${target}" is a writable file (not a directory), with free disk space and ` +
      'permissions (ENOSPC/EACCES).',
  );
}

/**
 * Build the dataset row for a trace entry, stamping the provenance the entry itself doesn't carry
 * (resolved prompt version, model, sampling settings, capture time). Pure — `now` is passed in
 * rather than read here — so a test can assert the row shape without touching the clock or disk.
 */
export function buildCaptureRow(entry: TraceEntry, now: number): CaptureRow {
  return {
    schema: CAPTURE_SCHEMA,
    ts: now,
    turn: entry.turn,
    tool: entry.tool,
    mood: entry.mood,
    input: entry.input,
    output: entry.output ?? '',
    source_type: captureSourceType(),
    valid: entry.degraded_reason === undefined,
    ...(entry.degraded_reason ? { degraded_reason: entry.degraded_reason } : {}),
    validators_triggered: entry.validators_triggered ?? [],
    prompt_version: getActivePromptKey(entry.mood),
    model: getModel(),
    inference: getInferenceSettings(),
    ...(entry.prompt_fingerprint ? { prompt_fingerprint: entry.prompt_fingerprint } : {}),
    ...(entry.retries !== undefined ? { retries: entry.retries } : {}),
    ...(entry.latency_ms !== undefined ? { latency_ms: entry.latency_ms } : {}),
  };
}

/**
 * Append one dataset row for a comedy generation, when capture is enabled. No-op when disabled or
 * when the entry has no final output line (nothing to learn from). Best-effort: any I/O error is
 * swallowed so capture can never crash a tool call. Failures are logged (first + sampled repeats)
 * regardless of SENSOR_HUMOR_DEBUG and stashed on captureStatus(). Called once per generation from
 * session.recordTrace — the single per-call record site. The write stays synchronous so a captured
 * row is durable before the tool returns (an async fire-and-forget can drop the last rows on exit).
 */
export function captureRow(entry: TraceEntry): void {
  const target = captureTarget();
  if (target === null) return;
  // A generation with no output line (shouldn't happen for the four generating tools, but guard)
  // carries no training signal — skip rather than write a blank row.
  if (typeof entry.output !== 'string' || entry.output.length === 0) return;
  try {
    const row = buildCaptureRow(entry, Date.now());
    // Ensure the parent dir exists (dirname of a bare filename is '.', a harmless no-op mkdir).
    mkdirSync(dirname(target), { recursive: true });
    // Append is atomic enough for JSONL at this call rate (~1 comedy call/sec): each row is a single
    // write of one line, no read-modify-write, so concurrent servers interleave whole lines cleanly
    // rather than clobbering a shared file the way session.json's whole-file write would.
    appendFileSync(target, `${JSON.stringify(row)}\n`, 'utf-8');
  } catch (err) {
    recordCaptureFailure(target, err);
  }
}
