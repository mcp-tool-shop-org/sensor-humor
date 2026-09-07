/**
 * Mood × technique overlays (Feature Pass FP-1).
 *
 * Bounded overlay inside one frozen primary skeleton — not mood.blend. comic_timing already
 * takes a technique; roast/heckle now do too, with a capability matrix so an overlay that
 * fights the skeleton is refused (ROADMAP: "cynic doesn't support escalation").
 *
 * Grounding: Brandt 2025 (arXiv:2510.00339) bounded overlay sits on the Pareto frontier;
 * Pai et al. 2025 (arXiv:2510.10157) two style cards fail to co-activate.
 */

import { COMIC_TECHNIQUES, type ComicTechnique, type MoodStyle } from '../types.js';

/** Overlay techniques a caller can request. `auto` means "no overlay — mood default." */
export const OVERLAY_TECHNIQUES = [
  'rule-of-three',
  'misdirection',
  'escalation',
  'callback',
  'understatement',
] as const satisfies readonly ComicTechnique[];

export type OverlayTechnique = (typeof OVERLAY_TECHNIQUES)[number];

/**
 * Per-mood allow-list. Primary skeleton always wins; an overlay is flavor, not a second
 * persona. Escalation/rule-of-three fight dry/cynic deadpan; understatement fights
 * chaotic/zoomer loudness.
 */
export const MOOD_TECHNIQUE_MATRIX: Record<MoodStyle, readonly OverlayTechnique[]> = {
  roast: ['rule-of-three', 'misdirection', 'escalation', 'callback', 'understatement'],
  cheeky: ['rule-of-three', 'misdirection', 'escalation', 'callback', 'understatement'],
  chaotic: ['rule-of-three', 'misdirection', 'escalation', 'callback'],
  cynic: ['misdirection', 'callback', 'understatement'],
  dry: ['misdirection', 'callback', 'understatement'],
  zoomer: ['rule-of-three', 'misdirection', 'escalation', 'callback'],
};

export class InvalidTechniqueError extends Error {
  readonly mood: MoodStyle;
  readonly technique: ComicTechnique;
  readonly allowed: readonly OverlayTechnique[];

  constructor(mood: MoodStyle, technique: ComicTechnique, allowed: readonly OverlayTechnique[]) {
    const list = allowed.join(', ');
    super(
      `I won't mix ${mood} with ${technique} — that overlay fights the ${mood} skeleton. For ${mood}, try: ${list}.`,
    );
    this.name = 'InvalidTechniqueError';
    this.mood = mood;
    this.technique = technique;
    this.allowed = allowed;
  }
}

export function techniquesForMood(mood: MoodStyle): readonly OverlayTechnique[] {
  return MOOD_TECHNIQUE_MATRIX[mood];
}

/**
 * `auto` is always legal (no overlay). Anything else must sit on the mood's allow-list.
 * Throws InvalidTechniqueError so the MCP handler can map it to code `validation`.
 */
export function assertMoodTechnique(mood: MoodStyle, technique: ComicTechnique): void {
  if (technique === 'auto') return;
  if (!(COMIC_TECHNIQUES as readonly string[]).includes(technique)) {
    throw new InvalidTechniqueError(mood, technique, MOOD_TECHNIQUE_MATRIX[mood]);
  }
  const allowed = MOOD_TECHNIQUE_MATRIX[mood];
  if (!allowed.includes(technique as OverlayTechnique)) {
    throw new InvalidTechniqueError(mood, technique, allowed);
  }
}

export function buildTechniqueGuidance(technique: ComicTechnique, hasCallbacks: boolean): string {
  switch (technique) {
    case 'rule-of-three':
      return 'Use the rule of three: two normal items, then a third that breaks the pattern.';
    case 'misdirection':
      return 'Use misdirection: set up an expectation, then deliver something completely different.';
    case 'escalation':
      return 'Use escalation: start reasonable, then each beat gets progressively more absurd.';
    case 'callback':
      // Fresh-twist guidance (callback-revival C4 + FP-2): a callback that merely repeats the
      // bit verbatim is not funny. Petrović & Matthews 2013 — humor requires related AND
      // unexpected; West & Horvitz 2019 — models default to safe reuse.
      return hasCallbacks
        ? 'Use a callback: reference an earlier bit from this session (check the session state / callback material). Do NOT repeat it verbatim — ESCALATE it or add a NEW twist so the callback lands as a fresh surprise, not a rerun.'
        : 'A callback was requested but there are no earlier bits to reference. Use understatement instead.';
    case 'understatement':
      return 'Use understatement: describe something dramatic as if it were completely mundane.';
    case 'auto':
      return hasCallbacks
        ? 'Choose the best technique for this text. If earlier session material is available, consider a callback.'
        : 'Choose the best comedy technique for this text.';
  }
}

/** Collapse a line so "The deadbeef incident." matches "the  deadbeef incident". */
export function normalizeCallbackText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * True when the rewrite is a byte-identical (after NFKC + punct/space collapse) replay of
 * the planted setup. Honored callbacks must vary (Loewenstein & Heath 2005 repetition-shift).
 */
export function isVerbatimCallback(rewrite: string, setup: string): boolean {
  const a = normalizeCallbackText(rewrite);
  const b = normalizeCallbackText(setup);
  return a.length > 0 && a === b;
}
