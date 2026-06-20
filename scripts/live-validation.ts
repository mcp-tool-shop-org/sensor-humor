/**
 * Live validation run — 15 calls across all 6 moods.
 * Requires Ollama running locally with qwen2.5:7b.
 */

import { resetSession, getSession } from '../src/session.js';
import { moodSet } from '../src/tools/mood.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { roast } from '../src/tools/roast.js';
import { heckle } from '../src/tools/heckle.js';
import { catchphraseGenerate, catchphraseCallback } from '../src/tools/catchphrase.js';
import type { MoodStyle } from '../src/types.js';

interface Call {
  mood: MoodStyle;
  fn: () => Promise<unknown>;
  label: string;
  input: string;
}

const calls: Call[] = [
  { mood: 'dry', fn: () => comicTiming('null pointer exception at line 847 in production', 'understatement'), label: 'comic_timing', input: 'null pointer at line 847' },
  { mood: 'roast', fn: () => roast('800-line god function with 47 parameters', 'code'), label: 'roast', input: '800-line god function' },
  { mood: 'cynic', fn: () => comicTiming('config broke again after the third deploy today', 'auto'), label: 'comic_timing', input: 'config broke again' },
  { mood: 'cheeky', fn: () => heckle('forgot to commit the .env file again'), label: 'heckle', input: 'forgot .env' },
  { mood: 'chaotic', fn: () => comicTiming('docker compose works locally but fails silently in CI', 'escalation'), label: 'comic_timing', input: 'docker fails in CI' },
  { mood: 'zoomer', fn: () => roast('var everywhere, no types, jQuery in 2026', 'code'), label: 'roast', input: 'var + jQuery in 2026' },
  { mood: 'dry', fn: () => catchphraseGenerate('legacy code migration'), label: 'catchphrase.gen', input: 'legacy migration' },
  { mood: 'cynic', fn: () => comicTiming('the test suite takes 45 minutes to run', 'auto'), label: 'comic_timing', input: '45 min test suite' },
  { mood: 'cheeky', fn: () => comicTiming('deployed to production on a Friday at 5pm', 'misdirection'), label: 'comic_timing', input: 'Friday 5pm deploy' },
  { mood: 'zoomer', fn: () => heckle('console.log is the only debugging tool'), label: 'heckle', input: 'console.log debugging' },
  { mood: 'chaotic', fn: () => roast('the database has no indexes on a 50M row table', 'code'), label: 'roast', input: 'no indexes 50M rows' },
  { mood: 'roast', fn: () => comicTiming('git push --force to main at 4:55pm Friday', 'auto'), label: 'comic_timing', input: 'force push to main' },
  { mood: 'dry', fn: () => catchphraseCallback(), label: 'catchphrase.cb', input: 'callback' },
  { mood: 'zoomer', fn: () => comicTiming('eslint disabled for the entire project', 'auto'), label: 'comic_timing', input: 'eslint disabled' },
  { mood: 'cynic', fn: () => heckle('prisma schema is 2000 lines in one file'), label: 'heckle', input: '2000 line prisma' },
];

resetSession();

for (let i = 0; i < calls.length; i++) {
  const { mood, fn, label, input } = calls[i];
  moodSet(mood);
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`[${i + 1}/${calls.length}] ${mood.toUpperCase()} | ${label} | ${ms}ms`);
    console.log(`  Input: ${input}`);

    // Extract the comedy text from whatever shape the result is
    const r = result as Record<string, unknown>;
    const text = r.rewrite ?? r.roast ?? r.heckle ?? r.phrase ?? JSON.stringify(r);
    console.log(`  Output: ${text}`);
    console.log('');
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[${i + 1}/${calls.length}] ${mood.toUpperCase()} | ${label} | ${ms}ms | ERROR`);
    console.log(`  ${(err as Error).message}`);
    console.log('');
  }
}

const session = getSession();
console.log('=== SESSION SUMMARY ===');
console.log(`Turns: ${session.turn_counter}`);
console.log(`Recent bits: ${session.recent_bits.length}`);
console.log(`Running gags: ${session.running_gags.length}`);
console.log(`Catchphrases: ${[...session.catchphrases.entries()].map(([k, v]) => `"${k}" (${v}x)`).join(', ') || 'none'}`);
