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
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, hasHarshLeak, sanitizeForPrompt, voicedSafeFallback, STATIC_SAFE_FALLBACK } from '../validators.js';
import { ROAST_LABEL_PATTERN } from './roast.js';

const ComicTimingSchema = z.object({
  rewrite: z.string().max(300),
  technique_used: z.string(),
  callback_source: z.string().optional(),
});

/**
 * Result shape returned by this tool, structurally extending ComicTimingResult with the
 * caller-legibility field `callback_honored` (b-tools-002). Declared locally rather than in
 * types.ts (which this agent does not own): when technique_used === 'callback', honored === true
 * means callback_source matched a real gag candidate (a verified callback); false means the model
 * claimed 'callback' but nothing matched (a hallucinated callback). Absent for non-callback
 * techniques, so existing callers and the base ComicTimingResult contract are unaffected.
 */
type ComicTimingResultWithHonor = ComicTimingResult & { callback_honored?: boolean };

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
): Promise<ComicTimingResultWithHonor> {
  const session = getSession();
  session.tick();
  // Snapshot the mood ONCE at entry (matches roast.ts / heckle.ts). Reading session.mood again
  // after an await would let a concurrent mood_set flip the mood mid-call, so the roast-label
  // retry decision and the voiced fallback below would enforce/voice the WRONG mood (tools-002).
  // Content safety is unaffected either way; this fixes voice consistency only.
  const mood = session.mood;

  // Check for callback candidates
  const callbackCandidates = session.findCallbackCandidates(text);
  const hasCallbacks = callbackCandidates.length > 0 || session.recent_bits.length > 0;

  // Build the full system prompt
  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(mood),
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
    rewrite: voicedSafeFallback(mood, text),
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

  // Roast pattern nudge: if roast mood and no verdict/label pattern, retry with hint.
  // Uses the entry-snapshot `mood`, not session.mood, so a concurrent mood_set during an await
  // above cannot flip this decision (tools-002).
  if (mood === 'roast' && !ROAST_LABEL_PATTERN.test(result.data.rewrite)) {
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
    // If the gate fired on the CALLER-SPECIFIC META_LEAK_PATTERN, use the input-free
    // STATIC_SAFE_FALLBACK rather than the interpolating voicedSafeFallback: the latter only
    // re-checks hasHarshLeak/hasSimileLeak (NOT META_LEAK_PATTERN), so if `text` itself contained
    // a leaked-prompt phrase the substitute could re-emit it. Input-free guarantees the returned
    // line cannot re-contain the pattern that fired the gate (server-003). Uses the entry-snapshot
    // `mood` (tools-002) so a concurrent mood_set cannot voice the wrong mood here.
    result.data.rewrite = META_LEAK_PATTERN.test(result.data.rewrite)
      ? STATIC_SAFE_FALLBACK[mood]
      : voicedSafeFallback(mood, text);
    result.data.technique_used = 'understatement';
    gateFired = true;
    recordSafetyFilterFire();
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error('[sensor-humor] ComicTiming: terminal safety gate triggered, using safe fallback');
    }
  }

  // Update session state
  session.pushBit(result.data.rewrite, result.data.technique_used);

  // If the model used a callback, update the gag's usage count and record whether the claimed
  // callback was actually HONORED — i.e. callback_source matched a real gag candidate. A gate
  // substitution above rewrites technique_used to 'understatement', so this only fires for a
  // genuine model 'callback'. When the model claims 'callback' but nothing matches (a hallucinated
  // callback), callback_honored is false so the caller can distinguish a real callback from an
  // invented one instead of trusting an unverified 'callback' label with no source (b-tools-002).
  // Typed view of the result data so the additive callback_honored field type-checks without
  // editing the shared ComicTimingResult in types.ts (this agent does not own it).
  const data = result.data as ComicTimingResultWithHonor;
  if (data.technique_used === 'callback') {
    const gag = data.callback_source
      ? callbackCandidates.find(
          (g) => g.setup === data.callback_source || g.tag === data.callback_source,
        )
      : undefined;
    if (gag) {
      session.addGag(gag.setup, gag.tag);
      data.callback_honored = true;
    } else {
      // Model labeled this a callback but callback_source matched no gag candidate (or was absent).
      // Flag it as unhonored rather than silently passing an unverified 'callback' through.
      data.callback_honored = false;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error(
          `[sensor-humor] callback_source "${data.callback_source ?? '(none)'}" did not match any gag candidate — callback_honored: false`,
        );
      }
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
