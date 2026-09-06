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
 *
 * Timeout/abort matches generateComedy: every generate() is raced against getTimeoutMs() and cancelled
 * via a per-call AbortController threaded into fetch (the ollama client does not forward a request-level
 * signal on non-streamed calls). Timeout or empty output is a null abstain, never a throw — one hung
 * 24–31B family must not discard the rest of the panel.
 */
import { Ollama } from 'ollama';
import { getOllamaHost, getTimeoutMs } from '../../ollama.js';
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

/**
 * Client bound to one call's AbortController. The ollama client does not forward a signal to fetch on
 * non-streamed generate()/list(), so we wrap fetch and merge the signal into every request init — the
 * same A-BK-002 pattern generateComedy / probeOllama use. Fresh client per call; no shared cache.
 */
function abortableClient(signal: AbortSignal): Ollama {
  const apiKey = process.env.OLLAMA_API_KEY;
  return new Ollama({
    host: getOllamaHost(),
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal })) as typeof fetch,
  });
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Ollama timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timeoutHandle.unref?.();
  });
  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
    controller.abort();
  }
}

function modelListed(names: string[], model: string): boolean {
  return names.some((n) => n === model || n === `${model}:latest` || n.startsWith(`${model}:`));
}

export interface JudgeProbeResult {
  reachable: boolean;
  host: string;
  available: string[];
  missing: string[];
  reason?: string;
}

/**
 * One timed list() against the judge panel. Missing families are returned in `missing` so the CLI
 * can skip them (never hang on a model that isn't pulled). Unreachable Ollama is `reachable: false`
 * — a SKIP, not an eval FAIL.
 */
export async function probeJudgeModels(
  models: readonly string[],
  timeoutMs = 5000,
): Promise<JudgeProbeResult> {
  const host = getOllamaHost();
  const wanted = [...models];
  try {
    const res = await withTimeout((signal) => abortableClient(signal).list(), timeoutMs);
    const names = (res.models ?? []).map(
      (m) => (m as { name?: string; model?: string }).name ?? (m as { model?: string }).model ?? '',
    );
    const available = wanted.filter((model) => modelListed(names, model));
    const missing = wanted.filter((model) => !modelListed(names, model));
    return { reachable: true, host, available, missing };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { reachable: false, host, available: [], missing: wanted, reason };
  }
}

/** Build a MoodJudge backed by a local (or cloud) Ollama model. Reuses the generator's host/auth
 *  resolution so OLLAMA_HOST / OLLAMA_API_KEY behave identically to the comedy path. */
export function ollamaJudge(model: string): MoodJudge {
  async function ask(prompt: string): Promise<string | null> {
    const timeoutMs = getTimeoutMs();
    try {
      const res = await withTimeout(
        (signal) =>
          abortableClient(signal).generate({
            model,
            prompt,
            stream: false,
            options: { temperature: 0 },
          }),
        timeoutMs,
      );
      const text = res.response ?? '';
      if (text.trim() === '') {
        console.error(
          `[eval] judge "${model}" returned empty output — abstaining this verdict (not throwing). ` +
            `Operator: check \`ollama ps\` / \`ollama run ${model}\`; empty replies usually mean the ` +
            `weights failed to load or the timeout (${timeoutMs}ms, SENSOR_HUMOR_TIMEOUT_MS) is too short for 24–31B.`,
        );
        return null;
      }
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[eval] judge "${model}" failed (${msg}) — abstaining this verdict; the panel continues. ` +
          `Operator: confirm "${model}" is pulled (\`ollama pull ${model}\`) and Ollama is up; ` +
          `raise SENSOR_HUMOR_TIMEOUT_MS if this 24–31B family needs longer than ${timeoutMs}ms.`,
      );
      return null;
    }
  }

  return {
    name: model,
    async conforms(req: ConformanceRequest): Promise<boolean | null> {
      const raw = await ask(buildConformancePrompt(req.input, req.line, req.mood, MOOD_RUBRICS[req.mood]));
      if (raw === null) return null;
      return parseYesNo(raw);
    },
    async identify(req: IdentifyRequest) {
      const raw = await ask(buildIdentifyPrompt(req.line, req.options));
      if (raw === null) return null;
      return parseMoodChoice(raw, req.options);
    },
  };
}
