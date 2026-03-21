/**
 * Shared post-validation patterns.
 * Used by comic_timing, roast, and heckle to reject banned output patterns.
 */

/** Detect similes, comparisons, and figurative language. */
export const SIMILE_PATTERN =
  /\blike a\b|\blike doing\b|\blike picking\b|\blike organizing\b|\blike flying\b|\bas if\b|\bas though\b|\bas a\b|\bsimilar to\b|\bresembles\b|\bakin to\b|\bcomparable to\b|\banalogous\b/i;

/** Detect slurs and extreme insults. */
export const HARSH_FILTER =
  /\b(whore|bitch|slut|cunt|faggot|nigger|retard)\b/i;

/** Check if output contains simile/comparison leak. */
export function hasSimileLeak(text: string): boolean {
  return SIMILE_PATTERN.test(text);
}

/** Negative prompt fragment appended on simile retry. */
export const SIMILE_RETRY_SUFFIX =
  '\n\nABSOLUTELY NO comparisons, similes, metaphors, or "like/as" phrases. Direct literal observation only.';
