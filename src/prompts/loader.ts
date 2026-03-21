/**
 * Prompt loader with version support.
 * Loads mood prompts from src/prompts/moods/{mood}.v{version}.prompt.ts
 * Falls back to v1 if requested version doesn't exist.
 */

import type { MoodStyle } from '../types.js';

interface MoodPromptModule {
  SYSTEM_PROMPT: string;
  VOICE_NOTES: string;
}

// Static import map — all mood/version combos loaded at startup.
// Dynamic import is cleaner but ESM + bundling makes it fragile.
// When adding v2 prompts, add them here.
import * as dry_v1 from './moods/dry.v1.prompt.js';
import * as roast_v1 from './moods/roast.v1.prompt.js';
import * as chaotic_v1 from './moods/chaotic.v1.prompt.js';
import * as cheeky_v1 from './moods/cheeky.v1.prompt.js';
import * as cynic_v1 from './moods/cynic.v1.prompt.js';
import * as zoomer_v1 from './moods/zoomer.v1.prompt.js';

const PROMPT_MAP: Record<string, MoodPromptModule> = {
  'dry.v1': dry_v1,
  'roast.v1': roast_v1,
  'chaotic.v1': chaotic_v1,
  'cheeky.v1': cheeky_v1,
  'cynic.v1': cynic_v1,
  'zoomer.v1': zoomer_v1,
};

function getPromptVersion(): string {
  return process.env.SENSOR_HUMOR_PROMPT_VERSION ?? '1';
}

export function loadMoodPrompt(mood: MoodStyle): MoodPromptModule {
  const version = getPromptVersion();
  const key = `${mood}.v${version}`;
  const fallbackKey = `${mood}.v1`;

  const module = PROMPT_MAP[key] ?? PROMPT_MAP[fallbackKey];
  if (!module) {
    throw new Error(`No prompt found for mood "${mood}" at version ${version} or v1`);
  }
  return module;
}

export function getMoodSystemPrompt(mood: MoodStyle): string {
  return loadMoodPrompt(mood).SYSTEM_PROMPT;
}

export function getMoodVoiceNotes(mood: MoodStyle): string {
  return loadMoodPrompt(mood).VOICE_NOTES;
}
