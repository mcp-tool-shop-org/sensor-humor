/**
 * comedic-moods-v0 — active / uncertainty-driven BWS tuple selection (Slice 4, decision B.2).
 *
 * `bws.ts` generates a fixed BALANCED design up front. This module instead picks the NEXT tuple to show
 * a human given the judgments collected so far, so the anchor reaches a reliable ranking in far fewer
 * comparisons — active sampling for pairwise comparisons cuts the budget ~3× vs a fixed design
 * (Mikhailiuk et al. 2020, arXiv:2004.05691, "Active Sampling for Pairwise Comparisons via Approximate
 * Message Passing and Information Gain Maximisation"). We implement its two levers with a cheap,
 * deterministic, greedy proxy (full EIG under a Thurstonian posterior is overkill for a few-hundred-line
 * anchor):
 *
 *   1. UNDER-SAMPLED items first. Few observations ⇒ high posterior variance ⇒ high expected information
 *      from sampling it. The seed of each tuple is the least-sampled line — you cannot lower an item's
 *      uncertainty without comparing it, so this guarantees coverage (the exploration phase).
 *   2. CLOSE current strengths. A comparison between two lines of similar Bradley-Terry strength has
 *      outcome probability p≈0.5 and thus maximal Bernoulli entropy — the "uncertain frontier" where the
 *      ranking is unresolved. A comparison between a runaway winner and a runaway loser (p≈1) is already
 *      settled and wastes the human. So the seed's tuple-mates are the lines whose strength is closest to
 *      the running fit (the exploitation phase).
 *
 * Pure + deterministic (no RNG, no clock): a total function of (items, judgments, k) — so an active run
 * is replayable and unit-testable, and the labeling CLI can resume it. Early, before any judgments, all
 * strengths tie (entropy 1 everywhere) and selection degrades gracefully to pure least-sampled coverage.
 */
import {
  fitBradleyTerry,
  judgmentsToPairs,
  tupleKey,
  type BwsJudgment,
  type BwsTuple,
} from './bws.js';

/** How many times each item has appeared across the judgments so far (0 for a never-shown item). */
export function appearanceCounts(judgments: BwsJudgment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const j of judgments) for (const it of j.items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return counts;
}

/**
 * Current strength estimate for every item in `items`. With no judgments (or no implied pairs) every
 * item gets the uniform prior 1/n. Otherwise items compared so far take their Bradley-Terry strength;
 * items not yet compared take the MEAN observed strength (a neutral "middle of the pack" placement until
 * a comparison places them). Strengths are relative — only their spacing drives selection.
 */
export function strengthMap(items: string[], judgments: BwsJudgment[]): Map<string, number> {
  const n = items.length;
  const uniform = n > 0 ? 1 / n : 0;
  const map = new Map<string, number>(items.map((it) => [it, uniform]));
  const pairs = judgmentsToPairs(judgments);
  if (pairs.length === 0) return map; // no data → uniform prior
  const ranked = fitBradleyTerry(pairs);
  const observed = new Map(ranked.map((r) => [r.item, r.score]));
  const meanObserved = ranked.length ? ranked.reduce((s, r) => s + r.score, 0) / ranked.length : uniform;
  for (const it of items) map.set(it, observed.get(it) ?? meanObserved);
  return map;
}

/** Bernoulli entropy (bits) of a probability in [0,1]; 0 at the extremes, maximal (1) at p=0.5. */
function bernoulli(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/**
 * Information a comparison between two items of strengths `si`, `sj` carries under Bradley-Terry: the
 * entropy of the outcome `p = si/(si+sj)`. Close strengths → p≈0.5 → ≈1 bit (informative); lopsided →
 * ≈0 (already settled). This is the formal version of "prefer close strengths." Symmetric in i,j.
 */
export function comparisonEntropy(si: number, sj: number): number {
  const denom = si + sj;
  return bernoulli(denom > 0 ? si / denom : 0.5);
}

/** Greedily grow a tuple from a seed by repeatedly adding the item that is most informative to compare
 *  against the members chosen so far (max total comparison entropy), tie-broken toward under-sampled
 *  then id — so the tuple concentrates on the uncertain frontier around the seed. Returns k ids in
 *  canonical (sorted) order for stable presentation + a stable tuple key. */
function buildAroundSeed(
  seed: string,
  items: string[],
  k: number,
  appear: (it: string) => number,
  strength: (it: string) => number,
): string[] {
  const chosen = [seed];
  const chosenSet = new Set([seed]);
  while (chosen.length < k) {
    const infoVs = (c: string): number => chosen.reduce((s, m) => s + comparisonEntropy(strength(c), strength(m)), 0);
    const pick = items
      .filter((c) => !chosenSet.has(c))
      .sort((a, b) => infoVs(b) - infoVs(a) || appear(a) - appear(b) || a.localeCompare(b))[0];
    chosen.push(pick);
    chosenSet.add(pick);
  }
  return [...chosen].sort((a, b) => a.localeCompare(b));
}

/**
 * Select the next BWS tuple to present, given the mood's full line set `items` and the judgments so far.
 * Deterministic. Seeds are tried least-sampled-first (ties by id); the first seed whose canonical tuple
 * is not in `opts.exclude` (the already-judged keys, for resume) is returned. If every seed's tuple is
 * excluded — the frontier is exhausted — the first-built tuple is returned so the caller can detect the
 * repeat (its key is in `exclude`) and stop.
 *
 * @throws if there are fewer than `k` items (cannot form a tuple).
 */
export function selectNextTuple(
  items: string[],
  judgments: BwsJudgment[],
  k = 4,
  opts: { exclude?: Iterable<string> } = {},
): BwsTuple {
  if (items.length < k) throw new Error(`need >= ${k} items to select a tuple (got ${items.length})`);
  const exclude = new Set(opts.exclude ?? []);
  const counts = appearanceCounts(judgments);
  const strengths = strengthMap(items, judgments);
  const appear = (it: string): number => counts.get(it) ?? 0;
  const strength = (it: string): number => strengths.get(it) ?? 0;

  // Seeds: least-sampled first (highest posterior variance → highest expected information gain,
  // Mikhailiuk 2020), ties by id for determinism.
  const seeds = [...items].sort((a, b) => appear(a) - appear(b) || a.localeCompare(b));
  let fallback: BwsTuple | null = null;
  for (const seed of seeds) {
    const tuple: BwsTuple = { items: buildAroundSeed(seed, items, k, appear, strength) };
    fallback ??= tuple;
    if (!exclude.has(tupleKey(tuple.items))) return tuple;
  }
  return fallback!; // every canonical tuple already judged → caller sees the key in `exclude` and stops
}
