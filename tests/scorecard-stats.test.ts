import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  threeValuedVerdict,
  sprt,
  recommendedSampleSize,
} from '../src/scorecard/stats.js';

describe('scorecard stats — the regression gate grounding', () => {
  describe('wilsonInterval', () => {
    it('matches the known 70/100 interval ~ [0.603, 0.782]', () => {
      const { lower, upper } = wilsonInterval(70, 100);
      expect(lower).toBeCloseTo(0.603, 2);
      expect(upper).toBeCloseTo(0.782, 2);
    });

    it('returns [0, 1] for n = 0 (an undefined proportion is maximally uncertain)', () => {
      expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
    });

    it('keeps the upper bound at exactly 1 for 100/100 (Wilson does not blow up at p=1)', () => {
      const { lower, upper } = wilsonInterval(100, 100);
      expect(upper).toBe(1);
      expect(lower).toBeGreaterThan(0.95);
    });

    it('keeps the lower bound at exactly 0 for 0/n (clamped, never negative)', () => {
      const { lower, upper } = wilsonInterval(0, 50);
      expect(lower).toBe(0);
      expect(upper).toBeGreaterThan(0);
      expect(upper).toBeLessThan(0.1);
    });

    it('clamps invalid input (successes > n) instead of producing garbage', () => {
      const { lower, upper } = wilsonInterval(120, 100);
      expect(upper).toBe(1);
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(lower).toBeLessThanOrEqual(1);
    });

    it('treats negative successes as 0', () => {
      const { lower, upper } = wilsonInterval(-5, 50);
      expect(lower).toBe(0);
      expect(upper).toBeGreaterThanOrEqual(0);
    });

    it('produces a narrower interval as n grows (more data -> more certainty)', () => {
      const small = wilsonInterval(7, 10);
      const large = wilsonInterval(700, 1000);
      const wSmall = small.upper - small.lower;
      const wLarge = large.upper - large.lower;
      expect(wLarge).toBeLessThan(wSmall);
    });
  });

  describe('threeValuedVerdict — andon-correct three-valued gate', () => {
    it('THE STUDY-SWARM CLAIM: 6/10 @ threshold 0.65 is INCONCLUSIVE, not FAIL', () => {
      // At N=10 the Wilson interval is far too wide to separate a healthy 0.75 mood from
      // a genuinely broken one. The naive point-threshold design would FAIL on the 0.60
      // observed rate ~22% of the time by chance (Brown/Cai/DasGupta 2001). The correct
      // gate refuses to decide here.
      const verdict = threeValuedVerdict(6, 10, { threshold: 0.65 });
      expect(verdict).toBe('INCONCLUSIVE');
      expect(verdict).not.toBe('FAIL');

      // Confirm the interval genuinely straddles the threshold.
      const { lower, upper } = wilsonInterval(6, 10);
      expect(lower).toBeLessThan(0.65);
      expect(upper).toBeGreaterThan(0.65);
    });

    it('at a sound N a healthy mood (150/200 @ 0.65) returns PASS', () => {
      // A genuinely healthy 0.75 conformance rate at N=200: the Wilson lower bound
      // (~0.686) clears the 0.65 floor, so the gate is confident enough to PASS.
      const verdict = threeValuedVerdict(150, 200, { threshold: 0.65 });
      expect(verdict).toBe('PASS');
      expect(wilsonInterval(150, 200).lower).toBeGreaterThan(0.65);
    });

    it('at a sound N a genuinely drifted mood (110/200 @ 0.65) returns FAIL', () => {
      const verdict = threeValuedVerdict(110, 200, { threshold: 0.65 });
      expect(verdict).toBe('FAIL');
      expect(wilsonInterval(110, 200).upper).toBeLessThan(0.65);
    });

    it('FAIL fires only when the Wilson UPPER bound is below threshold, never on uncertainty', () => {
      // 6/10 observed rate is 0.60 < 0.65 (a naive point gate would FAIL) yet the verdict
      // is INCONCLUSIVE because the upper bound is well above the threshold.
      expect(threeValuedVerdict(6, 10, { threshold: 0.65 })).not.toBe('FAIL');
    });
  });

  describe('sprt — Wald sequential early-stopping', () => {
    const base = { p0: 0.72, p1: 0.62, alpha: 0.05, beta: 0.05 };

    it('accepts a clearly-healthy stream early (60/70)', () => {
      expect(sprt({ successes: 60, n: 70, ...base })).toBe('ACCEPT_HEALTHY');
    });

    it('accepts a clearly-drifted stream early (35/70)', () => {
      expect(sprt({ successes: 35, n: 70, ...base })).toBe('ACCEPT_DRIFTED');
    });

    it('keeps sampling on an ambiguous early stream (5/8)', () => {
      expect(sprt({ successes: 5, n: 8, ...base })).toBe('CONTINUE');
    });

    it('returns CONTINUE with no data', () => {
      expect(sprt({ successes: 0, n: 0, ...base })).toBe('CONTINUE');
    });

    it('throws if p1 >= p0 (H1 must be the drifted, lower-rate hypothesis)', () => {
      expect(() => sprt({ successes: 5, n: 10, p0: 0.62, p1: 0.72, alpha: 0.05, beta: 0.05 })).toThrow(
        /p1 < p0/,
      );
    });

    it('throws on degenerate edge probabilities (p=0 or p=1)', () => {
      expect(() => sprt({ successes: 5, n: 10, p0: 1, p1: 0.62, alpha: 0.05, beta: 0.05 })).toThrow();
      expect(() => sprt({ successes: 5, n: 10, p0: 0.72, p1: 0, alpha: 0.05, beta: 0.05 })).toThrow();
    });

    it('throws on out-of-range alpha/beta', () => {
      expect(() => sprt({ successes: 5, n: 10, p0: 0.72, p1: 0.62, alpha: 0, beta: 0.05 })).toThrow();
      expect(() => sprt({ successes: 5, n: 10, p0: 0.72, p1: 0.62, alpha: 0.05, beta: 1 })).toThrow();
    });
  });

  describe('recommendedSampleSize', () => {
    it('recommendedSampleSize(0.7, 0.06) lands in the study-swarm range ~150-230', () => {
      const n = recommendedSampleSize(0.7, 0.06);
      expect(n).toBeGreaterThanOrEqual(150);
      expect(n).toBeLessThanOrEqual(230);
    });

    it('a tighter half-width demands more samples', () => {
      const wide = recommendedSampleSize(0.7, 0.06);
      const tight = recommendedSampleSize(0.7, 0.03);
      expect(tight).toBeGreaterThan(wide);
    });

    it('returns a whole number >= 1 (rounds up — no fractional samples)', () => {
      const n = recommendedSampleSize(0.7, 0.06);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    });

    it('throws on a non-positive half-width', () => {
      expect(() => recommendedSampleSize(0.7, 0)).toThrow();
    });
  });
});
