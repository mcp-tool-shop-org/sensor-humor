/**
 * heckle — short, punchy reaction. Quick jab, no config needed.
 * Respects current mood's voice pattern.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { HeckleResult, MoodStyle } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, HARSH_FILTER, sanitizeForPrompt } from '../validators.js';

const HeckleSchema = z.object({
  heckle: z.string().max(120),
});

const HECKLE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    heckle: {
      type: 'string',
      description: 'A short, punchy heckle in the current mood voice. 8-20 words max.',
    },
  },
  required: ['heckle'],
};

const HECKLE_NUM_PREDICT = 40;

/** Mood-specific heckle guidance for moods that need skeleton override. */
function buildHeckleGuidance(mood: MoodStyle): string {
  if (mood === 'zoomer') {
    return `\nHECKLE MODE (zoomer): Deliver a single savage heckle in this exact short format:
[lowercase reaction opener], [quick savage jab] [ONE 3-5 WORD CAPS BLOCK]

Examples (pattern only — do NOT copy):
bro, types nowhere, SKILL ISSUE FR
nahhh, legacy vibes, RATIO'D HARD
absolutely cooked, no tests, BUILT DIFFERENT FR

Rules: 8-20 words max. Exactly one caps block (3-5 words). No questions, no metaphors. Original every time.`;
  }
  return `\nHECKLE MODE: Deliver a single, short, pointed heckle in your current mood voice. 8-20 words max. Follow the mood prompt's delivery pattern. One sentence. Be ruthlessly concise.`;
}

/** Mood-specific heckle user prompt. */
function buildHeckleUserPrompt(mood: MoodStyle, target: string): string {
  if (mood === 'zoomer') {
    return `Heckle this. Format: [reaction opener], [savage jab] [CAPS BLOCK]. 8-20 words. No questions. No metaphors.

TARGET:
${sanitizeForPrompt(target)}

Respond with JSON only.`;
  }
  return `Heckle this. One short punchy line in your mood's voice pattern, 8-20 words. Direct hit.

TARGET:
${sanitizeForPrompt(target)}

Respond with JSON only.`;
}

export async function heckle(target: string): Promise<HeckleResult> {
  const session = getSession();
  session.tick();
  const mood = session.mood;

  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(mood),
    buildHeckleGuidance(mood),
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  const userPrompt = buildHeckleUserPrompt(mood, target);

  const fallback: z.infer<typeof HeckleSchema> = {
    heckle: target,
  };

  let result = await generateComedy<z.infer<typeof HeckleSchema>>(
    {
      systemPrompt,
      userPrompt,
      schema: HeckleSchema,
      jsonSchema: HECKLE_JSON_SCHEMA,
      numPredict: HECKLE_NUM_PREDICT,
    },
    fallback,
  );

  // Simile/comparison leak check: retry once with negative prompt
  if (hasSimileLeak(result.data.heckle)) {
    const simileRetryPrompt = `${userPrompt}${SIMILE_RETRY_SUFFIX}`;
    result = await generateComedy<z.infer<typeof HeckleSchema>>(
      {
        systemPrompt,
        userPrompt: simileRetryPrompt,
        schema: HeckleSchema,
        jsonSchema: HECKLE_JSON_SCHEMA,
        numPredict: HECKLE_NUM_PREDICT,
      },
      fallback,
    );
    if (hasSimileLeak(result.data.heckle)) {
      const moodFallbacks: Record<string, string> = {
        dry: `${sanitizeForPrompt(target)}. That's a choice.`,
        roast: `Verdict: ${sanitizeForPrompt(target)}.`,
        cynic: `Of course: ${sanitizeForPrompt(target)}.`,
        cheeky: `Oh honey, ${sanitizeForPrompt(target)}.`,
        chaotic: `${sanitizeForPrompt(target)}. The server weeps.`,
        zoomer: `${sanitizeForPrompt(target)}, cooked fr.`,
      };
      result.data.heckle = moodFallbacks[mood] ?? `${sanitizeForPrompt(target)}. That's a choice.`;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Heckle: simile leak persisted after retry, using safe fallback');
      }
    }
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (HARSH_FILTER.test(result.data.heckle)) {
    const cleanPrompt = `${userPrompt}\n\nNever use slurs, extreme insults, or derogatory terms. Keep savage but not cruel.`;
    result = await generateComedy<z.infer<typeof HeckleSchema>>(
      {
        systemPrompt,
        userPrompt: cleanPrompt,
        schema: HeckleSchema,
        jsonSchema: HECKLE_JSON_SCHEMA,
        numPredict: HECKLE_NUM_PREDICT,
      },
      fallback,
    );
    // Safe fallback if harsh filter still triggers after retry
    if (HARSH_FILTER.test(result.data.heckle)) {
      result.data.heckle = `${sanitizeForPrompt(target)}. That's a choice.`;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Heckle: harsh filter persisted after retry, using safe fallback');
      }
    }
  }

  // Update session
  session.pushBit(result.data.heckle, 'heckle');

  return {
    heckle: result.data.heckle,
    mood,
  };
}
