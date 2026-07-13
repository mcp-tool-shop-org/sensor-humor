/**
 * comedic-moods-v0 — the row contract (single source of truth).
 *
 * Defines both the runtime validator (`CaptureRowSchema`, zod) and the TS type (`CaptureRow`,
 * inferred from it) for the JSON-Lines rows the opt-in capture sink writes. `capture.ts` imports
 * `CAPTURE_SCHEMA` + `CaptureRow` from here (and re-exports them for back-compat), so the writer and
 * the validator can never drift — there is exactly one definition.
 *
 * PROVISIONAL for v0. Locked by the study-swarm synthesis (Representation/schema lock); the schema
 * tag `comedic-moods/v0` gates a future breaking row-shape change to a new tag.
 */
import { z } from 'zod';
import { MOOD_STYLES } from '../types.js';

/**
 * Dataset schema tag stamped on every row — ties on-disk rows to the `comedic-moods-v0` dataset and
 * lets a future schema (v1) be distinguished at read time. Bump the version suffix only on a breaking
 * row-shape change; additive columns keep the same tag.
 */
export const CAPTURE_SCHEMA = 'comedic-moods/v0';

/** Sampling settings a line was generated under. `.strict()` — a stray key is a contract violation. */
export const InferenceSettingsSchema = z
  .object({
    temperature: z.number(),
    top_p: z.number(),
    top_k: z.number(),
    mirostat: z.number(),
    mirostat_tau: z.number(),
  })
  .strict();

/**
 * The row shape before the cross-field check. `.strict()` closes the contract — an unknown top-level
 * key is rejected, so schema drift or a hand-edited row can't smuggle fields past the validator.
 * Optional fields (`degraded_reason`, `prompt_fingerprint`, `retries`, `latency_ms`) may be absent —
 * the sink omits them on the reuse / degraded paths.
 */
const BaseCaptureRowSchema = z
  .object({
    schema: z.literal(CAPTURE_SCHEMA),
    ts: z.number().int().nonnegative(),
    turn: z.number().int().nonnegative(),
    tool: z.string().min(1),
    mood: z.enum(MOOD_STYLES),
    input: z.string(),
    output: z.string().min(1),
    valid: z.boolean(),
    degraded_reason: z.string().min(1).optional(),
    validators_triggered: z.array(z.string()),
    prompt_version: z.string().min(1),
    model: z.string().min(1),
    inference: InferenceSettingsSchema,
    prompt_fingerprint: z.string().min(1).optional(),
    retries: z.number().int().positive().optional(),
    latency_ms: z.number().nonnegative().optional(),
  })
  .strict();

/**
 * The full row contract, including the cross-field invariant `valid === (degraded_reason ===
 * undefined)`: a row is a genuine model generation iff it was not degraded (backend fallback or
 * safety substitution). Downstream training filters on `valid`, so an internally-inconsistent row
 * (valid:true carrying a degraded_reason, or vice versa) is rejected rather than mislabeled.
 */
export const CaptureRowSchema = BaseCaptureRowSchema.refine(
  (r) => r.valid === (r.degraded_reason === undefined),
  { message: 'valid must equal (degraded_reason === undefined)', path: ['valid'] },
);

/** The row type — inferred from the schema, so it cannot drift from what the validator enforces. */
export type CaptureRow = z.infer<typeof BaseCaptureRowSchema>;

/** The row field names (from the schema shape) — exposed so a test can assert the sink writes exactly
 *  this set (a runtime drift guard against a field added to the writer but not the contract). */
export const CAPTURE_ROW_KEYS: readonly string[] = Object.keys(BaseCaptureRowSchema.shape);
