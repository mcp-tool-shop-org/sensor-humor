/**
 * roast — affectionate burns with severity rating.
 * Respects current mood's voice pattern. Label enforcement only in roast mood.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { RoastContext, RoastResult } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, HARSH_FILTER } from '../validators.js';

const RoastSchema = z.object({
  roast: z.string().max(200),
  severity: z.number().int().min(1).max(5),
});

const ROAST_JSON_SCHEMA = {
  type: 'object',
  properties: {
    roast: {
      type: 'string',
      description: 'The roast in the current mood voice',
    },
    severity: {
      type: 'integer',
      minimum: 1,
      maximum: 5,
      description: 'Severity 1-5 (1=mild pattern, 3=notable smell, 5=architectural crime)',
    },
  },
  required: ['roast', 'severity'],
};

const ROAST_LABEL_PATTERN = /^(Verdict|Diagnosis|Official status|Classification|Case closed|Exhibit A|File under|Status|Designation):/i;
const COMPARISON_LEAK = /\blike a\b|\bas a\b|\bas if\b|\bsimilar to\b|\bresembles\b|\bband[\s-]?aid\b|\bbandaid\b|\bblanket\b|\bcoffee break\b/i;

/** Build roast-specific guidance that respects mood voice. */
function buildRoastGuidance(mood: string): string {
  if (mood === 'roast') {
    return `\nROAST MODE: Assign severity 1-5 based on how egregious the flaw is (1=mild pattern, 3=notable code smell, 5=architectural crime). Start with ONE label — pick exactly one of: "Verdict:", "Diagnosis:", "Classification:", "Case closed:", "File under:", "Official status:". Do NOT combine labels.`;
  }
  // All other moods: let the mood prompt handle voice, just add severity guidance
  return `\nROAST MODE: Assign severity 1-5 based on how egregious the flaw is. Deliver the roast in your current mood voice — follow the mood prompt's pattern exactly.`;
}

/** Build roast user prompt that respects mood voice. */
function buildRoastUserPrompt(mood: string, target: string, context: RoastContext): string {
  if (mood === 'roast') {
    return `Roast the following ${context}. Pick ONE label (Verdict: OR Diagnosis: OR Classification:) then deliver 1 tight sentence.\n\nTARGET:\n${target}\n\nRespond with JSON only.`;
  }
  // Other moods: roast the target using mood's own pattern
  return `Roast the following ${context}. Use your mood's delivery pattern — do NOT use "Verdict:" or other roast labels.\n\nTARGET:\n${target}\n\nRespond with JSON only.`;
}

export async function roast(
  target: string,
  context: RoastContext = 'code',
): Promise<RoastResult> {
  const session = getSession();
  const turn = session.tick();

  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(session.mood),
    buildRoastGuidance(session.mood),
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  const userPrompt = buildRoastUserPrompt(session.mood, target, context);

  const fallback: z.infer<typeof RoastSchema> = {
    roast: `${target}. No further comment.`,
    severity: 3,
  };

  const ROAST_NUM_PREDICT = 80;

  let result = await generateComedy<z.infer<typeof RoastSchema>>(
    {
      systemPrompt,
      userPrompt,
      schema: RoastSchema,
      jsonSchema: ROAST_JSON_SCHEMA,
      numPredict: ROAST_NUM_PREDICT,
    },
    fallback,
  );

  // Label pattern enforcement: ONLY in roast mood
  if (session.mood === 'roast' && !ROAST_LABEL_PATTERN.test(result.data.roast)) {
    const retryPrompt = `${userPrompt}\n\nStart with a label like "Verdict:", "Diagnosis:", or "Classification:" followed by 1 tight sentence.`;
    result = await generateComedy<z.infer<typeof RoastSchema>>(
      {
        systemPrompt,
        userPrompt: retryPrompt,
        schema: RoastSchema,
        jsonSchema: ROAST_JSON_SCHEMA,
        numPredict: ROAST_NUM_PREDICT,
      },
      fallback,
    );
  }

  // Comparison/metaphor/simile leak check: retry once with negative prompt
  if (COMPARISON_LEAK.test(result.data.roast) || hasSimileLeak(result.data.roast)) {
    const cleanPrompt = `${userPrompt}${SIMILE_RETRY_SUFFIX}`;
    result = await generateComedy<z.infer<typeof RoastSchema>>(
      {
        systemPrompt,
        userPrompt: cleanPrompt,
        schema: RoastSchema,
        jsonSchema: ROAST_JSON_SCHEMA,
        numPredict: ROAST_NUM_PREDICT,
      },
      fallback,
    );
    // If still leaking after retry, use safe fallback
    if (COMPARISON_LEAK.test(result.data.roast) || hasSimileLeak(result.data.roast)) {
      result.data.roast = `${target}. No further comment.`;
    }
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (HARSH_FILTER.test(result.data.roast)) {
    const cleanPrompt = `${userPrompt}\n\nNever use slurs, extreme insults, or derogatory terms. Keep savage but not cruel.`;
    result = await generateComedy<z.infer<typeof RoastSchema>>(
      {
        systemPrompt,
        userPrompt: cleanPrompt,
        schema: RoastSchema,
        jsonSchema: ROAST_JSON_SCHEMA,
        numPredict: ROAST_NUM_PREDICT,
      },
      fallback,
    );
  }

  // Clamp severity
  const severity = Math.max(1, Math.min(5, result.data.severity));

  // Update session
  session.pushBit(result.data.roast, 'roast');

  return {
    roast: result.data.roast,
    severity,
    mood: session.mood,
  };
}
