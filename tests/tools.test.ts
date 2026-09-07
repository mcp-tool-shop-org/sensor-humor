import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { resetSession, getSession } from '../src/session.js';
import { MOOD_STYLES, MOOD_DESCRIPTIONS, type MoodStyle } from '../src/types.js';
import { HARSH_FILTER, SIMILE_PATTERN, STATIC_SAFE_FALLBACK, hasLanguageLeak, hasHarshLeak, hasSimileLeak, voicedSafeFallback } from '../src/validators.js';
import { isolatePersistEnv, restorePersistEnv, snapshotPersistEnv } from './setup.js';

const ORIG_PERSIST_ENV = snapshotPersistEnv();
isolatePersistEnv();
beforeAll(() => isolatePersistEnv());
afterAll(() => restorePersistEnv(ORIG_PERSIST_ENV));

// Local mirror of roast.ts's (non-exported) COMPARISON_LEAK term-list, so a server-003 test can
// assert a benign comparison word did not survive the terminal gate without importing a private symbol.
const COMPARISON_LEAK_WORDS = /\bblanket\b|\bcoffee break\b|\bband[\s-]?aid\b|\bbandaid\b/i;

// Obfuscated slur payloads (F-12a23ffa). Built from char codes so the slur is never spelled
// plainly. Each defeats HARSH_FILTER's \b until normalizeForDetection runs — swapping a tool
// site from hasHarshLeak back to HARSH_FILTER.test would leak these while every plaintext
// slur test in this file stayed green.
const RET = String.fromCharCode(0x72, 0x65, 0x74); // "ret"
const ARD = String.fromCharCode(0x61, 0x72, 0x64); // "ard"
const ZWSP_SLUR = `you ${RET}a${String.fromCharCode(0x200b)}${ARD.slice(1)} of a function`;
const CYRILLIC_SLUR = `you ${String.fromCharCode(0x72, 0x435, 0x442, 0x430, 0x72, 0x64)} of a function`;
// F-ad64c61c: U+00AD (Cf soft hyphen) is not in ZERO_WIDTH_AND_FORMAT; HARSH_FILTER.test misses it.
const SOFT_HYPHEN_SLUR = `you ${RET}${String.fromCharCode(0x00ad)}${ARD} of a function`;
const OBFUSCATED_SLURS: Array<{ name: string; payload: string }> = [
  { name: 'ZWSP-laced', payload: ZWSP_SLUR },
  { name: 'Cyrillic-homoglyph', payload: CYRILLIC_SLUR },
];
// Mirrors the unexported STATIC_SAFE_CATCHPHRASE.dry in catchphrase.ts. Default session mood
// is dry; a gated generate/callback must collapse to this input-free line.
const DRY_SAFE_CATCHPHRASE = 'Noted. Moving on.';
// Zero-width-laced simile the bare SIMILE_PATTERN misses (F-59082050 tool-site pin).
const ZWSP_LIKE = `broken li${String.fromCharCode(0x200b)}ke a charm`;

// Mock the Ollama module so tests don't need a live server. recordSafetyFilterFire is a no-op
// counter the tools call when a terminal gate fires — stub it so the tool code path runs.
vi.mock('../src/ollama.js', () => ({
  generateComedy: vi.fn(),
  recordSafetyFilterFire: vi.fn(),
}));

import { generateComedy, recordSafetyFilterFire } from '../src/ollama.js';
const mockGenerate = vi.mocked(generateComedy);
const mockRecordSafetyFire = vi.mocked(recordSafetyFilterFire);

// Import tools after mock is set up
import { moodSet, moodGet } from '../src/tools/mood.js';
import { roast } from '../src/tools/roast.js';
import { heckle } from '../src/tools/heckle.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { catchphraseGenerate, catchphraseCallback } from '../src/tools/catchphrase.js';
import { runningGag, DirtyGagError } from '../src/tools/running_gag.js';
import { InvalidTechniqueError } from '../src/tools/techniques.js';

describe('mood tools', () => {
  beforeEach(() => {
    resetSession();
  });

  describe('moodSet', () => {
    it('sets mood and returns description + voice_notes', () => {
      const result = moodSet('roast');
      expect(result.mood).toBe('roast');
      expect(result.description).toBe(MOOD_DESCRIPTIONS.roast);
      expect(result.voice_notes).toBeDefined();
      expect(result.voice_notes.length).toBeGreaterThan(0);
    });

    it('updates session mood', () => {
      moodSet('zoomer');
      expect(getSession().mood).toBe('zoomer');
    });

    it('accepts all 6 valid moods', () => {
      for (const mood of MOOD_STYLES) {
        const result = moodSet(mood);
        expect(result.mood).toBe(mood);
      }
    });

    it('throws on invalid mood', () => {
      expect(() => moodSet('silly')).toThrow('Invalid mood');
      expect(() => moodSet('')).toThrow('Invalid mood');
    });

    // --- b-tools-004: mood transition feedback (previous_mood / changed) ---

    it('reports previous_mood and changed=true on a real transition', () => {
      // Session starts at the default mood ('dry').
      const result = moodSet('roast');
      expect(result.previous_mood).toBe('dry');
      expect(result.mood).toBe('roast');
      expect(result.changed).toBe(true);
    });

    it('reports changed=false on a no-op re-set of the current mood', () => {
      moodSet('roast');
      const result = moodSet('roast'); // setting the same mood again
      expect(result.previous_mood).toBe('roast');
      expect(result.mood).toBe('roast');
      expect(result.changed).toBe(false);
    });

    it('tracks previous_mood across successive transitions', () => {
      moodSet('cynic');
      const result = moodSet('zoomer');
      expect(result.previous_mood).toBe('cynic');
      expect(result.mood).toBe('zoomer');
      expect(result.changed).toBe(true);
    });

    it('still returns the existing fields alongside transition feedback', () => {
      const result = moodSet('cheeky');
      // Backward-compatible: original MoodSetResult fields are unchanged.
      expect(result.mood).toBe('cheeky');
      expect(result.description).toBe(MOOD_DESCRIPTIONS.cheeky);
      expect(result.voice_notes.length).toBeGreaterThan(0);
    });
  });

  describe('moodGet', () => {
    it('returns current mood and gag count', () => {
      const result = moodGet();
      expect(result.mood).toBe('dry');
      expect(result.description).toBe(MOOD_DESCRIPTIONS.dry);
      expect(result.session_gag_count).toBe(0);
    });

    it('reflects mood changes', () => {
      moodSet('cynic');
      const result = moodGet();
      expect(result.mood).toBe('cynic');
    });

    it('reflects gag count', () => {
      const session = getSession();
      session.addGag('test', 'tag');
      session.addGag('test2', 'tag2');
      expect(moodGet().session_gag_count).toBe(2);
    });

    it('lists allowed_techniques for the current mood including auto (F-f0b39d16)', () => {
      expect(moodGet().allowed_techniques[0]).toBe('auto');
      expect(moodGet().allowed_techniques).toEqual(
        expect.arrayContaining(['auto', 'misdirection', 'callback', 'understatement']),
      );
      expect(moodGet().allowed_techniques).not.toContain('escalation');
      moodSet('cynic');
      expect(moodGet().allowed_techniques).not.toContain('escalation');
      expect(moodGet().allowed_techniques).toContain('understatement');
      moodSet('roast');
      expect(moodGet().allowed_techniques).toContain('escalation');
    });
  });
});

describe('roast tool', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('returns roast with severity and mood', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Monolithic state blob syndrome.', severity: 4 },
    });

    const result = await roast('global state everywhere', 'code');
    expect(result.roast).toBe('Verdict: Monolithic state blob syndrome.');
    expect(result.severity).toBe(4);
    expect(result.mood).toBe('dry'); // default mood
  });

  it('clamps severity to 1-5', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Extreme.', severity: 10 },
    });

    const result = await roast('terrible code');
    expect(result.severity).toBe(5);
  });

  it('pushes bit to session', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Done.', severity: 3 },
    });

    await roast('bad code');
    const session = getSession();
    expect(session.recent_bits).toHaveLength(1);
    expect(session.recent_bits[0].technique).toBe('roast');
  });

  it('increments turn counter', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Test.', severity: 2 },
    });

    await roast('test');
    expect(getSession().turn_counter).toBe(1);
  });

  it('retries when label pattern missing in roast mood', async () => {
    moodSet('roast');
    // First call returns no label, second returns with label
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'This code is bad.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Actively hostile codebase.', severity: 4 } });

    const result = await roast('awful code');
    // Should have called generateComedy at least twice (initial + label retry)
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('does NOT enforce label pattern in non-roast mood', async () => {
    moodSet('chaotic');
    mockGenerate.mockResolvedValue({
      data: { roast: 'The tests failed. Sources confirm they have unionized.', severity: 4 },
    });

    const result = await roast('flaky tests', 'code');
    // Should NOT retry — chaotic doesn't need Verdict: label
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.roast).not.toMatch(/^Verdict:/i);
    expect(result.mood).toBe('chaotic');
  });

  it('zoomer roast follows zoomer voice, not roast labels', async () => {
    moodSet('zoomer');
    mockGenerate.mockResolvedValue({
      data: { roast: 'nahhh, var in 2026, SKILL ISSUE DETECTED, ratio', severity: 5 },
    });

    const result = await roast('using var', 'code');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.roast).not.toMatch(/^Verdict:/i);
    expect(result.mood).toBe('zoomer');
  });

  it('cynic roast follows cynic voice', async () => {
    moodSet('cynic');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Of course: the deploy pipeline takes longer than the feature it ships.', severity: 3 },
    });

    const result = await roast('slow CI', 'situation');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.roast).toMatch(/^(Of course|Predictably|As expected)/);
    expect(result.mood).toBe('cynic');
  });

  it('retries on comparison leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Like a dumpster fire.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Terminal negligence.', severity: 3 } });

    const result = await roast('messy code');
    expect(mockGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reflects current mood', async () => {
    moodSet('zoomer');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: CHAOS.', severity: 5 },
    });

    const result = await roast('everything');
    expect(result.mood).toBe('zoomer');
  });
});

