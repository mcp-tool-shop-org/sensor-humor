/**
 * comedic-moods-v0 — the falsifiable eval: primary measurement + the three negative controls (Slice 3).
 *
 * Given a set of judged lines and one or more cross-family judge pools, this runs:
 *   - PRIMARY: mood-conformance of each valid line against its INTENDED mood (the real signal).
 *   - mood-blind: a label-free judge identifies the intended mood (must beat 1/6 chance).
 *   - mood-shuffled: conformance of each line against a WRONG mood (must be far below the real rate).
 *   - degraded-line: conformance of the canned/degraded (valid:false) lines (must be at/near floor).
 *
 * Every gate is pre-registered (eval/gates.ts). v0 PASSES only if EVERY pool independently clears every
 * gate — no single judge is ground truth (Kao, Hickey, Sakabe), so ≥2 pools must agree; inter-pool
 * agreement is reported as the reliability number. Judges are injected, so this whole module is
 * deterministic and unit-testable with a mock (the Ollama wiring is eval/ollama-judge.ts + the CLI).
 */
import type { MoodStyle } from '../../types.js';
import { MOODS, counterbalancedOptions, type MoodJudge } from './judge.js';
import {
  moodBlindGate,
  moodShuffledGate,
  degradedLineGate,
  conformanceFloorGate,
  type GateResult,
} from './gates.js';

/** A line to evaluate — a genuine generation (valid:true) with its intended mood + the situation. */
export interface EvalRow {
  mood: MoodStyle;
  input: string;
  output: string;
}

/** A canned/degraded line (valid:false) — for the degraded-line control. */
export interface DegradedLine {
  mood: MoodStyle;
  input: string;
  line: string;
}

/**
 * The WRONG mood used to shuffle row `index`: rotate the true mood by 1..(N-1) so the result is ALWAYS
 * a different mood, varied across the corpus. Deterministic (index-driven).
 */
export function shuffledMood(trueMood: MoodStyle, index: number): MoodStyle {
  const i = MOODS.indexOf(trueMood);
  const shift = 1 + (index % (MOODS.length - 1)); // 1..N-1, never 0
  return MOODS[(i + shift) % MOODS.length];
}

export interface PoolReport {
  judge: string;
  n_real: number;
  real_conformance: number;
  blind_correct: number;
  blind_n: number;
  blind_accuracy: number;
  shuffled_conformance: number;
  degraded_n: number;
  degraded_conformance: number;
  /** Per-real-row conformance verdicts (true/false/null), for cross-pool agreement. */
  realVerdicts: (boolean | null)[];
}

/** Rate of `true` over the non-null verdicts (null = unparseable, dropped from the denominator). */
function rateOf(verdicts: (boolean | null)[]): number {
  const decided = verdicts.filter((v) => v !== null) as boolean[];
  if (decided.length === 0) return 0;
  return decided.filter(Boolean).length / decided.length;
}

/**
 * Run every measurement for a single judge pool. Calls are SEQUENTIAL — a 24–31B local judge should not
 * be run concurrently on one GPU — so this is intentionally not parallelised.
 */
export async function runPool(judge: MoodJudge, rows: EvalRow[], degraded: DegradedLine[]): Promise<PoolReport> {
  const realVerdicts: (boolean | null)[] = [];
  const shuffledVerdicts: (boolean | null)[] = [];
  let blind_correct = 0;
  let blind_n = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // PRIMARY: conformance against the TRUE mood.
    realVerdicts.push(await judge.conforms({ input: row.input, line: row.output, mood: row.mood }));
    // mood-shuffled: conformance against a WRONG mood.
    shuffledVerdicts.push(await judge.conforms({ input: row.input, line: row.output, mood: shuffledMood(row.mood, i) }));
    // mood-blind: identify the mood with counterbalanced, label-free options.
    const choice = await judge.identify({ line: row.output, options: counterbalancedOptions(row.mood, i) });
    if (choice !== null) {
      blind_n++;
      if (choice === row.mood) blind_correct++;
    }
  }

  const degradedVerdicts: (boolean | null)[] = [];
  for (const d of degraded) {
    degradedVerdicts.push(await judge.conforms({ input: d.input, line: d.line, mood: d.mood }));
  }

  return {
    judge: judge.name,
    n_real: rows.length,
    real_conformance: rateOf(realVerdicts),
    blind_correct,
    blind_n,
    blind_accuracy: blind_n > 0 ? blind_correct / blind_n : 0,
    shuffled_conformance: rateOf(shuffledVerdicts),
    degraded_n: degradedVerdicts.filter((v) => v !== null).length,
    degraded_conformance: rateOf(degradedVerdicts),
    realVerdicts,
  };
}

export interface PoolGates {
  judge: string;
  blind: GateResult;
  shuffled: GateResult;
  degraded: GateResult;
  conformanceFloor: GateResult;
  pass: boolean;
}

/** Apply the four pre-registered gates to a pool's report. A pool passes only if all four pass. */
export function gatePool(r: PoolReport): PoolGates {
  const blind = moodBlindGate(r.blind_correct, r.blind_n);
  const shuffled = moodShuffledGate(r.real_conformance, r.shuffled_conformance);
  const degraded = degradedLineGate(r.degraded_conformance);
  const conformanceFloor = conformanceFloorGate(r.real_conformance);
  return {
    judge: r.judge,
    blind,
    shuffled,
    degraded,
    conformanceFloor,
    pass: blind.pass && shuffled.pass && degraded.pass && conformanceFloor.pass,
  };
}

/**
 * Raw pairwise agreement across pools on the PRIMARY conformance verdict, per row (fraction of
 * comparable rows where all pools returned the same boolean). Null verdicts and rows judged by <2 pools
 * are excluded. Returns null when fewer than 2 pools. This is the reliability number the lock asks for
 * (a raw-agreement proxy; Krippendorff's α is the future refinement).
 */
export function interPoolAgreement(pools: PoolReport[]): number | null {
  if (pools.length < 2) return null;
  const n = Math.min(...pools.map((p) => p.realVerdicts.length));
  let comparable = 0;
  let agree = 0;
  for (let i = 0; i < n; i++) {
    const vs = pools.map((p) => p.realVerdicts[i]).filter((v) => v !== null) as boolean[];
    if (vs.length < 2) continue;
    comparable++;
    if (vs.every((v) => v === vs[0])) agree++;
  }
  return comparable === 0 ? null : agree / comparable;
}

export interface EvalResult {
  pools: PoolReport[];
  gates: PoolGates[];
  agreement: number | null;
  /** v0 verdict: every pool clears every gate. */
  pass: boolean;
}

/** Run the full eval across all judge pools and assemble the pre-registered verdict. */
export async function evaluate(judges: MoodJudge[], rows: EvalRow[], degraded: DegradedLine[]): Promise<EvalResult> {
  const pools: PoolReport[] = [];
  for (const j of judges) pools.push(await runPool(j, rows, degraded));
  const gates = pools.map(gatePool);
  return {
    pools,
    gates,
    agreement: interPoolAgreement(pools),
    pass: gates.length > 0 && gates.every((g) => g.pass),
  };
}
