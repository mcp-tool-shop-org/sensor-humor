/**
 * Statistics module for the sensor-humor v1.2 "Prompt Stability Lock" regression gate.
 *
 * THE GROUNDING (load-bearing — read before changing any threshold logic):
 *
 * This gate measures STRUCTURAL CONFORMANCE (form + safety), NOT "funniness". The best
 * reported LLM-vs-human humor-rating correlation is only rho ~ 0.2 (Lu et al. 2025;
 * Sakabe et al. 2025), so a pass/fail signal on "is this funny" would be noise. What we
 * CAN measure reliably is whether generated output still conforms to its mood's pattern
 * and passes the safety filters — a regression gate on FORM, not on comedy quality.
 *
 * The naive design — N=10 samples checked against a flat 65% point-threshold — is
 * statistically unsound. For a binomial proportion, a healthy 75% conformance rate dips
 * below a 65% observed cut ~22% of the time purely by sampling chance at N=10 (the Wald
 * normal approximation breaks down at small n; Brown, Cai & DasGupta, "Interval Estimation
 * for a Binomial Proportion", Statistical Science 16(2):101-133, 2001,
 * https://projecteuclid.org/euclid.ss/1009213286). So the gate must instead:
 *
 *   1. Use a WILSON score interval (not Wald) for the proportion — accurate at small n,
 *      never produces out-of-range or zero-width intervals near p=0 or p=1.
 *   2. Be THREE-VALUED (PASS / FAIL / INCONCLUSIVE). FAIL only when the Wilson UPPER bound
 *      sits below the threshold — i.e. we are confident the mood is broken. A wide,
 *      undecided interval returns INCONCLUSIVE and NEVER blocks a merge (andon-correct:
 *      pull the cord on a confirmed defect, not on uncertainty).
 *   3. Support SPRT early-stopping (Wald's Sequential Probability Ratio Test) so a clearly
 *      healthy or clearly drifted stream can be accepted with far fewer samples than a
 *      fixed-N design, while ambiguous streams keep sampling (Bhardwaj 2026; ConSol 2025).
 *
 * All functions here are pure and deterministic — no I/O, no clock, no randomness.
 */

/** A closed proportion interval, both bounds clamped to [0, 1]. */
export interface Interval {
  lower: number;
  upper: number;
}

/** Clamp a value into the [0, 1] range. */
function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Brown, Cai & DasGupta (2001) show the textbook Wald interval
 * (p_hat +/- z*sqrt(p_hat*(1-p_hat)/n)) has erratic, often far-too-low coverage at small n
 * and degenerates to zero width when p_hat hits 0 or 1. The Wilson interval centers on a
 * shrunk estimate and stays inside [0, 1] with reliable coverage even for n in the tens.
 *
 * Formula (center +/- margin, all divided by the denominator):
 *   denom  = 1 + z^2/n
 *   center = (p_hat + z^2/(2n)) / denom
 *   margin = (z/denom) * sqrt(p_hat*(1-p_hat)/n + z^2/(4n^2))
 *
 * @param successes count of conforming/safe samples (0..n)
 * @param n         total samples
 * @param z         standard-normal critical value (1.96 = 95% two-sided)
 * @returns interval clamped to [0, 1]; { lower: 0, upper: 1 } when n <= 0
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  // Guard invalid input — an undefined proportion is maximally uncertain.
  if (!Number.isFinite(n) || n <= 0) return { lower: 0, upper: 1 };
  if (!Number.isFinite(successes) || successes < 0) successes = 0;
  if (successes > n) successes = n;

  const pHat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denom;
  const margin =
    (z / denom) * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));

  // Snap the degenerate ends to their exact mathematical values. At p_hat = 1 the upper
  // bound is exactly 1, and at p_hat = 0 the lower bound is exactly 0; clamp01 alone would
  // leave floating-point dust (e.g. 0.9999999999999999) on these boundaries.
  return {
    lower: pHat <= 0 ? 0 : clamp01(center - margin),
    upper: pHat >= 1 ? 1 : clamp01(center + margin),
  };
}

/** Three-valued gate verdict. INCONCLUSIVE never blocks a merge. */
export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

/**
 * Three-valued regression verdict from a Wilson interval.
 *
 *   PASS         — Wilson lower bound > threshold: confident the mood conforms.
 *   FAIL         — Wilson upper bound < threshold: confident the mood has drifted/broken.
 *   INCONCLUSIVE — the interval straddles the threshold: not enough evidence either way.
 *
 * This is the andon-correct gate. We only pull the cord (FAIL) on a CONFIRMED defect; an
 * undecided mood returns INCONCLUSIVE and the caller must not block on it. At an unsound
 * N (e.g. 6/10 @ 0.65) the interval is too wide to separate healthy from broken, so the
 * verdict is INCONCLUSIVE — exactly the study-swarm's point about N=10 being uninformative.
 *
 * @param opts.threshold conformance floor in [0, 1] (e.g. 0.65)
 * @param opts.z         standard-normal critical value (default 1.96)
 */