describe('heckle tool', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('returns heckle with mood', async () => {
    mockGenerate.mockResolvedValue({
      data: { heckle: 'var in 2026.' },
    });

    const result = await heckle('using var');
    expect(result.heckle).toBe('var in 2026.');
    expect(result.mood).toBe('dry');
  });

  it('pushes bit as heckle technique', async () => {
    mockGenerate.mockResolvedValue({
      data: { heckle: 'Bold choice.' },
    });

    await heckle('no tests');
    const session = getSession();
    expect(session.recent_bits[0].technique).toBe('heckle');
  });
});

describe('roast with new moods', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('roast in cynic mood returns cynic-flavored roast', async () => {
    moodSet('cynic');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Predictable failure mode.', severity: 3 },
    });

    const result = await roast('broken config', 'code');
    expect(result.mood).toBe('cynic');
    expect(result.roast).toContain('Verdict:');
  });

  it('roast in cheeky mood returns playful roast', async () => {
    moodSet('cheeky');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Brave little codebase.', severity: 2 },
    });

    const result = await roast('no tests', 'code');
    expect(result.mood).toBe('cheeky');
    expect(result.severity).toBe(2);
  });

  it('roast in chaotic mood returns chaotic roast', async () => {
    moodSet('chaotic');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: The tests have unionized.', severity: 4 },
    });

    const result = await roast('flaky tests', 'code');
    expect(result.mood).toBe('chaotic');
  });

  it('roast in zoomer mood returns zoomer-flavored roast', async () => {
    moodSet('zoomer');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: ABSOLUTE SKILL ISSUE.', severity: 5 },
    });

    const result = await roast('using var', 'code');
    expect(result.mood).toBe('zoomer');
    expect(result.severity).toBe(5);
  });

  it('echoes technique_used=auto when no overlay is requested', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Fine.', severity: 2 },
    });
    const result = await roast('mild smell', 'code');
    expect(result.technique_used).toBe('auto');
  });

  it('puts a valid overlay into the roast prompt (roast + misdirection)', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: You expected a helper. It is a 600-line novel.', severity: 4 },
    });
    const result = await roast('god function', 'code', 'misdirection');
    expect(result.technique_used).toBe('misdirection');
    const opts = mockGenerate.mock.calls[0][0] as { userPrompt: string; systemPrompt: string };
    expect(opts.userPrompt).toMatch(/misdirection/i);
    expect(opts.systemPrompt).toMatch(/TECHNIQUE OVERLAY/);
  });

  it('refuses cynic + escalation before calling the model', async () => {
    moodSet('cynic');
    await expect(roast('global state', 'code', 'escalation')).rejects.toBeInstanceOf(
      InvalidTechniqueError,
    );
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does not tick the session when an overlay is refused (F-4a7e6c91)', async () => {
    moodSet('cynic');
    const before = getSession().turn_counter;
    await expect(roast('global state', 'code', 'escalation')).rejects.toBeInstanceOf(
      InvalidTechniqueError,
    );
    expect(getSession().turn_counter).toBe(before);
  });

  it('honors a roast callback overlay and bumps the gag (F-8c2e1a47)', async () => {
    const session = getSession();
    session.tick();
    runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef');
    session.turn_counter += 3;
    mockGenerate.mockResolvedValue({
      data: {
        roast: 'Deadbeef again, now with extra undefined.',
        severity: 4,
        callback_source: 'deadbeef',
      },
    });
    const result = await roast('crash at deadbeef', 'error', 'callback');
    expect(result.callback_honored).toBe(true);
    expect(result.technique_used).toBe('callback');
    const gag = session.running_gags.find((g) => g.tag === 'deadbeef');
    expect(gag!.used).toBe(2);
  });

  it('retries then unhonors a verbatim roast callback overlay (F-8c2e1a47)', async () => {
    const session = getSession();
    session.tick();
    runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef');
    session.turn_counter += 3;
    mockGenerate
      .mockResolvedValueOnce({
        data: {
          roast: 'the deadbeef pointer that keeps haunting this build',
          severity: 3,
          callback_source: 'deadbeef',
        },
      })
      .mockResolvedValueOnce({
        data: {
          roast: 'the deadbeef pointer that keeps haunting this build',
          severity: 3,
          callback_source: 'deadbeef',
        },
      });
    const result = await roast('crash at deadbeef', 'error', 'callback');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.callback_honored).toBe(false);
    const gag = session.running_gags.find((g) => g.tag === 'deadbeef');
    expect(gag!.used).toBe(1);
  });

  it('injects overlay-coexistence copy when a technique overlay is requested (F-7e2c9b14)', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Fine.', severity: 2 },
    });
    await roast('mild smell', 'code', 'misdirection');
    const opts = mockGenerate.mock.calls[0][0] as { systemPrompt: string };
    expect(opts.systemPrompt).toMatch(/TECHNIQUE OVERLAY/);
    expect(opts.systemPrompt).toMatch(/lexical flavor/i);
  });
});

