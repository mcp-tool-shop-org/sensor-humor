/**
 * sensor-humor shared types
 */

export const MOOD_STYLES = [
  'dry',
  'roast',
  'chaotic',
  'cheeky',
  'cynic',
  'zoomer',
] as const;

export type MoodStyle = (typeof MOOD_STYLES)[number];

export const DEFAULT_MOOD: MoodStyle = 'dry';

export const MOOD_DESCRIPTIONS: Record<MoodStyle, string> = {
  dry: 'Deadpan, minimalist, says the obvious like it\'s devastating news',
  roast: 'Affectionate but pointed, never cruel, always punches up or at shared human frailty',
  chaotic: 'Starts normal, one big absurd twist, escalates into nonsense delivered as fact',
  cheeky: 'Playful teasing, affectionate mischief, gentle mockery with a wink',
  cynic: 'Bitter, jaded, quietly vicious realism — of course it failed',
  zoomer: 'Terminally online Gen-Z snark, savage one-liners, meme-adjacent energy',
};

export const COMIC_TECHNIQUES = [
  'rule-of-three',
  'misdirection',
  'escalation',
  'callback',
  'understatement',
  'auto',
] as const;

export type ComicTechnique = (typeof COMIC_TECHNIQUES)[number];

export const ROAST_CONTEXTS = ['code', 'error', 'idea', 'situation'] as const;

export type RoastContext = (typeof ROAST_CONTEXTS)[number];

// --- Session state ---

export interface RunningGag {
  setup: string;
  tag: string;
  used: number;
  last_turn: number;
  /**
   * Turn the gag was PLANTED (its setup). Distinct from last_turn (last reference). Load-bearing
   * for the callback distance gate (Ma et al. 2026, arXiv:2605.00143 — temporal distance /
   * anticipation is what makes a callback land, so a gag must age a minimum number of turns past
   * its setup before it is an eligible callback candidate). Optional for back-compat: a legacy
   * snapshot or a hand-built gag without it falls back to last_turn as the plant turn.
   */
  created_turn?: number;
}

/** Result of the running_gag tool — the explicit gag-planting affordance (callback-revival C1). */
export interface RunningGagResult {
  tag: string;
  setup: string;
  gag_count: number;
  created_turn: number;
}

export interface RecentBit {
  text: string;
  turn: number;
  technique: string;
}

export interface SensorHumorSession {
  mood: MoodStyle;
  running_gags: RunningGag[];
  recent_bits: RecentBit[]; // ring buffer, max 20
  catchphrases: Map<string, number>; // phrase → use count
  turn_counter: number;
}

// --- Tool return types ---

export interface MoodSetResult {
  mood: MoodStyle;
  description: string;
  voice_notes: string;
}

export interface MoodGetResult {
  mood: MoodStyle;
  description: string;
  session_gag_count: number;
}

/**
 * Closed, machine-branchable set of degradation reasons. Two are set by the tool layer above
 * generateComedy: 'safety-filter' (a slur/simile/meta-leak was substituted) and 'language' (the
 * model code-switched out of the expected Latin script — English comedy is the contract — so an
 * input-free English static line was substituted). 'language' is a language-CONFORMANCE degrade,
 * NOT a safety substitution: it is attributed distinctly and deliberately does NOT bump the
 * safety-filter counter. The rest are the classified Ollama/backend failure codes from classifyError
 * (kept in sync — classifyError returns this type) plus 'exhausted' (retries exhausted with no
 * classified cause). Q4 grounding: a consuming LLM agent must be able to branch on the reason
 * exhaustively, so it is a closed union, not a string.
 */
export type DegradedReason =
  | 'safety-filter'
  | 'language'
  | 'connection'
  | 'timeout'
  | 'model-not-found'
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'http'
  | 'json-parse'
  | 'validation'
  | 'exhausted'
  | 'unknown';

