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
  return HARSH_FILTER.test(normalizeForDetection(text));
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
 * \u2500\u2500 INVARIANT (load-bearing safety contract) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * CONFUSABLE_MAP MUST cover the common single-character homoglyph of every ASCII letter that
 * appears in the HARSH term list. A single-homoglyph substitution needs to swap only ONE letter
 * (e.g. Cyrillic \u0456 for "i" -> "b\u0456tch"); if that letter's homoglyph is absent, the slur
 * bypasses the terminal harsh gate entirely. THE MAP CANNOT DRIFT OUT OF SYNC WITH THE TERMS IT
 * PROTECTS: whenever HARSH_TERMS_B64 changes, re-derive the slur alphabet and revisit this map.
 *
 * Slur alphabet today (whore|bitch|slut|cunt|faggot|nigger|retard): w h o r e b i t c s l u n f a g d
 *   Covered here with a visually-identical homoglyph: a c d e g h i o s t w x y k p v
 *   Deliberately NOT mapped (no SAFE, visually-identical single-char Cyrillic/Greek look-alike
 *   exists, and folding a merely-resembling letter would mangle legitimate non-English display
 *   text \u2014 normalizeConfusables is shared with the sanitize/display path): b f l n r u
 *   These residual letters still get caught whenever ANOTHER position in the same slur carries a
 *   mapped homoglyph, leet digit, separator, or combining mark \u2014 so they are not a free bypass,
 *   only a narrowed one. UPDATE (post-fix adversarial verify, 2026-07-07): each residual letter
 *   DOES have a convincing look-alike (Cyrillic b/l/n/r, Armenian n/r/u/f, Greek u, Latin f/l/u),
 *   so ALL are now folded DETECTION-ONLY via DETECTION_CONFUSABLE_MAP in normalizeForDetection
 *   (kept out of this shared/display map so legit non-English display text is never mangled).
 *
 * NOTE (study-swarm): this RAISES the deterministic floor; it is NOT full confusable coverage \u2014
 * the full Unicode confusables table is a known ceiling, and precomposed accented homoglyphs
 * (e.g. Greek \u03ac) fold only if decomposed before this map runs, which they are not. The regex
 * stays the deterministic floor; we deliberately do NOT add an LLM classifier (proven more
 * bypassable). Only well-known, visually-identical look-alikes are mapped, never distinct letters
 * that merely resemble, to avoid false folds in the display path.
 */
const CONFUSABLE_MAP: Record<string, string> = {
  // Cyrillic -> Latin
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0445': 'x', '\u0443': 'y', '\u043a': 'k', '\u0442': 't',
  '\u0456': 'i', // Cyrillic \u0456 (byelorussian-ukrainian i) \u2014 CONFIRMED prior gap
  '\u0455': 's', // Cyrillic \u0455 (dze)                       \u2014 CONFIRMED prior gap
  '\u04bb': 'h', // Cyrillic \u04bb (shha)
  '\u0501': 'd', // Cyrillic \u0501 (komi de)
  '\u051d': 'w', // Cyrillic \u051d (we)
  // Greek -> Latin
  '\u03bf': 'o', '\u03b1': 'a', '\u03bd': 'v',
  '\u03b9': 'i', // Greek \u03b9 (iota)  \u2014 CONFIRMED prior gap
  '\u03c1': 'p', // Greek \u03c1 (rho)
  '\u03ba': 'k', // Greek \u03ba (kappa)
  '\u03c7': 'x', // Greek \u03c7 (chi)
  // Latin extension -> ASCII
  '\u0261': 'g', // Latin small letter script g (survives NFKC as non-ASCII)
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

/** Leetspeak digit/symbol -> letter folds for the most common slur evasions (detection-only). */
const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i',
};
const LEET_PATTERN = /[013457@$!]/g;

/**
 * DETECTION-ONLY extended homoglyph fold for the residual slur-alphabet letters (b f l n r u)
 * that have no SAFE display-path look-alike but DO have convincing Cyrillic/Greek/Armenian/Latin
 * homoglyphs. Applied ONLY in normalizeForDetection (never in the shared normalizeConfusables), so
 * the aggressive fold catches homoglyph-spelled slurs without mangling legitimate non-English
 * DISPLAY text. Closes the 24 single-substitution bypasses the post-fix adversarial verify found
 * (e.g. Cyrillic ь->b, palochka ӏ->l, Armenian ո->n / ս->u / ր->r). Keys are LOWERCASE codepoints —
 * uppercase look-alikes are folded by the preceding toLowerCase(); caseless small-caps (ᴜ) are
 * mapped directly. Floor, not full UTS-39 confusables coverage (see SECURITY.md).
 */