describe('heckle with new moods', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('heckle in cynic mood', async () => {
    moodSet('cynic');
    mockGenerate.mockResolvedValue({ data: { heckle: 'Of course.' } });

    const result = await heckle('global state');
    expect(result.mood).toBe('cynic');
  });

  it('heckle in cheeky mood', async () => {
    moodSet('cheeky');
    mockGenerate.mockResolvedValue({ data: { heckle: 'Cute.' } });

    const result = await heckle('no types');
    expect(result.mood).toBe('cheeky');
  });

  it('heckle in chaotic mood', async () => {
    moodSet('chaotic');
    mockGenerate.mockResolvedValue({ data: { heckle: 'The server weeps.' } });

    const result = await heckle('force push to main');
    expect(result.mood).toBe('chaotic');
  });

  it('heckle in zoomer mood', async () => {
    moodSet('zoomer');
    mockGenerate.mockResolvedValue({ data: { heckle: 'cooked.' } });

    const result = await heckle('console.log debugging');
    expect(result.mood).toBe('zoomer');
  });

  it('refuses cynic + escalation on heckle before calling the model', async () => {
    moodSet('cynic');
    await expect(heckle('global state', 'escalation')).rejects.toBeInstanceOf(InvalidTechniqueError);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('puts a valid overlay into the heckle prompt', async () => {
    moodSet('cheeky');
    mockGenerate.mockResolvedValue({ data: { heckle: 'Oh honey, no.' } });
    const result = await heckle('no types', 'understatement');
    expect(result.technique_used).toBe('understatement');
    const opts = mockGenerate.mock.calls[0][0] as { userPrompt: string };
    expect(opts.userPrompt).toMatch(/understatement/i);
  });

  it('does not tick heckle when an overlay is refused (F-4a7e6c91)', async () => {
    moodSet('cynic');
    const before = getSession().turn_counter;
    await expect(heckle('global state', 'escalation')).rejects.toBeInstanceOf(InvalidTechniqueError);
    expect(getSession().turn_counter).toBe(before);
  });

  it('honors a heckle callback overlay (F-8c2e1a47)', async () => {
    const session = getSession();
    session.tick();
    runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef');
    session.turn_counter += 3;
    mockGenerate.mockResolvedValue({
      data: { heckle: 'Deadbeef encore, extra UB.', callback_source: 'deadbeef' },
    });
    const result = await heckle('crash at deadbeef', 'callback');
    expect(result.callback_honored).toBe(true);
    expect(session.running_gags.find((g) => g.tag === 'deadbeef')!.used).toBe(2);
  });
});

describe('comic_timing tool', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('returns rewrite with technique', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Forty-seven builds. A new record.', technique_used: 'understatement' },
    });

    const result = await comicTiming('Build failed after 47 attempts', 'understatement');
    expect(result.rewrite).toBe('Forty-seven builds. A new record.');
    expect(result.technique_used).toBe('understatement');
  });

  it('pushes bit to session with technique', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Test.', technique_used: 'misdirection' },
    });

    await comicTiming('test input');
    const session = getSession();
    expect(session.recent_bits[0].technique).toBe('misdirection');
  });

  it('retries on meta-commentary leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { rewrite: 'The rules say no emoji here.', technique_used: 'auto' },
      })
      .mockResolvedValueOnce({
        data: { rewrite: 'Pointer at deadbeef. Naturally.', technique_used: 'understatement' },
      });

    await comicTiming('null pointer');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('handles callback technique with gag', async () => {
    const session = getSession();
    session.addGag('The deadbeef incident', 'deadbeef');
    // Age the gag past the callback distance gate (C2) so it is an eligible candidate — without
    // this, the revived mechanic correctly withholds a gag planted this same turn.
    session.turn_counter += 5;

    mockGenerate.mockResolvedValue({
      data: {
        rewrite: 'Deadbeef strikes again.',
        technique_used: 'callback',
        callback_source: 'deadbeef',
      },
    });

    const result = await comicTiming('another null pointer at deadbeef', 'callback');
    expect(result.callback_source).toBe('deadbeef');
    // Gag usage should increment
    const gag = session.running_gags.find(g => g.tag === 'deadbeef');
    expect(gag!.used).toBe(2);
  });

  it('handles callback_source that matches no gag gracefully', async () => {
    const session = getSession();
    session.addGag('Real gag', 'realtag');

    mockGenerate.mockResolvedValue({
      data: {
        rewrite: 'Reference to nothing.',
        technique_used: 'callback',
        callback_source: 'nonexistent_tag',
      },
    });

    const result = await comicTiming('some text about realtag', 'callback');
    expect(result.callback_source).toBe('nonexistent_tag');
    // Gag should NOT be incremented since source didn't match
    const gag = session.running_gags.find(g => g.tag === 'realtag');
    expect(gag!.used).toBe(1);
  });

  // --- b-tools-002: callback honesty (callback_honored) ---

  it('sets callback_honored=true when callback_source matches a real gag', async () => {
    const session = getSession();
    session.addGag('The deadbeef incident', 'deadbeef');
    // Age the gag past the callback distance gate (C2) so it is an eligible candidate.
    session.turn_counter += 5;

    mockGenerate.mockResolvedValue({
      data: {
        rewrite: 'Deadbeef strikes again.',
        technique_used: 'callback',
        callback_source: 'deadbeef',
      },
    });

    const result = await comicTiming('another null pointer at deadbeef', 'callback');
    expect(result.callback_honored).toBe(true);
    // Still reports the source (backward-compatible: field is added, not removed).
    expect(result.callback_source).toBe('deadbeef');
  });

  it('sets callback_honored=false when callback_source matches no gag (hallucinated callback)', async () => {
    const session = getSession();
    session.addGag('Real gag', 'realtag');

    mockGenerate.mockResolvedValue({
      data: {
        rewrite: 'Reference to nothing.',
        technique_used: 'callback',
        callback_source: 'nonexistent_tag',
      },
    });

    const result = await comicTiming('some text about realtag', 'callback');
    // The caller can now distinguish a hallucinated callback from a real one.
    expect(result.callback_honored).toBe(false);
    // Backward-compatible: technique label + source are still present (not silently removed).
    expect(result.technique_used).toBe('callback');
    expect(result.callback_source).toBe('nonexistent_tag');
  });

  it('sets callback_honored=false when technique is callback but no source is provided', async () => {
    const session = getSession();
    session.addGag('Real gag', 'realtag');

    mockGenerate.mockResolvedValue({
      data: {
        // Model claims callback but omits callback_source entirely — cannot be verified.
        rewrite: 'A vague callback with no source.',
        technique_used: 'callback',
      },
    });

    const result = await comicTiming('some text about realtag', 'callback');
    expect(result.callback_honored).toBe(false);
  });

  it('omits callback_honored entirely for non-callback techniques', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Deadpan line.', technique_used: 'understatement' },
    });

    const result = await comicTiming('some dry input');
    // Absent on non-callback results — existing callers and the base contract are unaffected.
    expect(result.callback_honored).toBeUndefined();
  });

  it('does not report an honored callback when a safety gate rewrote technique to understatement', async () => {
    const session = getSession();
    session.addGag('The deadbeef incident', 'deadbeef');

    // Model returns a slur-laden "callback"; the terminal safety gate substitutes a safe line
    // and rewrites technique_used to 'understatement'. The claimed callback must NOT be honored.
    const slur = HARSH_FILTER.source.match(/[a-z]{4,}/)?.[0] ?? 'retard';
    mockGenerate.mockResolvedValue({
      data: {
        rewrite: `You absolute ${slur}, deadbeef again.`,
        technique_used: 'callback',
        callback_source: 'deadbeef',
      },
    });

    const result = await comicTiming('another null pointer at deadbeef', 'callback');
    expect(result.technique_used).toBe('understatement');
    // No callback_honored signal because the result is no longer a callback at all.
    expect(result.callback_honored).toBeUndefined();
    // The real gag was NOT credited a use by a substituted line.
    const gag = session.running_gags.find(g => g.tag === 'deadbeef');
    expect(gag!.used).toBe(1);
  });

  it('defaults to auto technique', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Output.', technique_used: 'understatement' },
    });

    await comicTiming('input');
    const call = mockGenerate.mock.calls[0];
    const opts = call[0] as { userPrompt: string };
    expect(opts.userPrompt).toContain('Choose the best');
  });

  // --- callback-revival: the WHOLE loop through the real seeding path (running_gag -> comic_timing).
  // Before this feature, running_gags was never seeded at runtime, so this end-to-end callback was
  // IMPOSSIBLE — findCallbackCandidates always returned []. These tests prove it now works.
  describe('callback revival end-to-end (running_gag -> comic_timing)', () => {
    it('honors a callback against a gag planted by running_gag once it has aged in', async () => {
      const session = getSession();
      session.tick(); // turn 1
      runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef'); // plant, created_turn 1
      // Age past the distance gate (default min-distance 2).
      session.turn_counter += 3;

      mockGenerate.mockResolvedValue({
        data: {
          rewrite: 'Deadbeef, back for an encore, now with 30% more undefined behavior.',
          technique_used: 'callback',
          callback_source: 'deadbeef',
        },
      });

      const result = await comicTiming('another crash at deadbeef', 'callback');
      // The planted gag was found, matched, and honored — the mechanic is alive.
      expect(result.technique_used).toBe('callback');
      expect(result.callback_source).toBe('deadbeef');
      expect(result.callback_honored).toBe(true);
      // The honored callback bumped the gag's fire count (used: 1 -> 2).
      const gag = session.running_gags.find((g) => g.tag === 'deadbeef');
      expect(gag!.used).toBe(2);
      // The prompt actually surfaced the planted gag as callback material.
      const opts = mockGenerate.mock.calls[0][0] as { userPrompt: string };
      expect(opts.userPrompt).toContain('deadbeef');
    });

    it('retries a verbatim setup replay and does not honor if the retry is still verbatim (FP-2)', async () => {
      const session = getSession();
      session.tick();
      runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef');
      session.turn_counter += 3;

      mockGenerate
        .mockResolvedValueOnce({
          data: {
            rewrite: 'the deadbeef pointer that keeps haunting this build',
            technique_used: 'callback',
            callback_source: 'deadbeef',
          },
        })
        .mockResolvedValueOnce({
          data: {
            rewrite: 'the deadbeef pointer that keeps haunting this build',
            technique_used: 'callback',
            callback_source: 'deadbeef',
          },
        });

      const result = await comicTiming('another crash at deadbeef', 'callback');
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.callback_honored).toBe(false);
      const gag = session.running_gags.find((g) => g.tag === 'deadbeef');
      expect(gag!.used).toBe(1);
    });

    it('honors a callback after a verbatim first try is twisted on retry (FP-2)', async () => {
      const session = getSession();
      session.tick();
      runningGag('the deadbeef pointer that keeps haunting this build', 'deadbeef');
      session.turn_counter += 3;

      mockGenerate
        .mockResolvedValueOnce({
          data: {
            rewrite: 'The deadbeef pointer that keeps haunting this build.',
            technique_used: 'callback',
            callback_source: 'deadbeef',
          },
        })
        .mockResolvedValueOnce({
          data: {
            rewrite: 'Deadbeef, back for an encore, now with 30% more undefined behavior.',
            technique_used: 'callback',
            callback_source: 'deadbeef',
          },
        });

      const result = await comicTiming('another crash at deadbeef', 'callback');
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.callback_honored).toBe(true);
      expect(result.rewrite).toMatch(/encore/i);
      const gag = session.running_gags.find((g) => g.tag === 'deadbeef');
      expect(gag!.used).toBe(2);
    });

    it('does NOT honor a callback against a gag still inside the distance gate (planted this turn)', async () => {
      const session = getSession();
      session.tick(); // turn 1
      runningGag('the segfault saga', 'segfault'); // planted at turn 1, not yet aged

      mockGenerate.mockResolvedValue({
        data: {
          rewrite: 'Segfault again, apparently.',
          technique_used: 'callback',
          callback_source: 'segfault',
        },
      });

      const result = await comicTiming('another segfault crash', 'callback');
      // The gag exists but is withheld by the distance gate, so the model's claimed callback
      // matches no ELIGIBLE candidate — it is flagged unhonored and the gag is not bumped.
      expect(result.callback_honored).toBe(false);
      const gag = session.running_gags.find((g) => g.tag === 'segfault');
      expect(gag!.used).toBe(1);
    });

    it('does NOT honor a callback against a RETIRED gag (fired its cap)', async () => {
      const session = getSession();
      runningGag('the flaky test saga', 'flaky'); // used 1, created_turn = this turn
      const gag = session.running_gags.find((g) => g.tag === 'flaky')!;
      // Fire it up to the default cap of 3 so it retires.
      session.addGag('the flaky test saga', 'flaky'); // used 2
      session.addGag('the flaky test saga', 'flaky'); // used 3 -> retired
      // Open the distance gate wide so RETIREMENT is unambiguously the only reason it's excluded.
      session.turn_counter = (gag.created_turn ?? 0) + 20;
      expect(gag.used).toBe(3);

      mockGenerate.mockResolvedValue({
        data: {
          rewrite: 'Flaky yet again.',
          technique_used: 'callback',
          callback_source: 'flaky',
        },
      });

      const result = await comicTiming('another flaky failure', 'callback');
      // Retired gag is not an eligible candidate -> callback not honored, no further bump.
      expect(result.callback_honored).toBe(false);
      expect(gag.used).toBe(3);
    });
  });
});

