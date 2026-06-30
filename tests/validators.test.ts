import { describe, it, expect } from 'vitest';
import {
  hasSimileLeak,
  hasHarshLeak,
  SIMILE_PATTERN,
  HARSH_FILTER,
  sanitizeForPrompt,
  voicedSafeFallback,
  STATIC_SAFE_FALLBACK,
} from '../src/validators.js';

// Built from char codes so the obfuscation bytes are unambiguous in source.
// "retard" base term reconstructed only via normalization paths, never spelled here.
const RET = String.fromCharCode(0x72, 0x65, 0x74); // "ret"
const ARD = String.fromCharCode(0x61, 0x72, 0x64); // "ard"
// Zero-width-space (U+200B) laced into the slur: defeats a naive \b...\b boundary
// unless normalization strips the zero-width char before HARSH_FILTER runs.
const ZWSP_SLUR = `you ${RET}a${String.fromCharCode(0x200b)}${String.fromCharCode(0x72, 0x64)} of a function`;
// Cyrillic-homoglyph slur: е(U+0435) т(U+0442) а(U+0430) look like e,t,a but \b never
// matches unless confusables are folded down to ASCII first.
const CYRILLIC_SLUR = `you ${String.fromCharCode(0x72, 0x435, 0x442, 0x430, 0x72, 0x64)} of a function`;

