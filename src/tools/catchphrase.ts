/**
 * catchphrase.generate + catchphrase.callback
 * Generate short, reusable recurring bits. Store in session for callbacks.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy, recordSafetyFilterFire } from '../ollama.js';
import type { CatchphraseCallbackResult, CatchphraseGenerateResult, Degradable, MoodStyle } from '../types.js';
import { sanitizeForPrompt, hasHarshLeak, hasSimileLeak } from '../validators.js';

/** Escape regex special characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fully static, input-free safe catchphrases — used when a generated/persisted phrase trips the
 * terminal safety gate (slur or simile). Mirrors STATIC_SAFE_FALLBACK in validators.ts so a
 * dirty phrase is never stored or replayed.
 */
// Record<MoodStyle, string> so adding a mood fails the build until it has a static catchphrase.
const STATIC_SAFE_CATCHPHRASE: Record<MoodStyle, string> = {
  roast: 'Ship it and pray.',
  cynic: 'Of course it broke.',
  cheeky: 'Bless its little heart.',
  chaotic: 'The build weeps again.',
  zoomer: 'cooked, no cap.',
  dry: 'Noted. Moving on.',
};

/**
 * Terminal safety gate for catchphrases: a phrase must never reach the user (or get stored for
 * replay via callback / future prompts) if it carries a slur or simile. Substitutes an
 * input-free static catchphrase if it does. Returns the safe phrase and whether the gate fired.
 */
function safeCatchphrase(mood: MoodStyle, phrase: string): { phrase: string; gated: boolean } {
  if (hasHarshLeak(phrase) || hasSimileLeak(phrase)) {
    return { phrase: STATIC_SAFE_CATCHPHRASE[mood], gated: true };
  }
  return { phrase, gated: false };
}

const CatchphraseSchema = z.object({
  phrase: z.string().max(60),
});

const CATCHPHRASE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    phrase: {
      type: 'string',
      description: 'A short, punchy, reusable catchphrase. 3-8 words.',
    },
  },
  required: ['phrase'],
};

const CATCHPHRASE_NUM_PREDICT = 30;

/**
 * Generate a new catchphrase or return an existing one if context matches.
 */
export async function catchphraseGenerate(
  context?: string,
): Promise<CatchphraseGenerateResult> {
  const session = getSession();
  session.tick();

  // Check if we have an existing catchphrase that fits the context
  if (context && session.catchphrases.size > 0) {
    const lower = context.toLowerCase();
    for (const [phrase] of session.catchphrases) {
      // Never reuse a dirty stored phrase (legacy/persisted slur/simile): skip it so we fall
      // through to a fresh, gated generation instead of replaying a banned token.
      if (hasHarshLeak(phrase) || hasSimileLeak(phrase)) continue;
      // Match against ALL significant words of the stored phrase (mirrors how
      // findCallbackCandidates matches a gag tag), not just the first word — and strip trailing
      // punctuation first so a stored "cooked," still matches the context word "cooked" (tools-003).
      const words = phrase
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter((w) => w.length >= 3);
      const matched = words.some((w) => new RegExp(`\\b${escapeRegex(w)}\\b`).test(lower));
      if (matched) {
        session.useCatchphrase(phrase);
        session.pushBit(phrase, 'catchphrase');
        return { phrase, is_fresh: false };
      }
    }
  }

  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(session.mood),
    `\nCATCHPHRASE MODE: Generate a short, reusable catchphrase or recurring bit. 3-8 words. Make it punchy, memorable, and repeatable. It should work as a running gag that gets funnier with repetition.`,
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  const contextLine = context ? `\nContext: ${sanitizeForPrompt(context)}` : '';
  const userPrompt = `Generate a catchphrase for this session. 3-8 words, punchy, reusable.${contextLine}

Respond with JSON only.`;

  const fallback: z.infer<typeof CatchphraseSchema> = {
    phrase: 'Ship it and pray.',
  };

  const result = await generateComedy<z.infer<typeof CatchphraseSchema>>(
    {
      systemPrompt,
      userPrompt,
      schema: CatchphraseSchema,
      jsonSchema: CATCHPHRASE_JSON_SCHEMA,
      numPredict: CATCHPHRASE_NUM_PREDICT,
    },
    fallback,
  );

  // Terminal safety gate: re-check the generated phrase BEFORE it is stored (useCatchphrase /
  // pushBit), so a slur/simile can never be persisted and replayed by callback or future
  // prompts. A gated phrase collapses to a static input-free catchphrase.
  const gate = safeCatchphrase(session.mood, result.data.phrase);
  if (gate.gated) recordSafetyFilterFire();
  const phrase = gate.phrase;
  const degraded: Degradable = gate.gated
    ? { degraded: true, degraded_reason: 'safety-filter' }
    : result.fallback_reason
      ? { degraded: true, degraded_reason: result.fallback_reason }
      : {};
  // If Ollama returned a phrase we already have, treat as reuse not fresh
  if (session.catchphrases.has(phrase)) {
    session.useCatchphrase(phrase);
    session.pushBit(phrase, 'catchphrase');
    return { phrase, is_fresh: false, ...degraded };
  }
  session.useCatchphrase(phrase);
  session.pushBit(phrase, 'catchphrase');

  return { phrase, is_fresh: true, ...degraded };
}

/**
 * Recall an existing catchphrase from the session.
 * Returns the most-used one, or null if none exist.
 */
export function catchphraseCallback(): CatchphraseCallbackResult | null {
  const session = getSession();

  if (session.catchphrases.size === 0) return null;

  // Find the most-used CLEAN catchphrase. Dirty phrases (persisted/legacy slur/simile) are skipped
  // during the max scan (mirrors how catchphraseGenerate skips dirty stored phrases). This closes a
  // session-long livelock (tools-001): if a dirty phrase were selected, useCatchphrase would bump
  // ITS count every call, keeping it the map maximum forever, so the user would never recall a real
  // phrase again. Skipping it here means its count is never mutated and a clean phrase surfaces.
  let bestPhrase = '';
  let bestCount = 0;
  for (const [phrase, count] of session.catchphrases) {
    if (hasHarshLeak(phrase) || hasSimileLeak(phrase)) continue;
    if (count > bestCount) {
      bestPhrase = phrase;
      bestCount = count;
    }
  }

  // No clean phrase exists (every stored phrase is dirty): return an input-free static safe line
  // WITHOUT mutating any count — do not call useCatchphrase, so no dirty phrase's count is bumped.
  // Signal degraded:'safety-filter' so the substitution is machine-visible and never reads as a
  // genuine recall (Q4 / BK-B-01).
  if (bestPhrase === '') {
    recordSafetyFilterFire();
    const safe = STATIC_SAFE_CATCHPHRASE[session.mood];
    session.pushBit(safe, 'catchphrase');
    session.tick();
    return { phrase: safe, use_count: 0, degraded: true, degraded_reason: 'safety-filter' as const };
  }

  // Only mutate the phrase we ACTUALLY return, so use_count always describes the returned phrase
  // (tools-001b). bestPhrase is already clean (dirty entries were skipped above), so the terminal
  // gate below cannot fire on it — the gate is retained as defense-in-depth only.
  const newCount = session.useCatchphrase(bestPhrase);
  const gate = safeCatchphrase(session.mood, bestPhrase);
  if (gate.gated) recordSafetyFilterFire();
  session.pushBit(gate.phrase, 'catchphrase');
  session.tick();

  return {
    phrase: gate.phrase,
    use_count: newCount,
    ...(gate.gated ? { degraded: true, degraded_reason: 'safety-filter' as const } : {}),
  };
}
