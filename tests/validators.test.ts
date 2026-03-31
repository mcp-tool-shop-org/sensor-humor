import { describe, it, expect } from 'vitest';
import { hasSimileLeak, SIMILE_PATTERN, HARSH_FILTER, sanitizeForPrompt } from '../src/validators.js';

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
  });
});