describe('catchphrase tools', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  describe('catchphraseGenerate', () => {
    it('generates and stores a new phrase', async () => {
      mockGenerate.mockResolvedValue({
        data: { phrase: 'Verdict: Bug lottery.' },
      });

      const result = await catchphraseGenerate('buggy code');
      expect(result.phrase).toBe('Verdict: Bug lottery.');
      expect(result.is_fresh).toBe(true);
      expect(getSession().catchphrases.get('Verdict: Bug lottery.')).toBe(1);
    });

    it('pushes bit to session', async () => {
      mockGenerate.mockResolvedValue({
        data: { phrase: 'Ship it.' },
      });

      await catchphraseGenerate();
      expect(getSession().recent_bits[0].technique).toBe('catchphrase');
    });

    it('gates a slur from generateComedy: substitutes safe phrase, does NOT store it (A-TS-001)', async () => {
      mockGenerate.mockResolvedValue({
        data: { phrase: 'you absolute retard' },
      });

      const result = await catchphraseGenerate('bad code');
      // Output must pass BOTH safety filters
      expect(HARSH_FILTER.test(result.phrase)).toBe(false);
      expect(SIMILE_PATTERN.test(result.phrase)).toBe(false);
      expect(result.phrase).not.toMatch(/retard/i);
      // Degraded signal set
      expect(result.degraded).toBe(true);
      expect(result.degraded_reason).toBe('safety-filter');
      // The dirty phrase must NOT have been stored
      expect(getSession().catchphrases.has('you absolute retard')).toBe(false);
    });

    it('gates a simile from generateComedy: substitutes safe phrase, does NOT store it (A-TS-001)', async () => {
      mockGenerate.mockResolvedValue({
        data: { phrase: 'broken like a charm' },
      });

      const result = await catchphraseGenerate('flaky build');
      expect(SIMILE_PATTERN.test(result.phrase)).toBe(false);
      expect(HARSH_FILTER.test(result.phrase)).toBe(false);
      expect(result.phrase).not.toMatch(/like a/i);
      expect(result.degraded_reason).toBe('safety-filter');
      expect(getSession().catchphrases.has('broken like a charm')).toBe(false);
    });

    it('returns existing catchphrase when context matches (reuse path)', async () => {
      const session = getSession();
      // Pre-seed a catchphrase with a clean first word >= 3 chars
      session.useCatchphrase('Ship it and pray.');

      // Context contains "ship" which matches first word of existing phrase
      const result = await catchphraseGenerate('time to ship this feature');
      expect(result.phrase).toBe('Ship it and pray.');
      expect(result.is_fresh).toBe(false);
      // Should NOT have called generateComedy since it reused existing
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  describe('mood-specific comic_timing patterns', () => {
    beforeEach(() => {
      resetSession();
      mockGenerate.mockReset();
    });

    it('cynic: uses label starter pattern', async () => {
      moodSet('cynic');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'Of course: the config has 47 flags and none prevent this failure.', technique_used: 'understatement' },
      });

      const result = await comicTiming('config is broken again');
      expect(result.rewrite).toMatch(/^(Of course|Predictably|As expected|Right on schedule|Per the pattern|Confirmed):/);
    });

    it('cynic: accepts output without label starter (no cynic retry)', async () => {
      moodSet('cynic');
      mockGenerate
        .mockResolvedValueOnce({
          data: { rewrite: 'The config is a mess.', technique_used: 'understatement' },
        })
        .mockResolvedValueOnce({
          data: { rewrite: 'Predictably: 47 flags and not one useful.', technique_used: 'understatement' },
        });

      const result = await comicTiming('config is broken');
      // Cynic mood has no label enforcement retry — first response is returned as-is
      expect(result.rewrite).toBe('The config is a mess.');
    });

    it('cynic: cold factual delivery, no emotional words', async () => {
      moodSet('cynic');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'As expected: six date libraries and the timestamps are still wrong.', technique_used: 'understatement' },
      });

      const result = await comicTiming('timestamps are broken');
      expect(result.rewrite).not.toMatch(/\b(terrible|awful|frustrating|sad|annoying)\b/i);
    });

    it('cheeky: uses teasing opener pattern', async () => {
      moodSet('cheeky');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'Oh honey, you deployed on Friday like the weekend owes you.', technique_used: 'misdirection' },
      });

      const result = await comicTiming('deployed on Friday at 5pm');
      expect(result.rewrite).toMatch(/^(Oh honey|Bless your heart|Cute attempt|Bold move|Love the confidence|A for effort)/);
    });

    it('cheeky: warm tone, not cruel', async () => {
      moodSet('cheeky');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'Bold move, shipping 3000 lines in one file with zero comments.', technique_used: 'understatement' },
      });

      const result = await comicTiming('3000 line file no comments');
      expect(result.rewrite).not.toMatch(/\b(idiot|stupid|moron|incompetent)\b/i);
      expect(result.rewrite.length).toBeLessThan(200);
    });

    it('chaotic: grounded sentence then absurd escalation', async () => {
      moodSet('chaotic');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'The deploy failed at 5pm. Reportedly, the server has filed for emotional damages.', technique_used: 'escalation' },
      });

      const result = await comicTiming('deploy failed Friday');
      // Should have two sentences — normal then absurd
      const sentences = result.rewrite.split(/\.\s+/).filter((s: string) => s.trim().length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('chaotic: uses pivot word between sentences', async () => {
      moodSet('chaotic');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'The regex is 200 lines long. Sources confirm it has achieved sentience.', technique_used: 'escalation' },
      });

      const result = await comicTiming('200 line regex');
      expect(result.rewrite).toMatch(/(Reportedly|Sources confirm|Update|Witnesses say|Upon inspection|Further analysis reveals)/);
    });

    it('zoomer: follows reaction → savage → caps → tag skeleton', async () => {
      moodSet('zoomer');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'nahhh, this code is ancient, SKILL ISSUE DETECTED, ratio + L', technique_used: 'escalation' },
      });

      const result = await comicTiming('legacy code from 2010');
      // Should have at least one caps block
      expect(result.rewrite).toMatch(/[A-Z]{2,}/);
    });

    it('zoomer: no questions allowed', async () => {
      moodSet('zoomer');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'bro, overengineered mess, MAIN CHARACTER ENERGY, cooked fr', technique_used: 'escalation' },
      });

      const result = await comicTiming('overengineered abstraction');
      expect(result.rewrite).not.toContain('?');
    });

    it('zoomer: contains caps emphasis block', async () => {
      moodSet('zoomer');
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'absolutely cooked, zero tests on a 3000 line file, BUILT DIFFERENT FR FR, no shot', technique_used: 'escalation' },
      });

      const result = await comicTiming('no tests');
      const capsBlocks = result.rewrite.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,}){1,5}\b/);
      expect(capsBlocks).not.toBeNull();
    });
  });

  describe('catchphraseCallback', () => {
    it('returns null when no catchphrases exist', () => {
      expect(catchphraseCallback()).toBeNull();
    });

    it('returns most-used catchphrase', () => {
      const session = getSession();
      session.useCatchphrase('First');
      session.useCatchphrase('Second');
      session.useCatchphrase('Second');
      session.useCatchphrase('Second');

      const result = catchphraseCallback();
      expect(result).not.toBeNull();
      expect(result!.phrase).toBe('Second');
      expect(result!.use_count).toBe(4); // 3 existing + 1 from callback
    });

    it('increments use_count on callback', () => {
      const session = getSession();
      session.useCatchphrase('Test phrase');
      // Verify pre-state before callback
      expect(session.catchphrases.get('Test phrase')).toBe(1);

      const result = catchphraseCallback();
      expect(result!.use_count).toBe(2);
      expect(session.catchphrases.get('Test phrase')).toBe(2);
    });

    it('pushes bit to session', () => {
      const session = getSession();
      session.useCatchphrase('Phrase');

      catchphraseCallback();
      expect(session.recent_bits[0].technique).toBe('catchphrase');
    });

    it('gates a persisted/legacy dirty phrase before returning it (A-TS-001)', () => {
      const session = getSession();
      // A dirty phrase that slipped into the store (legacy / direct seed) must not be
      // replayed back to the caller by callback.
      session.useCatchphrase('you absolute retard');

      const result = catchphraseCallback();
      expect(result).not.toBeNull();
      expect(HARSH_FILTER.test(result!.phrase)).toBe(false);
      expect(SIMILE_PATTERN.test(result!.phrase)).toBe(false);
      expect(result!.phrase).not.toMatch(/retard/i);
    });
  });
});

describe('language-conformance post-validation (code-switch gate)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
    // Safety-fire counter is module-global and not reset by mockGenerate.mockReset(); clear it so
    // the "not a safety substitution" assertions below are reliable.
    mockRecordSafetyFire.mockClear();
  });

  it('comic_timing retries on a code-switch, then accepts clean English (no degrade)', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { rewrite: 'Diagnosis: The周五下午四点五十五分上线。', technique_used: 'understatement' },
      })
      .mockResolvedValueOnce({
        data: { rewrite: 'Diagnosis: Shipped at 4:55 on a Friday. Bold.', technique_used: 'understatement' },
      });

    const result = await comicTiming('deploying Friday 4:55pm');
    expect(mockGenerate).toHaveBeenCalledTimes(2); // initial + language retry
    expect(result.rewrite).toBe('Diagnosis: Shipped at 4:55 on a Friday. Bold.');
    expect(result.degraded).toBeUndefined();
    expect(mockRecordSafetyFire).not.toHaveBeenCalled();
  });

  it('comic_timing substitutes an English line + degraded_reason:"language" on a persistent code-switch', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'Diagnosis: The周五下午上线。', technique_used: 'understatement' } })
      .mockResolvedValueOnce({ data: { rewrite: '又一次失败的部署。', technique_used: 'escalation' } });

    const result = await comicTiming('deploying Friday');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // Output is the input-free English static line, never a code-switched one.
    expect(hasLanguageLeak(result.rewrite)).toBe(false);
    expect(result.rewrite).toBe(STATIC_SAFE_FALLBACK.dry);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('language');
    // A code-switch is a conformance degrade, NOT a safety substitution.
    expect(mockRecordSafetyFire).not.toHaveBeenCalled();
  });

  it('safety WINS when the output carries BOTH a slur and a code-switch', async () => {
    const slur = HARSH_FILTER.source.match(/[a-z]{4,}/)?.[0] ?? 'retard';
    // Every attempt returns a slur AND Chinese; the terminal gate must attribute safety, not language.
    mockGenerate.mockResolvedValue({
      data: { rewrite: `You absolute ${slur}, 彻底坏了的构建。`, technique_used: 'roast' },
    });

    const result = await comicTiming('bad build');
    expect(result.degraded_reason).toBe('safety-filter');
    expect(result.rewrite).not.toMatch(new RegExp(slur, 'i'));
    expect(hasLanguageLeak(result.rewrite)).toBe(false);
    expect(mockRecordSafetyFire).toHaveBeenCalled();
  });

  it('roast substitutes an English line + degraded_reason:"language" on a persistent code-switch', async () => {
    mockGenerate.mockResolvedValue({ data: { roast: '这个函数彻底坏了，无法修复。', severity: 4 } });

    const result = await roast('broken function', 'code');
    expect(hasLanguageLeak(result.roast)).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('language');
    expect(mockRecordSafetyFire).not.toHaveBeenCalled();
  });

  it('heckle substitutes an English line + degraded_reason:"language" on a persistent code-switch', async () => {
    mockGenerate.mockResolvedValue({ data: { heckle: '完全是技能问题。' } });

    const result = await heckle('using var');
    expect(hasLanguageLeak(result.heckle)).toBe(false);
    expect(result.degraded_reason).toBe('language');
    expect(mockRecordSafetyFire).not.toHaveBeenCalled();
  });

  it('catchphrase gates a code-switched phrase: substitutes, does NOT store it, flags language', async () => {
    mockGenerate.mockResolvedValue({ data: { phrase: '上线了，完蛋了' } });

    const result = await catchphraseGenerate('shipping');
    expect(hasLanguageLeak(result.phrase)).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('language');
    // The code-switched phrase must NOT have been stored (never replayed via callback).
    expect(getSession().catchphrases.has('上线了，完蛋了')).toBe(false);
    expect(mockRecordSafetyFire).not.toHaveBeenCalled();
  });

  it('accented-Latin output is never language-gated (no retry, no degrade)', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Forty-seven builds. A café-grade résumé of failure.', technique_used: 'understatement' },
    });

    const result = await comicTiming('build failed 47 times');
    expect(mockGenerate).toHaveBeenCalledTimes(1); // accented Latin is NOT a code-switch → no retry
    expect(result.degraded).toBeUndefined();
  });
});

