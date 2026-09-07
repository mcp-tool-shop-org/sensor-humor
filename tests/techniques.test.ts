import { describe, it, expect } from 'vitest';
import {
  assertMoodTechnique,
  InvalidTechniqueError,
  MOOD_TECHNIQUE_MATRIX,
  isVerbatimCallback,
  techniquesForMood,
} from '../src/tools/techniques.js';
import { MOOD_STYLES } from '../src/types.js';

describe('mood × technique matrix', () => {
  it('auto is legal on every mood', () => {
    for (const mood of MOOD_STYLES) {
      expect(() => assertMoodTechnique(mood, 'auto')).not.toThrow();
    }
  });

  it('refuses cynic + escalation with an actionable valid-list (ROADMAP gate)', () => {
    expect(() => assertMoodTechnique('cynic', 'escalation')).toThrow(InvalidTechniqueError);
    try {
      assertMoodTechnique('cynic', 'escalation');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTechniqueError);
      const e = err as InvalidTechniqueError;
      expect(e.message).toMatch(/cynic/);
      expect(e.message).toMatch(/escalation/);
      expect(e.message).toMatch(/understatement/);
      expect(e.message).toMatch(/callback/);
      expect(e.allowed).toEqual(MOOD_TECHNIQUE_MATRIX.cynic);
    }
  });

  it('allows roast + misdirection (ROADMAP gate)', () => {
    expect(() => assertMoodTechnique('roast', 'misdirection')).not.toThrow();
  });

  it('every listed overlay is actually in that mood\'s allow-list', () => {
    for (const mood of MOOD_STYLES) {
      for (const tech of techniquesForMood(mood)) {
        expect(() => assertMoodTechnique(mood, tech)).not.toThrow();
      }
    }
  });

  it('dry and cynic reject escalation and rule-of-three (skeleton fight)', () => {
    for (const mood of ['dry', 'cynic'] as const) {
      expect(() => assertMoodTechnique(mood, 'escalation')).toThrow(InvalidTechniqueError);
      expect(() => assertMoodTechnique(mood, 'rule-of-three')).toThrow(InvalidTechniqueError);
    }
  });

  it('chaotic and zoomer reject understatement (skeleton fight)', () => {
    expect(() => assertMoodTechnique('chaotic', 'understatement')).toThrow(InvalidTechniqueError);
    expect(() => assertMoodTechnique('zoomer', 'understatement')).toThrow(InvalidTechniqueError);
  });
});

describe('verbatim callback detection', () => {
  it('treats punctuation/case/spacing variants as the same setup', () => {
    expect(isVerbatimCallback('The deadbeef incident.', 'the  deadbeef incident')).toBe(true);
  });

  it('treats a twisted replay as different', () => {
    expect(
      isVerbatimCallback(
        'Deadbeef strikes again, now with 30% more undefined behavior.',
        'The deadbeef incident',
      ),
    ).toBe(false);
  });

  it('empty collapse is not a match', () => {
    expect(isVerbatimCallback('   !!!', '???')).toBe(false);
  });
});
