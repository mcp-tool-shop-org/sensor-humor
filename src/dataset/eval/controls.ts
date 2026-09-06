/**
 * comedic-moods-v0 — the falsifiable eval: primary measurement + the three negative controls (Slice 3),
 * aggregated as a CROSS-FAMILY PANEL (the character-embodiment patch).
 *
 * Given judged lines and ≥1 cross-family judge pools, this runs, per line:
 *   - PRIMARY: mood-conformance of each valid line against its INTENDED mood (the real signal).
 *   - mood-blind: a label-free judge identifies the intended mood (must beat 1/6 chance).
 *   - mood-shuffled: conformance of each line against a WRONG mood (must be far below the real rate).
 *   - degraded-line: conformance of the canned/degraded (valid:false) lines (must be at/near floor).
 *
 * AGGREGATION (why a panel, not per-pool unanimity): a single LLM judge is the WEAKEST setup for
 * style/persona conformance — style-strength is an LLM judge's worst axis (Lai et al. 2023,
 * arXiv:2304.13462, 31.2%) and the best LLM evaluators identify a persona at only ~69% vs humans' 90.8%
 * (Zhou et al. 2025 PersonaEval, arXiv:2508.10014), plus a judge rewards text like its own / lower-
 * perplexity (Panickssery 2024 arXiv:2404.13076; Wataoka 2024 arXiv:2410.21819) — which would penalize
 * our surprising voices (chaotic/zoomer). The evidence-backed fix is a PANEL of decorrelated families:
 * Verga et al. 2024 (PoLL, arXiv:2404.18796) show a cross-family panel beats a single GPT-4 (κ 0.76 vs
 * 0.63) and shrinks self-preference variance at ~7× lower cost. So the PRIMARY verdict is the per-line
 * MAJORITY vote across the panel; the per-pool reports are kept as diagnostics and inter-pool agreement
 * is the reliability number. Presentation order is counterbalanced in the mood-blind task (Wang 2023,
 * arXiv:2305.17926) and the judge is reasoning-stripped (ollama-judge.ts, temp 0). ≥3 families is the
 * intended setup (an even panel can tie → the vote abstains for that line).
 *
 * Judges are injected, so this whole module is deterministic and unit-testable with mocks (the Ollama
 * wiring is eval/ollama-judge.ts + the CLI). NO model judges its own comedy — the generator is
 * qwen2.5:7b and the CLI refuses any qwen* judge.
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
  /** Decided (non-null) shuffled verdicts — 0 means the shuffled gate must refuse pass. */
  shuffled_n: number;
  degraded_n: number;
  degraded_conformance: number;
  /** Per-line verdicts, kept so the panel can majority-aggregate and so inter-pool agreement is computable. */
  realVerdicts: (boolean | null)[];
  shuffledVerdicts: (boolean | null)[];
  /** The mood each pool CHOSE per line in the blind task (against counterbalanced options), or null. */
  blindChoices: (MoodStyle | null)[];
  degradedVerdicts: (boolean | null)[];
}

/** Rate of `true` over the non-null verdicts (null = unparseable/abstain, dropped from the denominator).
 *  Empty decided set returns 0 — fail-closed for the POSITIVE real-conformance floor. Negative
 *  controls pass shuffled_n / degraded_n into the gates, which refuse pass when n===0 (0% of
 *  nothing is not a discriminating / floor-passing control). */
function rateOf(verdicts: (boolean | null)[]): number {
  const decided = verdicts.filter((v) => v !== null) as boolean[];
  if (decided.length === 0) return 0;
  return decided.filter(Boolean).length / decided.length;
}

/** Majority boolean across a panel: true/false by strict majority of the decided votes; null on a tie
 *  or when nothing was decided (an even panel can tie — the panel abstains for that line). */
export function majorityBool(votes: (boolean | null)[]): boolean | null {
  let t = 0;
  let f = 0;
  for (const v of votes) {
    if (v === true) t++;
    else if (v === false) f++;
  }
  if (t > f) return true;
  if (f > t) return false;
  return null;
}

