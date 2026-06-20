/**
 * A/B Model Scorecard — runs the same prompts on two models for comparison.
 * Usage: npx tsx scripts/ab-scorecard.ts
 */

import { Ollama } from 'ollama';
import { baseSystemPrefix } from '../src/prompts/base.js';
import { getMoodSystemPrompt } from '../src/prompts/loader.js';
import type { MoodStyle } from '../src/types.js';

const MODELS = ['qwen2.5:7b'];

const MOODS_TO_TEST: MoodStyle[] = ['cynic', 'cheeky', 'chaotic'];

const TEST_INPUTS = [
  'eslint disabled for the whole file',
  'The Prisma schema is 2000 lines in one file',
  'docker compose up fails silently',
  'The config file has 47 boolean flags',
  'Production secrets are in a .env.example file',
  'Every PR is marked as urgent',
  'The CI pipeline takes 90 minutes',
  'There are 6 different date formatting libraries',
  'The error handler just logs and re-throws',
  'Someone wrote a 200-line regex for email validation',
];

const JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    rewrite: { type: 'string' as const },
  },
  required: ['rewrite'],
};

function scoreCynic(output: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Should start with a label
  const hasLabel = /^(Of course|Predictably|As expected|Right on schedule|Per the pattern|Confirmed)[,:]/i.test(output);
  if (!hasLabel) reasons.push('missing label starter');

  // Strip label for sentence count
  const body = output.replace(/^[^:]+:\s*/, '');
  const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) reasons.push(`${sentences.length} sentences after label (want 1)`);

  const words = body.split(/\s+/).length;
  if (words > 30) reasons.push(`${words} words (want <=25)`);

  // No rhetorical questions
  if (output.includes('?')) reasons.push('rhetorical question');

  // No exclamation marks
  if (output.includes('!')) reasons.push('exclamation mark');

  // No metaphors/similes
  if (/\blike a\b|\bas if\b|\bas though\b|\bsimilar to\b/i.test(output)) reasons.push('simile/metaphor leak');

  // No emotional words
  if (/\bfrustrating\b|\bterrible\b|\bawful\b|\bhell\b|\bsad\b|\bannoying\b/i.test(output)) reasons.push('emotional word');

  return { pass: reasons.length === 0, reasons };
}

function scoreCheeky(output: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Should start with a teasing opener
  const hasOpener = /^(Oh honey|Bless your heart|Cute attempt|Bold move|Love the confidence|A for effort)[,.:]/i.test(output);
  if (!hasOpener) reasons.push('missing teasing opener');

  // One sentence total
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 2) reasons.push(`${sentences.length} sentences (want 1)`);

  const words = output.split(/\s+/).length;
  if (words > 30) reasons.push(`${words} words (want <=25)`);

  // No rhetorical questions
  if (output.includes('?')) reasons.push('rhetorical question');

  // No metaphors/similes
  if (/\blike a\b|\bas if\b|\bas though\b|\bsimilar to\b/i.test(output)) reasons.push('simile/metaphor leak');

  // No pet names in body (after opener)
  const body = output.replace(/^[^,]+,\s*/, '');
  if (/\bbuddy\b|\bchamp\b|\bfriend\b|\bpal\b/i.test(body)) reasons.push('pet name in body');

  return { pass: reasons.length === 0, reasons };
}

function scoreChaotic(output: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Should have exactly 2 sentences
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 3) reasons.push(`${sentences.length} sentences (want 2)`);
  if (sentences.length < 2) reasons.push(`${sentences.length} sentence (want 2)`);

  // Should have a pivot word
  const hasPivot = /\b(Reportedly|Sources confirm|Update|Witnesses say|Upon inspection|Further analysis reveals)\b/i.test(output);
  if (!hasPivot) reasons.push('missing pivot word');

  const words = output.split(/\s+/).length;
  if (words > 45) reasons.push(`${words} words (want <=35)`);

  // No rhetorical questions
  if (output.includes('?')) reasons.push('rhetorical question');

  // No metaphors/similes
  if (/\blike a\b|\bas if\b|\bas though\b|\bsimilar to\b/i.test(output)) reasons.push('simile/metaphor leak');

  // No "what if"
  if (/\bwhat if\b/i.test(output)) reasons.push('"what if" hypothetical');

  // No dreams/dimensions
  if (/\bdream\b|\bparallel universe\b|\balternate dimension\b/i.test(output)) reasons.push('banned concept');

  return { pass: reasons.length === 0, reasons };
}

function scoreZoomer(output: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 2) reasons.push(`${sentences.length} sentences (want 1-2)`);

  const words = output.split(/\s+/).length;
  if (words > 45) reasons.push(`${words} words (want <=40)`);

  if (/\blike a\b|\bas if\b|\bas though\b|\bsimilar to\b/i.test(output)) reasons.push('simile/metaphor leak');

  const capsWords = output.match(/\b[A-Z]{2,}\b/g) ?? [];
  if (capsWords.length === 0) reasons.push('no caps emphasis');

  if (words < 8) reasons.push('too short — likely truncated');
  if (output.includes('?')) reasons.push('rhetorical question');
  if (/\b(whore|bitch|slut|cunt|faggot|nigger|retard)\b/i.test(output)) reasons.push('harshness violation');

  return { pass: reasons.length === 0, reasons };
}

async function runScorecard() {
  const client = new Ollama({ host: 'http://127.0.0.1:11434' });

  for (const mood of MOODS_TO_TEST) {
    const systemPrompt = baseSystemPrefix() + '\n\n' + getMoodSystemPrompt(mood);
    const scorerMap: Record<string, (o: string) => { pass: boolean; reasons: string[] }> = {
      cynic: scoreCynic,
      cheeky: scoreCheeky,
      chaotic: scoreChaotic,
      zoomer: scoreZoomer,
    };
    const scorer = scorerMap[mood] ?? scoreCynic;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`MOOD: ${mood.toUpperCase()}`);
    console.log(`${'='.repeat(70)}`);

    for (const model of MODELS) {
      console.log(`\n--- Model: ${model} ---`);
      let hits = 0;
      const results: { input: string; output: string; pass: boolean; reasons: string[] }[] = [];

      for (const input of TEST_INPUTS) {
        try {
          const response = await client.chat({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Rewrite this with comedy: "${input}"` },
            ],
            format: JSON_SCHEMA,
            options: {
              temperature: 0.55,
              top_p: 0.85,
              top_k: 40,
              mirostat: 2,
              mirostat_tau: 5.0,
              num_predict: 60,
            },
          });

          const parsed = JSON.parse(response.message.content);
          let output: string = parsed.rewrite ?? '(no rewrite field)';
          // Strip trailing JSON artifacts (Ollama leak)
          output = output.trim().replace(/[\s}]+$/, '').trim();
          const score = scorer(output);

          if (score.pass) hits++;
          results.push({ input, output, pass: score.pass, reasons: score.reasons });
        } catch (err) {
          results.push({ input, output: `ERROR: ${err}`, pass: false, reasons: ['error'] });
        }
      }

      // Print results
      for (const r of results) {
        const mark = r.pass ? 'PASS' : 'FAIL';
        console.log(`\n[${mark}] "${r.input}"`);
        console.log(`  -> ${r.output}`);
        if (r.reasons.length > 0) console.log(`  Issues: ${r.reasons.join(', ')}`);
      }

      console.log(`\n>> ${model} ${mood}: ${hits}/${TEST_INPUTS.length} (${Math.round(hits / TEST_INPUTS.length * 100)}%)`);
    }
  }
}

runScorecard().catch(console.error);
