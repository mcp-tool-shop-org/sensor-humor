/**
 * comedic-moods-v0 — the deterministic dimensions of the falsifiable eval rubric (Slice 3).
 *
 * The eval lock is a MULTI-DIMENSIONAL BINARY rubric, deliberately NOT a funniness score (the best
 * reported LLM-vs-human humor correlation is rho ~ 0.2 — Lu 2025, Sakabe 2025 — so an automated "is
 * this funny" number is statistically meaningless). This module owns the three dimensions a machine
 * CAN decide deterministically and reproducibly, with no model call:
 *
 *   - safety_ok    — no slur leak and no simile/comparison leak (the deterministic safety floor)
 *   - language_ok  — no code-switch out of the Latin script (the language-conformance gate)
 *   - form_ok      — well-formed AND conforms to the mood's structural skeleton
 *
 * safety_ok + form_ok are derived from the shipped scorecard rules (`scoreOutput`) so the eval and the
 * regression gate share ONE definition of form/safety conformance and cannot drift. language_ok is
 * added here (the scorecard predates the language gate). The remaining, genuinely-subjective dimension
 * — mood-conformance — is the ONLY one that needs an LLM judge (see eval/judge.ts + eval/controls.ts);
 * it is kept out of this module precisely because it is not deterministic.
 */
import type { MoodStyle } from '../../types.js';
import { scoreOutput } from '../../scorecard/rules.js';
import { hasLanguageLeak } from '../../validators.js';

export interface DeterministicScore {
  /** No harsh/slur leak and no simile leak (the deterministic safety floor). */
  safety_ok: boolean;
  /** No code-switch out of the Latin script (English is the comedy contract). */
  language_ok: boolean;
  /** Well-formed (length / no structured-output leak / has words) AND matches the mood skeleton. */
  form_ok: boolean;
  /** Every failing sub-check, prefixed (`safety:` / `form:` / `skeleton:` / `language:`) for debugging. */
  reasons: string[];
}

/**
 * Score a line on the three deterministic rubric dimensions for its INTENDED mood. Pure — same inputs
 * always yield the same score, no model, no I/O. `safety_ok` and `form_ok` are read off the shipped
 * `scoreOutput` reason set (so they mean exactly what the regression gate means); `language_ok` runs
 * the language gate directly. A line is deterministically-clean iff all three are true — but the eval
 * reports the dimensions SEPARATELY (a blended pass/fail would hide which dimension failed).
 */
export function scoreDeterministic(mood: MoodStyle, text: string): DeterministicScore {
  const { reasons } = scoreOutput(mood, text);
  const safety_ok = !reasons.some((r) => r.startsWith('safety:'));
  // `scoreOutput` only emits a `skeleton:` reason on otherwise-well-formed text; a malformed line
  // carries a `form:` reason instead. Either means the form dimension failed.
  const form_ok = !reasons.some((r) => r.startsWith('form:') || r.startsWith('skeleton:'));
  const language_ok = !hasLanguageLeak(text);

  const allReasons = [...reasons];
  if (!language_ok) allReasons.push('language:code-switch');
  return { safety_ok, language_ok, form_ok, reasons: allReasons };
}

/** All three deterministic dimensions pass. Convenience for callers that want a single floor flag. */
export function deterministicClean(score: DeterministicScore): boolean {
  return score.safety_ok && score.language_ok && score.form_ok;
}
