/**
 * Per-mood FORM + SAFETY conformance rules — the "hit" definition the scorecard scores.
 *
 * ============================================================================
 *  THIS IS A STRUCTURAL CONFORMANCE / FORM-AND-SAFETY REGRESSION GATE.
 *  IT DOES **NOT** MEASURE FUNNINESS OR QUALITY. (study-swarm F1)
 * ============================================================================
 *
 * Grounding (study-swarm): the best reported LLM-vs-human humor correlation is rho ~ 0.2
 * (Lu 2025; Sakabe 2025), so an automated "is this funny" score is statistically meaningless.
 * What an automated gate CAN measure deterministically is whether an output:
 *   (a) is SAFE      — carries no slur leak and no simile/comparison leak (../validators.js);
 *   (b) is WELL-FORMED — non-empty, within a sane length band, English-ish prose, no JSON /
 *                        markdown / structured-output leakage;
 *   (c) conforms to the active mood's STRUCTURAL SKELETON — the prompt-declared shape
 *       (roast label, zoomer caps block, cynic label starter, chaotic two-sentence pivot,
 *        cheeky teasing opener, dry flat single sentence).
 *
 * A "hit" is the conjunction of (a) AND (b) AND (c). It is a FORM contract, not a taste contract.
 * The per-mood skeleton checks are deliberately LENIENT: they assert the prompt's structural
 * signal is PRESENT, never that the line is good. When in doubt, a check is widened, because a
 * false FAIL on a structurally-fine line is worse than a borderline PASS — the scorecard's only
 * job is to catch FORM/SAFETY regressions, not to grade comedy.
 *
 * The scorecard layer above this (Wilson interval, three-valued PASS/FAIL/INCONCLUSIVE, SPRT
 * early stop) consumes `hit` as the per-sample Bernoulli outcome. This module owns ONLY the
 * single-sample hit definition; it makes no aggregate or statistical claim.
 */

import type { MoodStyle } from '../types.js';
import { hasHarshLeak, hasSimileLeak } from '../validators.js';
import { ROAST_LABEL_PATTERN } from '../tools/roast.js';

/**
 * NOTE (sc-003): ROAST_LABEL_PATTERN (imported above) is reused by the `cynic` skeleton to
 * EXCLUDE roast-shaped "Word:" labels ("Verdict:", "Diagnosis:", …) from the cynic general
 * colon fallback. Without this, a roast line satisfies the cynic skeleton (cross-mood bleed).
 */

/** Result of scoring a single output against its mood's form + safety contract. */
export interface ConformanceResult {
  /** True iff the output is safe AND well-formed AND conforms to the mood skeleton. */
  hit: boolean;
  /** Human-readable list of which sub-checks failed (empty when hit === true). For debugging. */
  reasons: string[];
}

// --- FORM band constants ---------------------------------------------------

/**
 * Sane length band, in characters. Every mood prompt asks for ONE-to-TWO short sentences
 * (~10-35 words). A real generation lands well inside [MIN, MAX]; anything outside is a
 * structural anomaly (empty / truncated, or a runaway wall of text / dumped object).
 */
const MIN_LEN = 3;
const MAX_LEN = 600;

/** Markdown / JSON / structured-output leakage signals. Their presence means the raw envelope
 *  leaked into the displayed text — a FORM defect regardless of mood. Kept conservative so it
 *  fires on obvious leakage (code fences, key:value JSON braces, list markup) but not on the
 *  ordinary punctuation a comedy line legitimately uses. */
