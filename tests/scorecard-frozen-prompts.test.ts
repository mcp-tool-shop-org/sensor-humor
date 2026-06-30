import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as dry_v1 from '../src/prompts/moods/dry.v1.prompt.js';
import * as roast_v1 from '../src/prompts/moods/roast.v1.prompt.js';
import * as chaotic_v1 from '../src/prompts/moods/chaotic.v1.prompt.js';
import * as cheeky_v1 from '../src/prompts/moods/cheeky.v1.prompt.js';
import * as cynic_v1 from '../src/prompts/moods/cynic.v1.prompt.js';
import * as zoomer_v1 from '../src/prompts/moods/zoomer.v1.prompt.js';

// v1.2 Prompt Stability Lock: the v1 prompts are FROZEN. A prompt may only change under a NEW
// version (drop a `<mood>.v2.prompt.ts`, register it, and prove the change with the regression
// scorecard) — never edited in place. This test pins each v1 fingerprint so an accidental in-place
// edit turns CI red and names the fix: bump to v2, don't mutate the frozen baseline.
type PromptModule = { SYSTEM_PROMPT: string; VOICE_NOTES: string };

const FROZEN: Record<string, { mod: PromptModule; fp: string }> = {
  'dry.v1': { mod: dry_v1, fp: '3fba259a39b6e076' },
  'roast.v1': { mod: roast_v1, fp: '1178373207a728e5' },
  'chaotic.v1': { mod: chaotic_v1, fp: 'b722fafd6657ab5a' },
  'cheeky.v1': { mod: cheeky_v1, fp: '082d23d89ec54c9c' },
  'cynic.v1': { mod: cynic_v1, fp: '6040e4cab659e28e' },
  'zoomer.v1': { mod: zoomer_v1, fp: '0c6f6f3e8a868dad' },
};

function fingerprint(m: PromptModule): string {
  return createHash('sha256').update(`${m.SYSTEM_PROMPT} ${m.VOICE_NOTES}`).digest('hex').slice(0, 16);
}

describe('frozen v1 prompts (prompt-stability lock)', () => {
  for (const [key, { mod, fp }] of Object.entries(FROZEN)) {
    it(`${key} matches its pinned fingerprint (to change it: bump to v2, never edit v1 in place)`, () => {
      expect(fingerprint(mod)).toBe(fp);
    });
  }
});
