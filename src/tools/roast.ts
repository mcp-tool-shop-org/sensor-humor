/**
 * roast — affectionate burns with severity rating.
 * Uses verdict/label pattern exclusively.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import type { RoastContext, RoastResult } from '../types.js';

const RoastSchema = z.object({
  roast: z.string().max(200),
  severity: z.number().int().min(1).max(5),
});

const ROAST_JSON_SCHEMA = {
  type: 'object',
  properties: {
    roast: {
      type: 'string',
      description: 'The roast using Verdict:/Diagnosis:/Classification: label pattern',
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

export async function roast(
  target: string,
  context: RoastContext = 'code',
): Promise<RoastResult> {
  const session = getSession();
  const turn = session.tick();

  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(session.mood),
    `\nROAST MODE: Assign severity 1-5 based on how egregious the flaw is (1=mild pattern, 3=notable code smell, 5=architectural crime). Start with ONE label — pick exactly one of: "Verdict:", "Diagnosis:", "Classification:", "Case closed:", "File under:", "Official status:". Do NOT combine labels.`,
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  const userPrompt = `Roast the following ${context}. Pick ONE label (Verdict: OR Diagnosis: OR Classification:) then deliver 1 tight sentence.

TARGET:
${target}

Respond with JSON only.`;

  const fallback: z.infer<typeof RoastSchema> = {
    roast: `Verdict: ${target}. No further comment.`,
    severity: 3,
  };

  let result = await generateComedy<z.infer<typeof RoastSchema>>(
    {
      systemPrompt,
      userPrompt,
      schema: RoastSchema,
      jsonSchema: ROAST_JSON_SCHEMA,
    },
    fallback,
  );

  // Label pattern enforcement: retry once if missing
  if (!ROAST_LABEL_PATTERN.test(result.data.roast)) {
    const retryPrompt = `${userPrompt}\n\nStart with a label like "Verdict:", "Diagnosis:", or "Classification:" followed by 1 tight sentence.`;
    result = await generateComedy<z.infer<typeof RoastSchema>>(
      {
        systemPrompt,
        userPrompt: retryPrompt,
        schema: RoastSchema,
        jsonSchema: ROAST_JSON_SCHEMA,
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
