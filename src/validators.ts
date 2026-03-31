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
    .replace(/[\r\n]+/g, ' ')       // collapse newlines to spaces
    .replace(/[\x00-\x1f]/g, '')    // strip control characters
    .replace(/\s{2,}/g, ' ')        // collapse multiple spaces
    .trim()
    .slice(0, 500);                  // cap length to prevent prompt stuffing
}

/** Negative prompt fragment appended on simile retry. */
export const SIMILE_RETRY_SUFFIX =
  '\n\nABSOLUTELY NO comparisons, similes, metaphors, or "like/as" phrases. Direct literal observation only.';
