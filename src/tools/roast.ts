/**
 * roast — affectionate burns with severity rating.
 * Respects current mood's voice pattern. Label enforcement only in roast mood.
 */

import { z } from 'zod';
import { getSession, fullTraceEnabled } from '../session.js';
import { baseSystemPrefix } from '../prompts/base.js';
import { overlayCoexistenceBlock } from '../prompts/overlay.js';
import { getMoodSystemPrompt } from '../prompts/loader.js';
import { generateComedy, recordSafetyFilterFire } from '../ollama.js';
import type { RoastContext, RoastResult, MoodStyle, ComicTechnique } from '../types.js';
import { hasSimileLeak, SIMILE_RETRY_SUFFIX, hasHarshLeak, hasLanguageLeak, LANGUAGE_RETRY_SUFFIX, sanitizeForPrompt, voicedSafeFallback, STATIC_SAFE_FALLBACK } from '../validators.js';
import {
  assertMoodTechnique,
  buildTechniqueGuidance,
  isVerbatimCallback,
  matchCallbackGag,
  resolveOverlayTechnique,
} from './techniques.js';

const RoastSchema = z.object({
  roast: z.string().max(200),
  severity: z.number().int().min(1).max(5),
  callback_source: z.string().optional(),
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
    callback_source: {
      type: 'string',
      description: 'If the overlay is callback, the planted gag tag or setup being referenced',
    },
  },
  required: ['roast', 'severity'],
};

export const ROAST_LABEL_PATTERN = /^(Verdict|Diagnosis|Official status|Classification|Case closed|Exhibit A|File under|Status|Designation):/i;
const COMPARISON_LEAK = /\blike a\b|\bas a\b|\bas if\b|\bsimilar to\b|\bresembles\b|\bband[\s-]?aid\b|\bbandaid\b|\bblanket\b|\bcoffee break\b/i;

/** Build roast-specific guidance that respects mood voice. */
function buildRoastGuidance(mood: MoodStyle, technique: ComicTechnique, hasCallbacks: boolean): string {
  const overlay =
    technique === 'auto' ? '' : `\nTECHNIQUE OVERLAY (primary mood pattern still wins): ${buildTechniqueGuidance(technique, hasCallbacks)}`;
  if (mood === 'roast') {
    return `\nROAST MODE: Assign severity 1-5 based on how egregious the flaw is (1=mild pattern, 3=notable code smell, 5=architectural crime). Start with ONE label — pick exactly one of: "Verdict:", "Diagnosis:", "Classification:", "Case closed:", "File under:", "Official status:". Do NOT combine labels.${overlay}`;
  }
  // All other moods: let the mood prompt handle voice, just add severity guidance
  return `\nROAST MODE: Assign severity 1-5 based on how egregious the flaw is. Deliver the roast in your current mood voice — follow the mood prompt's pattern exactly.${overlay}`;
}

/** Build roast user prompt that respects mood voice. */
function buildRoastUserPrompt(
  mood: MoodStyle,
  target: string,
  context: RoastContext,
  techniqueGuide: string,
  callbackContext: string,
): string {
  const extra = techniqueGuide === '' ? '' : `\nTECHNIQUE: ${techniqueGuide}${callbackContext}\n`;
  if (mood === 'roast') {
    return `Roast the following ${context}. Pick ONE label (Verdict: OR Diagnosis: OR Classification:) then deliver 1 tight sentence.${extra}\nTARGET:\n${sanitizeForPrompt(target)}\n\nRespond with JSON only.`;
  }
  // Other moods: roast the target using mood's own pattern
  return `Roast the following ${context}. Use your mood's delivery pattern — do NOT use "Verdict:" or other roast labels.${extra}\nTARGET:\n${sanitizeForPrompt(target)}\n\nRespond with JSON only.`;
}