const DETECTION_CONFUSABLE_MAP: Record<string, string> = {
  'τ': 't', 'ω': 'w', 'ε': 'e',                       // Greek τ(tau)=t, ω(omega)=w, ε(epsilon)=e (caps fold via toLowerCase)
  'ь': 'b', 'ƅ': 'b', 'Ƅ': 'b',                       // Cyrillic ь, Latin ƅ (U+0185) + its uppercase Ƅ
  'ӏ': 'l', 'ɩ': 'l', 'ǀ': 'l', 'ℓ': 'l',   // Cyrillic ӏ, Latin ɩ, ǀ, ℓ
  'ո': 'n', 'ռ': 'n', 'п': 'n',                  // Armenian ո, ռ, Cyrillic п
  'ր': 'r', 'г': 'r', 'ɼ': 'r',                  // Armenian ր, Cyrillic г, Latin ɼ
  'ս': 'u', 'υ': 'u', 'ᴜ': 'u', 'ʋ': 'u',   // Armenian ս, Greek υ, ᴜ, Latin ʋ
  'ƒ': 'f', 'ք': 'f',                                 // Latin ƒ, Armenian ք
};
/**
 * Combined fold re-applied AFTER toLowerCase in the detection path. The shared CONFUSABLE_MAP runs
 * (inside normalizeConfusables) BEFORE lowercasing and has only lowercase keys, so an UPPERCASE
 * homoglyph (Cyrillic Т U+0422 -> т, С U+0421 -> с, Greek Ο -> ο) would slip past it. Re-folding the
 * union of both maps after toLowerCase closes that casing gap. Detection-only (never in the shared
 * display path), so it cannot mangle legit non-English DISPLAY text.
 */
const DETECTION_FOLD_MAP: Record<string, string> = { ...CONFUSABLE_MAP, ...DETECTION_CONFUSABLE_MAP };
const DETECTION_FOLD_PATTERN = new RegExp(`[${Object.keys(DETECTION_FOLD_MAP).join('')}]`, 'g');

/**
 * Capital Cyrillic/Greek homoglyphs whose SCRIPT-lowercase is NOT the Latin look-alike, so a
 * post-toLowerCase fold would miss them (Cyrillic Н U+041D reads as H but lowercases to н U+043D)
 * or map them WRONG (Greek Ν reads as N but lowercases to ν -> 'v' in the shared map). Folded by
 * EXACT codepoint BEFORE lowercasing so the capital disambiguates from its script-lowercase.
 * Detection-only. Found by the post-fix adversarial verify (Cyrillic Н was the last bypass class).
 */
const DETECTION_CAPITAL_MAP: Record<string, string> = {
  'Н': 'h', 'н': 'h', // Cyrillic Н/н (En) = H
  'В': 'b', 'в': 'b', // Cyrillic В/в (Ve) = B
  'Η': 'h', 'η': 'h', // Greek Η/η (Eta)  = H
  'Β': 'b', 'β': 'b', // Greek Β/β (Beta) = B
  'Ν': 'n',                // Greek Ν (Nu)     = N (lowercase ν stays -> v)
};
const DETECTION_CAPITAL_PATTERN = new RegExp(`[${Object.keys(DETECTION_CAPITAL_MAP).join('')}]`, 'g');

/**
 * Aggressive normalization for the HARSH DETECTION path ONLY (hasHarshLeak). On top of
 * normalizeConfusables it folds the three most common real-world slur obfuscations so the
 * \b term-list still catches them:
 *   - combining diacritics (NFKD + strip U+0300-U+036F): "retárd" / accented look-alikes -> ASCII
 *   - leetspeak digit/symbol substitution: r3tard / b1tch / f@ggot -> retard / bitch / faggot
 *   - intra-word separators (. - _): "re-tard" / "r.e.t.a.r.d" -> "retard"
 *   - residual-letter homoglyphs (DETECTION_CONFUSABLE_MAP): Cyrillic/Greek/Armenian/Latin
 *     look-alikes for b/f/l/n/r/u -> ASCII, closing the single-substitution slur bypass
 * DETECTION-ONLY: deliberately NOT used by sanitizeForPrompt, because aggressively folding
 * leet/separators would corrupt legitimate DISPLAYED text ("800-line", "v3", "i18n"). When this
 * check fires, the caller returns an input-free static safe line, so the obfuscated source text
 * is never what reaches the user. False positives only cost a slightly-less-funny safe line;
 * a missed slur reaches the user — so detection is deliberately biased toward catching.
 * Floor, not ceiling: spaced-out letters ("r e t a r d") and out-of-list slur variants remain a
 * documented limitation (see SECURITY.md).
 */
export function normalizeForDetection(input: string): string {
  return normalizeConfusables(input)
    .replace(DETECTION_CAPITAL_PATTERN, (ch) => DETECTION_CAPITAL_MAP[ch] ?? ch) // mismatched-lowercase capitals (Cyrillic Н->h, Greek Ν->n), exact codepoint, BEFORE lowercasing
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')           // strip combining diacritical marks
    .toLowerCase()
    .replace(DETECTION_FOLD_PATTERN, (ch) => DETECTION_FOLD_MAP[ch] ?? ch) // re-fold homoglyphs post-lowercase — catches UPPERCASE look-alikes too (detection-only)
    .replace(LEET_PATTERN, (ch) => LEET_MAP[ch] ?? ch)   // fold leetspeak
    .replace(/[._-]/g, '');                              // remove intra-word separators
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
