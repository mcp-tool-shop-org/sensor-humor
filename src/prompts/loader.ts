/**
 * Prompt loader with version support.
 * Loads mood prompts from src/prompts/moods/{mood}.v{version}.prompt.ts
 * Falls back to v1 if requested version doesn't exist.
 */

import { MOOD_STYLES, type MoodStyle } from '../types.js';

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

// Fail fast at startup if a mood is missing its v1 prompt, rather than throwing mid-call the
// first time that mood is invoked (a missing prompt is a build/wiring error, not a runtime one).
for (const mood of MOOD_STYLES) {
  if (!PROMPT_MAP[`${mood}.v1`]) {
    throw new Error(`[sensor-humor] No v1 prompt registered for mood "${mood}" — add it to PROMPT_MAP in loader.ts`);
  }
}

export function getPromptVersion(): string {
  return process.env.SENSOR_HUMOR_PROMPT_VERSION ?? '1';
}

// loadMoodPrompt runs on every tool call, so a version-downgrade warning is emitted at most
// once per mood+version combo to surface the misconfig without spamming stderr.
const _warnedDowngrades = new Set<string>();

export function loadMoodPrompt(mood: MoodStyle): MoodPromptModule {
  const version = getPromptVersion();
  const key = `${mood}.v${version}`;
  const fallbackKey = `${mood}.v1`;

  const module = PROMPT_MAP[key];
  if (module) return module;

  // Requested version is missing — fall back to v1, but surface the downgrade so an
  // operator who set SENSOR_HUMOR_PROMPT_VERSION knows their A/B knob is not active.
  if (version !== '1' && !_warnedDowngrades.has(key)) {
    _warnedDowngrades.add(key);
    console.error(
      `[sensor-humor] No "${mood}" prompt at v${version}; falling back to v1`,
    );
  }
  const fallback = PROMPT_MAP[fallbackKey];
  if (!fallback) {
    throw new Error(`No prompt found for mood "${mood}" at version ${version} or v1`);
  }
  return fallback;
}

export function getMoodSystemPrompt(mood: MoodStyle): string {
  return loadMoodPrompt(mood).SYSTEM_PROMPT;
}

export function getMoodVoiceNotes(mood: MoodStyle): string {
  return loadMoodPrompt(mood).VOICE_NOTES;
}
