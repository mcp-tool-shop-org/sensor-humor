/**
 * comic_timing — the money tool.
 * Takes dry text + optional technique → rewrites with comedic delivery.
 */

import { z } from 'zod';
import { getSession } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy, recordSafetyFilterFire } from '../ollama.js';
import { COMIC_TECHNIQUES, type ComicTechnique, type ComicTimingResult } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, hasHarshLeak, sanitizeForPrompt, voicedSafeFallback } from '../validators.js';
import { ROAST_LABEL_PATTERN } from './roast.js';

const ComicTimingSchema = z.object({
  rewrite: z.string().max(300),
  technique_used: z.string(),
  callback_source: z.string().optional(),
});

/**
 * Detect meta-commentary or prompt leakage in output. Anchored on multi-word leakage phrases
 * rather than bare nouns ("rule", "prompt", "instruction") so ordinary dev-humor vocabulary
 * ("the linter rule fired", "a prompt apology") no longer triggers a needless retry.
 */
const META_LEAK_PATTERN =
  /\b(?:base instructions|system prompt|mood prompt|forbidden (?:item|word)s?|no emoji|no exclamation marks?|zoomer mood|the rules?\s+(?:say|state|forbid|require|are)|per the (?:rules|instructions)|cannot say|not allowed to say)\b/i;

/** comic_timing's rewrite schema allows up to 300 chars; give it enough tokens to finish
 *  multi-sentence outputs (the 60-token default truncated the "money tool" mid-sentence). */
const COMIC_TIMING_NUM_PREDICT = 140;

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
  session.tick();

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
      ? `\nCALLBACK MATERIAL AVAILABLE:\n${callbackCandidates.map((g) => `- "${sanitizeForPrompt(g.setup)}" (tag: ${sanitizeForPrompt(g.tag)})`).join('\n')}`
      : '';

  const userPrompt = `Rewrite the following text with comedic delivery.

TECHNIQUE: ${techniqueGuide}
${callbackContext}

TEXT TO REWRITE:
${sanitizeForPrompt(text)}

Respond with JSON only.`;

  // Voiced fallback so a backend-down result reads as an in-voice stock line, not a bare echo
  // of the caller's input (OBS-06); voicedSafeFallback also guarantees it is slur/simile-free.
  const fallback: ComicTimingResult = {
    rewrite: voicedSafeFallback(session.mood, text),
    technique_used: 'understatement',
  };

  // All retries share the same system prompt, schema, and token budget; only the user
  // prompt varies, so wrap generateComedy once.
  const gen = (up: string) =>
    generateComedy<ComicTimingResult>(
      {
        systemPrompt,
        userPrompt: up,
        schema: ComicTimingSchema,
        jsonSchema: COMIC_TIMING_JSON_SCHEMA,
        numPredict: COMIC_TIMING_NUM_PREDICT,
      },
      fallback,
    );

  let result = await gen(userPrompt);

  // Post-validation: reject meta-commentary leaks and retry once
  if (META_LEAK_PATTERN.test(result.data.rewrite)) {
    result = await gen(`${userPrompt}\n\nOutput ONLY the comedic rewrite. No rules, no comments, no meta text. Pure comedy only.`);
  }

  // Simile/comparison leak check: retry once with negative prompt
  if (hasSimileLeak(result.data.rewrite)) {
    result = await gen(`${userPrompt}${SIMILE_RETRY_SUFFIX}`);
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (hasHarshLeak(result.data.rewrite)) {
    result = await gen(`${userPrompt}\n\nNever use slurs, extreme insults, or derogatory terms. Keep savage but not cruel. Pure comedy only.`);
  }

  // Roast pattern nudge: if roast mood and no verdict/label pattern, retry with hint
  if (session.mood === 'roast' && !ROAST_LABEL_PATTERN.test(result.data.rewrite)) {
    result = await gen(`${userPrompt}\n\nStart with a label like "Verdict:", "Diagnosis:", or "Classification:" followed by 1 tight sentence.`);
  }

  // Terminal safety gate: the harsh filter, simile check, AND meta-leak check must be the LAST
  // word, after EVERY content-shaping retry above (including the roast-label retry), so a late
  // retry can never sneak a slur, comparison, or leaked prompt-internal past the filters and reach
  // the user. META_LEAK is included here (BK-B-02) so a persistent prompt/system-instruction leak
  // is substituted AND flagged degraded, instead of returning verbatim and unflagged.
  let gateFired = false;
  if (
    hasHarshLeak(result.data.rewrite) ||
    hasSimileLeak(result.data.rewrite) ||
    META_LEAK_PATTERN.test(result.data.rewrite)
  ) {
    result.data.rewrite = voicedSafeFallback(session.mood, text);
    result.data.technique_used = 'understatement';
    gateFired = true;
    recordSafetyFilterFire();
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error('[sensor-humor] ComicTiming: terminal safety gate triggered, using safe fallback');
    }
  }

  // Update session state
  session.pushBit(result.data.rewrite, result.data.technique_used);

  // If the model used a callback, update the gag's usage count
  if (result.data.technique_used === 'callback' && result.data.callback_source) {
    const gag = callbackCandidates.find(
      (g) => g.setup === result.data.callback_source || g.tag === result.data.callback_source,
    );
    if (gag) {
      session.addGag(gag.setup, gag.tag);
    } else if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error(`[sensor-humor] callback_source "${result.data.callback_source}" did not match any gag candidate`);
    }
  }

  // Surface the degradation signal: backend failure (fallback_reason) or a safety substitution.
  const degradedReason = result.fallback_reason ?? (gateFired ? 'safety-filter' : undefined);
  if (degradedReason) {
    result.data.degraded = true;
    result.data.degraded_reason = degradedReason;
  }

  return result.data;
}
