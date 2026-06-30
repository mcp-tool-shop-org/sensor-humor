/**
 * Shared post-validation patterns.
 * Used by comic_timing, roast, and heckle to reject banned output patterns.
 */

import type { MoodStyle } from './types.js';

/** Detect similes, comparisons, and figurative language. */
export const SIMILE_PATTERN =
  /\blike a\b|\blike doing\b|\blike picking\b|\blike organizing\b|\blike flying\b|\bas if\b|\bas though\b|\bas a\b|\bsimilar to\b|\bresembles\b|\bakin to\b|\bcomparable to\b|\banalogous\b/i;

/** Detect slurs and extreme insults. Terms are base64-encoded to keep source diffs clean and avoid plaintext slurs in the codebase. */
const HARSH_TERMS_B64 = 'd2hvcmV8Yml0Y2h8c2x1dHxjdW50fGZhZ2dvdHxuaWdnZXJ8cmV0YXJk';
const HARSH_FILTER_TERMS = Buffer.from(HARSH_TERMS_B64, 'base64').toString();
export const HARSH_FILTER = new RegExp(`\\b(${HARSH_FILTER_TERMS})\\b`, 'i');

if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
  const termCount = HARSH_FILTER_TERMS.split('|').length;
  console.error(`[sensor-humor] HARSH_FILTER loaded: ${termCount} terms`);
}

/** Check if output contains simile/comparison leak. */
export function hasSimileLeak(text: string): boolean {
  return SIMILE_PATTERN.test(normalizeConfusables(text));
}

/**
 * Check if text contains a harsh/slur term, AFTER de-obfuscation. Mirrors hasSimileLeak so the
 * two safety checks are symmetric: every harsh check normalizes first, so a zero-width-laced or
 * homoglyph-spelled slur cannot defeat HARSH_FILTER's \b boundary at ANY call site (model output
 * or fallback candidate), not just the ones that flow through sanitizeForPrompt.
 */
export function hasHarshLeak(text: string): boolean {
  return HARSH_FILTER.test(normalizeConfusables(text));
}

/**
 * Zero-width, format, and bidi control characters used to break up a slur so HARSH_FILTER's
 * \b boundary no longer holds (e.g. "reta\u200brd"). Stripping these BEFORE filtering closes
 * the boundary-evasion path. Includes variation selectors (U+FE00-FE0F).
 */
const ZERO_WIDTH_AND_FORMAT = new RegExp(
  '[' +
    '\\u200B-\\u200D' + // zero-width space / non-joiner / joiner
    '\\u200E\\u200F' +  // LRM / RLM
    '\\u202A-\\u202E' + // bidi embedding/override
    '\\u2060' +         // word joiner
    '\\u2066-\\u2069' + // bidi isolates
    '\\uFEFF' +         // BOM / zero-width no-break space
    '\\uFE00-\\uFE0F' + // variation selectors
    ']',
  'g',
);

/**
 * Targeted confusables fold: the common Latin-look-alike homoglyphs used to spell slurs in a
 * way that survives NFKC (Cyrillic / Greek letters NFKC-normalize to themselves, not to ASCII).
 * Folding them to ASCII lets HARSH_FILTER's \b actually hold.
 *
 * NOTE (study-swarm): this RAISES the deterministic floor; it is NOT full confusable coverage \u2014
 * the full Unicode confusables table is a known ceiling. The regex stays the deterministic
 * floor; we deliberately do NOT add an LLM classifier (proven more bypassable).
 */
const CONFUSABLE_MAP: Record<string, string> = {
  // Cyrillic -> Latin
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0445': 'x', '\u0443': 'y', '\u043a': 'k', '\u0442': 't',
  // Greek -> Latin
  '\u03bf': 'o', '\u03b1': 'a', '\u03bd': 'v',
};
const CONFUSABLE_PATTERN = new RegExp(`[${Object.keys(CONFUSABLE_MAP).join('')}]`, 'g');

/**
 * Normalize obfuscation before any HARSH_FILTER / simile test or fallback interpolation:
 *   1. NFKC (folds fullwidth ASCII, ligatures, compatibility forms down to plain ASCII)
 *   2. strip zero-width / format / bidi / variation-selector chars
 *   3. fold the targeted Latin-look-alike confusables to ASCII
 * Raises the deterministic floor so a zero-width-laced or homoglyph-spelled slur cannot defeat
 * HARSH_FILTER's word boundary. Full confusable coverage remains a known ceiling (study-swarm).
 */
export function normalizeConfusables(input: string): string {
  return input
    .normalize('NFKC')
    .replace(ZERO_WIDTH_AND_FORMAT, '')
    .replace(CONFUSABLE_PATTERN, (ch) => CONFUSABLE_MAP[ch] ?? ch);
}

/**
 * Sanitize user input before interpolating into Ollama prompts.
 * Strips newlines, control chars, obfuscation (zero-width/confusables), and injection patterns.
 */
export function sanitizeForPrompt(input: string): string {
  return normalizeConfusables(input)            // NFKC + strip zero-width + fold confusables
    .replace(/[\r\n\u2028\u2029]+/g, ' ')  // collapse newlines + Unicode line/para separators
    .replace(/[\x00-\x1f\x7f]/g, '')       // strip control characters (incl. DEL)
    .replace(/\s{2,}/g, ' ')               // collapse multiple spaces
    .trim()
    .slice(0, 500);                         // cap length to prevent prompt stuffing
}

/** Negative prompt fragment appended on simile retry. */
export const SIMILE_RETRY_SUFFIX =
  '\n\nABSOLUTELY NO comparisons, similes, metaphors, or "like/as" phrases. Direct literal observation only.';

/**
 * Fully static, input-free safe lines. Used when the caller's OWN input carries a banned
 * token: the voiced fallback interpolates the input, so echoing it would re-emit the slur or
 * simile. We collapse to one of these instead so the fallback can never reach the user dirty.
 */
// Record<MoodStyle, string> so adding a mood fails the build until it has a static fallback.
export const STATIC_SAFE_FALLBACK: Record<MoodStyle, string> = {
  roast: 'Verdict: not even worth the words.',
  cynic: 'Of course. Predictable.',
  cheeky: 'Oh honey. Bless.',
  chaotic: 'Reportedly, words failed.',
  zoomer: 'absolute state, no cap.',
  dry: 'No further comment.',
};

/**
 * Mood-voiced safe fallback for comic_timing and roast, used when retries cannot clear a
 * banned pattern (slur or simile). Stays in the active mood's voice when it safely can; if the
 * caller's input itself carries a slur/comparison, it collapses to a static input-free line so
 * the fallback never echoes a banned token back. heckle keeps its own shorter shape.
 */
export function voicedSafeFallback(mood: MoodStyle, text: string): string {
  const t = sanitizeForPrompt(text);
  let candidate: string;
  switch (mood) {
    case 'roast': candidate = `Verdict: ${t}. No further comment.`; break;
    case 'cynic': candidate = `Of course: ${t}. Predictable.`; break;
    case 'cheeky': candidate = `Oh honey, ${t}. Bless.`; break;
    case 'chaotic': candidate = `${t}. Sources confirm it's fine.`; break;
    case 'zoomer': candidate = `${t}, absolute state, no cap.`; break;
    default: candidate = `${t}. No further comment.`;
  }
  if (hasHarshLeak(candidate) || hasSimileLeak(candidate)) {
    return STATIC_SAFE_FALLBACK[mood];
  }
  return candidate;
}
