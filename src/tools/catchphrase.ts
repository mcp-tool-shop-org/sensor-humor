/**
 * catchphrase.generate + catchphrase.callback
 * Generate short, reusable recurring bits. Store in session for callbacks.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { CatchphraseCallbackResult, CatchphraseGenerateResult, MoodStyle } from '../types.js';
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
      const firstWord = phrase.toLowerCase().split(' ')[0];
      if (firstWord.length >= 3 && new RegExp(`\\b${escapeRegex(firstWord)}\\b`).test(lower)) {
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
  const phrase = gate.phrase;
  const degraded = gate.gated
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

  // Find the most-used catchphrase
  let bestPhrase = '';
  let bestCount = 0;
  for (const [phrase, count] of session.catchphrases) {
    if (count > bestCount) {
      bestPhrase = phrase;
      bestCount = count;
    }
  }

  // Increment usage
  const newCount = session.useCatchphrase(bestPhrase);
  // Terminal safety gate: a persisted/legacy phrase could be dirty (slur/simile). Re-check and
  // substitute an input-free static catchphrase before returning, so callback never replays a
  // banned token. pushBit uses the gated phrase so the recent-bits ring stays clean too.
  const safe = safeCatchphrase(session.mood, bestPhrase).phrase;
  session.pushBit(safe, 'catchphrase');
  session.tick();

  return { phrase: safe, use_count: newCount };
}
