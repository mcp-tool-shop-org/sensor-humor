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

export function moodSet(style: string): MoodSetResult {
  if (!MOOD_STYLES.includes(style as MoodStyle)) {
    throw new Error(
      `Invalid mood "${style}". Valid moods: ${MOOD_STYLES.join(', ')}`,
    );
  }

  const mood = style as MoodStyle;
  const session = getSession();
  session.setMood(mood);

  return {
    mood,
    description: MOOD_DESCRIPTIONS[mood],
    voice_notes: getMoodVoiceNotes(mood),
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
