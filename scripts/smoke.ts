import { Ollama } from 'ollama';
import { baseSystemPrefix } from '../src/prompts/base.js';
import { getMoodSystemPrompt } from '../src/prompts/loader.js';
import { MOOD_STYLES } from '../src/types.js';

const client = new Ollama({ host: 'http://127.0.0.1:11434' });
const model = 'qwen2.5:7b';

const inputs = [
  'Build failed after 47 attempts',
  'The entire codebase is one 3000-line file',
  'Deployed to production on Friday at 5pm',
  'Using var in 2026 with no types anywhere',
  'The database has no indexes and 50 million rows',
];

async function main() {
  for (const mood of MOOD_STYLES) {
    const systemPrompt = baseSystemPrefix() + '\n\n' + getMoodSystemPrompt(mood);
    console.log('\n' + '='.repeat(60));
    console.log('MOOD: ' + mood.toUpperCase());
    console.log('='.repeat(60));

    for (const input of inputs) {
      try {
        const resp = await client.chat({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input },
          ],
          options: { temperature: 0.55, mirostat: 2, mirostat_tau: 5.0, num_predict: 60 },
        });
        const text = resp.message.content.trim();
        console.log(`  [${input.substring(0, 45)}] -> ${text}`);
      } catch (e: any) {
        console.log(`  [${input.substring(0, 45)}] -> ERROR: ${e.message}`);
      }
    }
  }
  console.log('\n--- SMOKE COMPLETE ---');
}

main();
