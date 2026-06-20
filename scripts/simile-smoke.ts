import { resetSession } from '../src/session.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { heckle } from '../src/tools/heckle.js';
import { moodSet } from '../src/tools/mood.js';

const inputs = [
  'Build failed after 47 attempts',
  'The entire codebase is one 3000-line file',
  'Deployed to production on Friday at 5pm',
  'Using var in 2026 with no types anywhere',
  'The database has no indexes and 50 million rows',
];

const SIMILE = /\blike a\b|\blike doing\b|\blike picking\b|\blike organizing\b|\blike flying\b|\bas if\b|\bas though\b|\bas a\b|\bsimilar to\b|\bresembles\b|\bakin to\b|\bcomparable to\b|\banalogous\b/i;

async function main() {
  for (const mood of ['dry', 'cheeky'] as const) {
    console.log('\n' + '='.repeat(60));
    console.log('MOOD: ' + mood.toUpperCase() + ' (comic_timing)');
    console.log('='.repeat(60));
    let hits = 0;

    for (const input of inputs) {
      resetSession();
      moodSet(mood);
      try {
        const result = await comicTiming(input, 'auto');
        const leak = SIMILE.test(result.rewrite);
        const tag = leak ? 'SIMILE LEAK' : 'CLEAN';
        if (!leak) hits++;
        console.log(`  [${tag}] ${input.substring(0, 40)} -> ${result.rewrite}`);
      } catch (e: any) {
        console.log(`  [ERROR] ${input.substring(0, 40)} -> ${e.message}`);
      }
    }
    console.log(`  >> ${mood} comic_timing: ${hits}/${inputs.length} clean`);

    console.log(`\n--- ${mood.toUpperCase()} (heckle) ---`);
    let hHits = 0;
    for (const input of inputs) {
      resetSession();
      moodSet(mood);
      try {
        const result = await heckle(input);
        const leak = SIMILE.test(result.heckle);
        const tag = leak ? 'SIMILE LEAK' : 'CLEAN';
        if (!leak) hHits++;
        console.log(`  [${tag}] ${input.substring(0, 40)} -> ${result.heckle}`);
      } catch (e: any) {
        console.log(`  [ERROR] ${input.substring(0, 40)} -> ${e.message}`);
      }
    }
    console.log(`  >> ${mood} heckle: ${hHits}/${inputs.length} clean`);
  }
  console.log('\n--- SIMILE SMOKE COMPLETE ---');
}

main();