/** Majority mood across a panel: the single mood with the strictly-highest vote count, or null on a tie. */
export function majorityMood(choices: (MoodStyle | null)[]): MoodStyle | null {
  const tally = new Map<MoodStyle, number>();
  for (const c of choices) if (c !== null) tally.set(c, (tally.get(c) ?? 0) + 1);
  let best: MoodStyle | null = null;
  let bestN = 0;
  let tie = false;
  for (const [m, n] of tally) {
    if (n > bestN) {
      best = m;
      bestN = n;
      tie = false;
    } else if (n === bestN) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/**
 * Run every measurement for a single judge pool. Calls are SEQUENTIAL — a 24–31B local judge should not
 * be run concurrently on one GPU — so this is intentionally not parallelised. All per-line verdicts are
 * retained so the panel can aggregate them.
 */
export async function runPool(judge: MoodJudge, rows: EvalRow[], degraded: DegradedLine[]): Promise<PoolReport> {
  const realVerdicts: (boolean | null)[] = [];
  const shuffledVerdicts: (boolean | null)[] = [];
  const blindChoices: (MoodStyle | null)[] = [];
  let blind_correct = 0;
  let blind_n = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // PRIMARY: conformance against the TRUE mood.
    realVerdicts.push(await judge.conforms({ input: row.input, line: row.output, mood: row.mood }));
    // mood-shuffled: conformance against a WRONG mood.
    shuffledVerdicts.push(await judge.conforms({ input: row.input, line: row.output, mood: shuffledMood(row.mood, i) }));
    // mood-blind: identify the mood with counterbalanced, label-free options (same order for every pool).
    const choice = await judge.identify({ line: row.output, options: counterbalancedOptions(row.mood, i) });
    blindChoices.push(choice);
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
    shuffled_n: shuffledVerdicts.filter((v) => v !== null).length,
    degraded_n: degradedVerdicts.filter((v) => v !== null).length,
    degraded_conformance: rateOf(degradedVerdicts),
    realVerdicts,
    shuffledVerdicts,
    blindChoices,
    degradedVerdicts,
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

/** Apply the four pre-registered gates to one pool's numbers (a DIAGNOSTIC — the primary verdict is the
 *  panel below). A pool passes only if all four pass. */
export function gatePool(r: {
  blind_correct: number;
  blind_n: number;
  real_conformance: number;
  shuffled_conformance: number;
  shuffled_n?: number;
  degraded_n?: number;
  degraded_conformance: number;
  judge?: string;
}): PoolGates {
  const blind = moodBlindGate(r.blind_correct, r.blind_n);
  const shuffled = moodShuffledGate(r.real_conformance, r.shuffled_conformance, r.shuffled_n);
  const degraded = degradedLineGate(r.degraded_conformance, r.degraded_n);
  const conformanceFloor = conformanceFloorGate(r.real_conformance);
  return {
    judge: r.judge ?? 'panel',
    blind,
    shuffled,
    degraded,
    conformanceFloor,
    pass: blind.pass && shuffled.pass && degraded.pass && conformanceFloor.pass,
  };
}

/** The cross-family panel: per-line majority verdicts aggregated across all pools. This is the PRIMARY
 *  measurement (Verga PoLL — a decorrelated panel beats any single judge and reduces self-preference). */
export interface PanelReport {
  judges: string[];
  n_pools: number;
  n_real: number;
  real_conformance: number;
  blind_correct: number;
  blind_n: number;
  blind_accuracy: number;
  shuffled_conformance: number;
  shuffled_n: number;
  degraded_n: number;
  degraded_conformance: number;
}

/** Aggregate the pools into the panel report by per-line majority vote. `rows` supplies the true moods
 *  for scoring the blind majority choice. Degraded lines are aggregated the same way. */
export function aggregatePanel(pools: PoolReport[], rows: EvalRow[]): PanelReport {
  const nReal = rows.length;
  const panelReal: (boolean | null)[] = [];
  const panelShuffled: (boolean | null)[] = [];
  let blind_correct = 0;
  let blind_n = 0;

  for (let i = 0; i < nReal; i++) {
    panelReal.push(majorityBool(pools.map((p) => p.realVerdicts[i] ?? null)));
    panelShuffled.push(majorityBool(pools.map((p) => p.shuffledVerdicts[i] ?? null)));
    const choice = majorityMood(pools.map((p) => p.blindChoices[i] ?? null));
    if (choice !== null) {
      blind_n++;
      if (choice === rows[i].mood) blind_correct++;
    }
  }

  const degN = pools[0]?.degradedVerdicts.length ?? 0;
  const panelDegraded: (boolean | null)[] = [];
  for (let j = 0; j < degN; j++) panelDegraded.push(majorityBool(pools.map((p) => p.degradedVerdicts[j] ?? null)));

  return {
    judges: pools.map((p) => p.judge),
    n_pools: pools.length,
    n_real: nReal,
    real_conformance: rateOf(panelReal),
    blind_correct,
    blind_n,
    blind_accuracy: blind_n > 0 ? blind_correct / blind_n : 0,
    shuffled_conformance: rateOf(panelShuffled),
    shuffled_n: panelShuffled.filter((v) => v !== null).length,
    degraded_n: panelDegraded.filter((v) => v !== null).length,
    degraded_conformance: rateOf(panelDegraded),
  };
}

/**
 * Raw pairwise agreement across pools on the PRIMARY conformance verdict, per row (fraction of
 * comparable rows where all pools returned the same boolean). Null verdicts and rows judged by <2 pools
 * are excluded. Returns null when fewer than 2 pools. The reliability number (a raw-agreement proxy;
 * Krippendorff's α is the future refinement).
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
  /** Per-family reports (diagnostic — surfaces a rogue judge the panel would otherwise absorb). */
  pools: PoolReport[];
  /** Per-family gates (diagnostic). */
  gates: PoolGates[];
  /** The cross-family panel — the PRIMARY measurement. */
  panel: PanelReport;
  /** The pre-registered gates applied to the panel — the PRIMARY verdict. */
  panelGates: PoolGates;
  /** Inter-pool agreement on the primary conformance verdict (reliability), or null with <2 pools. */
  agreement: number | null;
  /** v0 verdict = the panel clears every pre-registered gate. */
  pass: boolean;
}

/** Run the full eval across all judge pools and assemble the panel verdict + per-pool diagnostics. */
export async function evaluate(judges: MoodJudge[], rows: EvalRow[], degraded: DegradedLine[]): Promise<EvalResult> {
  const pools: PoolReport[] = [];
  for (const j of judges) pools.push(await runPool(j, rows, degraded));
  const gates = pools.map(gatePool);
  const panel = aggregatePanel(pools, rows);
  const panelGates = gatePool({ ...panel, judge: 'panel' });
  return {
    pools,
    gates,
    panel,
    panelGates,
    agreement: interPoolAgreement(pools),
    pass: pools.length > 0 && panelGates.pass,
  };
}
