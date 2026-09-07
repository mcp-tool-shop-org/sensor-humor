/**
 * Overlay-coexistence copy (F-7e2c9b14).
 *
 * Frozen v1 mood cards never mention technique overlays. This fragment is NOT part of the
 * v1 fingerprint (that pins SYSTEM_PROMPT + VOICE_NOTES on the mood module only). Engine
 * injects it when an overlay is requested so the 7B applies the overlay as lexical flavor
 * inside the existing skeleton — not a second persona (not mood.blend).
 */

import type { ComicTechnique, MoodStyle } from '../types.js';

export const OVERLAY_COEXISTENCE = `TECHNIQUE OVERLAY (when present — primary mood pattern still wins):
- Apply the overlay as lexical flavor INSIDE the mood's exact format. Do not change sentence count, drop labels / the chaotic pivot / the zoomer caps-block, or add a second skeleton.
- Originality means do not copy prompt examples or replay a previous line verbatim. A callback overlay MAY reference an earlier planted bit with a FRESH twist (escalate or recontextualize) — that is not recycling.
- One-sentence moods: escalation is a single crescendo clause, not extra sentences. Rule-of-three packs two setups and a breaker into that one sentence.
- chaotic: keep exactly two sentences and the pivot; rule-of-three lives inside sentence two.
- cynic + misdirection: keep zero-surprise affect ("of course"); the named rot is worse than the setup implied.`;

/** Per-mood how-to, appended after OVERLAY_COEXISTENCE when the overlay is not auto. */
export function overlayHowTo(mood: MoodStyle, technique: ComicTechnique): string {
  if (technique === 'auto') return '';
  if (mood === 'cynic' && technique === 'misdirection') {
    return 'cynic/misdirection: the "Of course" stance stays inevitable; the payload is a worse rot than the setup advertised.';
  }
  if (mood === 'chaotic' && technique === 'rule-of-three') {
    return 'chaotic/rule-of-three: three items inside sentence two; sentence one stays normal; keep the pivot.';
  }
  if ((mood === 'roast' || mood === 'cheeky' || mood === 'zoomer') && technique === 'escalation') {
    return `${mood}/escalation: one sentence, each clause worse than the last; do not add a second sentence.`;
  }
  if (technique === 'callback') {
    return `${mood}/callback: reference the planted bit, then twist it. Never repeat the setup verbatim.`;
  }
  return '';
}

export function overlayCoexistenceBlock(mood: MoodStyle, technique: ComicTechnique): string {
  if (technique === 'auto') return '';
  const how = overlayHowTo(mood, technique);
  return how ? `${OVERLAY_COEXISTENCE}\n- ${how}` : OVERLAY_COEXISTENCE;
}
