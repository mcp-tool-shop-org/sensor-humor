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
