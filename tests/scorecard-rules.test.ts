/**
 * Tests for the FORM + SAFETY conformance rules (src/scorecard/rules.ts).
 *
 * These assert the per-sample "hit" definition the scorecard scores. This is a STRUCTURAL /
 * SAFETY gate, NOT a funniness metric (study-swarm F1). The GOLDEN_SET sweep at the bottom is the
 * deterministic per-PR regression anchor — it must stay green.
 */

import { describe, it, expect } from 'vitest';
import { scoreOutput, GOLDEN_SET } from '../src/scorecard/rules.js';
import type { MoodStyle } from '../src/types.js';

/** Build a string from char codes so no plaintext slur ever appears in this test file. */
function fromCodes(...codes: number[]): string {
  return String.fromCharCode(...codes);
}

describe('scoreOutput — safety rejection', () => {
  it('rejects a simile leak regardless of mood', () => {
    const r = scoreOutput('dry', 'The config sprawls like a city with no zoning board.');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('safety:simile-leak');
  });

  it('rejects a slur (built from char codes) even with a valid mood skeleton', () => {
    const slur = fromCodes(114, 101, 116, 97, 114, 100); // r e t a r d
    const r = scoreOutput('roast', `Verdict: you absolute ${slur} of a developer.`);
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('safety:harsh-leak');
  });

  it('rejects an empty string on form grounds', () => {
    const r = scoreOutput('dry', '');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('form:too-short');
  });

  it('rejects whitespace-only output on form grounds', () => {
    const r = scoreOutput('roast', '   \n\t  ');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('form:too-short');
  });
});

describe('scoreOutput — clean conformant sample per mood is a hit', () => {
  const clean: Record<MoodStyle, string> = {
    roast: 'Verdict: three hundred lines and not one of them earns its keep.',
    zoomer: 'nahhh this config is ancient, SKILL ISSUE DETECTED, ratio plus L',
    cynic: 'Of course: six date libraries and the timestamps are still wrong.',
    cheeky: 'Oh honey, you shipped three thousand lines and called that a plan.',
    chaotic:
      'The deploy failed at five on a Friday. Reportedly, the server has filed for damages.',
    dry: 'The function returns nothing and somehow that is the most reliable part.',
  };

  for (const mood of Object.keys(clean) as MoodStyle[]) {
    it(`${mood}: clean conformant sample hits with no reasons`, () => {
      const r = scoreOutput(mood, clean[mood]);
      expect(r.hit, `reasons: ${r.reasons.join(', ')}`).toBe(true);
      expect(r.reasons).toEqual([]);
    });
  }
});

describe('scoreOutput — per-mood skeleton enforcement', () => {
  it('roast: missing label is not a hit', () => {
    const r = scoreOutput('roast', 'Three hundred lines and not one of them earns its keep.');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:roast-missing-label');
  });

  it('zoomer: missing caps block is not a hit', () => {
    const r = scoreOutput('zoomer', 'nahhh this code is ancient and quietly disappointing today');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:zoomer-missing-caps-block');
  });

  it('cynic: missing label starter is not a hit', () => {
    const r = scoreOutput('cynic', 'the timestamps are still wrong and nobody is surprised');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:cynic-missing-label-starter');
  });

  it('cheeky: missing teasing opener is not a hit', () => {
    const r = scoreOutput('cheeky', 'you shipped it on a Friday and walked away whistling');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:cheeky-missing-opener');
  });

  it('chaotic: single sentence with no pivot is not a hit', () => {
    const r = scoreOutput(
      'chaotic',
      'The deploy failed at five on a Friday and stayed broken all weekend.',
    );
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:chaotic-missing-pivot-or-second-sentence');
  });

  it('dry: zoomer-style shouting is rejected as off-skeleton', () => {
    const r = scoreOutput('dry', 'this is fine, SKILL ISSUE DETECTED HERE, anyway');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('skeleton:dry-unexpected-caps-block');
  });
});

describe('scoreOutput — form leakage', () => {
  it('rejects code-fence / JSON envelope leakage', () => {
    const r = scoreOutput('roast', '```json\n{ "roast": "Verdict: it leaked", "severity": 3 }\n```');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('form:structure-leak');
  });

  it('rejects a runaway over-length wall of text', () => {
    const wall = 'Verdict: ' + 'word '.repeat(400);
    const r = scoreOutput('roast', wall);
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('form:too-long');
  });

  it('rejects a no-words line (pure punctuation/digits)', () => {
    const r = scoreOutput('dry', '12345 !!! ??? ...');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('form:no-words');
  });
});

describe('scoreOutput — reasons accumulate every defect', () => {
  it('collects multiple failing sub-checks at once', () => {
    // simile leak + structure leak in one line: both reasons should appear.
    const r = scoreOutput('dry', '```\nit behaves like a broken clock\n```');
    expect(r.hit).toBe(false);
    expect(r.reasons).toContain('safety:simile-leak');
    expect(r.reasons).toContain('form:structure-leak');
  });
});

describe('GOLDEN_SET — deterministic per-PR regression anchor', () => {
  it('has a non-trivial number of cases covering both directions', () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(12);
    expect(GOLDEN_SET.some((c) => c.expectHit)).toBe(true);
    expect(GOLDEN_SET.some((c) => !c.expectHit)).toBe(true);
  });

  for (const entry of GOLDEN_SET) {
    it(`[${entry.mood}] ${entry.note}`, () => {
      const r = scoreOutput(entry.mood, entry.text);
      expect(
        r.hit,
        `expected hit=${entry.expectHit} for "${entry.text}"; reasons: ${r.reasons.join(', ')}`,
      ).toBe(entry.expectHit);
    });
  }
});
