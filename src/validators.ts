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
  return SIMILE_PATTERN.test(text);
}

/**
 * Sanitize user input before interpolating into Ollama prompts.
 * Strips newlines, control chars, and common injection patterns.
 */
export function sanitizeForPrompt(input: string): string {
  return input
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
const STATIC_SAFE_FALLBACK: Record<MoodStyle, string> = {
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
  if (HARSH_FILTER.test(candidate) || SIMILE_PATTERN.test(candidate)) {
    return STATIC_SAFE_FALLBACK[mood];
  }
  return candidate;
}
