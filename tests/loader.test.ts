import { describe, it, expect, afterEach } from 'vitest';
import { loadMoodPrompt, getMoodSystemPrompt, getMoodVoiceNotes } from '../src/prompts/loader.js';
import { MOOD_STYLES, type MoodStyle } from '../src/types.js';

describe('Prompt Loader', () => {
  const originalEnv = process.env.SENSOR_HUMOR_PROMPT_VERSION;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SENSOR_HUMOR_PROMPT_VERSION;
    } else {
      process.env.SENSOR_HUMOR_PROMPT_VERSION = originalEnv;
    }
  });

  describe('loadMoodPrompt', () => {
    it('loads v1 prompts for all 6 moods', () => {
      for (const mood of MOOD_STYLES) {
        const module = loadMoodPrompt(mood);
        expect(module.SYSTEM_PROMPT).toBeDefined();
        expect(module.SYSTEM_PROMPT.length).toBeGreaterThan(50);
        expect(module.VOICE_NOTES).toBeDefined();
        expect(module.VOICE_NOTES.length).toBeGreaterThan(5);
      }
    });

    it('falls back to v1 when requested version does not exist', () => {
      process.env.SENSOR_HUMOR_PROMPT_VERSION = '999';
      const module = loadMoodPrompt('dry');
      expect(module.SYSTEM_PROMPT).toContain('deadpan');
    });

    it('uses v1 by default when env var not set', () => {
      delete process.env.SENSOR_HUMOR_PROMPT_VERSION;
      const module = loadMoodPrompt('roast');
      expect(module.SYSTEM_PROMPT).toContain('affectionate');
    });
  });

  describe('getMoodSystemPrompt', () => {
    it('returns string for each mood', () => {
      for (const mood of MOOD_STYLES) {
        const prompt = getMoodSystemPrompt(mood);
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      }
    });

    it('dry prompt contains deadpan voice anchor', () => {
      expect(getMoodSystemPrompt('dry')).toContain('deadpan');
    });

    it('roast prompt contains affectionate voice anchor', () => {
      expect(getMoodSystemPrompt('roast')).toContain('affectionate');
    });

    it('unhinged prompt contains chaos/energy language', () => {
      const prompt = getMoodSystemPrompt('unhinged');
      expect(prompt.toLowerCase()).toMatch(/chaos|energy|spiraling|composure/);
    });
  });

  describe('getMoodVoiceNotes', () => {
    it('returns non-empty voice notes for each mood', () => {
      for (const mood of MOOD_STYLES) {
        const notes = getMoodVoiceNotes(mood);
        expect(typeof notes).toBe('string');
        expect(notes.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Base prompt', () => {
  it('assembles all sections', async () => {
    const { baseSystemPrefix } = await import('../src/prompts/base.js');
    const prefix = baseSystemPrefix();
    expect(prefix).toContain('LANGUAGE');
    expect(prefix).toContain('SAFETY');
    expect(prefix).toContain('STYLE CONSTRAINTS');
    expect(prefix).toContain('COMEDY PRINCIPLES');
    expect(prefix).toContain('OUTPUT RULES');
  });

  it('bans emojis', async () => {
    const { baseSystemPrefix } = await import('../src/prompts/base.js');
    const prefix = baseSystemPrefix();
    expect(prefix.toLowerCase()).toContain('never use emojis');
  });

  it('bans metaphors', async () => {
    const { baseSystemPrefix } = await import('../src/prompts/base.js');
    const prefix = baseSystemPrefix();
    expect(prefix.toLowerCase()).toContain('never use metaphors');
  });
});
