import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetSession, getSession } from '../src/session.js';
import { MOOD_STYLES, MOOD_DESCRIPTIONS, type MoodStyle } from '../src/types.js';

// Mock the Ollama module so tests don't need a live server
vi.mock('../src/ollama.js', () => ({
  generateComedy: vi.fn(),
}));

import { generateComedy } from '../src/ollama.js';
const mockGenerate = vi.mocked(generateComedy);

// Import tools after mock is set up
import { moodSet, moodGet } from '../src/tools/mood.js';
import { roast } from '../src/tools/roast.js';
import { heckle } from '../src/tools/heckle.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { catchphraseGenerate, catchphraseCallback } from '../src/tools/catchphrase.js';

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
      moodSet('unhinged');
      expect(getSession().mood).toBe('unhinged');
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
  });

  describe('moodGet', () => {
    it('returns current mood and gag count', () => {
      const result = moodGet();
      expect(result.mood).toBe('dry');
      expect(result.description).toBe(MOOD_DESCRIPTIONS.dry);
      expect(result.session_gag_count).toBe(0);
    });

    it('reflects mood changes', () => {
      moodSet('sardonic');
      const result = moodGet();
      expect(result.mood).toBe('sardonic');
    });

    it('reflects gag count', () => {
      const session = getSession();
      session.addGag('test', 'tag');
      session.addGag('test2', 'tag2');
      expect(moodGet().session_gag_count).toBe(2);
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

  it('retries when label pattern missing', async () => {
    // First call returns no label, second returns with label
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'This code is bad.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Actively hostile codebase.', severity: 4 } });

    const result = await roast('awful code');
    // Should have called generateComedy at least twice (initial + label retry)
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('retries on comparison leak', async () => {
    mockGenerate
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Like a dumpster fire.', severity: 3 } })
      .mockResolvedValueOnce({ data: { roast: 'Verdict: Terminal negligence.', severity: 3 } });

    const result = await roast('messy code');
    expect(mockGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reflects current mood', async () => {
    moodSet('unhinged');
    mockGenerate.mockResolvedValue({
      data: { roast: 'Verdict: CHAOS.', severity: 5 },
    });

    const result = await roast('everything');
    expect(result.mood).toBe('unhinged');
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

  it('defaults to auto technique', async () => {
    mockGenerate.mockResolvedValue({
      data: { rewrite: 'Output.', technique_used: 'understatement' },
    });

    await comicTiming('input');
    const call = mockGenerate.mock.calls[0];
    const opts = call[0] as { userPrompt: string };
    expect(opts.userPrompt).toContain('Choose the best');
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
  });
});
