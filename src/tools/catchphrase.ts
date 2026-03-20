/**
 * catchphrase.generate + catchphrase.callback
 * Generate short, reusable recurring bits. Store in session for callbacks.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { CatchphraseCallbackResult, CatchphraseGenerateResult } from '../types.js';

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
      if (lower.includes(phrase.toLowerCase().split(' ')[0])) {
        const count = session.useCatchphrase(phrase);
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

  const contextLine = context ? `\nContext: ${context}` : '';
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

  const phrase = result.data.phrase;
  session.useCatchphrase(phrase);
  session.pushBit(phrase, 'catchphrase');

  return { phrase, is_fresh: true };
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
    if (count >= bestCount) {
      bestPhrase = phrase;
      bestCount = count;
    }
  }

  // Increment usage
  const newCount = session.useCatchphrase(bestPhrase);
  session.pushBit(bestPhrase, 'catchphrase');
  session.tick();

  return { phrase: bestPhrase, use_count: newCount };
}
