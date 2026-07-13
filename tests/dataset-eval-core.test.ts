import { describe, it, expect } from 'vitest';
import { scoreDeterministic, deterministicClean } from '../src/dataset/eval/rubric.js';
import {
  binomialTailGE,
  isAboveChance,
  moodBlindGate,
  moodShuffledGate,
  degradedLineGate,
  conformanceFloorGate,
  MOOD_BLIND_CHANCE,
} from '../src/dataset/eval/gates.js';

describe('scoreDeterministic — the deterministic rubric dimensions', () => {
  it('a clean, in-shape roast line passes all three dimensions', () => {
    const s = scoreDeterministic('roast', 'Verdict: three hundred lines and not one of them earns its keep.');
    expect(s).toMatchObject({ safety_ok: true, language_ok: true, form_ok: true });
    expect(deterministicClean(s)).toBe(true);
  });

  it('a simile leak fails ONLY the safety dimension', () => {
    const s = scoreDeterministic('dry', 'The config sprawls like a city with no zoning board.');
    expect(s.safety_ok).toBe(false);
    expect(s.form_ok).toBe(true);
    expect(s.language_ok).toBe(true);
    expect(s.reasons.some((r) => r.startsWith('safety:'))).toBe(true);
  });

  it('a well-formed but wrong-shape line (roast with no label) fails ONLY the form dimension', () => {
    const s = scoreDeterministic('roast', 'Three hundred lines and not one of them earns its keep.');
    expect(s.form_ok).toBe(false);
    expect(s.safety_ok).toBe(true);
    expect(s.language_ok).toBe(true);
  });

  it('a code-switched line fails ONLY the language dimension', () => {
    // roast label present (form ok), safe, but a Han run trips the language gate
    const s = scoreDeterministic('roast', 'Verdict: 周五部署失败 again, classic.');
    expect(s.language_ok).toBe(false);
    expect(s.safety_ok).toBe(true);
    expect(s.form_ok).toBe(true);
    expect(s.reasons).toContain('language:code-switch');
  });

  it('an empty line fails the form dimension', () => {
    expect(scoreDeterministic('dry', '').form_ok).toBe(false);
  });
});

describe('binomialTailGE — exact upper-tail P(X >= k)', () => {
  it('boundary cases', () => {
    expect(binomialTailGE(0, 10, 0.5)).toBe(1); // X>=0 certain
    expect(binomialTailGE(11, 10, 0.5)).toBe(0); // k>n impossible
  });

  it('matches hand-computed fair-coin tails', () => {
    expect(binomialTailGE(1, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(binomialTailGE(2, 2, 0.5)).toBeCloseTo(0.25, 10);
    expect(binomialTailGE(1, 2, 0.5)).toBeCloseTo(0.75, 10);
    expect(binomialTailGE(2, 4, 0.5)).toBeCloseTo(11 / 16, 10); // 1 - 1/16 - 4/16
  });

  it('is monotonically non-increasing in k', () => {
    let prev = binomialTailGE(0, 20, 1 / 6);
    for (let k = 1; k <= 21; k++) {
      const cur = binomialTailGE(k, 20, 1 / 6);
      expect(cur).toBeLessThanOrEqual(prev + 1e-12);
      prev = cur;
    }
  });
});

describe('isAboveChance — one-sided binomial test', () => {
  it('a rate near the chance base is NOT above chance', () => {
    // 16/96 ≈ 1/6 exactly (the null mean) → p-value ~0.5, not significant
    expect(isAboveChance(16, 96, MOOD_BLIND_CHANCE).aboveChance).toBe(false);
  });

  it('a rate far above the chance base IS above chance', () => {
    expect(isAboveChance(30, 96, MOOD_BLIND_CHANCE).aboveChance).toBe(true);
  });
});

describe('pre-registered gate predicates', () => {
  it('mood-blind: passes above chance, fails at chance', () => {
    expect(moodBlindGate(30, 96).pass).toBe(true);
    expect(moodBlindGate(16, 96).pass).toBe(false);
  });

  it('mood-shuffled: passes on a wide real−shuffled gap, fails on a narrow one', () => {
    expect(moodShuffledGate(0.75, 0.3).pass).toBe(true); // 45pp gap
    expect(moodShuffledGate(0.75, 0.7).pass).toBe(false); // 5pp gap — no discrimination
  });

  it('degraded-line: passes at/below the floor, fails above it', () => {
    expect(degradedLineGate(0.1).pass).toBe(true);
    expect(degradedLineGate(0.5).pass).toBe(false);
  });

  it('conformance floor: real signal must itself clear the minimum', () => {
    expect(conformanceFloorGate(0.6).pass).toBe(true);
    expect(conformanceFloorGate(0.3).pass).toBe(false);
  });
});
