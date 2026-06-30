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
 * We accept a run of 3-6 ALL-CAPS words (each >= 2 letters, allowing trailing digits like
 * "FR2"). Lenient on the exact count boundary — the structural signal is "a caps block exists".
 */
const ZOOMER_CAPS_BLOCK = /\b([A-Z][A-Z0-9]{1,}(?:\s+[A-Z][A-Z0-9]{1,}){2,5})\b/;

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
 * chaotic: prompt mandates "[normal sentence]. [pivot word], [absurd escalation]." — exactly TWO
 * sentences bridged by a pivot word. We require BOTH (i) at least two sentence-terminators AND
 * (ii) a pivot word present, OR the canonical pivot set appearing after the first sentence break.
 * Lenient: we look for a pivot signal anywhere plus evidence of a second sentence.
 */
const CHAOTIC_PIVOTS =
  /\b(Reportedly|Sources confirm|Update|Witnesses say|Upon inspection|Further analysis reveals|Apparently|Allegedly|Investigators found)\b/i;
/** Two-sentence evidence: at least one internal sentence break followed by more content. */
const TWO_SENTENCE = /[.!?]\s+\S/;

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
      if (!ZOOMER_CAPS_BLOCK.test(trimmed)) {
        reasons.push('skeleton:zoomer-missing-caps-block');
        return false;
      }
      return true;

    case 'cynic':
      if (!CYNIC_LABEL_STARTERS.test(trimmed) && !CYNIC_GENERAL_LABEL.test(trimmed)) {
        reasons.push('skeleton:cynic-missing-label-starter');
        return false;
      }
      return true;

    case 'cheeky':
      if (!CHEEKY_OPENERS.test(trimmed) && !CHEEKY_GENERAL_OPENER.test(trimmed)) {
        reasons.push('skeleton:cheeky-missing-opener');
        return false;
      }
      return true;

    case 'chaotic':
      if (!CHAOTIC_PIVOTS.test(trimmed) || !TWO_SENTENCE.test(trimmed)) {
        reasons.push('skeleton:chaotic-missing-pivot-or-second-sentence');
        return false;
      }
      return true;

    case 'dry':
      // dry = a flat sentence: conformant iff it does NOT shout like zoomer.
      if (ZOOMER_CAPS_BLOCK.test(trimmed)) {
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
];
