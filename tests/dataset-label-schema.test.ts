import { describe, it, expect } from 'vitest';
import {
  BWS_JUDGMENT_SCHEMA,
  BwsJudgmentRecordSchema,
  lineId,
  bestWorstInTuple,
  tupleIdsDistinct,
  judgmentRecordToBws,
} from '../src/dataset/label/schema.js';

const ids = ['aaa', 'bbb', 'ccc', 'ddd'];
const valid = {
  schema: BWS_JUDGMENT_SCHEMA,
  ts: 1_700_000_000_000,
  mood: 'dry',
  line_ids: ids,
  best: 'aaa',
  worst: 'ddd',
};

describe('lineId', () => {
  it('is stable + content-derived (same mood|output → same 12-hex id)', () => {
    expect(lineId('dry', 'the build failed again')).toBe(lineId('dry', 'the build failed again'));
    expect(lineId('dry', 'x')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('separates by mood and by output (the same text under two moods is two lines)', () => {
    expect(lineId('dry', 'x')).not.toBe(lineId('roast', 'x'));
    expect(lineId('dry', 'x')).not.toBe(lineId('dry', 'y'));
    // mood is a closed enum with no '|', so the first '|' always separates mood from output
    // unambiguously — an output that itself contains '|' stays distinct from a different output.
    expect(lineId('dry', 'a|b')).not.toBe(lineId('dry', 'a|c'));
    expect(lineId('dry', 'a|b')).not.toBe(lineId('dry', 'ab'));
  });
});

describe('structural predicates', () => {
  it('bestWorstInTuple requires best+worst ∈ line_ids and distinct', () => {
    expect(bestWorstInTuple({ line_ids: ids, best: 'aaa', worst: 'ddd' })).toBe(true);
    expect(bestWorstInTuple({ line_ids: ids, best: 'zzz', worst: 'ddd' })).toBe(false);
    expect(bestWorstInTuple({ line_ids: ids, best: 'aaa', worst: 'aaa' })).toBe(false);
  });

  it('tupleIdsDistinct rejects a repeated id', () => {
    expect(tupleIdsDistinct({ line_ids: ids })).toBe(true);
    expect(tupleIdsDistinct({ line_ids: ['aaa', 'aaa', 'bbb'] })).toBe(false);
  });
});

describe('BwsJudgmentRecordSchema', () => {
  it('round-trips a valid judgment (with and without an optional rater)', () => {
    expect(BwsJudgmentRecordSchema.safeParse(valid).success).toBe(true);
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, rater: 'mike' }).success).toBe(true);
  });

  it('rejects a wrong/absent schema tag', () => {
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, schema: 'comedic-moods-bws/v1' }).success).toBe(false);
    const { schema: _drop, ...noSchema } = valid;
    expect(BwsJudgmentRecordSchema.safeParse(noSchema).success).toBe(false);
  });

  it('is strict — an unknown top-level key is a contract violation', () => {
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, sneaky: 1 }).success).toBe(false);
  });

  it('rejects best or worst that is not one of line_ids', () => {
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, best: 'zzz' }).success).toBe(false);
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, worst: 'zzz' }).success).toBe(false);
  });

  it('rejects best === worst', () => {
    const res = BwsJudgmentRecordSchema.safeParse({ ...valid, best: 'aaa', worst: 'aaa' });
    expect(res.success).toBe(false);
  });

  it('rejects duplicate line_ids', () => {
    const res = BwsJudgmentRecordSchema.safeParse({ ...valid, line_ids: ['aaa', 'aaa', 'ccc', 'ddd'], best: 'aaa', worst: 'ddd' });
    expect(res.success).toBe(false);
  });

  it('requires at least two line_ids', () => {
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, line_ids: ['aaa'], best: 'aaa', worst: 'aaa' }).success).toBe(false);
  });

  it('rejects a negative ts and an unknown mood', () => {
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, ts: -1 }).success).toBe(false);
    expect(BwsJudgmentRecordSchema.safeParse({ ...valid, mood: 'giddy' }).success).toBe(false);
  });

  it('reports the offending field path for a structural violation', () => {
    const res = BwsJudgmentRecordSchema.safeParse({ ...valid, best: 'zzz' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues.some((i) => i.path.join('.') === 'best')).toBe(true);
  });
});

describe('judgmentRecordToBws', () => {
  it('projects the record onto the pure-math shape (drops persistence fields)', () => {
    const parsed = BwsJudgmentRecordSchema.parse(valid);
    expect(judgmentRecordToBws(parsed)).toEqual({ items: ids, best: 'aaa', worst: 'ddd' });
  });
});