describe('harsh filter retry', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('roast retries on harsh output then accepts clean', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'Verdict: you retard.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Impressive incompetence.', severity: 3 } });

    const result = await roast('bad code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.roast).not.toMatch(/retard/i);
  });

  it('heckle retries on harsh output', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { heckle: 'you stupid bitch.' } })
      .mockResolvedValueOnce({ data: { heckle: 'Bold of you to ship that.' } });

    const result = await heckle('bad code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.heckle).not.toMatch(/bitch/i);
  });

  it('comic_timing retries on harsh output', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'you stupid retard.', technique_used: 'roast' } })
      .mockResolvedValueOnce({ data: { rewrite: 'Bold architectural choices.', technique_used: 'understatement' } });

    const result = await comicTiming('bad architecture');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.rewrite).not.toMatch(/retard/i);
  });

  it('roast falls back safely on double harsh violation', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'you stupid retard.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'you dumb bitch.', severity: 3 } });

    const result = await roast('bad code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // Should return safe fallback, not the harsh text
    expect(result.roast).not.toMatch(/retard|bitch/i);
    expect(result.roast).toContain('bad code');
  });

  it('heckle falls back safely on double harsh violation', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { heckle: 'you retard.' } })
      .mockResolvedValueOnce({ data: { heckle: 'you bitch.' } });

    const result = await heckle('bad code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.heckle).not.toMatch(/retard|bitch/i);
    expect(result.heckle).toContain('bad code');
  });

  it('heckle TERMINAL gate catches a simile re-introduced by the harsh-filter retry (A-TST-002)', async () => {
    // 1st gen: harsh slur (no simile) -> passes simile check, fails harsh -> harsh retry fires.
    // 2nd gen (harsh retry): clean of slurs BUT carries a simile. The simile check already ran
    // (and passed) BEFORE the harsh retry, and the harsh block only re-checks HARSH_FILTER —
    // so ONLY the terminal gate can catch this simile. Deleting the terminal gate -> GREEN->RED.
    mockGenerate
      .mockResolvedValueOnce({ data: { heckle: 'you absolute retard.' } })
      .mockResolvedValueOnce({ data: { heckle: 'broken like a charm.' } });

    const result = await heckle('flaky build');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.heckle).not.toMatch(/like a/i);
    expect(result.heckle).not.toMatch(/retard/i);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
  });

  it('comic_timing falls back safely on double harsh violation', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'you stupid retard.', technique_used: 'roast' } })
      .mockResolvedValueOnce({ data: { rewrite: 'you dumb bitch.', technique_used: 'roast' } });

    const result = await comicTiming('bad code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.rewrite).not.toMatch(/retard|bitch/i);
    expect(result.rewrite).toContain('bad code');
  });
});

describe('mood-specific fallbacks', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('roast simile fallback uses cynic voice in cynic mood', async () => {
    moodSet('cynic');
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Like a dumpster fire.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Similar to a trainwreck.', severity: 3 } });

    const result = await roast('messy code');
    expect(result.roast).toMatch(/^Of course:/);
  });

  it('heckle simile fallback uses zoomer voice in zoomer mood', async () => {
    moodSet('zoomer');
    mockGenerate
      .mockResolvedValueOnce({ data: { heckle: 'Coding like a toddler.' } })
      .mockResolvedValueOnce({ data: { heckle: 'Similar to finger painting.' } });

    const result = await heckle('no types');
    expect(result.heckle).toContain('cooked fr');
  });

  it('comic_timing simile fallback uses chaotic voice in chaotic mood', async () => {
    moodSet('chaotic');
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'That is like a bad dream.', technique_used: 'misdirection' } })
      .mockResolvedValueOnce({ data: { rewrite: 'Similar to watching paint dry.', technique_used: 'understatement' } });

    const result = await comicTiming('slow build');
    expect(result.rewrite).toContain('Sources confirm');
  });
});

describe('simile/comparison post-validation', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('comic_timing retries on simile leak then accepts clean output', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { rewrite: 'That code is like a bad habit nobody quits.', technique_used: 'misdirection' },
      })
      .mockResolvedValueOnce({
        data: { rewrite: 'Forty-seven builds. A new personal record.', technique_used: 'understatement' },
      });

    const result = await comicTiming('Build failed after 47 attempts');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.rewrite).toBe('Forty-seven builds. A new personal record.');
    expect(result.rewrite).not.toMatch(/like a/i);
  });

  it('comic_timing falls back on double simile leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { rewrite: 'That is like a trainwreck.', technique_used: 'misdirection' },
      })
      .mockResolvedValueOnce({
        data: { rewrite: 'Similar to watching paint dry.', technique_used: 'understatement' },
      });

    const result = await comicTiming('slow build');
    expect(result.rewrite).toBe('slow build. No further comment.');
    expect(result.technique_used).toBe('understatement');
  });

  it('heckle retries on simile leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { heckle: 'Debugging like a caveman.' },
      })
      .mockResolvedValueOnce({
        data: { heckle: 'Stone age debugging.' },
      });

    const result = await heckle('console.log everywhere');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.heckle).toBe('Stone age debugging.');
  });

  it('heckle falls back on double simile leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { heckle: 'Coding like a toddler.' },
      })
      .mockResolvedValueOnce({
        data: { heckle: 'Similar to finger painting.' },
      });

    const result = await heckle('no types');
    expect(result.heckle).toBe("no types. That's a choice.");
  });

  it('roast retries on simile leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        data: { roast: 'Verdict: This code is like a maze.', severity: 3 },
      })
      .mockResolvedValueOnce({
        data: { roast: 'Verdict: Labyrinthine spaghetti.', severity: 3 },
      });

    const result = await roast('tangled code', 'code');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.roast).not.toMatch(/like a/i);
  });

  it('clean output passes without retry', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Forty-seven builds. Persistence personified.', technique_used: 'understatement' },
    });

    const result = await comicTiming('Build failed 47 times');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.rewrite).toBe('Forty-seven builds. Persistence personified.');
  });
});

describe('structured output validation', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('roast falls back when generateComedy returns fallback on null fields', async () => {
    // Simulate generateComedy returning the fallback (which is what happens
    // when Zod rejects null values — the catch block returns fallback)
    mockGenerate.mockResolvedValue({
      data: { roast: 'messy code. No further comment.', severity: 3 },
    });

    const result = await roast('messy code');
    expect(result.roast).toBeDefined();
    expect(typeof result.roast).toBe('string');
    expect(result.severity).toBeGreaterThanOrEqual(1);
    expect(result.severity).toBeLessThanOrEqual(5);
  });

  it('heckle falls back when generateComedy returns fallback', async () => {
    mockGenerate.mockResolvedValue({
      data: { heckle: 'bad code' },
    });

    const result = await heckle('bad code');
    expect(result.heckle).toBeDefined();
    expect(typeof result.heckle).toBe('string');
  });

  it('comic_timing falls back when generateComedy returns fallback', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'test input', technique_used: 'understatement' },
    });

    const result = await comicTiming('test input');
    expect(result.rewrite).toBeDefined();
    expect(typeof result.rewrite).toBe('string');
    expect(result.technique_used).toBeDefined();
  });

  it('catchphraseGenerate falls back when generateComedy returns fallback', async () => {
    mockGenerate.mockResolvedValue({
      data: { phrase: 'Ship it and pray.' },
    });

    const result = await catchphraseGenerate('anything');
    expect(result.phrase).toBeDefined();
    expect(typeof result.phrase).toBe('string');
    expect(result.is_fresh).toBe(true);
  });
});

