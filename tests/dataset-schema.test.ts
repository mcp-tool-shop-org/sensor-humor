import { describe, it, expect } from 'vitest';
import { CAPTURE_SCHEMA } from '../src/capture.js';
import { CaptureRowSchema, CAPTURE_ROW_KEYS } from '../src/dataset/schema.js';
import { validateCaptureJsonl } from '../src/dataset/validate.js';

/** A well-formed row (a genuine, non-degraded generation). */
const validRow = {
  schema: CAPTURE_SCHEMA,
  ts: 1_700_000_000_000,
  turn: 1,
  tool: 'roast',
  mood: 'dry',
  input: 'a 3000-line file with zero comments',
  output: 'A 3000-line file with zero comments. How are they expecting anyone to find the exit??',
  valid: true,
  validators_triggered: [],
  prompt_version: 'dry.v1',
  model: 'qwen2.5:7b',
  inference: { temperature: 0.55, top_p: 0.85, top_k: 40, mirostat: 2, mirostat_tau: 5 },
  prompt_fingerprint: '8759040bb8ee',
  retries: 1,
  latency_ms: 9226,
};

describe('CaptureRowSchema (the row contract)', () => {
  it('accepts a well-formed generated row', () => {
    expect(CaptureRowSchema.safeParse(validRow).success).toBe(true);
  });

  it('accepts a reuse-path row (no generation metadata)', () => {
    const reuse = {
      schema: CAPTURE_SCHEMA,
      ts: 1,
      turn: 12,
      tool: 'catchphrase',
      mood: 'chaotic',
      input: 'another flaky CI run',
      output: 'CI: Yet another flake',
      valid: true,
      validators_triggered: ['reuse'],
      prompt_version: 'chaotic.v1',
      model: 'qwen2.5:7b',
      inference: { temperature: 0.55, top_p: 0.85, top_k: 40, mirostat: 2, mirostat_tau: 5 },
    };
    expect(CaptureRowSchema.safeParse(reuse).success).toBe(true);
  });

  it('rejects a missing output line', () => {
    const { output, ...noOutput } = validRow;
    void output;
    expect(CaptureRowSchema.safeParse(noOutput).success).toBe(false);
  });

  it('rejects an empty output line', () => {
    expect(CaptureRowSchema.safeParse({ ...validRow, output: '' }).success).toBe(false);
  });

  it('rejects an unknown mood', () => {
    expect(CaptureRowSchema.safeParse({ ...validRow, mood: 'silly' }).success).toBe(false);
  });

  it('rejects an unknown top-level key (closed contract)', () => {
    expect(CaptureRowSchema.safeParse({ ...validRow, sneaky: 1 }).success).toBe(false);
  });

  it('rejects a stray key in inference (closed contract)', () => {
    const bad = { ...validRow, inference: { ...validRow.inference, seed: 42 } };
    expect(CaptureRowSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects valid:true carrying a degraded_reason (cross-field invariant)', () => {
    expect(CaptureRowSchema.safeParse({ ...validRow, degraded_reason: 'timeout' }).success).toBe(false);
  });

  it('accepts valid:false with a degraded_reason', () => {
    const degraded = { ...validRow, valid: false, degraded_reason: 'safety-filter' };
    expect(CaptureRowSchema.safeParse(degraded).success).toBe(true);
  });

  it('rejects valid:false with NO degraded_reason (cross-field invariant)', () => {
    expect(CaptureRowSchema.safeParse({ ...validRow, valid: false }).success).toBe(false);
  });

  // Drift guard: every field the fixture uses must be a known schema field (a valid:true row legally
  // omits the optional degraded_reason, so its key set is a SUBSET of the schema's). CaptureRow is
  // inferred FROM this schema (single source), so a fixture key not in the contract fails here.
  it('the canonical row uses only known schema fields (no fixture drift)', () => {
    for (const key of Object.keys(validRow)) expect(CAPTURE_ROW_KEYS).toContain(key);
  });
});

describe('validateCaptureJsonl', () => {
  it('counts valid/invalid rows and reports 1-based line numbers', () => {
    const jsonl = [
      JSON.stringify(validRow),
      '{ not valid json',
      JSON.stringify({ ...validRow, mood: 'nope' }),
      '', // trailing blank line — must be skipped, not an error
    ].join('\n');
    const r = validateCaptureJsonl(jsonl);
    expect(r.total).toBe(3);
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(2);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});
