import { describe, it, expect } from 'vitest';
import { CAPTURE_SCHEMA } from '../src/capture.js';
import {
  EnrichedRecordSchema,
  ProvenanceSchema,
  PiiScrubResultSchema,
} from '../src/dataset/provenance-schema.js';
import { enrichCaptureJsonl } from '../src/dataset/enrich.js';

/** A well-formed raw row (a genuine, non-degraded generation). */
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

/** A well-formed provenance block for a synthetic public_candidate row. */
const validProvenance = {
  source_type: 'synthetic',
  consent_status: 'n/a',
  pii_scrub: null,
  code_snippet_flag: false,
  record_verdict: 'public_candidate',
  verdict_reason: 'synthetic row (internal-seed input + model output); public pending human review',
};

const validEnriched = { ...validRow, provenance: validProvenance };

describe('PiiScrubResultSchema', () => {
  it('accepts a per-entity pass/fail map', () => {
    expect(
      PiiScrubResultSchema.safeParse({
        tool: 'regex-floor',
        version: '0.0.0',
        per_entity: { email: 'pass', phone: 'fail' },
        clean: false,
      }).success,
    ).toBe(true);
  });

  it('rejects a per-entity value other than pass/fail', () => {
    expect(
      PiiScrubResultSchema.safeParse({
        tool: 'regex-floor',
        version: '0.0.0',
        per_entity: { email: 'maybe' },
        clean: false,
      }).success,
    ).toBe(false);
  });

  it('rejects a stray key (closed contract)', () => {
    expect(
      PiiScrubResultSchema.safeParse({ tool: 't', version: '0', per_entity: {}, clean: true, extra: 1 }).success,
    ).toBe(false);
  });
});

describe('ProvenanceSchema', () => {
  it('accepts a well-formed provenance block', () => {
    expect(ProvenanceSchema.safeParse(validProvenance).success).toBe(true);
  });

  it('rejects an unknown record_verdict', () => {
    expect(ProvenanceSchema.safeParse({ ...validProvenance, record_verdict: 'ship-it' }).success).toBe(false);
  });

  it('rejects an unknown consent_status', () => {
    expect(ProvenanceSchema.safeParse({ ...validProvenance, consent_status: 'sure' }).success).toBe(false);
  });

  it('rejects a stray key (closed contract)', () => {
    expect(ProvenanceSchema.safeParse({ ...validProvenance, sneaky: 1 }).success).toBe(false);
  });
});

describe('EnrichedRecordSchema (the enriched-row contract)', () => {
  it('accepts a well-formed enriched record (row + provenance)', () => {
    expect(EnrichedRecordSchema.safeParse(validEnriched).success).toBe(true);
  });

  it('rejects an enriched record with no provenance block', () => {
    expect(EnrichedRecordSchema.safeParse(validRow).success).toBe(false);
  });

  it('rejects an unknown top-level key (closed contract, inherited from the base row)', () => {
    expect(EnrichedRecordSchema.safeParse({ ...validEnriched, sneaky: 1 }).success).toBe(false);
  });

  it('enforces the SAME cross-field invariant as the raw row (valid:true + degraded_reason fails)', () => {
    expect(EnrichedRecordSchema.safeParse({ ...validEnriched, degraded_reason: 'timeout' }).success).toBe(false);
  });

  it('accepts a degraded enriched row (valid:false + degraded_reason + internal verdict)', () => {
    const degraded = {
      ...validRow,
      valid: false,
      degraded_reason: 'language',
      provenance: { ...validProvenance, record_verdict: 'internal', verdict_reason: 'degraded output — internal-only negative' },
    };
    expect(EnrichedRecordSchema.safeParse(degraded).success).toBe(true);
  });
});

describe('enrichCaptureJsonl', () => {
  it('enriches valid rows and tallies verdicts (synthetic → public_candidate)', () => {
    const jsonl = [JSON.stringify(validRow), JSON.stringify({ ...validRow, mood: 'cynic' })].join('\n');
    const { records, summary } = enrichCaptureJsonl(jsonl, { source_type: 'synthetic' });
    expect(summary.total).toBe(2);
    expect(summary.enriched).toBe(2);
    expect(summary.invalid).toBe(0);
    expect(summary.by_verdict.public_candidate).toBe(2);
    expect(records.every((r) => r.provenance.record_verdict === 'public_candidate')).toBe(true);
    expect(records.every((r) => r.provenance.consent_status === 'n/a')).toBe(true);
  });

  it('every enriched record round-trips through EnrichedRecordSchema', () => {
    const jsonl = [JSON.stringify(validRow), JSON.stringify({ ...validRow, valid: false, degraded_reason: 'language' })].join('\n');
    const { records } = enrichCaptureJsonl(jsonl);
    expect(records).toHaveLength(2);
    for (const r of records) expect(EnrichedRecordSchema.safeParse(r).success).toBe(true);
  });

  it('reports parse + contract failures with 1-based line numbers and skips blank lines', () => {
    const jsonl = [
      JSON.stringify(validRow), // line 1 ok
      '{ not valid json', // line 2 parse error
      JSON.stringify({ ...validRow, mood: 'nope' }), // line 3 contract error
      '', // trailing blank — skipped, not an error
    ].join('\n');
    const { summary } = enrichCaptureJsonl(jsonl);
    expect(summary.total).toBe(3);
    expect(summary.enriched).toBe(1);
    expect(summary.invalid).toBe(2);
    expect(summary.errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it('a degraded row enriches to an internal verdict (never a public positive)', () => {
    const jsonl = JSON.stringify({ ...validRow, valid: false, degraded_reason: 'safety-filter' });
    const { summary } = enrichCaptureJsonl(jsonl);
    expect(summary.by_verdict.internal).toBe(1);
    expect(summary.by_verdict.public_candidate).toBe(0);
  });

  it('user_input without opt-in consent stays internal', () => {
    const jsonl = JSON.stringify({ ...validRow, input: 'just some plain feedback' });
    const { records, summary } = enrichCaptureJsonl(jsonl, { source_type: 'user_input', consent_status: 'unknown' });
    expect(summary.by_verdict.internal).toBe(1);
    expect(records[0].provenance.verdict_reason).toContain('opt-in');
  });

  it('defaults source_type to synthetic when no context is given', () => {
    const { records } = enrichCaptureJsonl(JSON.stringify(validRow));
    expect(records[0].provenance.source_type).toBe('synthetic');
  });
});