describe('edge cases', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('roast handles empty target gracefully', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Nothing to roast.', severity: 1 },
    });

    const result = await roast('', 'code');
    expect(result.roast).toBeDefined();
    expect(result.severity).toBeGreaterThanOrEqual(1);
  });

  it('heckle handles empty target gracefully', async () => {
    mockGenerate.mockResolvedValue({
      data: { heckle: 'Bold move.' },
    });

    const result = await heckle('');
    expect(result.heckle).toBeDefined();
  });

  it('comic_timing handles empty text gracefully', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Nothing. Literally.', technique_used: 'understatement' },
    });

    const result = await comicTiming('');
    expect(result.rewrite).toBeDefined();
  });

  it('roast handles very long input (truncated by sanitizer)', async () => {
    const longInput = 'a'.repeat(600);
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Too much.', severity: 5 },
    });

    const result = await roast(longInput, 'code');
    expect(result.roast).toBeDefined();
    // Verify sanitizer was applied — the prompt should have truncated input
    const call = mockGenerate.mock.calls[0];
    const opts = call[0] as { userPrompt: string };
    expect(opts.userPrompt.length).toBeLessThan(longInput.length + 200);
  });

  it('comic_timing handles special characters in text', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'JSON in curly braces. Peak comedy.', technique_used: 'understatement' },
    });

    const result = await comicTiming('{"key": "value"}');
    expect(result.rewrite).toBeDefined();
  });

  it('catchphraseGenerate handles empty context', async () => {
    mockGenerate.mockResolvedValue({
      data: { phrase: 'Ship it.' },
    });

    const result = await catchphraseGenerate('');
    expect(result.is_fresh).toBe(true);
  });

  it('handles concurrent tool invocations without state corruption', async () => {
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: Concurrent.', severity: 3 },
    });

    const results = await Promise.all([
      roast('target 1'),
      roast('target 2'),
      roast('target 3'),
    ]);

    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.roast).toBeDefined();
      expect(r.severity).toBeGreaterThanOrEqual(1);
    });
    // Turn counter should have incremented 3 times
    expect(getSession().turn_counter).toBe(3);
    // All 3 bits should be recorded
    expect(getSession().recent_bits).toHaveLength(3);
  });

  it('catchphraseGenerate handles context with newlines (sanitized)', async () => {
    mockGenerate.mockResolvedValue({
      data: { phrase: 'Clean code.' },
    });

    const result = await catchphraseGenerate('buggy\ncode\neverywhere');
    expect(result.is_fresh).toBe(true);
    // Verify sanitizer stripped newlines from the prompt
    const call = mockGenerate.mock.calls[0];
    const opts = call[0] as { userPrompt: string };
    expect(opts.userPrompt).not.toContain('\n\nContext: buggy\ncode');
  });
});

describe('parameterized regression', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('all moods produce valid roast output', async () => {
    for (const mood of MOOD_STYLES) {
      resetSession();
      moodSet(mood);
      mockGenerate.mockResolvedValue({
        data: { roast: 'Verdict: Test output.', severity: 3 },
      });
      const result = await roast('test target');
      expect(result.mood).toBe(mood);
      expect(typeof result.roast).toBe('string');
    }
  });

  it('all moods produce valid heckle output', async () => {
    for (const mood of MOOD_STYLES) {
      resetSession();
      moodSet(mood);
      mockGenerate.mockResolvedValue({
        data: { heckle: 'Test heckle.' },
      });
      const result = await heckle('test target');
      expect(result.mood).toBe(mood);
      expect(typeof result.heckle).toBe('string');
    }
  });

  it('all techniques produce valid comic_timing output', async () => {
    const { COMIC_TECHNIQUES } = await import('../src/types.js');
    for (const technique of COMIC_TECHNIQUES) {
      resetSession();
      mockGenerate.mockResolvedValue({
        data: { rewrite: 'Test rewrite.', technique_used: technique === 'auto' ? 'understatement' : technique },
      });
      const result = await comicTiming('test input', technique);
      expect(typeof result.rewrite).toBe('string');
    }
  });
});

describe('comic_timing terminal safety gate (roast mode)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('catches a slur re-introduced by the roast-label retry (which runs after the harsh filter)', async () => {
    moodSet('roast');
    // 1: clean but unlabeled -> triggers the roast-label retry, which runs LAST.
    // 2: that retry sneaks a slur back in — the terminal safety gate must catch it.
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'This code is questionable.', technique_used: 'understatement' } })
      .mockResolvedValueOnce({ data: { rewrite: 'Verdict: you absolute retard.', technique_used: 'understatement' } });

    const result = await comicTiming('bad code');
    expect(result.rewrite).not.toMatch(/retard/i);
    expect(result.rewrite).toContain('bad code');
  });

  it('catches a simile re-introduced by the roast-label retry', async () => {
    moodSet('roast');
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'This code is questionable.', technique_used: 'understatement' } })
      .mockResolvedValueOnce({ data: { rewrite: 'Verdict: this is like a trainwreck.', technique_used: 'understatement' } });

    const result = await comicTiming('bad code');
    expect(result.rewrite).not.toMatch(/like a/i);
    expect(result.rewrite).toContain('bad code');
  });
});

describe('META_LEAK_PATTERN precision', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('does NOT trigger a retry on benign dev vocabulary containing "rule"', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Broke every rule in the linter and shipped anyway.', technique_used: 'understatement' },
    });
    const result = await comicTiming('messy lint config');
    expect(mockGenerate).toHaveBeenCalledTimes(1); // no false-positive meta retry
    expect(result.rewrite).toContain('rule');
  });

  it('still retries on a genuine meta leak ("system prompt", "no emoji")', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { rewrite: 'The system prompt says no emoji.', technique_used: 'auto' } })
      .mockResolvedValueOnce({ data: { rewrite: 'Pointer at deadbeef. Naturally.', technique_used: 'understatement' } });
    await comicTiming('null pointer');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});

describe('safe fallback never echoes a banned token from the INPUT', () => {
  // When the gate fires and its fallback interpolates the caller's input, a slur/simile in
  // that input must NOT be echoed back — the fallback collapses to a static safe line.
  const SLUR_INPUT = 'you absolute retard of a function';
  const SIMILE_INPUT = 'it works like a charm but fails as a service';

  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('comic_timing does not echo a slur present in the input (Ollama-down path)', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: SLUR_INPUT, technique_used: 'understatement' }, fallback_reason: 'connection' });
    const result = await comicTiming(SLUR_INPUT);
    expect(result.rewrite).not.toMatch(/retard/i);
  });

  it('comic_timing does not echo a simile present in the input', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: SIMILE_INPUT, technique_used: 'understatement' } });
    const result = await comicTiming(SIMILE_INPUT);
    expect(result.rewrite).not.toMatch(/like a|as a/i);
  });

  it('roast does not echo a slur present in the input', async () => {
    mockGenerate.mockResolvedValue({ data: { roast: `${SLUR_INPUT}. No further comment.`, severity: 3 } });
    const result = await roast(SLUR_INPUT);
    expect(result.roast).not.toMatch(/retard/i);
  });

  it('heckle does not echo a slur present in the input', async () => {
    mockGenerate.mockResolvedValue({ data: { heckle: SLUR_INPUT } });
    const result = await heckle(SLUR_INPUT);
    expect(result.heckle).not.toMatch(/retard/i);
  });
});

describe('degraded signal', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('comic_timing flags degraded + reason when the backend fell back', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: 'Forty-seven builds. A record.', technique_used: 'understatement' }, fallback_reason: 'connection' });
    const result = await comicTiming('Build failed');
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('connection');
  });

  it('comic_timing carries NO degraded flag on a real generation', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: 'Forty-seven builds. A record.', technique_used: 'understatement' } });
    const result = await comicTiming('Build failed');
    expect(result.degraded).toBeUndefined();
  });

  it('comic_timing reports degraded_reason "safety-filter" when the terminal gate fires', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: 'you absolute retard', technique_used: 'understatement' } });
    const result = await comicTiming('bad code');
    expect(result.rewrite).not.toMatch(/retard/i);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
  });

  it('roast flags degraded + reason', async () => {
    mockGenerate.mockResolvedValue({ data: { roast: 'Verdict: Done.', severity: 3 }, fallback_reason: 'model-not-found' });
    const result = await roast('bad code');
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('model-not-found');
  });

  it('heckle flags degraded + reason', async () => {
    mockGenerate.mockResolvedValue({ data: { heckle: 'Bold.' }, fallback_reason: 'timeout' });
    const result = await heckle('no tests');
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('timeout');
  });

  it('catchphrase_generate flags degraded + reason', async () => {
    mockGenerate.mockResolvedValue({ data: { phrase: 'Ship it and pray.' }, fallback_reason: 'connection' });
    const result = await catchphraseGenerate('anything');
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('connection');
  });
});

// Stage C — the degradation contract (study-swarm Q4): every degraded output must be
// machine-signalled with a closed-enum reason, and NO safety substitution may read as genuine.
describe('Stage C degradation contract', () => {
  // The closed DegradedReason set (mirrors types.ts DegradedReason). A reason outside this set
  // would be an un-branchable contract violation for a consuming agent.
  const KNOWN_DEGRADED_REASONS = new Set([
    'safety-filter', 'connection', 'timeout', 'model-not-found', 'auth',
    'rate-limit', 'server', 'http', 'json-parse', 'validation', 'exhausted', 'unknown',
  ]);

  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
    mockRecordSafetyFire.mockClear();
  });

  it('catchphraseCallback flags degraded when its safety gate substitutes a stored dirty phrase (B1)', () => {
    const session = getSession();
    // Store a dirty phrase directly (bypassing the on-load content gate) so the callback gate
    // is the thing under test — it must substitute AND signal, not silently swap.
    session.useCatchphrase('you absolute retard');
    const result = catchphraseCallback();
    expect(result).not.toBeNull();
    expect(HARSH_FILTER.test(result!.phrase)).toBe(false);
    expect(result!.phrase).not.toMatch(/retard/i);
    expect(result!.degraded).toBe(true);
    expect(result!.degraded_reason).toBe('safety-filter');
    expect(mockRecordSafetyFire).toHaveBeenCalled();
  });

  it('catchphraseCallback carries NO degraded flag for a clean recalled phrase', () => {
    const session = getSession();
    session.useCatchphrase('Ship it and pray.');
    const result = catchphraseCallback();
    expect(result!.phrase).toBe('Ship it and pray.');
    expect(result!.degraded).toBeUndefined();
  });

  it('comic_timing terminal-gates a persistent meta-leak and flags degraded safety-filter (B2)', async () => {
    // Model leaks prompt internals on every attempt; the meta-leak retry does not clear it, so the
    // terminal gate must substitute + flag rather than return the leak verbatim and unflagged.
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'well, the rules say no emoji here', technique_used: 'understatement' },
    });
    const result = await comicTiming('ship the build');
    expect(result.rewrite).not.toMatch(/the rules say/i);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
    expect(mockRecordSafetyFire).toHaveBeenCalled();
  });

  it('roast flags degraded when an INTERMEDIATE safety fallback substitutes, not only the terminal gate', async () => {
    // First call leaks a simile; the retry STILL leaks -> the intermediate fallback substitutes and
    // cleans the output, so the terminal gate never fires. The degraded signal must still be set.
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'broken like a charm', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'still broken like a dream', severity: 3 } });
    const result = await roast('the code');
    expect(SIMILE_PATTERN.test(result.roast)).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
  });

  it('every degraded output carries a reason from the closed DegradedReason set', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'x', technique_used: 'understatement' },
      fallback_reason: 'rate-limit',
    });
    const result = await comicTiming('anything');
    expect(result.degraded).toBe(true);
    expect(KNOWN_DEGRADED_REASONS.has(result.degraded_reason as string)).toBe(true);
  });
});

