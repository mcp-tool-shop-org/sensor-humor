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
 * Non-Latin-script ratio, exposed for tests/callers: the fraction of the output's LETTERS that are
 * outside the Latin script (0 when the text has no letters). See hasLanguageLeak for the gate.
 */
export const LANGUAGE_NONLATIN_RATIO = 0.3;
/** Minimum non-Latin letter COUNT before the ratio path fires — one lone stray/borrowed character
 *  is tolerated as non-degrading noise, so the ratio can't trip on a single symbol in a short line. */
const LANGUAGE_MIN_NONLATIN = 2;
/** A contiguous run of this many non-Latin letters is, on its own, a code-switched word/phrase —
 *  the run path fires regardless of how long the surrounding English is (see hasLanguageLeak). */
const LANGUAGE_MIN_NONLATIN_RUN = 3;
/** Single-char (stateless, no /g) script probes. \p{Script=Latin} covers ASCII a–z AND accented
 *  Latin (café, naïve, résumé, piñata), so legitimate loanwords never count as non-Latin. */
const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{L}/u;

/**
 * Language-conformance gate (detection-only). sensor-humor's comedy is English — every mood voice,
 * skeleton, and static fallback is Latin-script English. qwen2.5:7b occasionally code-switches
 * mid-generation (observed in comedic-moods-v0 capture: a roast-mood comic_timing rewrite continued
 * in Chinese, "Diagnosis: The<Han run>."), and nothing flagged it, so the line passed as a clean
 * generation and polluted the opt-in dataset with a valid:true code-switched row.
 *
 * Flags output that has code-switched OUT of the Latin script, by two independent triggers computed
 * over LETTERS only — punctuation, digits, whitespace, emoji, and symbols are script-neutral and
 * ignored, so "€5, 100%, e.g., :)" and a lone emoji never trip it:
 *
 *   1. RUN: a contiguous run of >= LANGUAGE_MIN_NONLATIN_RUN non-Latin letters — an unbroken foreign
 *      word/phrase. Three consecutive letters from another script is unambiguous in English
 *      dev-humor and is invariant to how long the English portion is, so it catches the observed
 *      qwen failure (a long Han run) regardless of the "Diagnosis: The" prefix.
 *   2. RATIO: non-Latin letters make up >= LANGUAGE_NONLATIN_RATIO of ALL letters (with a
 *      >= LANGUAGE_MIN_NONLATIN floor), catching heavily code-mixed output that never forms one run.
 *
 * A single stray/borrowed non-Latin character is tolerated (still ~all English). Accented Latin is
 * Latin script and is NOT flagged; combining diacritics are marks (\p{M}), not letters, so "reta´rd"
 * concerns only the harsh path, never this one.
 *
 * DETECTION-ONLY: like hasSimileLeak/hasHarshLeak it returns a verdict and never mutates the display
 * path. It deliberately does NOT run normalizeConfusables first — that fold turns a Cyrillic
 * code-switch into ASCII and would hide the very thing we want to see. When it fires, the caller
 * retries in English once and, if the code-switch persists, substitutes an input-free English static
 * line (degraded_reason:'language') — a conformance degrade, NOT a safety substitution.
 */