export async function roast(
  target: string,
  context: RoastContext = 'code',
  technique: ComicTechnique = 'auto',
): Promise<RoastResult> {
  const session = getSession();
  const mood = session.mood;
  // F-4a7e6c91: validation before tick — a refused overlay must not age gag distance.
  assertMoodTechnique(mood, technique);
  session.tick();

  const callbackCandidates = session.findCallbackCandidates(target);
  const hasEligibleGags = callbackCandidates.length > 0;
  const effective = resolveOverlayTechnique(technique, hasEligibleGags);
  const hasCallbacks = hasEligibleGags || session.recent_bits.length > 0;
  const techniqueGuide = effective === 'auto' ? '' : buildTechniqueGuidance(effective, hasEligibleGags);
  const callbackContext =
    effective === 'callback' && hasEligibleGags
      ? `\nCALLBACK MATERIAL AVAILABLE:\n${callbackCandidates.map((g) => `- "${sanitizeForPrompt(g.setup)}" (tag: ${sanitizeForPrompt(g.tag)})`).join('\n')}`
      : '';

  const coexistence = overlayCoexistenceBlock(mood, effective);
  const systemPrompt = [
    baseSystemPrefix(),
    getMoodSystemPrompt(mood),
    buildRoastGuidance(mood, effective, hasCallbacks),
    coexistence,
    `\nSESSION CONTEXT:\n${session.stateSummary()}`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const userPrompt = buildRoastUserPrompt(mood, target, context, techniqueGuide, callbackContext);

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

  // Which local safety/pattern gates fired this call — captured best-effort for the forensic trace
  // (ROADMAP v2.0 "Chain Trace Tool"), so debug_chain shows WHY a retry/substitution happened.
  const validatorsTriggered: string[] = [];

  // Label pattern enforcement: ONLY in roast mood. Skip when the backend already fell back —
  // another generateComedy would just re-hit a dead daemon (the unlabeled canned line is already
  // the terminal output).
  if (!result.fallback_reason && mood === 'roast' && !ROAST_LABEL_PATTERN.test(result.data.roast)) {
    validatorsTriggered.push('roast-label');
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

  // Track ANY safety substitution (an intermediate fallback OR the terminal gate) so the degraded
  // signal fires whenever a safe line replaced the model output — not only on the terminal gate.
  // Without this, an intermediate fallback that cleans the output leaves the response unflagged.
  let safetySubstituted = false;
  // Separate flag for a LANGUAGE (code-switch) substitution — a conformance degrade attributed
  // degraded_reason:'language', distinct from safety so it never bumps the safety-filter counter.
  let languageSubstituted = false;

  // Comparison/metaphor/simile leak check: retry once with negative prompt
  if (!result.fallback_reason && (COMPARISON_LEAK.test(result.data.roast) || hasSimileLeak(result.data.roast))) {
    validatorsTriggered.push('simile');
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
    // If still leaking after retry, use mood-specific safe fallback
    if (COMPARISON_LEAK.test(result.data.roast) || hasSimileLeak(result.data.roast)) {
      result.data.roast = voicedSafeFallback(mood, target);
      safetySubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Roast: simile leak persisted after retry, using safe fallback');
      }
    }
  }

  // Harshness filter: reject slurs/extreme insults and retry once
  if (!result.fallback_reason && hasHarshLeak(result.data.roast)) {
    validatorsTriggered.push('harsh');
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
    // Safe fallback if harsh filter still triggers after retry
    if (hasHarshLeak(result.data.roast)) {
      result.data.roast = voicedSafeFallback(mood, target);
      safetySubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Roast: harsh filter persisted after retry, using safe fallback');
      }
    }
  }

  // Language-conformance filter: retry once in English if the output code-switched out of the Latin
  // script, then substitute an input-free English line if it persists. Distinct from the safety
  // filters — a code-switch is a conformance degrade, not a slur/simile — so it uses its own flag
  // and is attributed degraded_reason:'language' (and never bumps the safety-filter counter).
  if (!result.fallback_reason && hasLanguageLeak(result.data.roast)) {
    validatorsTriggered.push('language');
    const cleanPrompt = `${userPrompt}${LANGUAGE_RETRY_SUFFIX}`;
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
    // Input-free static line (NOT voicedSafeFallback) — the caller's target may be the non-Latin
    // source, so interpolating it could re-introduce the code-switch.
    if (hasLanguageLeak(result.data.roast)) {
      result.data.roast = STATIC_SAFE_FALLBACK[mood];
      languageSubstituted = true;
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Roast: language leak persisted after retry, using English fallback');
      }
    }
  }

  // F-8c2e1a47 / FP-2: verbatim callback overlay retry before the terminal gate.
  if (!result.fallback_reason && effective === 'callback') {
    const gagForVerbatim = matchCallbackGag(result.data.callback_source, callbackCandidates);
    if (gagForVerbatim && isVerbatimCallback(result.data.roast, gagForVerbatim.setup)) {
      validatorsTriggered.push('callback-verbatim');
      result = await generateComedy<z.infer<typeof RoastSchema>>(
        {
          systemPrompt,
          userPrompt: `${userPrompt}\n\nDo NOT repeat the callback setup verbatim. Escalate it or add a NEW twist so it lands as a fresh surprise, not a rerun.`,
          schema: RoastSchema,
          jsonSchema: ROAST_JSON_SCHEMA,
          numPredict: ROAST_NUM_PREDICT,
        },
        fallback,
      );
    }
  }

  // Terminal safety gate: harsh + comparison + simile are the last word, so a late retry
  // cannot re-introduce a banned pattern an earlier filter already cleared.
  if (
    hasHarshLeak(result.data.roast) ||
    hasSimileLeak(result.data.roast) ||
    COMPARISON_LEAK.test(result.data.roast)
  ) {
    // If the gate fired on the CALLER-SPECIFIC COMPARISON_LEAK pattern, the interpolating
    // voicedSafeFallback (which only re-checks hasHarshLeak/hasSimileLeak, NOT COMPARISON_LEAK)
    // could re-emit the very COMPARISON_LEAK word if it appears in `target` (e.g. a benign
    // 'blanket'/'coffee break'). Use the input-free STATIC_SAFE_FALLBACK so the returned line
    // cannot re-contain the pattern that fired the gate — terminal gate is the last word (server-003).
    result.data.roast = COMPARISON_LEAK.test(result.data.roast)
      ? STATIC_SAFE_FALLBACK[mood]
      : voicedSafeFallback(mood, target);
    safetySubstituted = true;
    validatorsTriggered.push('terminal-gate');
  } else if (hasLanguageLeak(result.data.roast)) {
    // Terminal language gate (runs only when no safety pattern fired — safety wins). Input-free
    // English static line, attributed 'language', so a code-switch introduced by a late retry
    // cannot reach the user or the dataset as a clean generation.
    result.data.roast = STATIC_SAFE_FALLBACK[mood];
    languageSubstituted = true;
    validatorsTriggered.push('terminal-gate');
  }
  if (safetySubstituted) recordSafetyFilterFire();

  // Clamp severity. The schema already constrains 1-5, so this only guards the fallback
  // literal and any future schema relaxation — defensive, intentionally redundant.
  const severity = Math.max(1, Math.min(5, result.data.severity));

  let callback_honored: boolean | undefined;
  const callback_source = result.data.callback_source;
  if (
    effective === 'callback' &&
    !safetySubstituted &&
    !languageSubstituted &&
    !result.fallback_reason
  ) {
    const gag = matchCallbackGag(callback_source, callbackCandidates);
    if (gag && !isVerbatimCallback(result.data.roast, gag.setup)) {
      session.addGag(gag.setup, gag.tag);
      callback_honored = true;
    } else {
      callback_honored = false;
    }
  }

  // Update session
  session.pushBit(result.data.roast, 'roast');

  const degradedReason =
    result.fallback_reason ?? (safetySubstituted ? 'safety-filter' : languageSubstituted ? 'language' : undefined);

  // Record ONE forensic trace entry for this call (ROADMAP v2.0 "Chain Trace Tool"). Light fields
  // always; heavy fields only under SENSOR_HUMOR_FULL_TRACE. gen-metadata fields are optional (a
  // mocked generateComedy omits them) and pass through as undefined harmlessly.
  session.recordTrace({
    turn: session.turn_counter,
    tool: 'roast',
    mood,
    input: target,
    output: result.data.roast,
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
    roast: result.data.roast,
    severity,
    mood,
    technique_used: effective,
    ...(callback_source ? { callback_source } : {}),
    ...(callback_honored !== undefined ? { callback_honored } : {}),
    ...(degradedReason ? { degraded: true, degraded_reason: degradedReason } : {}),
  };
}
