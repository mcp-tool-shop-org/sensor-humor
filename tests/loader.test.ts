import { describe, it, expect, afterEach } from 'vitest';
import {
  loadMoodPrompt,
  getMoodSystemPrompt,
  getMoodVoiceNotes,
  getActivePromptKey,
  getRegisteredPromptKeys,
} from '../src/prompts/loader.js';
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

  // v1.2 prompt-versioning scaffolding: SENSOR_HUMOR_PROMPT_VERSION=2 must load a v2 prompt where
  // one exists (dry.v2) AND fall back to v1 per-mood where it does not (roast has no v2). This is
  // the "v2 prompts load alongside v1, switchable per-session" gate.
  describe('prompt versioning (v2 scaffolding)', () => {
    it('loads v2 for a mood that has one when version=2', () => {
      process.env.SENSOR_HUMOR_PROMPT_VERSION = '2';
      const v2 = loadMoodPrompt('dry').SYSTEM_PROMPT;
      expect(v2).toContain('Pick exactly ONE output shape'); // v2-distinctive marker
      expect(v2).not.toContain('Prioritize structural humor'); // a v1-only phrase
      expect(getActivePromptKey('dry')).toBe('dry.v2');
    });

    it('falls back to v1 per-mood for moods with no v2 when version=2', () => {
      process.env.SENSOR_HUMOR_PROMPT_VERSION = '2';
      expect(loadMoodPrompt('roast').SYSTEM_PROMPT).toContain('affectionate');
      expect(getActivePromptKey('roast')).toBe('roast.v1');
    });

    it('getActivePromptKey reflects the resolved (not requested) version', () => {
      delete process.env.SENSOR_HUMOR_PROMPT_VERSION;
      expect(getActivePromptKey('dry')).toBe('dry.v1');
      process.env.SENSOR_HUMOR_PROMPT_VERSION = '999';
      // requested v999 silently downgrades to v1 — the active key exposes that
      expect(getActivePromptKey('dry')).toBe('dry.v1');
    });

    // b-sc-004: the v2 on-ramp has a silent-downgrade failure mode — a dev adds a
    // `<mood>.v2.prompt.ts` import but forgets the PROMPT_MAP entry, so version=2 silently serves v1
    // for that mood and the A/B knob is a no-op. This asserts that for EVERY `<mood>.v2` key actually
    // registered in PROMPT_MAP, getActivePromptKey(mood) at version=2 resolves to that v2 key. It
    // reads the LIVE registration set (getRegisteredPromptKeys) so it guards the half-wiring case
    // rather than a hand-listed expectation. Today only dry.v2 exists; this stays correct as more
    // v2 prompts are registered, and if a registered v2 fails to resolve, CI names the mood.
    it('every registered <mood>.v2 resolves via getActivePromptKey at version=2 (v2 half-wiring guard)', () => {
      process.env.SENSOR_HUMOR_PROMPT_VERSION = '2';
      const v2Keys = getRegisteredPromptKeys().filter((k) => k.endsWith('.v2'));
      expect(v2Keys.length, 'expected at least one registered v2 prompt (dry.v2 exemplar)').toBeGreaterThan(0);
      const unresolved: string[] = [];
      for (const key of v2Keys) {
        const mood = key.slice(0, -'.v2'.length) as MoodStyle;
        if (getActivePromptKey(mood) !== key) {
          unresolved.push(`${key} -> got ${getActivePromptKey(mood)}`);
        }
      }
      // Non-empty means a v2 was registered but does NOT win at version=2 (or a key is malformed) —
      // the silent-downgrade bug, named per mood.
      expect(unresolved).toEqual([]);
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

    it('zoomer prompt contains snark/meme language', () => {
      const prompt = getMoodSystemPrompt('zoomer');
      expect(prompt.toLowerCase()).toMatch(/zoomer|snark|savage|meme/);
    });

    it('cynic prompt contains jaded/bitter language', () => {
      const prompt = getMoodSystemPrompt('cynic');
      expect(prompt.toLowerCase()).toMatch(/cynic|bitter|jaded|vicious/);
    });

    it('cheeky prompt contains playful/teasing language', () => {
      const prompt = getMoodSystemPrompt('cheeky');
      expect(prompt.toLowerCase()).toMatch(/cheeky|playful|teasing|mischief/);
    });

    it('chaotic prompt contains absurd/escalation language', () => {
      const prompt = getMoodSystemPrompt('chaotic');
      expect(prompt.toLowerCase()).toMatch(/chaotic|absurd|escalat|reality/);
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
