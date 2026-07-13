import { describe, it, expect } from 'vitest';
import {
  makeBwsTuples,
  bwsCountScores,
  judgmentToPairs,
  judgmentsToPairs,
  fitBradleyTerry,
  findIntransitiveTriples,
  type BwsJudgment,
} from '../src/dataset/label/bws.js';

describe('makeBwsTuples', () => {
  it('makes size-k tuples with distinct members covering every item', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const tuples = makeBwsTuples(items, 4, 2);
    expect(tuples.length).toBeGreaterThan(0);
    const covered = new Set<string>();
    for (const t of tuples) {
      expect(t.items).toHaveLength(4);
      expect(new Set(t.items).size).toBe(4); // no duplicate within a tuple
      for (const it of t.items) covered.add(it);
    }
    expect([...covered].sort()).toEqual(items);
  });

  it('is deterministic', () => {
    const a = makeBwsTuples(['a', 'b', 'c', 'd', 'e'], 4, 2);
    const b = makeBwsTuples(['a', 'b', 'c', 'd', 'e'], 4, 2);
    expect(a).toEqual(b);
  });

  it('throws when there are fewer items than the tuple size', () => {
    expect(() => makeBwsTuples(['a', 'b'], 4)).toThrow();
  });
});

describe('bwsCountScores', () => {
  it('scores (best − worst) / appearances, ranked descending', () => {
    const judgments: BwsJudgment[] = [
      { items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' },
      { items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'c' },
    ];
    const ranked = bwsCountScores(judgments);
    expect(ranked[0]).toEqual({ item: 'a', score: 1 }); // best twice, worst never, appeared twice
    expect(ranked.map((r) => r.item)).toEqual(['a', 'b', 'c', 'd']); // b=0, c=d=-0.5 (tie → id order)
    expect(ranked.find((r) => r.item === 'c')!.score).toBeCloseTo(-0.5, 10);
  });
});

describe('judgmentToPairs', () => {
  it('best beats all others; every middle beats worst (2k−3 pairs)', () => {
    const pairs = judgmentToPairs({ items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' });
    expect(pairs).toHaveLength(5);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ['a', 'b'],
        ['a', 'c'],
        ['a', 'd'],
        ['b', 'd'],
        ['c', 'd'],
      ]),
    );
  });

  it('judgmentsToPairs flattens across judgments', () => {
    const pairs = judgmentsToPairs([
      { items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' },
      { items: ['a', 'b', 'c', 'd'], best: 'b', worst: 'c' },
    ]);
    expect(pairs).toHaveLength(10);
  });
});

describe('fitBradleyTerry', () => {
  it('recovers a transitive order a > b > c', () => {
    const ranked = fitBradleyTerry([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
    expect(ranked.map((r) => r.item)).toEqual(['a', 'b', 'c']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  });

  it('a consistent winner ranks first', () => {
    const ranked = fitBradleyTerry([
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
    ]);
    expect(ranked[0].item).toBe('a');
  });

  it('empty input → empty ranking', () => {
    expect(fitBradleyTerry([])).toEqual([]);
  });

  it('strengths sum to ~1', () => {
    const ranked = fitBradleyTerry([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    expect(ranked.reduce((s, r) => s + r.score, 0)).toBeCloseTo(1, 6);
  });
});

describe('findIntransitiveTriples', () => {
  it('detects a cycle a≻b≻c≻a', () => {
    const cycles = findIntransitiveTriples([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    expect(cycles).toEqual([['a', 'b', 'c']]);
  });

  it('a transitive set has no cycles', () => {
    const cycles = findIntransitiveTriples([
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ]);
    expect(cycles).toEqual([]);
  });

  it('BWS judgments are internally transitive (no self-inflicted cycles)', () => {
    // a single BWS judgment can never produce a cycle among its own items
    const pairs = judgmentToPairs({ items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' });
    expect(findIntransitiveTriples(pairs)).toEqual([]);
  });
});