/**
 * Degradation signal carried on every comedy result. Present (true) only when the output is
 * NOT a genuine model generation: either the Ollama backend failed (degraded_reason is the
 * classified error code), the safety filter had to substitute a canned line
 * (degraded_reason: 'safety-filter'), or the language-conformance gate substituted an English
 * line because the model code-switched out of the Latin script (degraded_reason: 'language').
 * Absent on the happy path, so existing callers are unaffected and the absence of the flag is a
 * positive signal of a real generation.
 */
export interface Degradable {
  degraded?: boolean;
  degraded_reason?: DegradedReason;
}

export interface ComicTimingResult extends Degradable {
  rewrite: string;
  technique_used: string;
  callback_source?: string;
}

export interface RoastResult extends Degradable {
  roast: string;
  severity: number;
  mood: MoodStyle;
}

export interface HeckleResult extends Degradable {
  heckle: string;
  mood: MoodStyle;
}

export interface CatchphraseGenerateResult extends Degradable {
  phrase: string;
  is_fresh: boolean;
}

export interface CatchphraseCallbackResult extends Degradable {
  phrase: string;
  use_count: number;
}

export interface GenerationMetadata {
  model: string;
  temperature: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
}

/**
 * One entry in the session's forensic trace ring (ROADMAP v2.0 "Chain Trace Tool"). Recorded once
 * per comedy tool call so a dev can reconstruct the whole generation pipeline for a recent output
 * in a single debug_chain call, instead of grepping logs. Bounded to the last 10 on the session.
 *
 * The light fields are always populated. The heavy fields (prompt_text / raw_output /
 * parsed_output) are captured ONLY when SENSOR_HUMOR_FULL_TRACE=true, so a default trace stays
 * small — the ROADMAP's prompt_hash maps to prompt_fingerprint, and ollama_raw/parsed_output are
 * gated behind the full-trace flag.
 */
export interface TraceEntry {
  /** Session turn this call ran on (session.turn_counter at record time). */
  turn: number;
  /** Which comedy tool produced the output ('comic_timing' | 'roast' | 'heckle' | 'catchphrase'). */
  tool: string;
  /** Active mood snapshot at generation time. */
  mood: MoodStyle;
  /** The caller's input (the raw request text the tool was given). */
  input: string;
  /**
   * The final output line the tool returned (post safety-gate). Light field, always populated by the
   * comedy tools. Distinct from parsed_output (full-trace-only, the whole result object): this is the
   * single humor line, so the opt-in dataset capture (capture.ts) records a complete row WITHOUT
   * requiring SENSOR_HUMOR_FULL_TRACE. Optional for back-compat with existing recordTrace callers/tests.
   */
  output?: string;
  /**
   * Short stable hash of the ACTIVE prompt (the ROADMAP's prompt_hash). Reuses the fingerprint
   * mechanism generateComedy returns; undefined only if generation metadata was unavailable
   * (e.g. a mocked generateComedy in tests).
   */
  prompt_fingerprint?: string;
  /** Number of generation attempts used (1 = no retry). Undefined when metadata is unavailable. */
  retries?: number;
  /**
   * Which safety/pattern checks fired locally in the tool (e.g. 'meta-leak', 'simile', 'harsh',
   * 'roast-label', 'terminal-gate', 'comparison'). Best-effort — captures the tool's local
   * knowledge of which gates/retries triggered. Empty array when nothing fired.
   */
  validators_triggered: string[];
  /** The degradation reason if the output was degraded (backend fallback or safety substitution). */
  degraded_reason?: DegradedReason;
  /** End-to-end generation latency in ms. Undefined when metadata is unavailable. */
  latency_ms?: number;
  // ── Heavy fields: only present when SENSOR_HUMOR_FULL_TRACE=true (bounded size by default). ──
  /** Full active prompt text (system + user). Full-trace only. */
  prompt_text?: string;
  /** Raw model output string before parsing. Full-trace only. */
  raw_output?: string;
  /** The parsed/validated tool result object. Full-trace only. */
  parsed_output?: unknown;
}
