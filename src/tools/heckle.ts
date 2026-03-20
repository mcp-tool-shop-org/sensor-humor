/**
 * heckle — short, punchy reaction. Quick jab, no config needed.
 * Subset of roast with tighter constraints.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { HeckleResult } from '../types.js';

const HeckleSchema = z.object({
  heckle: z.string().max(120),
});

const HECKLE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    heckle: {
      type: 'string',
      description: 'A short, punchy heckle. 8-20 words max.',
    },
  },
  required: ['heckle'],
};

const HECKLE_NUM_PREDICT = 40;

export async function heckle(target: string): Promise<HeckleResult> {
  const session = getSession();
  const turn = session.tick();

  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(session.mood),
    `\nHECKLE MODE: Deliver a single, short, pointed heckle. 8-20 words max. No label needed — direct burn. One sentence. Be ruthlessly concise.`,
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  const userPrompt = `Heckle this. One short punchy line, 8-20 words. No labels, no prefaces. Direct hit.

TARGET:
${target}

Respond with JSON only.`;

  const fallback: z.infer<typeof HeckleSchema> = {
    heckle: target,
  };

  const result = await generateComedy<z.infer<typeof HeckleSchema>>(
    {
      systemPrompt,
      userPrompt,
      schema: HeckleSchema,
      jsonSchema: HECKLE_JSON_SCHEMA,
      numPredict: HECKLE_NUM_PREDICT,
    },
    fallback,
  );

  // Update session
  session.pushBit(result.data.heckle, 'heckle');

  return {
    heckle: result.data.heckle,
    mood: session.mood,
  };
}
