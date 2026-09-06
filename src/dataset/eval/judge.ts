/**
 * comedic-moods-v0 — the LLM-judge dimension of the eval (Slice 3).
 *
 * Mood-conformance is the ONE rubric dimension a deterministic check can't decide — it needs a model
 * to read voice. The eval lock pins how that judgement is run:
 *   - NO model judges its own comedy — the judge is a DIFFERENT family than the qwen2.5:7b generator.
 *   - The generator's reasoning is HIDDEN — the judge sees only the output line (+ the situation it
 *     answered + the target mood's rubric), never the generation prompt/chain (Kambhampati 2024).
 *   - Presentation order is COUNTERBALANCED — LLM judges have strong position bias (Wang 2023: the
 *     preferred option flips 82.5% of the time when you swap order), so the correct answer must occupy
 *     each slot equally across the corpus (see counterbalancedOptions).
 *   - The judgement is BINARY, never a funniness score (best LLM-vs-human humor rho ~ 0.2).
 *
 * This module owns the PURE, testable parts — the mood rubrics, the prompt builders, the response
 * parsers, and the counterbalancing — behind an injected `MoodJudge` interface. The concrete
 * Ollama-backed judge lives in ollama-judge.ts; tests drive the controls with a mock judge.
 */
import { MOOD_STYLES, type MoodStyle } from '../../types.js';

/** All six moods, in canonical order — the option universe for the mood-blind identification task. */
export const MOODS: readonly MoodStyle[] = MOOD_STYLES;

/**
 * One-line voice description per mood — what the conformance judge is told the mood SOUNDS like.
 * Mirrors the structural skeletons the scorecard enforces (roast label, cynic starter, cheeky opener,
 * chaotic pivot, zoomer caps, dry flatness) but in prose a judge can reason over.
 */
export const MOOD_RUBRICS: Record<MoodStyle, string> = {
  dry: 'Deadpan and flat: one plain, understated sentence. No shouting, no exclamation, no label prefix — the humor is in the restraint.',
  roast: 'A cutting verdict on the target, usually opening with a judgemental label like "Verdict:", "Diagnosis:", or "Assessment:". Merciless but never a slur.',
  cynic: 'World-weary resignation, opening with a knowing starter like "Of course", "Predictably", or "As expected", then the grim observation. Nothing surprises it.',
  cheeky: 'Playful and teasing, opening with a teasing address like "Oh honey,", "Bold move,", or "Cute attempt," then the gentle mockery.',
  chaotic: 'Unhinged escalation: a normal setup sentence, then a pivot ("Reportedly,", "Sources confirm,") into an absurd, surreal escalation.',
  zoomer: 'Gen-Z internet slang and meme cadence with one ALL-CAPS shout block (e.g. "SKILL ISSUE DETECTED"), lowercase elsewhere, "no cap", "ratio", "L".',
};

export interface ConformanceRequest {
  /** The situation the line was responding to (the tool input). */
  input: string;
  /** The comedy line under judgement (the ONLY generator output the judge sees). */
  line: string;
  /** The mood the line is being judged AGAINST (the true mood for the primary pass; a wrong mood for
   *  the mood-shuffled control). */
  mood: MoodStyle;
}

export interface IdentifyRequest {
  /** The comedy line, with NO mood label — the judge must recover the mood from the text alone. */
  line: string;
  /** The 6 mood options, already counterbalanced (see counterbalancedOptions). */
  options: MoodStyle[];
}

/**
 * A cross-family mood judge. Injected so the controls are testable with a mock and the CLI can wire a
 * real Ollama model. `conforms` returns null when the judge's answer can't be parsed to yes/no;
 * `identify` returns null when no option is recognised — nulls are dropped from the denominator, never
 * silently counted as a pass/fail.
 */
export interface MoodJudge {
  /** Judge/pool id (e.g. the model name) — must be a DIFFERENT family than the generator. */
  readonly name: string;
  conforms(req: ConformanceRequest): Promise<boolean | null>;
  identify(req: IdentifyRequest): Promise<MoodStyle | null>;
}