export function threeValuedVerdict(
  successes: number,
  n: number,
  opts: { threshold: number; z?: number },
): Verdict {
  const { threshold, z = 1.96 } = opts;
  const { lower, upper } = wilsonInterval(successes, n, z);
  if (lower > threshold) return 'PASS';
  if (upper < threshold) return 'FAIL';
  return 'INCONCLUSIVE';
}

/** SPRT early-stopping decision. CONTINUE means keep sampling. */
export type SprtDecision = 'ACCEPT_HEALTHY' | 'ACCEPT_DRIFTED' | 'CONTINUE';

/**
 * Wald's Sequential Probability Ratio Test (SPRT) for a Bernoulli stream.
 *
 * Tests two simple hypotheses about the underlying conformance rate:
 *   H0: rate = p0  (healthy, e.g. 0.72)
 *   H1: rate = p1  (drifted, e.g. 0.62), with p1 < p0
 *
 * After each batch we accumulate the log-likelihood ratio of the data under H1 vs H0:
 *   llr = successes*log(p1/p0) + (n - successes)*log((1-p1)/(1-p0))
 *
 * and compare against Wald's boundaries derived from the desired error rates:
 *   A = log((1 - beta) / alpha)   (upper: accept H1 / drifted)
 *   B = log(beta / (1 - alpha))   (lower: accept H0 / healthy)
 *
 *   llr >= A  -> ACCEPT_DRIFTED
 *   llr <= B  -> ACCEPT_HEALTHY
 *   otherwise -> CONTINUE
 *
 * SPRT reaches a decision with the minimum expected number of samples for given error
 * rates (Bhardwaj 2026; ConSol 2025 sequential-acceptance testing for LLM evals). Because
 * H1 is the drifted hypothesis, a HIGH llr means the data favor drift.
 *
 * @param opts.alpha P(accept drifted | actually healthy) — false-alarm rate
 * @param opts.beta  P(accept healthy | actually drifted) — miss rate
 */
export function sprt(opts: {
  successes: number;
  n: number;
  p0: number;
  p1: number;
  alpha: number;
  beta: number;
}): SprtDecision {
  const { successes, n, p0, p1, alpha, beta } = opts;

  // Guard misuse: H1 must be the strictly-drifted (lower) rate, and the probabilities and
  // error rates must be open in (0, 1) so every log term is finite.
  if (!(p1 < p0)) {
    throw new Error('sprt: require p1 < p0 (H1 is the drifted, lower-rate hypothesis)');
  }
  if (p0 <= 0 || p0 >= 1 || p1 <= 0 || p1 >= 1) {
    throw new Error('sprt: p0 and p1 must lie strictly in (0, 1)');
  }
  if (alpha <= 0 || alpha >= 1 || beta <= 0 || beta >= 1) {
    throw new Error('sprt: alpha and beta must lie strictly in (0, 1)');
  }

  // No data yet -> cannot decide.
  if (n <= 0) return 'CONTINUE';

  const s = Math.max(0, Math.min(successes, n));
  const failures = n - s;

  const llr = s * Math.log(p1 / p0) + failures * Math.log((1 - p1) / (1 - p0));
  const A = Math.log((1 - beta) / alpha);
  const B = Math.log(beta / (1 - alpha));

  if (llr >= A) return 'ACCEPT_DRIFTED';
  if (llr <= B) return 'ACCEPT_HEALTHY';
  return 'CONTINUE';
}

/**
 * Recommended fixed sample size for a target Wilson half-width at a working proportion.
 *
 * Derivation: the Wilson half-width is dominated, for moderate-to-large n, by the same
 * leading term as the Wald margin, z*sqrt(p*(1-p)/n). Setting that equal to the desired
 * half-width h and solving for n:
 *
 *   h = z * sqrt(p*(1-p)/n)
 *   h^2 = z^2 * p*(1-p) / n
 *   n = z^2 * p*(1-p) / h^2
 *
 * At p=0.7, h=0.06, z=1.96:  n = 3.8416 * 0.21 / 0.0036 ≈ 224.  The study-swarm's
 * ~150-200-per-mood result falls out of this family (tighter h or p further from 0.5 pulls
 * n down). We round up — you cannot take a fractional sample — and floor at 1.
 *
 * Note this is the Wald-leading-term estimate used for PLANNING. The actual gate always
 * computes the true Wilson interval on the realized counts; this only sizes the run.
 *
 * @param p         working proportion the run is planned around (default 0.7)
 * @param halfWidth desired Wilson half-width (default 0.06)
 * @param z         standard-normal critical value (default 1.96)
 */
export function recommendedSampleSize(p = 0.7, halfWidth = 0.06, z = 1.96): number {
  if (!(halfWidth > 0)) {
    throw new Error('recommendedSampleSize: halfWidth must be > 0');
  }
  const pClamped = clamp01(p);
  const n = (z * z * pClamped * (1 - pClamped)) / (halfWidth * halfWidth);
  return Math.max(1, Math.ceil(n));
}