export function hasLanguageLeak(text: string): boolean {
  let latin = 0;
  let nonLatin = 0;
  let run = 0;
  let maxRun = 0;
  // for-of iterates by code point, so astral CJK / emoji are one step each.
  for (const ch of text) {
    if (LATIN_LETTER.test(ch)) {
      latin++;
      run = 0;
    } else if (ANY_LETTER.test(ch)) {
      nonLatin++;
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      // punctuation / whitespace / digit / symbol / emoji — script-neutral, and it breaks a run.
      run = 0;
    }
  }
  const totalLetters = latin + nonLatin;
  if (totalLetters === 0) return false;
  if (maxRun >= LANGUAGE_MIN_NONLATIN_RUN) return true;
  return nonLatin >= LANGUAGE_MIN_NONLATIN && nonLatin / totalLetters >= LANGUAGE_NONLATIN_RATIO;
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

// ── b-sc-001: make the load-bearing INVARIANT (above CONFUSABLE_MAP) machine-checkable ─────────
// The comment says "the detection maps MUST cover the common homoglyph of every ASCII letter in
// the HARSH term list." Nothing enforced it: the fuzz sweep hardcodes today's 7 slurs, so adding
// a term with a NEW letter (m/j/z/q/v...) would ship an uncovered single-substitution bypass with
// green CI. The three exports below turn that comment into a red-CI gate (see the coverage test in
// tests/validators.test.ts). They are ADDITIVE — no existing signature changes.

/**
 * The three homoglyph→ASCII fold maps, exported READ-ONLY for the coverage test. These are the
 * real source of truth normalizeForDetection folds through; a test derives the set of ASCII
 * letters they can PRODUCE and asserts it covers the runtime slur alphabet. Frozen so a test (or
 * any importer) cannot mutate the live maps. Order/contents mirror the private constants exactly.
 */
export const DETECTION_FOLD_MAPS: {
  readonly shared: Readonly<Record<string, string>>;
  readonly residual: Readonly<Record<string, string>>;
  readonly capital: Readonly<Record<string, string>>;
} = Object.freeze({
  shared: Object.freeze({ ...CONFUSABLE_MAP }),
  residual: Object.freeze({ ...DETECTION_CONFUSABLE_MAP }),
  capital: Object.freeze({ ...DETECTION_CAPITAL_MAP }),
});

/**
 * The set of ASCII letters that AT LEAST ONE mapped homoglyph folds to, across all three detection
 * maps. This is the "letters we can defend with a single-substitution homoglyph" set. If a slur
 * alphabet letter is NOT in here, a one-character homoglyph swap of that letter bypasses the
 * terminal harsh gate. Derived once at module load from the live maps (never hand-listed) so it
 * can never drift out of sync with the maps it summarizes.
 */
export const FOLDED_LETTERS: ReadonlySet<string> = new Set<string>(
  [
    ...Object.values(CONFUSABLE_MAP),
    ...Object.values(DETECTION_CONFUSABLE_MAP),
    ...Object.values(DETECTION_CAPITAL_MAP),
  ].map((c) => c.toLowerCase()),
);

/** True iff `ascii` (a single lowercase a–z letter) has at least one mapped homoglyph that folds
 *  to it. The predicate form of FOLDED_LETTERS, for the coverage test and any future caller. */
export function coversLetter(ascii: string): boolean {
  return FOLDED_LETTERS.has(ascii.toLowerCase());
}

/**
 * The distinct ASCII letters of the LIVE harsh-term list, derived AT RUNTIME from the real source
 * of truth (the base64-decoded, `|`-joined HARSH_FILTER_TERMS string) — never hand-copied. This is
 * the alphabet the INVARIANT is about: the coverage test asserts coversLetter() holds for every
 * member. When HARSH_TERMS_B64 grows a term with a new letter, THIS set grows automatically and the
 * coverage test fails until the maps are extended (or the letter is added to the documented
 * NO_HOMOGLYPH allow-list in the test), converting the comment into a real gate.
 */
export function slurAlphabet(): ReadonlySet<string> {
  const letters = new Set<string>();
  for (const ch of HARSH_FILTER_TERMS.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') letters.add(ch);
  }
  return letters;
}

/**
 * Aggressive normalization for the HARSH DETECTION path ONLY (hasHarshLeak). On top of
 * normalizeConfusables it folds the three most common real-world slur obfuscations so the
 * \b term-list still catches them:
 *   - format chars + combining marks (NFKD + strip \p{Cf}+\p{M}): "retárd", U+00AD/U+2061–2064
 *     splits, and marks outside U+0300–036F (U+20DD, U+0483) collapse so HARSH_FILTER's \b holds
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
// Detection-only: after NFKC/NFKD, delete EVERY format char and EVERY combining mark (`\p{Cf}` +
// `\p{M}`), not a hand-listed subset. Display path (ZERO_WIDTH_AND_FORMAT) stays conservative.
const FORMAT_AND_MARKS = /[\p{Cf}\p{M}]+/gu;

export function normalizeForDetection(input: string): string {
  return normalizeConfusables(input)
    .replace(DETECTION_CAPITAL_PATTERN, (ch) => DETECTION_CAPITAL_MAP[ch] ?? ch) // mismatched-lowercase capitals (Cyrillic Н->h, Greek Ν->n), exact codepoint, BEFORE lowercasing
    .normalize('NFKD')
    .replace(FORMAT_AND_MARKS, '')             // strip ALL format chars + combining marks
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

/** Negative prompt fragment appended on a language-conformance retry (see hasLanguageLeak): force
 *  English output in the Latin alphabet so a code-switched generation gets one shot to correct. */
export const LANGUAGE_RETRY_SUFFIX =
  '\n\nRespond in ENGLISH ONLY, using the Latin alphabet. Do NOT use Chinese, Japanese, Korean, Cyrillic, Arabic, or any other non-Latin script.';

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
 * caller's input itself carries a slur/comparison — or is non-Latin/code-switched, which the
 * interpolation would echo — it collapses to a static input-free English line so the fallback
 * never re-emits a banned token or foreign-script text. heckle keeps its own shorter shape.
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
  if (hasHarshLeak(candidate) || hasSimileLeak(candidate) || hasLanguageLeak(candidate)) {
    return STATIC_SAFE_FALLBACK[mood];
  }
  return candidate;
}