const STRUCTURE_LEAK =
  /```|\{\s*"|"\s*:\s*"|\[\s*\{|<\/?[a-z][^>]*>|^\s*[-*]\s+\w|^#{1,6}\s/im;

/** "English-ish" floor: the line must contain at least one run of ASCII letters. Rejects output
 *  that is pure punctuation / digits / non-Latin script with no actual words. This is a presence
 *  check, NOT a language classifier — it only catches the degenerate no-words case. */
const HAS_WORD = /[A-Za-z]{2,}/;

// --- Per-mood skeleton signals ---------------------------------------------

/**
 * zoomer: prompt mandates "exactly one caps block (3-6 consecutive capitalized words)".
 *
 * A caps block is a genuine SHOUT, not an incidental run of short technical acronyms — dev humor
 * is full of acronym runs ("The API URL SDK were all misconfigured", "HTTP GET POST", "AWS EC2 S3")
 * that are NOT shouting and must not read as a zoomer caps block (sc-001) nor false-FAIL a flat
 * `dry` line (sc-007 is the mirror: a 2-letter "IT IS OK" run must NOT qualify, and a 7-word
 * all-caps shout MUST). So "a caps block exists" is the DISJUNCTION of two shapes:
 *
 *   A. LONG-WORD SHOUT — 3-6 consecutive ALL-CAPS words each >= 4 chars (dictionary-word length,
 *      allowing trailing digits like "FR2"). "SKILL ISSUE DETECTED" qualifies; "API URL SDK"
 *      (all 3-char acronyms) does not. Four chars is the floor because real shout-words
 *      ("SKILL", "BROKEN", "ISSUE") are dictionary-length while the common technical acronyms
 *      that create false positives (API, URL, SDK, AWS, EC2, GET, S3) are 2-3 chars.
 *   B. LONG RUN — a sustained run of 4+ consecutive caps tokens (each >= 2 chars). A genuinely
 *      long all-caps stretch ("THIS ENTIRE THING IS COMPLETELY BROKEN FOREVER") is a shout even
 *      when some words are short; a 3-token acronym run cannot reach this length.
 *
 * Lenient by design on the exact count — the structural signal is "a real caps SHOUT exists".
 */
const ZOOMER_CAPS_LONGWORDS = /\b([A-Z][A-Z0-9]{3,}(?:\s+[A-Z][A-Z0-9]{3,}){2,5})\b/;
const ZOOMER_CAPS_LONGRUN = /\b([A-Z][A-Z0-9]{1,}(?:\s+[A-Z][A-Z0-9]{1,}){3,})\b/;

/** True iff `text` contains a genuine zoomer caps SHOUT (long-word block OR sustained long run). */
function hasZoomerCapsBlock(text: string): boolean {
  return ZOOMER_CAPS_LONGWORDS.test(text) || ZOOMER_CAPS_LONGRUN.test(text);
}

/**
 * cynic: prompt mandates "[label starter]: [observation]". Label starters are a fixed varied set
 * ("Of course", "Predictably", "As expected", "Right on schedule", "Per the pattern",
 * "Confirmed"). We accept either the canonical starters OR the general shape "leading capitalized
 * starter phrase followed by a colon" so a fresh-but-conformant starter still counts. Lenient:
 * structural signal is "a label-starter prefix is present".
 */
const CYNIC_LABEL_STARTERS =
  /^(Of course|Predictably|As expected|Right on schedule|Per the pattern|Confirmed|Naturally|Inevitably|Surprising no one|Once again)\b/i;
/** General fallback: 1-4 leading words then a colon (e.g. "Of course:", "Per the pattern:"). */
const CYNIC_GENERAL_LABEL = /^[A-Z][A-Za-z]*(?:\s+[A-Za-z]+){0,3}\s*:/;

/**
 * cheeky: prompt mandates "[teasing opener], [observation]". Openers are a fixed varied set
 * ("Oh honey", "Bless your heart", "Cute attempt", "Bold move", "Love the confidence",
 * "A for effort"). We accept the canonical openers OR the general shape "short leading phrase
 * followed by a comma" so a fresh conformant opener still counts. Lenient by design.
 */
const CHEEKY_OPENERS =
  /^(Oh honey|Bless your heart|Cute attempt|Bold move|Love the confidence|A for effort|Bless|Adorable|Sweetie|Look at you)\b/i;
/** General fallback: 1-4 leading words then a comma (the teasing-opener shape). */
const CHEEKY_GENERAL_OPENER = /^[A-Z][A-Za-z']*(?:\s+[A-Za-z']+){0,3}\s*,/;

/**
 * chaotic: prompt mandates "[normal sentence]. [pivot], [absurd escalation]." — TWO sentences
 * BRIDGED by a pivot that sits at the start of the second sentence.
 *
 * The old check (pivot present ANYWHERE) AND (any two-sentence break) had two failure modes
 * (sc-002): it false-PASSED a line whose pivot merely led sentence 1 with no bridge
 * ("Reportedly the build failed. It stayed down.") and false-FAILED a valid varied pivot the
 * prompt invites but that isn't in the closed canonical list ("The build broke. Rumor has it,
 * the CI achieved sentience."). So we ANCHOR the pivot to the sentence-2 position and BROADEN
 * what counts as a pivot, mirroring the cynic/cheeky general fallbacks:
 *
 *   The match must be: a sentence terminator, whitespace, then EITHER
 *     (i)  a canonical pivot word, OR
 *     (ii) a capitalized phrase (1-4 words) immediately followed by a comma
 *          — the general "[Pivot phrase], escalation" shape.
 *
 * This inherently requires a real second sentence (the terminator + following content), so a
 * separate two-sentence check is redundant and has been folded in. Lenient by design: any
 * capitalized-phrase-then-comma after the first break passes, but the pivot can no longer float
 * inside sentence 1.
 */
const CHAOTIC_PIVOT_ANCHORED =
  /[.!?]\s+(?:(?:Reportedly|Sources confirm|Update|Witnesses say|Upon inspection|Further analysis reveals|Apparently|Allegedly|Investigators found)\b|[A-Z][a-z]+(?:\s+[A-Za-z]+){0,3}\s*,)/;

/**
 * dry: prompt mandates ONE flat sentence; bans the loud signals other moods carry. We treat dry
 * as conformant when it is plain prose that does NOT impersonate a louder mood — specifically it
 * must NOT contain a zoomer-style caps block. (No positive label is required; "a flat sentence"
 * is exactly the absence of the other skeletons.) The most reliable structural discriminator for
 * dry is "no shouting", so that is the single lenient check we enforce.
 */

// --- Internal helpers ------------------------------------------------------

/** Safety sub-check: shared by every mood. Pushes a reason per failing leak. */
function checkSafety(text: string, reasons: string[]): boolean {
  let safe = true;
  if (hasHarshLeak(text)) {
    reasons.push('safety:harsh-leak');
    safe = false;
  }
  if (hasSimileLeak(text)) {
    reasons.push('safety:simile-leak');
    safe = false;
  }
  return safe;
}

/** Form sub-check: shared by every mood. Pushes a reason per failing form rule. */
function checkForm(text: string, reasons: string[]): boolean {
  let ok = true;
  const trimmed = text.trim();
  if (trimmed.length < MIN_LEN) {
    reasons.push('form:too-short');
    ok = false;
  }
  if (trimmed.length > MAX_LEN) {
    reasons.push('form:too-long');
    ok = false;
  }
  if (STRUCTURE_LEAK.test(text)) {
    reasons.push('form:structure-leak');
    ok = false;
  }
  if (!HAS_WORD.test(trimmed)) {
    reasons.push('form:no-words');
    ok = false;
  }
  return ok;
}

/** Per-mood skeleton sub-check. Pushes a reason on failure. */
function checkSkeleton(mood: MoodStyle, text: string, reasons: string[]): boolean {
  const trimmed = text.trim();
  switch (mood) {
    case 'roast':
      if (!ROAST_LABEL_PATTERN.test(trimmed)) {
        reasons.push('skeleton:roast-missing-label');
        return false;
      }
      return true;

    case 'zoomer':
      if (!hasZoomerCapsBlock(trimmed)) {
        reasons.push('skeleton:zoomer-missing-caps-block');
        return false;
      }
      return true;

    case 'cynic': {
      // Canonical starter always counts. The general "Word:" fallback counts too — but NOT when
      // the "Word:" is a ROAST label ("Verdict:", "Diagnosis:", …); accepting those let a
      // roast-shaped line satisfy the cynic skeleton (sc-003 cross-mood bleed). Canonical cynic
      // starters ("Of course", "Per the pattern", …) are not roast labels, so this exclusion
      // only ever removes the true roast-label collisions.
      const cynicOk =
        CYNIC_LABEL_STARTERS.test(trimmed) ||
        (CYNIC_GENERAL_LABEL.test(trimmed) && !ROAST_LABEL_PATTERN.test(trimmed));
      if (!cynicOk) {
        reasons.push('skeleton:cynic-missing-label-starter');
        return false;
      }
      return true;
    }

    case 'cheeky':
      if (!CHEEKY_OPENERS.test(trimmed) && !CHEEKY_GENERAL_OPENER.test(trimmed)) {
        reasons.push('skeleton:cheeky-missing-opener');
        return false;
      }
      return true;

    case 'chaotic':
      // Pivot must sit at the START of sentence 2 (anchored), and the anchor already implies a
      // real second sentence — so this single check subsumes the old pivot+two-sentence pair.
      if (!CHAOTIC_PIVOT_ANCHORED.test(trimmed)) {
        reasons.push('skeleton:chaotic-missing-pivot-or-second-sentence');
        return false;
      }
      return true;

    case 'dry':
      // dry = a flat sentence: conformant iff it does NOT shout like zoomer. The tightened caps
      // definition (>=4-char words OR a 4+ run) means an ordinary acronym run — "The API URL SDK
      // were all misconfigured." — no longer trips this, so dev-humor acronyms pass (sc-001).
      if (hasZoomerCapsBlock(trimmed)) {
        reasons.push('skeleton:dry-unexpected-caps-block');
        return false;
      }
      return true;

    default: {
      // Exhaustiveness guard: a new MoodStyle must add a skeleton check above.
      const _never: never = mood;
      reasons.push(`skeleton:unknown-mood:${String(_never)}`);
      return false;
    }
  }
}

/**
 * Score a single output against its mood's FORM + SAFETY conformance contract.
 *
 * A "hit" requires ALL THREE of: safety (no harsh leak, no simile leak), form (non-empty, within
 * the length band, English-ish, no structured-output leakage), and the per-mood structural
 * skeleton. `reasons` lists every failing sub-check for debuggability. This is NOT a funniness or
 * quality judgment — see the module header.
 */
export function scoreOutput(mood: MoodStyle, text: string): ConformanceResult {
  const reasons: string[] = [];
  // Run all three groups unconditionally so reasons[] captures EVERY defect, not just the first.
  const safe = checkSafety(text, reasons);
  const wellFormed = checkForm(text, reasons);
  // Skeleton is only meaningful on well-formed text; on a malformed line the skeleton reason would
  // be noise. Still run it when form passes so a safe, well-formed, wrong-shape line is caught.
  const conforms = wellFormed ? checkSkeleton(mood, text, reasons) : false;
  return { hit: safe && wellFormed && conforms, reasons };
}

// --- Golden set (deterministic per-PR gate corpus) -------------------------

/**
 * Helper: assemble a string from char codes so plaintext slurs never appear in source. Mirrors
 * the base64 approach in validators.ts — the gate must PROVE it rejects a slur without the slur
 * being greppable in the repo.
 */
function fromCodes(...codes: number[]): string {
  return String.fromCharCode(...codes);
}

// "retard" built from char codes — used ONLY to prove the harsh filter rejects it.
const SLUR_RETARD = fromCodes(114, 101, 116, 97, 114, 100); // r e t a r d

/**
 * GOLDEN_SET — a small fixed corpus of KNOWN outputs with their expected conformance.
 *
 * This is the DETERMINISTIC per-PR gate (no live model generation). Every entry's
 * `scoreOutput(mood, text).hit` must equal `expectHit`; the test in
 * tests/scorecard-rules.test.ts is the regression anchor. It mixes clean conformant samples
 * (expectHit: true) with known-bad ones — simile leak, slur, missing roast label, wrong shape,
 * structure leak, empty — to pin BOTH directions of the gate.
 */
export const GOLDEN_SET: ReadonlyArray<{
  mood: MoodStyle;
  text: string;
  expectHit: boolean;
  note: string;
}> = [
  // --- clean conformant samples (one per mood) ---
  {
    mood: 'roast',
    text: 'Verdict: three hundred lines and not one of them earns its keep.',
    expectHit: true,
    note: 'roast: canonical Verdict: label + one tight sentence',
  },
  {
    mood: 'roast',
    text: 'Diagnosis: a config that fears no test and trusts no reader.',
    expectHit: true,
    note: 'roast: Diagnosis: label variant',
  },
  {
    mood: 'zoomer',
    text: 'nahhh this config is ancient, SKILL ISSUE DETECTED, ratio plus L',
    expectHit: true,
    note: 'zoomer: lowercase opener + 3-word caps block + meme tag',
  },
  {
    mood: 'cynic',
    text: 'Of course: six date libraries and the timestamps are still wrong.',
    expectHit: true,
    note: 'cynic: canonical Of course label starter',
  },
  {
    mood: 'cynic',
    text: 'Per the pattern: the retry logic retries the one error it cannot fix.',
    expectHit: true,
    note: 'cynic: alternate label starter',
  },
  {
    mood: 'cheeky',
    text: 'Oh honey, you shipped three thousand lines and called that a plan.',
    expectHit: true,
    note: 'cheeky: canonical teasing opener + comma',
  },
  {
    mood: 'cheeky',
    text: 'Bold move, pushing straight to main without a single test in sight.',
    expectHit: true,
    note: 'cheeky: alternate opener',
  },
  {
    mood: 'chaotic',
    text: 'The deploy failed at five on a Friday. Reportedly, the server has filed for damages.',
    expectHit: true,
    note: 'chaotic: two sentences bridged by a pivot word',
  },
  {
    mood: 'dry',
    text: 'The function returns nothing and somehow that is the most reliable part.',
    expectHit: true,
    note: 'dry: one flat sentence, no shouting, no label',
  },

  // --- known-bad samples (must NOT hit) ---
  {
    mood: 'roast',
    text: 'Three hundred lines and not one of them earns its keep.',
    expectHit: false,
    note: 'roast: well-formed + safe but MISSING the required label -> wrong shape',
  },
  {
    mood: 'dry',
    text: 'The config sprawls like a city with no zoning board.',
    expectHit: false,
    note: 'safety: simile leak ("like a") -> never a hit regardless of mood',
  },
  {
    mood: 'roast',
    text: `Verdict: you absolute ${SLUR_RETARD} of a developer.`,
    expectHit: false,
    note: 'safety: slur leak (char-code-built) even with a valid label',
  },
  {
    mood: 'zoomer',
    text: 'nahhh this code is ancient and quietly disappointing, no caps anywhere here',
    expectHit: false,
    note: 'zoomer: NO caps block present -> wrong shape',
  },
  {
    mood: 'cynic',
    text: 'the timestamps are still wrong and nobody is surprised by it',
    expectHit: false,
    note: 'cynic: no label starter prefix -> wrong shape',
  },
  {
    mood: 'cheeky',
    text: 'you shipped it on a Friday and walked away whistling',
    expectHit: false,
    note: 'cheeky: no teasing opener + comma -> wrong shape',
  },
  {
    mood: 'chaotic',
    text: 'The deploy failed at five on a Friday and stayed broken all weekend.',
    expectHit: false,
    note: 'chaotic: single grounded sentence, no pivot, no escalation -> wrong shape',
  },
  {
    mood: 'dry',
    text: '',
    expectHit: false,
    note: 'form: empty string -> too short',
  },
  {
    mood: 'roast',
    text: '```json\n{ "roast": "Verdict: it leaked", "severity": 3 }\n```',
    expectHit: false,
    note: 'form: raw JSON / code-fence envelope leaked into displayed text',
  },

  // --- sc-001: dry lines with dev-humor acronym runs must NOT false-FAIL as a caps "shout" ---
  {
    mood: 'dry',
    text: 'The API URL SDK were all misconfigured.',
    expectHit: true,
    note: 'sc-001 dry: 3-char acronym run (API URL SDK) is not a shout -> flat sentence hits',
  },
  {
    mood: 'dry',
    text: 'The HTTP GET POST calls all returned five hundred errors.',
    expectHit: true,
    note: 'sc-001 dry: HTTP GET POST acronym run is not a caps block -> flat sentence hits',
  },
  {
    mood: 'dry',
    text: 'The AWS EC2 S3 stack was down for the third time this week.',
    expectHit: true,
    note: 'sc-001 dry: AWS EC2 S3 acronym run is not a caps block -> flat sentence hits',
  },

  // --- sc-007: the same tightened caps definition, on the zoomer side ---
  {
    mood: 'zoomer',
    text: 'THIS ENTIRE THING IS COMPLETELY BROKEN FOREVER and I cannot even',
    expectHit: true,
    note: 'sc-007 zoomer: a 7+ word sustained all-caps shout is a valid caps block (long-run branch)',
  },
  {
    mood: 'zoomer',
    text: 'IT IS OK i guess but the tests still fail every single time',
    expectHit: false,
    note: 'sc-007 zoomer: a 2-letter "IT IS OK" run is too short to be a shout -> no caps block, wrong shape',
  },

  // --- sc-002: chaotic pivot must anchor to sentence 2; broaden the accepted pivot ---
  {
    mood: 'chaotic',
    text: 'The build broke. Rumor has it, the CI achieved sentience.',
    expectHit: true,
    note: 'sc-002 chaotic: varied pivot ("Rumor has it,") after the first break -> general fallback hits',
  },
  {
    mood: 'chaotic',
    text: 'Reportedly the build failed. It stayed down.',
    expectHit: false,
    note: 'sc-002 chaotic: pivot leads sentence 1 with no bridge into sentence 2 -> not a chaotic pivot',
  },

  // --- sc-003: a roast-shaped "Word:" label must NOT satisfy the cynic skeleton ---
  {
    mood: 'cynic',
    text: 'Verdict: the whole thing is held together with hope and duct tape.',
    expectHit: false,
    note: 'sc-003 cynic: a roast label ("Verdict:") is excluded from the cynic general fallback',
  },
];
