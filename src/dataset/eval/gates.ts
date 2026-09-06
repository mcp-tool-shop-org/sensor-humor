/**
 * comedic-moods-v0 — pre-registered eval gates + the exact statistics behind them (Slice 3).
 *
 * The eval lock requires the three negative controls to be pinned to PRE-REGISTERED chance targets:
 * "v0 fails if any control matches the real signal." Pre-registration means the thresholds live here,
 * in code, decided before the run — not tuned after seeing results. This module owns:
 *
 *   - an EXACT one-sided binomial test (no normal approximation — N is small, ~tens–hundreds of lines,
 *     where the normal approx is unreliable; Brown/Cai/DasGupta 2001), and
 *   - the three gate predicates, each a pure function of the aggregated counts.
 *
 * Gate directions (pinned; the mood-blind direction was confirmed with the director — a MOOD-CONDITIONED
 * dataset wants moods to be RECOVERABLE, so identifiable-above-chance is the valid signal):
 *   - mood-blind    PASS  ⇔ a label-free judge identifies the intended mood ABOVE the 1/6 chance base.
 *   - mood-shuffled PASS  ⇔ scoring a line against the WRONG mood's voice conforms FAR LESS than the
 *                            right mood (the judge discriminates mood, not rubber-stamps).
 *   - degraded-line PASS  ⇔ canned/degraded (valid:false) lines conform at/near FLOOR (the judge is not
 *                            fooled by an in-voice-but-generic fallback — the Sakabe irrelevant-response
 *                            control humans reject).
 */

/** 6 moods, uniform ⇒ a blind guess is right 1/6 of the time. The mood-blind chance base. */
export const MOOD_BLIND_CHANCE = 1 / 6;
/** One-sided significance level for the mood-blind binomial test. */
export const GATE_ALPHA = 0.05;
/** mood-shuffled: the real-mood conformance rate must exceed the wrong-mood rate by at least this
 *  margin. A rubric that "passes everything" shows ~no gap; a discriminating one shows a wide gap. */
export const SHUFFLE_MARGIN = 0.2;
/** degraded-line: canned/degraded lines must conform at or below this rate (near floor). */
export const DEGRADED_FLOOR = 0.2;
/** The real-mood conformance rate must itself clear this before the eval makes any positive claim —
 *  a control separation is meaningless if the real signal is already at floor. */
export const CONFORMANCE_MIN = 0.5;

/**
 * Exact upper-tail binomial probability P(X >= k) for X ~ Binomial(n, p). Computed by iterating the
 * pmf (pmf(0) = (1-p)^n; pmf(i) = pmf(i-1) · (n-i+1)/i · p/(1-p)) and summing the k..n tail — stable
 * for the n (tens–hundreds) and p (~1/6) this eval uses, and exact rather than a normal approximation.
 * Guards: k<=0 ⇒ 1 (X>=0 is certain), k>n ⇒ 0, and p must be strictly inside (0,1).
 */
export function binomialTailGE(k: number, n: number, p: number): number {
  if (n <= 0) return k <= 0 ? 1 : 0;
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0; // with p=0, P(X>=k>=1) = 0
  if (p >= 1) return 1; // with p=1, X=n>=k>=1 always
  const q = 1 - p;
  const ratio = p / q;
  let pmf = Math.pow(q, n); // P(X = 0)
  let tail = 0;
  for (let i = 1; i <= n; i++) {
    pmf *= ((n - i + 1) / i) * ratio;
    if (i >= k) tail += pmf;
  }
  return Math.min(1, tail);
}

export interface AboveChanceResult {
  /** Exact one-sided p-value: P(X >= successes) under the null Binomial(n, chance). */
  pValue: number;
  /** True iff that p-value is below alpha — the observed rate is significantly above chance. */
  aboveChance: boolean;
}

/** One-sided exact binomial test that `successes`/`n` beats `chance`. */
export function isAboveChance(successes: number, n: number, chance: number, alpha: number = GATE_ALPHA): AboveChanceResult {
  const pValue = binomialTailGE(successes, n, chance);
  return { pValue, aboveChance: pValue < alpha };
}

export interface GateResult {
  pass: boolean;
  /** Human-readable one-liner explaining the observed vs pre-registered threshold. */
  detail: string;
}

/** mood-blind gate: the label-free judge must identify the intended mood above the 1/6 chance base. */
export function moodBlindGate(idCorrect: number, nLines: number): GateResult {
  const { pValue, aboveChance } = isAboveChance(idCorrect, nLines, MOOD_BLIND_CHANCE);
  const rate = nLines > 0 ? idCorrect / nLines : 0;
  return {
    pass: aboveChance,
    detail: `mood-blind: ${idCorrect}/${nLines} correct (${(rate * 100).toFixed(1)}%) vs ${(MOOD_BLIND_CHANCE * 100).toFixed(1)}% chance, p=${pValue.toExponential(2)} (${aboveChance ? 'above' : 'not above'} chance @ α=${GATE_ALPHA})`,
  };
}

/** mood-shuffled gate: real-mood conformance must exceed wrong-mood conformance by SHUFFLE_MARGIN.
 *  An empty decided set (shuffledN === 0) is INCONCLUSIVE and refuses pass — 0% of nothing is not
 *  a discriminating negative control. */
export function moodShuffledGate(realRate: number, shuffledRate: number, shuffledN?: number): GateResult {
  if (shuffledN === 0) {
    return {
      pass: false,
      detail:
        'mood-shuffled: INCONCLUSIVE — 0 decided shuffled verdicts (empty denominator is not 0% conformance; refuse pass)',
    };
  }
  const gap = realRate - shuffledRate;
  return {
    pass: gap >= SHUFFLE_MARGIN,
    detail: `mood-shuffled: real ${(realRate * 100).toFixed(1)}% − shuffled ${(shuffledRate * 100).toFixed(1)}% = ${(gap * 100).toFixed(1)}pp gap (need ≥ ${(SHUFFLE_MARGIN * 100).toFixed(0)}pp)`,
  };
}

/** degraded-line gate: canned/degraded lines must conform at or below the pre-registered floor.
 *  An empty decided set (degradedN === 0) is INCONCLUSIVE and refuses pass — 0% of nothing is not
 *  a floor-passing negative control. */
export function degradedLineGate(degradedRate: number, degradedN?: number): GateResult {
  if (degradedN === 0) {
    return {
      pass: false,
      detail:
        'degraded-line: INCONCLUSIVE — 0 decided degraded verdicts (empty denominator is not a 0% floor; refuse pass)',
    };
  }
  return {
    pass: degradedRate <= DEGRADED_FLOOR,
    detail: `degraded-line: ${(degradedRate * 100).toFixed(1)}% conform (need ≤ ${(DEGRADED_FLOOR * 100).toFixed(0)}% floor)`,
  };
}

/** Real-mood conformance must itself clear CONFORMANCE_MIN for the eval to make a positive claim. */
export function conformanceFloorGate(realRate: number): GateResult {
  return {
    pass: realRate >= CONFORMANCE_MIN,
    detail: `real conformance: ${(realRate * 100).toFixed(1)}% (need ≥ ${(CONFORMANCE_MIN * 100).toFixed(0)}%)`,
  };
}
