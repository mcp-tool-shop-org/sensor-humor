import { describe, it, expect } from 'vitest';
import { tupleKey, type BwsJudgment } from '../src/dataset/label/bws.js';
import {
  appearanceCounts,
  strengthMap,
  comparisonEntropy,
  selectNextTuple,
} from '../src/dataset/label/bws-active.js';

// Six items in two strength clusters with EQUAL appearances: a,c,e win once each, b,d,f lose once each,
// and every judgment shows all six — so appearances are identical and only the strengths separate them.
const six = ['a', 'b', 'c', 'd', 'e', 'f'];
const clustered: BwsJudgment[] = [
  { items: six, best: 'a', worst: 'b' },
  { items: six, best: 'c', worst: 'd' },
  { items: six, best: 'e', worst: 'f' },
];

describe('appearanceCounts', () => {
  it('counts how many tuples each item appeared in', () => {
    const counts = appearanceCounts(clustered);
    for (const it of six) expect(counts.get(it)).toBe(3);
    expect(counts.get('missing')).toBeUndefined();
  });
});

describe('strengthMap', () => {
  it('is the uniform prior when there are no judgments', () => {
    const sm = strengthMap(['a', 'b', 'c', 'd'], []);
    for (const v of sm.values()) expect(v).toBeCloseTo(0.25, 10);
  });

  it('reflects Bradley-Terry strengths once there is data (winner > loser)', () => {
    const sm = strengthMap(six, clustered);
    expect(sm.get('a')!).toBeGreaterThan(sm.get('b')!);
    expect(sm.get('c')!).toBeGreaterThan(sm.get('d')!);
    expect(sm.get('e')!).toBeGreaterThan(sm.get('f')!);
  });

  it('gives an un-compared item a neutral (mean) strength rather than dropping it', () => {
    const sm = strengthMap([...six, 'newbie'], clustered);
    expect(sm.has('newbie')).toBe(true);
    const s = sm.get('newbie')!;
    expect(s).toBeGreaterThan(sm.get('b')!); // above the losers
    expect(s).toBeLessThan(sm.get('a')!); // below the winners
  });
});

describe('comparisonEntropy', () => {
  it('is maximal (1 bit) when strengths are equal, regardless of level', () => {
    expect(comparisonEntropy(0.5, 0.5)).toBeCloseTo(1, 10);
    expect(comparisonEntropy(0.2, 0.2)).toBeCloseTo(1, 10);
  });

  it('is 0 for a settled comparison (one item dominates)', () => {
    expect(comparisonEntropy(0.3, 0)).toBe(0);
  });

  it('is symmetric and rewards closer strengths', () => {
    expect(comparisonEntropy(0.2, 0.8)).toBeCloseTo(comparisonEntropy(0.8, 0.2), 12);
    expect(comparisonEntropy(0.45, 0.55)).toBeGreaterThan(comparisonEntropy(0.1, 0.9));
  });
});

describe('selectNextTuple', () => {
  it('is deterministic — same state, same tuple', () => {
    expect(selectNextTuple(six, clustered, 4)).toEqual(selectNextTuple(six, clustered, 4));
  });

  it('throws when there are fewer than k items', () => {
    expect(() => selectNextTuple(['a', 'b'], [], 4)).toThrow();
  });

  it('always seeds in the least-sampled item (coverage — you cannot reduce unseen uncertainty)', () => {
    const items = ['a', 'b', 'c', 'd', 'z'];
    const judged: BwsJudgment[] = [
      { items: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' },
      { items: ['a', 'b', 'c', 'd'], best: 'b', worst: 'c' },
    ];
    // a,b,c,d each appeared twice; z never — z must be pulled in.
    expect(selectNextTuple(items, judged, 4).items).toContain('z');
  });

  it('targets the uncertain frontier — groups close-strength items, not a settled max-spread tuple', () => {
    const sm = strengthMap(six, clustered);
    const spread = (t: string[]): number => Math.max(...t.map((x) => sm.get(x)!)) - Math.min(...t.map((x) => sm.get(x)!));
    const selected = selectNextTuple(six, clustered, 3).items;
    // seed is 'a' (equal appearances → lowest id); its closest-strength mates are the other winners.
    expect(selected).toEqual(['a', 'c', 'e']);
    // the selected tuple is tighter in strength than the naive first-k-by-id tuple (which mixes clusters).
    expect(spread(selected)).toBeLessThan(spread(['a', 'b', 'c']));
  });

  it('honors the exclude set (resume) — returns a different tuple when its first choice was already judged', () => {
    const first = selectNextTuple(six, clustered, 4);
    const second = selectNextTuple(six, clustered, 4, { exclude: [tupleKey(first.items)] });
    expect(tupleKey(second.items)).not.toBe(tupleKey(first.items));
  });
});
