/**
 * Zoomer heckle batch test — 10 calls, scorecard.
 */
import { resetSession } from '../src/session.js';
import { moodSet } from '../src/tools/mood.js';
import { heckle } from '../src/tools/heckle.js';

const inputs = [
  'console.log is the only debugging tool',
  'using var in 2026',
  'no types anywhere in the project',
  'eslint disabled for the whole repo',
  'the entire codebase is one file',
  'git push --force to main',
  'no tests, no CI, no docs',
  'nested ternaries 6 levels deep',
  'global mutable state everywhere',
  'copy-pasted the same function 12 times',
];

resetSession();
moodSet('zoomer');

let hits = 0;
for (let i = 0; i < inputs.length; i++) {
  const start = Date.now();
  try {
    const result = await heckle(inputs[i]);
    const ms = Date.now() - start;
    const text = result.heckle;

    // Score: caps block present?
    const hasCaps = /[A-Z]{2,}/.test(text);
    // Score: no question marks?
    const noQuestion = !text.includes('?');
    // Score: no simile/metaphor?
    const noSimile = !/\blike a\b|\bas if\b|\bas though\b/i.test(text);
    // Score: has some lowercase text (reaction opener)?
    const hasLower = /[a-z]{3,}/.test(text);

    const pass = hasCaps && noQuestion && noSimile && hasLower;
    if (pass) hits++;

    const issues: string[] = [];
    if (!hasCaps) issues.push('no caps');
    if (!noQuestion) issues.push('question');
    if (!noSimile) issues.push('simile leak');
    if (!hasLower) issues.push('all caps');

    const verdict = pass ? 'PASS' : 'FAIL';
    console.log(`[${verdict}] "${inputs[i]}" (${ms}ms)`);
    console.log(`  -> ${text}`);
    if (issues.length) console.log(`  Issues: ${issues.join(', ')}`);
    console.log('');
  } catch (err) {
    console.log(`[ERROR] "${inputs[i]}": ${(err as Error).message}\n`);
  }
}

console.log(`>> zoomer heckle: ${hits}/${inputs.length} (${Math.round(hits / inputs.length * 100)}%)`);