/**
 * Prompt for the binary mood-conformance judgement. Deliberately carries ONLY the line, the situation
 * it answered, and the target mood's rubric — never the generator's prompt or reasoning (hidden-reason
 * verification). The "genuine, specific response" clause is what makes the degraded-line control bite:
 * an in-voice-but-canned fallback that ignores the situation is a NO (the Sakabe irrelevant-response
 * failure a good judge must reject).
 */
export function buildConformancePrompt(input: string, line: string, mood: MoodStyle, rubric: string): string {
  return [
    'You are judging whether a one-line comedy response is written in a specific comedic VOICE and genuinely responds to the situation.',
    '',
    `Comedic voice "${mood}": ${rubric}`,
    '',
    `Situation being responded to: ${input}`,
    `The line: ${line}`,
    '',
    `Answer YES only if the line is BOTH (a) clearly in the "${mood}" voice AND (b) a genuine, specific response to that situation (not a generic canned line that ignores it).`,
    'Reply with exactly one word: YES or NO.',
  ].join('\n');
}

/**
 * Prompt for the mood-blind identification task: the judge sees the line and the (counterbalanced) mood
 * options with NO label and must name the mood. The dataset's premise is that moods are recoverable
 * from the text; this measures whether that signal is really present (identify above 1/6 chance).
 */
export function buildIdentifyPrompt(line: string, orderedOptions: MoodStyle[]): string {
  const numbered = orderedOptions.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return [
    'Below is a one-line comedy response. Identify which comedic MOOD it was written in.',
    '',
    `The line: ${line}`,
    '',
    'Options:',
    numbered,
    '',
    `Reply with exactly one mood word (one of: ${orderedOptions.join(', ')}). No explanation.`,
  ].join('\n');
}

/** True when `token` at `idx` is a negated mention ('not yes', 'cannot say yes', 'never roast'). */
function isNegatedMention(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 24), idx).toLowerCase();
  return /(?:^|\b)(?:not|never|cannot|can'?t|don't|dont|isn't|isnt|ain't|aint|no)\s+(?:\w+\s+){0,2}$/.test(before);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a judge's yes/no reply. Last standalone YES/NO token wins (so an echoed 'YES or NO' plus a
 * later 'NO' counts as NO). The instruction phrase 'YES or NO' is stripped so it cannot vote.
 * Negated mentions ('not yes', 'cannot say yes') are non-votes. Returns null when nothing remains.
 */
export function parseYesNo(raw: string): boolean | null {
  const stripped = raw.replace(/\byes\s+or\s+no\b/gi, ' ');
  let last: boolean | null = null;
  for (const m of stripped.matchAll(/\b(yes|no)\b/gi)) {
    const idx = m.index ?? 0;
    if (isNegatedMention(stripped, idx)) continue;
    last = m[1].toLowerCase() === 'yes';
  }
  return last;
}

/**
 * Parse a judge's mood choice: whole-word option mentions only (so 'sundry' is not 'dry'), LAST
 * mention wins, and negated mentions ('not roast') are non-votes. Null if no option word remains.
 */
export function parseMoodChoice(raw: string, options: readonly MoodStyle[]): MoodStyle | null {
  const t = raw.toLowerCase();
  let best: { mood: MoodStyle; idx: number } | null = null;
  for (const mood of options) {
    const re = new RegExp(`\\b${escapeRe(mood)}\\b`, 'g');
    for (const m of t.matchAll(re)) {
      const idx = m.index ?? 0;
      if (isNegatedMention(t, idx)) continue;
      if (best === null || idx >= best.idx) best = { mood, idx };
    }
  }
  return best ? best.mood : null;
}

/**
 * Counterbalanced option order for the mood-blind task: place the CORRECT mood at position (index mod
 * N), the others filling the remaining slots in canonical order. Across the corpus the correct answer
 * therefore occupies every position equally often, so a judge with a fixed positional bias scores only
 * ~1/N (chance) — the Wang 2023 order effect can't inflate the result. Deterministic (index-driven, no
 * RNG) so a run is reproducible.
 */
export function counterbalancedOptions(trueMood: MoodStyle, index: number, moods: readonly MoodStyle[] = MOODS): MoodStyle[] {
  const n = moods.length;
  const pos = ((index % n) + n) % n;
  const others = moods.filter((m) => m !== trueMood);
  const result = [...others];
  result.splice(pos, 0, trueMood);
  return result;
}
