/**
 * Slice-1 internal capture sweep for comedic-moods-v0 (UNTRACKED grounding utility).
 *
 * Runs the shipped comedy tools across all 6 moods with SENSOR_HUMOR_CAPTURE set, producing a real
 * internal JSONL batch to look at. Local + free (Ollama qwen2.5:7b). Non-committal — this file is a
 * throwaway grounding run; the productionized sweep/build lives in the dataset repo once its home is
 * decided.
 *
 * Usage:  SENSOR_HUMOR_CAPTURE=<path.jsonl> npx tsx scripts/capture-internal-sweep.ts
 */
import { MOOD_STYLES } from '../src/types.js';
import { moodSet } from '../src/tools/mood.js';
import { roast } from '../src/tools/roast.js';
import { heckle } from '../src/tools/heckle.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { catchphraseGenerate } from '../src/tools/catchphrase.js';

// Starter dev-input pool (one per tool) — a placeholder corpus the director can revise before any
// bulk build. Deliberately in sensor-humor's native domain (roasting code / dev situations).
const INPUTS = {
  roast: 'a 3000-line file with zero comments',
  heckle: 'catch (e) {}  // the error is quietly swallowed',
  comic: 'deploying to prod at 4:55pm on a Friday',
  catchphrase: 'another flaky CI run',
} as const;

const pad = (s: string) => s.padEnd(8);

async function main(): Promise<void> {
  if (!process.env.SENSOR_HUMOR_CAPTURE) {
    console.error('[sweep] SENSOR_HUMOR_CAPTURE is not set — nothing would be captured. Aborting.');
    process.exit(1);
  }
  console.error(`[sweep] capturing to ${process.env.SENSOR_HUMOR_CAPTURE}`);
  let n = 0;
  for (const mood of MOOD_STYLES) {
    moodSet(mood);
    const r = await roast(INPUTS.roast, 'code');
    const h = await heckle(INPUTS.heckle);
    const c = await comicTiming(INPUTS.comic);
    const p = await catchphraseGenerate(INPUTS.catchphrase);
    n += 4;
    console.error(`\n[${pad(mood)}] roast : ${r.roast}`);
    console.error(`[${pad('')}] heckle: ${h.heckle}`);
    console.error(`[${pad('')}] comic : ${c.rewrite}`);
    console.error(`[${pad('')}] phrase: ${p.phrase}`);
  }
  console.error(`\n[sweep] done — ${n} generations across ${MOOD_STYLES.length} moods.`);
}

main().catch((e) => {
  console.error('[sweep] failed:', e);
  process.exit(1);
});
