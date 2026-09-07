import { describe, it, expect } from 'vitest';
import { CAPTURE_SCHEMA } from '../src/capture.js';
import { scrubPii, PII_ENTITY_CLASSES, PII_SCRUB_TOOL } from '../src/dataset/pii-scrub.js';
import { enrichCaptureJsonl } from '../src/dataset/enrich.js';

describe('scrubPii — the regex floor', () => {
  it('clean prose passes every entity class (clean:true)', () => {
    const { result } = scrubPii('deploying to prod at 4:55pm on a Friday, again');
    expect(result.clean).toBe(true);
    for (const c of PII_ENTITY_CLASSES) expect(result.per_entity[c]).toBe('pass');
    expect(result.tool).toBe(PII_SCRUB_TOOL);
  });

  it('detects an email and fails only that class', () => {
    const { result } = scrubPii('ping jane.doe@example.com when it breaks');
    expect(result.per_entity.email).toBe('fail');
    expect(result.clean).toBe(false);
    expect(result.per_entity.ssn).toBe('pass');
  });

  it('detects a US SSN', () => {
    expect(scrubPii('my ssn is 123-45-6789 ok').result.per_entity.ssn).toBe('fail');
  });

  it('detects an IPv4 address', () => {
    expect(scrubPii('the box at 192.168.1.100 is down').result.per_entity.ip).toBe('fail');
  });

  it('detects a phone number', () => {
    expect(scrubPii('call me at (555) 123-4567 tomorrow').result.per_entity.phone).toBe('fail');
  });

  it('detects a card-shaped number', () => {
    expect(scrubPii('card 4111 1111 1111 1111 declined').result.per_entity.credit_card).toBe('fail');
  });

  it('detects secret/key material (several formats)', () => {
    expect(scrubPii('token sk-ABCDEFGHIJKLMNOP1234 leaked').result.per_entity.key).toBe('fail');
    expect(scrubPii('sk-proj-abcdefghijklmnopqrstuvwxyz leaked').result.per_entity.key).toBe('fail');
    expect(scrubPii('sk-ant-abcdefghijklmnopqrstuvwxyz leaked').result.per_entity.key).toBe('fail');
    // Built at runtime so the source never contains a contiguous sk_live_ + 16-alnum token
    // (GitHub push protection treats that shape as a Stripe secret).
    expect(scrubPii(`token ${['sk', 'live', 'x'.repeat(16)].join('_')} leaked`).result.per_entity.key).toBe('fail');
    expect(scrubPii('github_pat_abcdefghijklmnopqrstuvwxyz leaked').result.per_entity.key).toBe('fail');
    expect(scrubPii('-----BEGIN PRIVATE KEY----- leaked').result.per_entity.key).toBe('fail');
    expect(scrubPii('AKIAIOSFODNN7EXAMPLE in the log').result.per_entity.key).toBe('fail');
    expect(scrubPii('hash 5f4dcc3b5aa765d61d8327deb882cf99 stored').result.per_entity.key).toBe('fail');
  });

  it('detects IPv6 as well as IPv4', () => {
    expect(scrubPii('the box at 2001:0db8:85a3:0000:0000:8a2e:0370:7334 is down').result.per_entity.ip).toBe('fail');
    expect(scrubPii('loopback ::1 refused').result.per_entity.ip).toBe('fail');
  });

  it('redacts detected entities to [CLASS] placeholders', () => {
    const { redacted } = scrubPii('email jane@example.com or call 5551234567');
    expect(redacted).toContain('[EMAIL]');
    expect(redacted).not.toContain('jane@example.com');
    // the phone digits should be gone too
    expect(redacted).not.toContain('5551234567');
  });

  it('is deterministic — same text yields the same per-entity result', () => {
    const a = scrubPii('mail x@y.io and ip 10.0.0.1');
    const b = scrubPii('mail x@y.io and ip 10.0.0.1');
    expect(a.result).toEqual(b.result);
  });

  it('accented Latin / ordinary words do not trip a detector (clean)', () => {
    expect(scrubPii('café résumé naïve — a normal sentence about code review').result.clean).toBe(true);
  });
});

// --- enrichment integration ------------------------------------------------

function rowWith(input: string, output = 'A clean generated comedy line about the situation.') {
  return JSON.stringify({
    schema: CAPTURE_SCHEMA,
    ts: 1_700_000_000_000,
    turn: 1,
    tool: 'roast',
    mood: 'dry',
    input,
    output,
    valid: true,
    validators_triggered: [],
    prompt_version: 'dry.v1',
    model: 'qwen2.5:7b',
    inference: { temperature: 0.55, top_p: 0.85, top_k: 40, mirostat: 2, mirostat_tau: 5 },
  });
}

describe('enrich + PII scrub integration', () => {
  it('user_input with PII + --scrub → excluded (a failing entity blocks distribution)', () => {
    const { records, summary } = enrichCaptureJsonl(rowWith('reach me at jane.doe@example.com'), {
      source_type: 'user_input',
      consent_status: 'opted_in',
      scrub: true,
    });
    expect(summary.by_verdict.excluded).toBe(1);
    expect(records[0].provenance.pii_scrub?.clean).toBe(false);
    expect(records[0].provenance.pii_scrub?.per_entity.email).toBe('fail');
  });

  it('opted-in, PII-clean user_input + --scrub → public_candidate', () => {
    const { records, summary } = enrichCaptureJsonl(rowWith('just some plain feedback about the UI'), {
      source_type: 'user_input',
      consent_status: 'opted_in',
      scrub: true,
    });
    expect(summary.by_verdict.public_candidate).toBe(1);
    expect(records[0].provenance.pii_scrub?.clean).toBe(true);
  });

  it('user_input WITHOUT --scrub stays internal ("not yet PII-scrubbed"), pii_scrub null', () => {
    const { records, summary } = enrichCaptureJsonl(rowWith('reach me at jane.doe@example.com'), {
      source_type: 'user_input',
      consent_status: 'opted_in',
      // scrub omitted
    });
    expect(summary.by_verdict.internal).toBe(1);
    expect(records[0].provenance.pii_scrub).toBeNull();
    expect(records[0].provenance.verdict_reason).toContain('scrub');
  });

  it('synthetic rows are always floor-scrubbed so public_candidate cannot issue without a result', () => {
    const { records } = enrichCaptureJsonl(rowWith('a 3000-line file with zero comments'), {
      source_type: 'synthetic',
    });
    expect(records[0].provenance.pii_scrub).not.toBeNull();
    expect(records[0].provenance.pii_scrub?.clean).toBe(true);
    expect(records[0].provenance.record_verdict).toBe('public_candidate');
  });
});
