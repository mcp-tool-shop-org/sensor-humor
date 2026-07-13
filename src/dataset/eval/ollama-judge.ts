/**
 * comedic-moods-v0 — the Ollama-backed cross-family mood judge (Slice 3).
 *
 * The concrete `MoodJudge` the CLI wires up: one instance per judge model. Deliberately THIN — it only
 * turns the pure prompt builders (judge.ts) into an Ollama `generate` call and feeds the raw text to the
 * pure parsers. All the logic worth testing lives in the pure modules; this wiring is exercised by the
 * CLI smoke run. Runs the judge at temperature 0 for a stable, reproducible verdict.
 *
 * CALLER CONTRACT: the model MUST be a different family than the generator (qwen2.5:7b). The CLI enforces
 * this — pass e.g. mistral-small:24b (Mistral) and gemma4:31b (Google), never a qwen* model.
 */
import { Ollama } from 'ollama';
import { getOllamaHost } from '../../ollama.js';
import {
  MOOD_RUBRICS,
  buildConformancePrompt,
  buildIdentifyPrompt,
  parseYesNo,
  parseMoodChoice,
  type MoodJudge,
  type ConformanceRequest,
  type IdentifyRequest,
} from './judge.js';

/** Build a MoodJudge backed by a local (or cloud) Ollama model. Reuses the generator's host/auth
 *  resolution so OLLAMA_HOST / OLLAMA_API_KEY behave identically to the comedy path. */
export function ollamaJudge(model: string): MoodJudge {
  const apiKey = process.env.OLLAMA_API_KEY;
  const client = new Ollama({
    host: getOllamaHost(),
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
  });

  async function ask(prompt: string): Promise<string> {
    const res = await client.generate({ model, prompt, stream: false, options: { temperature: 0 } });
    return res.response ?? '';
  }

  return {
    name: model,
    async conforms(req: ConformanceRequest): Promise<boolean | null> {
      const raw = await ask(buildConformancePrompt(req.input, req.line, req.mood, MOOD_RUBRICS[req.mood]));
      return parseYesNo(raw);
    },
    async identify(req: IdentifyRequest) {
      const raw = await ask(buildIdentifyPrompt(req.line, req.options));
      return parseMoodChoice(raw, req.options);
    },
  };
}
