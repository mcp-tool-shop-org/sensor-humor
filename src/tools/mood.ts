/**
 * mood.set and mood.get tool implementations.
 */

import { getSession } from '../session.js';
import {
  MOOD_DESCRIPTIONS,
  MOOD_STYLES,
  type MoodGetResult,
  type MoodSetResult,
  type MoodStyle,
} from '../types.js';
import { getMoodVoiceNotes } from '../prompts/loader.js';

/**
 * mood_set result, structurally extending MoodSetResult with transition feedback (b-tools-004):
 * `previous_mood` is the mood in effect BEFORE this call, and `changed` is `previous_mood !== mood`
 * (false on a no-op re-set of the current mood). Declared locally rather than in types.ts (which
 * this agent does not own); both fields are additive, so existing MoodSetResult callers are
 * unaffected.
 */
type MoodSetResultWithTransition = MoodSetResult & {
  previous_mood: MoodStyle;
  changed: boolean;
};

export function moodSet(style: string): MoodSetResultWithTransition {
  if (!MOOD_STYLES.includes(style as MoodStyle)) {
    throw new Error(
      `Invalid mood "${style}". Valid moods: ${MOOD_STYLES.join(', ')}`,
    );
  }

  const mood = style as MoodStyle;
  const session = getSession();
  // Capture the mood BEFORE the transition so the caller can confirm a real change vs. a no-op:
  // setting 'roast' while already 'roast' returns changed=false, an actual transition returns
  // changed=true. Without this the result is byte-identical either way, and an agent driving the
  // session can't tell whether its set took effect (b-tools-004).
  const previous_mood = session.mood;
  session.setMood(mood);

  return {
    mood,
    description: MOOD_DESCRIPTIONS[mood],
    voice_notes: getMoodVoiceNotes(mood),
    previous_mood,
    changed: previous_mood !== mood,
  };
}

export function moodGet(): MoodGetResult {
  const session = getSession();
  return {
    mood: session.mood,
    description: MOOD_DESCRIPTIONS[session.mood],
    session_gag_count: session.running_gags.length,
  };
}
