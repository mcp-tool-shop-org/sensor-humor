/**
 * Internal capture sweep for comedic-moods-v0 (in-repo grounding utility).
 *
 * Runs the shipped comedy tools across all 6 moods with SENSOR_HUMOR_CAPTURE set, producing a real
 * internal JSONL batch to look at + validate + enrich. Local + free (Ollama qwen2.5:7b).
 *
 * Independence (Slice 2.3 fix): the session is RESET before every generation, then the mood is re-set,
 * so each row is a fully independent generation event (the schema lock's "one row = one generation").
 * The Slice-1 sweep shared one session across all moods, which (a) let catchphrase_generate REUSE the
 * first mood's minted phrase (5/6 rows collapsed to one catchphrase) and (b) leaked session state
 * between moods (mood-bleed). A clean session per call removes both, and lets us run MULTIPLE inputs
 * per tool without the second catchphrase in a mood reusing the first.
 *
 * Usage:  SENSOR_HUMOR_CAPTURE=<path.jsonl> npx tsx scripts/capture-internal-sweep.ts
 *         (optional) SWEEP_INPUTS=<N>  cap inputs per tool (default: all) for a quicker run
 */
import { MOOD_STYLES } from '../src/types.js';
import { moodSet } from '../src/tools/mood.js';
import { resetSession } from '../src/session.js';
import { roast } from '../src/tools/roast.js';
import { heckle } from '../src/tools/heckle.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { catchphraseGenerate } from '../src/tools/catchphrase.js';

/**
 * Varied dev-domain input pools (sensor-humor's native register: roasting code / dev situations). A
 * placeholder corpus the director can revise before any bulk build — kept in-distribution so the run
 * grounds the pipeline on realistic inputs, and varied so the batch exercises the tools beyond one line.
 */
const INPUTS = {
  roast: [
    'a 3000-line file with zero comments',
    'a function named doStuff2 that returns any',
    'a 400-line YAML config with no schema',
    'a git history that is all "fix" and "final fix"',
  ],
  heckle: [
    'catch (e) {}  // the error is quietly swallowed',
    'it works on my machine',
    'we will add tests later',
    'a PR titled "minor changes" with 4,000 lines',
  ],
  comic: [
    'deploying to prod at 4:55pm on a Friday',
    'the CI passed locally but failed on main',
    'a hotfix for the hotfix for the hotfix',
    'reading the docs only after the outage',
  ],
  catchphrase: [
    'another flaky CI run',
    'a merge conflict in the lockfile',
    'standup ran 45 minutes again',
    'the staging environment is down (again)',
  ],
} as const;

const pad = (s: string) => s.padEnd(9);

/** Reset to a clean session and set the mood — the per-generation independence step. */
function freshMood(mood: string): void {
  resetSession();
  moodSet(mood);
}

async function main(): Promise<void> {
  if (!process.env.SENSOR_HUMOR_CAPTURE) {
    console.error('[sweep] SENSOR_HUMOR_CAPTURE is not set — nothing would be captured. Aborting.');
    process.exit(1);
  }
  const cap = process.env.SWEEP_INPUTS ? Math.max(1, parseInt(process.env.SWEEP_INPUTS, 10) || 1) : Infinity;
  const take = <T>(xs: readonly T[]) => xs.slice(0, cap);

  console.error(`[sweep] capturing to ${process.env.SENSOR_HUMOR_CAPTURE}`);
  let n = 0;
  for (const mood of MOOD_STYLES) {
    for (const input of take(INPUTS.roast)) {
      freshMood(mood);
      const r = await roast(input, 'code');
      console.error(`[${pad(mood)}] roast : ${r.roast}`);
      n++;
    }
    for (const input of take(INPUTS.heckle)) {
      freshMood(mood);
      const h = await heckle(input);
      console.error(`[${pad(mood)}] heckle: ${h.heckle}`);
      n++;
    }
    for (const input of take(INPUTS.comic)) {
      freshMood(mood);
      const c = await comicTiming(input);
      console.error(`[${pad(mood)}] comic : ${c.rewrite}`);
      n++;
    }
    for (const input of take(INPUTS.catchphrase)) {
      freshMood(mood);
      const p = await catchphraseGenerate(input);
      console.error(`[${pad(mood)}] phrase: ${p.phrase}`);
      n++;
    }
  }
  console.error(`\n[sweep] done — ${n} independent generations across ${MOOD_STYLES.length} moods.`);
}

main().catch((e) => {
  console.error('[sweep] failed:', e);
  process.exit(1);
});
