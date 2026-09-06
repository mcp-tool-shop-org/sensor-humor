/**
 * heckle — short, punchy reaction. Quick jab, no config needed.
 * Respects current mood's voice pattern.
 */

import { z } from 'zod';
import { getSession, fullTraceEnabled } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy, recordSafetyFilterFire } from '../ollama.js';
import type { HeckleResult, MoodStyle } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, hasHarshLeak, hasLanguageLeak, LANGUAGE_RETRY_SUFFIX, sanitizeForPrompt } from '../validators.js';

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

// Record<MoodStyle, string> so adding a mood fails the build until it has a static fallback.
const HECKLE_STATIC_FALLBACK: Record<MoodStyle, string> = {
  roast: 'Verdict: noted.',
  cynic: 'Of course.',
  cheeky: 'Oh honey.',
  chaotic: 'The server weeps.',
  zoomer: 'cooked fr.',
  dry: "That's a choice.",
};

/**
 * Mood-voiced safe fallback for heckle (shorter punch-line shape than comic_timing/roast).
 * Collapses to a static input-free line if the caller's input itself carries a slur/simile,
 * so the fallback never echoes a banned token back.
 */
function heckleFallback(mood: MoodStyle, target: string): string {
  const t = sanitizeForPrompt(target);
  let candidate: string;
  switch (mood) {
    case 'roast': candidate = `Verdict: ${t}.`; break;
    case 'cynic': candidate = `Of course: ${t}.`; break;
    case 'cheeky': candidate = `Oh honey, ${t}.`; break;
    case 'chaotic': candidate = `${t}. The server weeps.`; break;
    case 'zoomer': candidate = `${t}, cooked fr.`; break;
    default: candidate = `${t}. That's a choice.`;
  }
  // Collapse to the static input-free line if interpolating the caller's target would echo a slur,
  // a simile, OR non-Latin/code-switched text (the last so a Chinese/Cyrillic target can't leak
  // through the backend-down fallback path).
  if (hasHarshLeak(candidate) || hasSimileLeak(candidate) || hasLanguageLeak(candidate)) {
    return HECKLE_STATIC_FALLBACK[mood];
  }
  return candidate;
}

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

  // Voiced fallback so a backend-down heckle reads as an in-voice stock line, not a bare
  // echo of the caller's input (OBS-06).
  const fallback: z.infer<typeof HeckleSchema> = {
    heckle: heckleFallback(mood, target),
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

  // Track ANY safety substitution (intermediate fallback OR terminal gate) so the degraded signal
  // fires whenever a safe line replaced the model output, not only on the terminal gate.
  let safetySubstituted = false;
  // Separate flag for a LANGUAGE (code-switch) substitution — degraded_reason:'language', distinct
  // from safety so it never bumps the safety-filter counter.
  let languageSubstituted = false;

  // Which local safety/pattern gates fired this call — captured best-effort for the forensic trace
  // (ROADMAP v2.0 "Chain Trace Tool"), so debug_chain shows WHY a retry/substitution happened.
  const validatorsTriggered: string[] = [];

  // Simile/comparison leak check: retry once with negative prompt
  if (!result.fallback_reason && hasSimileLeak(result.data.heckle)) {
    validatorsTriggered.push('simile');
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
      result.data.heckle = heckleFallback(mood, target);
      safetySubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Heckle: simile leak persisted after retry, using safe fallback');
      }
    }
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (!result.fallback_reason && hasHarshLeak(result.data.heckle)) {
    validatorsTriggered.push('harsh');
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
    if (hasHarshLeak(result.data.heckle)) {
      result.data.heckle = heckleFallback(mood, target);
      safetySubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Heckle: harsh filter persisted after retry, using safe fallback');
      }
    }
  }

  // Language-conformance filter: retry once in English if the heckle code-switched out of the Latin
  // script, then substitute an input-free English line if it persists. A conformance degrade
  // (degraded_reason:'language'), distinct from the safety filters — its own flag, no safety counter.
  if (!result.fallback_reason && hasLanguageLeak(result.data.heckle)) {
    validatorsTriggered.push('language');
    const cleanPrompt = `${userPrompt}${LANGUAGE_RETRY_SUFFIX}`;
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
    // Input-free static line (NOT heckleFallback) — the caller's target may be the non-Latin source.
    if (hasLanguageLeak(result.data.heckle)) {
      result.data.heckle = HECKLE_STATIC_FALLBACK[mood];
      languageSubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Heckle: language leak persisted after retry, using English fallback');
      }
    }
  }

  // Terminal safety gate: harsh + simile are the last word, so a late retry cannot
  // re-introduce a banned pattern an earlier filter already cleared.
  if (hasHarshLeak(result.data.heckle) || hasSimileLeak(result.data.heckle)) {
    result.data.heckle = heckleFallback(mood, target);
    safetySubstituted = true;
    validatorsTriggered.push('terminal-gate');
  } else if (hasLanguageLeak(result.data.heckle)) {
    // Terminal language gate (only when no safety pattern fired — safety wins). Input-free English.
    result.data.heckle = HECKLE_STATIC_FALLBACK[mood];
    languageSubstituted = true;
    validatorsTriggered.push('terminal-gate');
  }
  if (safetySubstituted) recordSafetyFilterFire();

  // Update session
  session.pushBit(result.data.heckle, 'heckle');

  const degradedReason =
    result.fallback_reason ?? (safetySubstituted ? 'safety-filter' : languageSubstituted ? 'language' : undefined);

  // Record ONE forensic trace entry for this call (ROADMAP v2.0 "Chain Trace Tool"). Light fields
  // always; heavy fields only under SENSOR_HUMOR_FULL_TRACE. gen-metadata fields are optional (a
  // mocked generateComedy omits them) and pass through as undefined harmlessly.
  session.recordTrace({
    turn: session.turn_counter,
    tool: 'heckle',
    mood,
    input: target,
    output: result.data.heckle,
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

  return {
    heckle: result.data.heckle,
    mood,
    ...(degradedReason ? { degraded: true, degraded_reason: degradedReason } : {}),
  };
}
