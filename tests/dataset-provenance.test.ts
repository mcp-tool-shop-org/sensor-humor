import { describe, it, expect } from 'vitest';
import { CAPTURE_SCHEMA } from '../src/capture.js';
import type { CaptureRow } from '../src/capture.js';
import {
  assignVerdict,
  looksLikeCode,
  type PiiScrubResult,
} from '../src/dataset/provenance.js';

function makeRow(over: Partial<CaptureRow> = {}): CaptureRow {
  return {
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
    prompt_fingerprint: 'abc123def456',
    retries: 1,
    latency_ms: 200,
    ...over,
  } as CaptureRow;
}

const cleanScrub: PiiScrubResult = {
  tool: 'presidio',
  version: '0.0.0',
  per_entity: { email: 'pass', phone: 'pass' },
  clean: true,
};
const dirtyScrub: PiiScrubResult = {
  tool: 'presidio',
  version: '0.0.0',
  per_entity: { email: 'pass', phone: 'fail' },
  clean: false,
};

describe('looksLikeCode', () => {
  it('is false for prose ABOUT code (the internal seed inputs)', () => {
    expect(looksLikeCode('a 3000-line file with zero comments')).toBe(false);
    expect(looksLikeCode('deploying to prod at 4:55pm on a Friday')).toBe(false);
    expect(looksLikeCode('another flaky CI run')).toBe(false);
  });

  it('is true for a real code snippet (multiple signals)', () => {
    expect(looksLikeCode('const x = () => { return foo; }')).toBe(true);
    expect(looksLikeCode('catch (e) {}  // the error is quietly swallowed')).toBe(true);
    expect(looksLikeCode('if (x) { doThing(); }')).toBe(true);
  });
});

describe('assignVerdict — the distribution gate', () => {
  it('a degraded row is internal-only (never a public positive)', () => {
    const r = assignVerdict(makeRow({ valid: false, degraded_reason: 'language' }));
    expect(r.provenance.record_verdict).toBe('internal');
    expect(r.provenance.verdict_reason).toContain('language');
  });

  it('a synthetic (internal-seed) valid row is a public_candidate pending review', () => {
    const r = assignVerdict(makeRow(), { source_type: 'synthetic' });
    expect(r.provenance.record_verdict).toBe('public_candidate');
    expect(r.provenance.consent_status).toBe('n/a');
  });

  it('never auto-assigns public', () => {
    const r = assignVerdict(makeRow(), { source_type: 'synthetic' });
    expect(r.provenance.record_verdict).not.toBe('public');
  });

  it('a failing PII scrub excludes the row', () => {
    const r = assignVerdict(makeRow(), { source_type: 'user_input', consent_status: 'opted_in', pii_scrub: dirtyScrub });
    expect(r.provenance.record_verdict).toBe('excluded');
  });

  it('user input without opt-in consent stays internal', () => {
    const r = assignVerdict(makeRow(), { source_type: 'user_input', consent_status: 'unknown' });
    expect(r.provenance.record_verdict).toBe('internal');
    expect(r.provenance.verdict_reason).toContain('opt-in');
  });

  it('opted-in user input containing CODE stays internal (license review per Doe v. GitHub)', () => {
    const r = assignVerdict(makeRow({ input: 'const secret = () => { return apiKey; }' }), {
      source_type: 'user_input',
      consent_status: 'opted_in',
      pii_scrub: cleanScrub,
    });
    expect(r.provenance.code_snippet_flag).toBe(true);
    expect(r.provenance.record_verdict).toBe('internal');
    expect(r.provenance.verdict_reason).toContain('license');
  });

  it('opted-in user input not yet scrubbed stays internal', () => {
    const r = assignVerdict(makeRow({ input: 'just some plain feedback' }), {
      source_type: 'user_input',
      consent_status: 'opted_in',
    });
    expect(r.provenance.record_verdict).toBe('internal');
    expect(r.provenance.verdict_reason).toContain('scrub');
  });

  it('opted-in, PII-clean, no-code user input becomes a public_candidate', () => {
    const r = assignVerdict(makeRow({ input: 'just some plain feedback' }), {
      source_type: 'user_input',
      consent_status: 'opted_in',
      pii_scrub: cleanScrub,
    });
    expect(r.provenance.record_verdict).toBe('public_candidate');
  });

  it('defaults source_type to synthetic and preserves the row fields', () => {
    const row = makeRow();
    const r = assignVerdict(row);
    expect(r.provenance.source_type).toBe('synthetic');
    expect(r.output).toBe(row.output);
    expect(r.mood).toBe(row.mood);
  });
});
