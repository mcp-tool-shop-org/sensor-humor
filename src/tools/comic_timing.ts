/**
 * comic_timing — the money tool.
 * Takes dry text + optional technique → rewrites with comedic delivery.
 */

import { z } from 'zod';
import { getSession, fullTraceEnabled } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy, recordSafetyFilterFire } from '../ollama.js';
import type { ComicTechnique, ComicTimingResult } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, hasHarshLeak, hasLanguageLeak, LANGUAGE_RETRY_SUFFIX, sanitizeForPrompt, voicedSafeFallback, STATIC_SAFE_FALLBACK } from '../validators.js';
import { ROAST_LABEL_PATTERN } from './roast.js';
import { buildTechniqueGuidance, isVerbatimCallback } from './techniques.js';

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

  // Which local safety/pattern gates fired this call — captured best-effort for the forensic trace
  // (ROADMAP v2.0 "Chain Trace Tool"), so debug_chain can show WHY a retry happened. Each block
  // below records its tag when it fires; the terminal gate records 'terminal-gate'.
  const validatorsTriggered: string[] = [];

  // Post-validation: reject meta-commentary leaks and retry once
  if (!result.fallback_reason && META_LEAK_PATTERN.test(result.data.rewrite)) {
    validatorsTriggered.push('meta-leak');
    result = await gen(`${userPrompt}\n\nOutput ONLY the comedic rewrite. No rules, no comments, no meta text. Pure comedy only.`);
  }

  // Simile/comparison leak check: retry once with negative prompt
  if (!result.fallback_reason && hasSimileLeak(result.data.rewrite)) {
    validatorsTriggered.push('simile');
    result = await gen(`${userPrompt}${SIMILE_RETRY_SUFFIX}`);
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (!result.fallback_reason && hasHarshLeak(result.data.rewrite)) {
    validatorsTriggered.push('harsh');
    result = await gen(`${userPrompt}\n\nNever use slurs, extreme insults, or derogatory terms. Keep savage but not cruel. Pure comedy only.`);
  }

  // Language-conformance leak check: retry once in English if the model code-switched out of the
  // Latin script (observed: qwen2.5:7b continuing a rewrite in Chinese). Detection-only — a
  // persistent code-switch is substituted by the terminal gate below, not mangled here.
  if (!result.fallback_reason && hasLanguageLeak(result.data.rewrite)) {
    validatorsTriggered.push('language');
    result = await gen(`${userPrompt}${LANGUAGE_RETRY_SUFFIX}`);
  }

  // FP-2: a callback that replays the planted setup verbatim is not a callback. Retry once
  // with a stronger vary instruction BEFORE the terminal gate, so a dirty retry cannot skip it.
  if (!result.fallback_reason && result.data.technique_used === 'callback') {
    const gagForVerbatim = result.data.callback_source
      ? callbackCandidates.find(
          (g) => g.setup === result.data.callback_source || g.tag === result.data.callback_source,
        )
      : undefined;
    if (gagForVerbatim && isVerbatimCallback(result.data.rewrite, gagForVerbatim.setup)) {
      validatorsTriggered.push('callback-verbatim');
      result = await gen(
        `${userPrompt}\n\nDo NOT repeat the callback setup verbatim. Escalate it or add a NEW twist so it lands as a fresh surprise, not a rerun.`,
      );
    }
  }

  // Roast pattern nudge: if roast mood and no verdict/label pattern, retry with hint.
  // Uses the entry-snapshot `mood`, not session.mood, so a concurrent mood_set during an await
  // above cannot flip this decision (tools-002).
  if (!result.fallback_reason && mood === 'roast' && !ROAST_LABEL_PATTERN.test(result.data.rewrite)) {
    validatorsTriggered.push('roast-label');
    result = await gen(`${userPrompt}\n\nStart with a label like "Verdict:", "Diagnosis:", or "Classification:" followed by 1 tight sentence.`);
  }

  // Terminal safety gate: the harsh filter, simile check, AND meta-leak check must be the LAST
  // word, after EVERY content-shaping retry above (including the roast-label retry), so a late
  // retry can never sneak a slur, comparison, or leaked prompt-internal past the filters and reach
  // the user. META_LEAK is included here (BK-B-02) so a persistent prompt/system-instruction leak
  // is substituted AND flagged degraded, instead of returning verbatim and unflagged.
  let gateFired = false;
  let languageGateFired = false;
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
    validatorsTriggered.push('terminal-gate');
    recordSafetyFilterFire();
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error('[sensor-humor] ComicTiming: terminal safety gate triggered, using safe fallback');
    }
  } else if (hasLanguageLeak(result.data.rewrite)) {
    // Language-conformance is the terminal word AFTER the safety gate (safety wins if both fire):
    // a code-switch that survived the retry is substituted with an input-free English static line.
    // Input-free (STATIC_SAFE_FALLBACK, not voicedSafeFallback) because the caller's OWN text may
    // be the non-Latin source, so interpolating it could re-introduce the code-switch. This is a
    // language degrade, NOT a safety substitution: it is attributed degraded_reason:'language' and
    // deliberately does NOT bump the safety-filter counter (which counts slur/simile/meta only).
    result.data.rewrite = STATIC_SAFE_FALLBACK[mood];
    result.data.technique_used = 'understatement';
    languageGateFired = true;
    validatorsTriggered.push('terminal-gate');
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error('[sensor-humor] ComicTiming: terminal language gate triggered, using English fallback');
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
    if (gag && !isVerbatimCallback(data.rewrite, gag.setup)) {
      session.addGag(gag.setup, gag.tag);
      data.callback_honored = true;
    } else if (gag) {
      // Matched a real gag but the rewrite is a verbatim replay of the setup — not honored,
      // and do not bump the fire count (a rerun is not a fire that should retire the gag).
      data.callback_honored = false;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error(
          `[sensor-humor] callback rewrite matched setup verbatim — callback_honored: false`,
        );
      }
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

  // Surface the degradation signal: backend failure (fallback_reason), a safety substitution, or a
  // language substitution. Backend reason wins (it is the root cause); safety wins over language.
  const degradedReason =
    result.fallback_reason ?? (gateFired ? 'safety-filter' : languageGateFired ? 'language' : undefined);
  if (degradedReason) {
    result.data.degraded = true;
    result.data.degraded_reason = degradedReason;
  }

  // Record ONE forensic trace entry for this call (ROADMAP v2.0 "Chain Trace Tool") so a dev can
  // reconstruct this generation via debug_chain. Light fields always; heavy fields (prompt/raw/
  // parsed) only under SENSOR_HUMOR_FULL_TRACE to bound the ring size. The gen-metadata fields are
  // optional (a mocked generateComedy omits them), so they pass through as undefined harmlessly.
  session.recordTrace({
    turn: session.turn_counter,
    tool: 'comic_timing',
    mood,
    input: text,
    output: result.data.rewrite,
    prompt_fingerprint: result.prompt_fingerprint,
    retries: result.retries,
    validators_triggered: validatorsTriggered,
    degraded_reason: degradedReason,
    latency_ms: result.latency_ms,
    ...(fullTraceEnabled()
      ? {
          prompt_text: `${systemPrompt}\n\n${userPrompt}`,
          raw_output: result.raw_output,
          parsed_output: result.data,
        }
      : {}),
  });

  return result.data;
}