// tools-001 — catchphrase_callback must not livelock on a poisoned (dirty) stored phrase.
// A dirty phrase's count was bumped every call BEFORE the safety gate substituted it, so it stayed
// the map maximum forever and shadowed every clean phrase for the rest of the session.
describe('catchphraseCallback livelock (tools-001)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
    mockRecordSafetyFire.mockClear();
  });

  it('a poisoned phrase does NOT shadow clean phrases across repeated callbacks', () => {
    const session = getSession();
    // Seed a dirty phrase and a clean phrase. Give the dirty one a HEAD START so the OLD code
    // (which bumps the selected phrase pre-gate) would keep re-selecting it forever.
    session.useCatchphrase('you absolute retard'); // dirty, count 1
    session.useCatchphrase('Ship it and pray.');   // clean, count 1

    // Every callback must recall the CLEAN phrase; the dirty phrase must never surface, and its
    // count must never be mutated (so it can't climb back to the maximum).
    for (let i = 0; i < 5; i++) {
      const result = catchphraseCallback();
      expect(result).not.toBeNull();
      expect(HARSH_FILTER.test(result!.phrase)).toBe(false);
      expect(result!.phrase).not.toMatch(/retard/i);
      expect(result!.phrase).toBe('Ship it and pray.');
    }
    // The dirty phrase's count was never bumped — still at its seeded value of 1.
    expect(session.catchphrases.get('you absolute retard')).toBe(1);
    // The clean phrase climbed 1 (seed) + 5 (callbacks) = 6.
    expect(session.catchphrases.get('Ship it and pray.')).toBe(6);
  });

  it('use_count matches the returned (clean) phrase, not a different bestPhrase', () => {
    const session = getSession();
    // Dirty phrase seeded to a HIGHER count than the clean one. If the scan picked the dirty phrase
    // as bestPhrase (old behavior) but returned the static substitute, use_count would describe the
    // dirty phrase while `phrase` is a different string. Skipping dirty entries keeps them aligned.
    session.useCatchphrase('you absolute retard');
    session.useCatchphrase('you absolute retard');
    session.useCatchphrase('you absolute retard'); // dirty, count 3
    session.useCatchphrase('Ship it and pray.');   // clean, count 1

    const result = catchphraseCallback();
    expect(result!.phrase).toBe('Ship it and pray.');
    // use_count describes the RETURNED phrase: 1 (seed) + 1 (this callback) = 2.
    expect(result!.use_count).toBe(2);
    expect(session.catchphrases.get('Ship it and pray.')).toBe(2);
  });

  it('all-dirty map → static safe line, degraded, and NO count mutation', () => {
    const session = getSession();
    session.useCatchphrase('you absolute retard');  // dirty, count 1
    session.useCatchphrase('broken like a charm');  // dirty (simile), count 1
    const before = new Map(session.catchphrases);

    const result = catchphraseCallback();
    expect(result).not.toBeNull();
    // Returned line is safe on BOTH filters.
    expect(HARSH_FILTER.test(result!.phrase)).toBe(false);
    expect(SIMILE_PATTERN.test(result!.phrase)).toBe(false);
    expect(result!.phrase).not.toMatch(/retard|like a/i);
    // Substitution is machine-visible.
    expect(result!.degraded).toBe(true);
    expect(result!.degraded_reason).toBe('safety-filter');
    expect(result!.use_count).toBe(0);
    expect(mockRecordSafetyFire).toHaveBeenCalled();
    // No count was mutated — every dirty entry keeps its pre-callback count.
    for (const [k, v] of before) {
      expect(session.catchphrases.get(k)).toBe(v);
    }
  });
});

// tools-003 — catchphraseGenerate context reuse must match on any significant word of the stored
// phrase and tolerate trailing punctuation (old code compared only the FIRST word WITH punctuation).
describe('catchphraseGenerate context reuse (tools-003)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('reuses a phrase whose FIRST word carries a trailing comma', async () => {
    const session = getSession();
    // Old code: firstWord = "cooked," (punctuation kept) → \bcooked,\b never matches "cooked".
    session.useCatchphrase('cooked, no cap.');

    const result = await catchphraseGenerate('this build is absolutely cooked today');
    expect(result.phrase).toBe('cooked, no cap.');
    expect(result.is_fresh).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('reuses a phrase by a NON-first significant word', async () => {
    const session = getSession();
    // "ship" is the first word; "pray" is a later significant word. Old code compared only the
    // first word, so a context that mentioned "pray" but not "ship" would miss the reuse.
    session.useCatchphrase('Ship it and pray.');

    const result = await catchphraseGenerate('all we can do now is pray it compiles');
    expect(result.phrase).toBe('Ship it and pray.');
    expect(result.is_fresh).toBe(false);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

// tools-002 — comic_timing must snapshot mood once at entry. A concurrent mood_set during the
// generateComedy await must NOT flip the roast-label enforcement decision.
describe('comic_timing mood snapshot (tools-002)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  it('uses the ENTRY mood for the roast-label retry, not a mid-await mood_set', async () => {
    // Enter in a NON-roast mood (dry). While the first generateComedy await is in flight, a
    // concurrent mood_set flips the session to roast. If comic_timing read session.mood post-await
    // (the bug), it would now enforce the roast label and fire a second generation. With the entry
    // snapshot, it stays 'dry' and does NOT retry.
    moodSet('dry');
    mockGenerate.mockImplementationOnce(async () => {
      moodSet('roast'); // concurrent mood change lands during the await
      return { data: { rewrite: 'The config is a mess.', technique_used: 'understatement' } };
    });

    const result = await comicTiming('config broke');
    // Entry mood was 'dry' → no roast-label enforcement → exactly one generation.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.rewrite).toBe('The config is a mess.');
  });

  it('ENTERS in roast mood → enforces the label even if a mid-await mood_set flips to dry', async () => {
    // Symmetric case: entry mood is roast, so the label retry MUST fire even though a concurrent
    // mood_set flips to dry during the await. Reading session.mood post-await would wrongly skip it.
    moodSet('roast');
    mockGenerate
      .mockImplementationOnce(async () => {
        moodSet('dry'); // concurrent flip away from roast during the await
        return { data: { rewrite: 'This code is questionable.', technique_used: 'understatement' } };
      })
      .mockResolvedValueOnce({ data: { rewrite: 'Verdict: architectural malpractice.', technique_used: 'understatement' } });

    const result = await comicTiming('bad code');
    // Entry mood roast + unlabeled first output → label retry fires → two generations.
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.rewrite).toMatch(/^Verdict:/i);
  });
});

// server-003 — terminal gate that fires on a CALLER-SPECIFIC pattern must use the input-free
// STATIC_SAFE_FALLBACK, so a benign COMPARISON_LEAK / META_LEAK word in the caller's target/text
// cannot survive into the returned line via the interpolating voicedSafeFallback.
describe('terminal gate uses input-free fallback for caller-specific patterns (server-003)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
    mockRecordSafetyFire.mockClear();
  });

  it('roast: a COMPARISON_LEAK word ("blanket") in the target does not survive into the line', async () => {
    // 'blanket' is a COMPARISON_LEAK term. Model persistently emits it; the simile/comparison retry
    // cannot clear it, so the terminal gate fires ON COMPARISON_LEAK. The OLD voicedSafeFallback
    // would interpolate the target ("...blanket policy...") and re-emit 'blanket'. The input-free
    // STATIC_SAFE_FALLBACK must be used instead — 'blanket' must NOT appear in the result.
    mockGenerate.mockResolvedValue({ data: { roast: 'Verdict: a blanket statement.', severity: 3 } });

    const result = await roast('the blanket retry policy', 'code');
    expect(COMPARISON_LEAK_WORDS.test(result.roast)).toBe(false);
    expect(result.roast).not.toMatch(/blanket/i);
    // It collapsed to the dry static safe line (default mood).
    expect(result.roast).toBe(STATIC_SAFE_FALLBACK.dry);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
  });

  it('comic_timing: a META_LEAK phrase in the text does not survive into the rewrite', async () => {
    // Model persistently leaks a meta phrase ("no emoji") that ALSO appears in the caller's text.
    // The meta retry cannot clear it, so the terminal gate fires on META_LEAK_PATTERN. The
    // input-free STATIC_SAFE_FALLBACK must be used so the caller's own 'no emoji' cannot be
    // re-emitted through an interpolating fallback.
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'well, no emoji allowed here', technique_used: 'understatement' },
    });

    const result = await comicTiming('the linter enforces no emoji in commit messages');
    expect(result.rewrite).not.toMatch(/no emoji/i);
    // Collapsed to the input-free dry static line (default mood), not an interpolation of the text.
    expect(result.rewrite).toBe(STATIC_SAFE_FALLBACK.dry);
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
  });
});