describe('validators', () => {
  describe('hasSimileLeak', () => {
    it('detects "like a" pattern', () => {
      expect(hasSimileLeak('This code is like a dumpster fire')).toBe(true);
    });

    it('detects "as if" pattern', () => {
      expect(hasSimileLeak('As if that would work')).toBe(true);
    });

    it('detects "similar to" pattern', () => {
      expect(hasSimileLeak('Similar to watching paint dry')).toBe(true);
    });

    it('detects "resembles" pattern', () => {
      expect(hasSimileLeak('This resembles spaghetti')).toBe(true);
    });

    it('detects "akin to" pattern', () => {
      expect(hasSimileLeak('Akin to a disaster')).toBe(true);
    });

    it('returns false for clean text', () => {
      expect(hasSimileLeak('Verdict: Terminal negligence.')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasSimileLeak('')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(hasSimileLeak('LIKE A trainwreck')).toBe(true);
    });
  });

  describe('SIMILE_PATTERN', () => {
    it('matches "like doing"', () => {
      expect(SIMILE_PATTERN.test('like doing nothing')).toBe(true);
    });

    it('matches "comparable to"', () => {
      expect(SIMILE_PATTERN.test('comparable to garbage')).toBe(true);
    });

    it('matches "analogous"', () => {
      expect(SIMILE_PATTERN.test('analogous situation')).toBe(true);
    });

    it('does not match "likely"', () => {
      // "like a" requires word boundary, but "likely" should not match
      expect(SIMILE_PATTERN.test('This will likely fail')).toBe(false);
    });
  });

  describe('HARSH_FILTER', () => {
    it('detects harsh terms', () => {
      // We don't spell out the terms — just verify the regex works on a known blocked word
      expect(HARSH_FILTER.test('you retard')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(HARSH_FILTER.test('RETARD')).toBe(true);
    });

    it('passes clean text', () => {
      expect(HARSH_FILTER.test('This code is terrible but fixable')).toBe(false);
    });

    it('requires word boundary', () => {
      // "bitchin" should not match "bitch" due to word boundary
      expect(HARSH_FILTER.test('bitchin')).toBe(false);
    });
  });

  describe('hasHarshLeak (normalized harsh check — A-TS-002 symmetry)', () => {
    // The bare regex MISSES obfuscated slurs; the normalized check is what every gate site now
    // uses, so harsh detection is symmetric with hasSimileLeak at all 12 call sites.
    it('catches a zero-width-laced slur the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(ZWSP_SLUR)).toBe(false);
      expect(hasHarshLeak(ZWSP_SLUR)).toBe(true);
    });

    it('catches a Cyrillic-homoglyph slur the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(CYRILLIC_SLUR)).toBe(false);
      expect(hasHarshLeak(CYRILLIC_SLUR)).toBe(true);
    });

    // The three most COMMON real-world obfuscations (caught by the adversarial verifier):
    // leetspeak, intra-word separators, and combining diacritics. Built from char codes so the
    // slur is never spelled plainly. Bare HARSH_FILTER misses all of these; hasHarshLeak catches.
    const LEET = `${RET[0]}3${RET[2]}${ARD}`;                 // r3tard
    const SEP_DASH = `${RET.slice(0, 2)}-${RET[2]}${ARD}`;    // re-tard
    const SEP_DOTS = `${RET}${ARD}`.split('').join('.');      // r.e.t.a.r.d
    const COMBINING = `${RET}a${String.fromCharCode(0x0301)}${ARD.slice(1)}`; // reta+acute+rd

    it('catches a leetspeak slur (digit substitution)', () => {
      expect(HARSH_FILTER.test(LEET)).toBe(false);
      expect(hasHarshLeak(LEET)).toBe(true);
    });

    it('catches a separator-laced slur (dash and dots)', () => {
      expect(HARSH_FILTER.test(SEP_DASH)).toBe(false);
      expect(hasHarshLeak(SEP_DASH)).toBe(true);
      expect(hasHarshLeak(SEP_DOTS)).toBe(true);
    });

    it('catches a combining-diacritic slur', () => {
      expect(HARSH_FILTER.test(COMBINING)).toBe(false);
      expect(hasHarshLeak(COMBINING)).toBe(true);
    });

    it('does not false-positive on legitimate text with digits/separators', () => {
      expect(hasHarshLeak('refactor this 800-line god function v3.2')).toBe(false);
      expect(hasHarshLeak('i18n config for the s3 bucket')).toBe(false);
    });

    it('passes clean text', () => {
      expect(hasHarshLeak('This code is terrible but fixable')).toBe(false);
    });
  });

  describe('sanitizeForPrompt', () => {
    it('strips newlines', () => {
      expect(sanitizeForPrompt('hello\nworld\r\nfoo')).toBe('hello world foo');
    });

    it('strips control characters', () => {
      expect(sanitizeForPrompt('hello\x00\x01world')).toBe('helloworld');
    });

    it('collapses multiple spaces', () => {
      expect(sanitizeForPrompt('hello    world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(sanitizeForPrompt('  hello  ')).toBe('hello');
    });

    it('caps length at 500 chars', () => {
      const long = 'a'.repeat(600);
      expect(sanitizeForPrompt(long).length).toBe(500);
    });

    it('handles empty string', () => {
      expect(sanitizeForPrompt('')).toBe('');
    });

    it('strips zero-width and bidi obfuscation chars (A-TS-002)', () => {
      // zero-width space, ZWNJ, ZWJ, word-joiner, BOM all removed
      const obf = `a${String.fromCharCode(0x200b)}b${String.fromCharCode(0x200c)}c${String.fromCharCode(0x2060)}d${String.fromCharCode(0xfeff)}`;
      expect(sanitizeForPrompt(obf)).toBe('abcd');
    });

    it('NFKC-normalizes fullwidth ASCII and folds confusables (A-TS-002)', () => {
      // fullwidth "ABC" -> "ABC"; Cyrillic homoglyphs -> ASCII
      const full = String.fromCharCode(0xff21, 0xff22, 0xff23); // ＡＢＣ
      expect(sanitizeForPrompt(full)).toBe('ABC');
      const cyr = String.fromCharCode(0x430, 0x435, 0x43e); // а е о
      expect(sanitizeForPrompt(cyr)).toBe('aeo');
    });
  });

  // A-TS-002: a zero-width-laced or homoglyph-spelled slur in the CALLER input must NOT
  // survive into voicedSafeFallback's interpolation. The fallback must collapse to the
  // input-free STATIC_SAFE_FALLBACK line.
  describe('voicedSafeFallback normalization floor (A-TS-002)', () => {
    it('collapses a zero-width-laced slur to the static input-free line', () => {
      const out = voicedSafeFallback('roast', ZWSP_SLUR);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a Cyrillic-homoglyph slur to the static input-free line', () => {
      const out = voicedSafeFallback('roast', CYRILLIC_SLUR);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a leetspeak slur in caller input to the static line', () => {
      // the verifier's exact exploit class: leet slur echoed via the Ollama-down fallback
      const out = voicedSafeFallback('roast', `this ${RET[0]}3${RET[2]}${ARD} logic`);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a separator-laced slur in caller input to the static line', () => {
      const out = voicedSafeFallback('roast', `this ${RET.slice(0, 2)}-${RET[2]}${ARD} logic`);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('still emits an in-voice line for clean input', () => {
      const out = voicedSafeFallback('roast', 'global state everywhere');
      expect(out).not.toBe(STATIC_SAFE_FALLBACK.roast);
      expect(out).toContain('global state everywhere');
    });
  });
});
