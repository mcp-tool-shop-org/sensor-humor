/**
 * Shared post-validation patterns.
 * Used by comic_timing, roast, and heckle to reject banned output patterns.
 */

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
 * Mood-voiced safe fallback for comic_timing and roast, used when retries cannot clear a
 * banned pattern (slur or simile). Stays in the active mood's voice instead of collapsing to
 * a single generic line. heckle keeps its own shorter punch-line fallbacks (different shape).
 */
export function voicedSafeFallback(mood: string, text: string): string {
  const t = sanitizeForPrompt(text);
  switch (mood) {
    case 'roast': return `Verdict: ${t}. No further comment.`;
    case 'cynic': return `Of course: ${t}. Predictable.`;
    case 'cheeky': return `Oh honey, ${t}. Bless.`;
    case 'chaotic': return `${t}. Sources confirm it's fine.`;
    case 'zoomer': return `${t}, absolute state, no cap.`;
    default: return `${t}. No further comment.`;
  }
}