// ROADMAP v2.0 "Chain Trace Tool": every comedy tool records ONE trace entry per call into the
// session ring, with the documented fields populated. (generateComedy is mocked here, so the
// gen-metadata fields — retries/fingerprint/latency — are absent; the LIGHT fields the tool owns
// must always be present.) SENSOR_HUMOR_FULL_TRACE adds the heavy prompt/raw/parsed fields.
describe('per-tool trace recording (ROADMAP v2.0 debug_chain)', () => {
  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
  });

  afterEach(() => {
    delete process.env.SENSOR_HUMOR_FULL_TRACE;
  });

  it('comic_timing records a trace with the documented fields', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Forty-seven builds. A record.', technique_used: 'understatement' },
    });
    await comicTiming('Build failed after 47 attempts');
    const traces = getSession().getTraces();
    expect(traces).toHaveLength(1);
    const t = traces[0];
    expect(t.tool).toBe('comic_timing');
    expect(t.mood).toBe('dry');
    expect(t.input).toBe('Build failed after 47 attempts');
    expect(t.turn).toBe(1);
    expect(Array.isArray(t.validators_triggered)).toBe(true);
    // No gate fired on clean output, and no degradation.
    expect(t.validators_triggered).toEqual([]);
    expect(t.degraded_reason).toBeUndefined();
  });

  it('roast records a trace tagged with the tool name and input', async () => {
    mockGenerate.mockResolvedValue({ data: { roast: 'Verdict: Done.', severity: 3 } });
    await roast('global state everywhere', 'code');
    const t = getSession().getTraces()[0];
    expect(t.tool).toBe('roast');
    expect(t.input).toBe('global state everywhere');
    expect(t.mood).toBe('dry');
  });

  it('heckle records a trace', async () => {
    mockGenerate.mockResolvedValue({ data: { heckle: 'Bold move.' } });
    await heckle('no tests');
    const t = getSession().getTraces()[0];
    expect(t.tool).toBe('heckle');
    expect(t.input).toBe('no tests');
  });

  it('catchphrase_generate records a trace', async () => {
    mockGenerate.mockResolvedValue({ data: { phrase: 'Ship it and pray.' } });
    await catchphraseGenerate('buggy code');
    const t = getSession().getTraces()[0];
    expect(t.tool).toBe('catchphrase');
    expect(t.input).toBe('buggy code');
  });

  it('trace captures which validators fired (terminal gate on a slur)', async () => {
    mockGenerate.mockResolvedValue({ data: { rewrite: 'you absolute retard', technique_used: 'understatement' } });
    await comicTiming('bad code');
    const t = getSession().getTraces()[0];
    // The terminal safety gate fired -> recorded in validators_triggered, and the trace's
    // degraded_reason mirrors the safety substitution.
    expect(t.validators_triggered).toContain('terminal-gate');
    expect(t.degraded_reason).toBe('safety-filter');
  });

  it('records the degraded_reason from a backend fallback in the trace', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Forty-seven builds.', technique_used: 'understatement' },
      fallback_reason: 'connection',
    });
    await comicTiming('Build failed');
    const t = getSession().getTraces()[0];
    expect(t.degraded_reason).toBe('connection');
  });

  it('default trace OMITS the heavy prompt/raw/parsed fields (bounded size)', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Clean line.', technique_used: 'understatement' },
    });
    await comicTiming('some text');
    const t = getSession().getTraces()[0];
    expect(t.prompt_text).toBeUndefined();
    expect(t.raw_output).toBeUndefined();
    expect(t.parsed_output).toBeUndefined();
  });

  it('SENSOR_HUMOR_FULL_TRACE=true ADDS the heavy prompt_text + parsed_output fields', async () => {
    process.env.SENSOR_HUMOR_FULL_TRACE = 'true';
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Clean line.', technique_used: 'understatement' },
      // Under full-trace, generateComedy would return raw_output; the mock provides it here so the
      // tool can thread it into the trace.
      raw_output: '{"rewrite":"Clean line.","technique_used":"understatement"}',
    });
    await comicTiming('some text');
    const t = getSession().getTraces()[0];
    expect(typeof t.prompt_text).toBe('string');
    expect(t.prompt_text!.length).toBeGreaterThan(0);
    expect(t.raw_output).toBe('{"rewrite":"Clean line.","technique_used":"understatement"}');
    expect(t.parsed_output).toEqual({ rewrite: 'Clean line.', technique_used: 'understatement' });
  });

  it('records one trace per call: three calls => three ordered entries (newest first)', async () => {
    mockGenerate.mockResolvedValue({ data: { heckle: 'Bold.' } });
    await heckle('one');
    await heckle('two');
    await heckle('three');
    const traces = getSession().getTraces();
    expect(traces).toHaveLength(3);
    expect(traces.map((t) => t.input)).toEqual(['three', 'two', 'one']);
  });
});

// F-12a23ffa: comedy-tool safety proofs must plant obfuscated slurs and call hasHarshLeak.
// Plaintext 'you retard' tests stay green if a tool site swaps hasHarshLeak back to HARSH_FILTER.test;
// these payloads go RED because the bare regex misses them.
describe('obfuscated slur wiring (hasHarshLeak at every tool site)', () => {
  const TARGET = 'bad code';

  beforeEach(() => {
    resetSession();
    mockGenerate.mockReset();
    mockRecordSafetyFire.mockClear();
  });

  it('named regression: HARSH_FILTER.test misses the obfuscated payloads (why the normalized path is required at the tool site)', () => {
    for (const { payload } of OBFUSCATED_SLURS) {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      expect(hasHarshLeak(payload)).toBe(true);
    }
  });

  for (const { name, payload } of OBFUSCATED_SLURS) {
    it(`roast substitutes the voiced safe fallback for a ${name} slur`, async () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      mockGenerate.mockResolvedValue({ data: { roast: payload, severity: 3 } });
      const result = await roast(TARGET);
      expect(result.roast).toBe(voicedSafeFallback('dry', TARGET));
      expect(result.degraded).toBe(true);
      expect(result.degraded_reason).toBe('safety-filter');
      expect(hasHarshLeak(result.roast)).toBe(false);
    });

    it(`heckle substitutes the voiced safe fallback for a ${name} slur`, async () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      mockGenerate.mockResolvedValue({ data: { heckle: payload } });
      const result = await heckle(TARGET);
      expect(result.heckle).toBe(`${TARGET}. That's a choice.`);
      expect(result.degraded).toBe(true);
      expect(result.degraded_reason).toBe('safety-filter');
      expect(hasHarshLeak(result.heckle)).toBe(false);
    });

    it(`comic_timing substitutes the voiced safe fallback for a ${name} slur`, async () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      mockGenerate.mockResolvedValue({ data: { rewrite: payload, technique_used: 'understatement' } });
      const result = await comicTiming(TARGET);
      expect(result.rewrite).toBe(voicedSafeFallback('dry', TARGET));
      expect(result.degraded).toBe(true);
      expect(result.degraded_reason).toBe('safety-filter');
      expect(hasHarshLeak(result.rewrite)).toBe(false);
    });

    it(`catchphraseGenerate substitutes the static safe catchphrase for a ${name} slur`, async () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      mockGenerate.mockResolvedValue({ data: { phrase: payload } });
      const result = await catchphraseGenerate(TARGET);
      expect(result.phrase).toBe(DRY_SAFE_CATCHPHRASE);
      expect(result.degraded).toBe(true);
      expect(result.degraded_reason).toBe('safety-filter');
      expect(hasHarshLeak(result.phrase)).toBe(false);
      expect(getSession().catchphrases.has(payload)).toBe(false);
    });

    it(`catchphraseCallback substitutes the static safe catchphrase for a stored ${name} slur`, () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      getSession().useCatchphrase(payload);
      const result = catchphraseCallback();
      expect(result).not.toBeNull();
      expect(result!.phrase).toBe(DRY_SAFE_CATCHPHRASE);
      expect(result!.degraded).toBe(true);
      expect(result!.degraded_reason).toBe('safety-filter');
      expect(hasHarshLeak(result!.phrase)).toBe(false);
    });

    it(`runningGag refuses a ${name} slur and stores nothing`, () => {
      expect(HARSH_FILTER.test(payload)).toBe(false);
      let threw: unknown;
      try {
        runningGag(payload, 'clean-tag');
      } catch (e) {
        threw = e;
      }
      expect(threw).toBeInstanceOf(DirtyGagError);
      const msg = (threw as Error).message;
      expect(hasHarshLeak(msg)).toBe(false);
      expect(getSession().running_gags).toHaveLength(0);
    });
  }

  // F-ad64c61c: pin one Cf/M splitter through a comedy-tool terminal gate so a wiring
  // revert from hasHarshLeak to HARSH_FILTER.test goes red (U+00AD is not in ZERO_WIDTH_AND_FORMAT).
  it('roast terminal-gates a U+00AD-split slur the bare HARSH_FILTER misses', async () => {
    expect(HARSH_FILTER.test(SOFT_HYPHEN_SLUR)).toBe(false);
    expect(hasHarshLeak(SOFT_HYPHEN_SLUR)).toBe(true);
    mockGenerate.mockResolvedValue({ data: { roast: SOFT_HYPHEN_SLUR, severity: 3 } });
    const result = await roast(TARGET);
    expect(result.roast).toBe(voicedSafeFallback('dry', TARGET));
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
    expect(hasHarshLeak(result.roast)).toBe(false);
  });

  // F-59082050: pin one obfuscated simile through a comedy tool so the terminal gate, not just
  // the unit hasSimileLeak suite, requires the normalized path.
  it('roast terminal-gates a zero-width-laced simile the bare SIMILE_PATTERN misses', async () => {
    expect(SIMILE_PATTERN.test(ZWSP_LIKE)).toBe(false);
    expect(hasSimileLeak(ZWSP_LIKE)).toBe(true);
    mockGenerate.mockResolvedValue({ data: { roast: ZWSP_LIKE, severity: 3 } });
    const result = await roast('the code');
    expect(result.roast).toBe(voicedSafeFallback('dry', 'the code'));
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe('safety-filter');
    expect(hasSimileLeak(result.roast)).toBe(false);
  });
});
