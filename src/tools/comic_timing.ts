/**
 * comic_timing — the money tool.
 * Takes dry text + optional technique → rewrites with comedic delivery.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy } from '../ollama.js';
import { COMIC_TECHNIQUES, type ComicTechnique, type ComicTimingResult } from '../types.js';

const ComicTimingSchema = z.object({
  rewrite: z.string().max(500),
  technique_used: z.string(),
  callback_source: z.string().optional(),
});

/** JSON schema for Ollama format parameter. */
const COMIC_TIMING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    rewrite: {
      type: 'string',
      description: 'The comedic rewrite of the input text',
    },
    technique_used: {
      type: 'string',
      enum: ['rule-of-three', 'misdirection', 'escalation', 'callback', 'understatement'],
      description: 'Which comedy technique was used',
    },
    callback_source: {
      type: 'string',
      description: 'If technique is callback, what earlier bit is being referenced',
    },
  },
  required: ['rewrite', 'technique_used'],
};

function buildTechniqueGuidance(technique: ComicTechnique, hasCallbacks: boolean): string {
  switch (technique) {
    case 'rule-of-three':
      return 'Use the rule of three: two normal items, then a third that breaks the pattern.';
    case 'misdirection':
      return 'Use misdirection: set up an expectation, then deliver something completely different.';
    case 'escalation':
      return 'Use escalation: start reasonable, then each beat gets progressively more absurd.';
    case 'callback':
      return hasCallbacks
        ? 'Use a callback: reference an earlier bit from this session. Check the session state for material.'
        : 'A callback was requested but there are no earlier bits to reference. Use understatement instead.';
    case 'understatement':
      return 'Use understatement: describe something dramatic as if it were completely mundane.';
    case 'auto':
      return hasCallbacks
        ? 'Choose the best technique for this text. If earlier session material is available, consider a callback.'
        : 'Choose the best comedy technique for this text.';
  }
}

export async function comicTiming(
  text: string,
  technique: ComicTechnique = 'auto',
): Promise<ComicTimingResult> {
  const session = getSession();
  const turn = session.tick();

  // Check for callback candidates
  const callbackCandidates = session.findCallbackCandidates(text);
  const hasCallbacks = callbackCandidates.length > 0 || session.recent_bits.length > 0;

  // Build the full system prompt
  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(session.mood),
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ].join('\n\n');

  // Build the user prompt
  const techniqueGuide = buildTechniqueGuidance(technique, hasCallbacks);
  const callbackContext =
    callbackCandidates.length > 0
      ? `\nCALLBACK MATERIAL AVAILABLE:\n${callbackCandidates.map((g) => `- "${g.setup}" (tag: ${g.tag})`).join('\n')}`
      : '';

  const userPrompt = `Rewrite the following text with comedic delivery.

TECHNIQUE: ${techniqueGuide}
${callbackContext}

TEXT TO REWRITE:
${text}

Respond with JSON only.`;

  const fallback: ComicTimingResult = {
    rewrite: text,
    technique_used: 'understatement',
  };

  const result = await generateComedy<ComicTimingResult>(
    {
      systemPrompt,
      userPrompt,
      schema: ComicTimingSchema,
      jsonSchema: COMIC_TIMING_JSON_SCHEMA,
    },
    fallback,
  );

  // Update session state
  session.pushBit(result.data.rewrite, result.data.technique_used);

  // If the model used a callback, update the gag's usage count
  if (result.data.technique_used === 'callback' && result.data.callback_source) {
    const gag = callbackCandidates.find(
      (g) => g.setup === result.data.callback_source || g.tag === result.data.callback_source,
    );
    if (gag) {
      session.addGag(gag.setup, gag.tag);
    }
  }

  return result.data;
}
