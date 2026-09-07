#!/usr/bin/env node

/**
 * sensor-humor MCP server entry point.
 * Registers all tools and runs via stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MOOD_STYLES, COMIC_TECHNIQUES, ROAST_CONTEXTS } from './types.js';
import { moodSet, moodGet } from './tools/mood.js';
import { comicTiming } from './tools/comic_timing.js';
import { roast } from './tools/roast.js';
import { heckle } from './tools/heckle.js';
import { InvalidTechniqueError } from './tools/techniques.js';
import { catchphraseGenerate, catchphraseCallback } from './tools/catchphrase.js';
import { runningGag } from './tools/running_gag.js';
import { getSession, resetSession, persistEnabled, sessionFilePath, getGagMinDistance, getGagMaxFires, fullTraceEnabled } from './session.js';
import { MOOD_DESCRIPTIONS } from './types.js';
import { createHash } from 'node:crypto';
import { baseSystemPrefix } from './prompts/base.js';
import { getMoodVoiceNotes, getMoodSystemPrompt, getPromptVersion, getActivePromptKey } from './prompts/loader.js';
import { getModel, getOllamaHost, getTimeoutMs, getTemperature, getMaxRetries, getOllamaStats, isDebug, probeOllama, hasApiKey } from './ollama.js';
import { allowedTechniquesForMood } from './tools/techniques.js';

const server = new McpServer({
  name: 'sensor-humor',
  version: '1.3.1',
});

/** Hints keyed by error code, so a tool error tells the caller how to fix it. */
const ERROR_HINTS: Record<string, string> = {
  validation: 'Check the tool arguments against the documented schema (e.g. a valid mood, or a mood×technique combo the current mood supports).',
  connection: 'Ensure Ollama is running and OLLAMA_HOST is reachable.',
  'model-not-found': 'The configured model is not pulled. Run: ollama pull <SENSOR_HUMOR_MODEL> (default qwen2.5:7b).',
  timeout: 'The model took too long — raise SENSOR_HUMOR_TIMEOUT_MS or use a smaller model.',
  auth: 'Ollama rejected the request (auth). Check credentials for a remote/cloud OLLAMA_HOST.',
  'rate-limit': 'Rate limited by the Ollama host. Retry after a short delay.',
  unknown: 'Set SENSOR_HUMOR_DEBUG=true and check stderr for detail.',
};

function classifyToolError(e: Error): string {
  // DirtyGagError: running_gag refused an unsafe/empty gag — a caller-input problem, not a backend
  // fault, so it classifies as 'validation' (the hint points the caller at the arguments).
  if (e.name === 'DirtyGagError') return 'validation';
  if (e instanceof InvalidTechniqueError || e.name === 'InvalidTechniqueError') return 'validation';
  if (e.name === 'ZodError' || /ZodError|Invalid mood|Valid moods/i.test(e.message)) return 'validation';
  if (e.name === 'ResponseError' && /not found|no such model/i.test(e.message)) return 'model-not-found';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET/.test(e.message)) return 'connection';
  if (/timeout/i.test(e.message)) return 'timeout';
  return 'unknown';
}

/**
 * Map any thrown error to the studio Structured Error Shape ({ code, message, hint,
 * retryable, cause? }) and return it as an MCP tool error result. The server never
 * exposes a raw stack trace — only this structured, actionable shape.
 */
function toolError(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = classifyToolError(e);
  const body: Record<string, unknown> = {
    code,
    message: e.message,
    hint: ERROR_HINTS[code] ?? ERROR_HINTS.unknown,
    retryable: code === 'connection' || code === 'timeout',
  };
  if (process.env.SENSOR_HUMOR_DEBUG === 'true') body.cause = e.name;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    isError: true,
  };
}

// --- mood_set ---
server.tool(
  'mood_set',
  'Set the comedic mood/persona for this session. Affects the voice of all comedy tools.',
  {
    style: z.enum(MOOD_STYLES).describe(
      'The mood to set. Options: dry (deadpan), roast (affectionate burns), chaotic (normal-to-absurd), cheeky (playful teasing), cynic (bitter realism), zoomer (Gen-Z snark)',
    ),
  },
  async ({ style }) => {
    try {
      const result = moodSet(style);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- mood_get ---
server.tool(
  'mood_get',
  'Get the current comedic mood and session stats.',
  {},
  async () => {
    try {
      const result = moodGet();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- comic_timing ---
server.tool(
  'comic_timing',
  'Rewrite dry text with comedic delivery. The money tool — takes boring text and makes it funny using the current mood voice. Supports specific comedy techniques or auto-selection.',
  {
    text: z.string().describe('The dry text to rewrite with comedic delivery'),
    technique: z
      .enum(COMIC_TECHNIQUES)
      .optional()
      .describe(
        'Comedy technique to use. rule-of-three, misdirection, escalation, callback (references earlier session bits), understatement, or auto (let the sidekick choose)',
      ),
  },
  async ({ text, technique }) => {
    try {
      const result = await comicTiming(text, technique ?? 'auto');
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- roast ---
server.tool(
  'roast',
  'Deliver an affectionate burn on code, errors, ideas, or situations. Returns a severity rating 1-5. Uses verdict/diagnosis label pattern. Optional technique overlay must be valid for the current mood.',
  {
    target: z.string().describe('The code, error, idea, or situation to roast'),
    context: z
      .enum(ROAST_CONTEXTS)
      .optional()
      .describe('What kind of thing is being roasted: code, error, idea, or situation'),
    technique: z
      .enum(COMIC_TECHNIQUES)
      .optional()
      .describe(
        'Optional comedy-technique overlay (rule-of-three, misdirection, escalation, callback, understatement, auto). Invalid mood×technique combos are refused.',
      ),
  },
  async ({ target, context, technique }) => {
    try {
      const result = await roast(target, context ?? 'code', technique ?? 'auto');
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- heckle ---
server.tool(
  'heckle',
  'Quick, punchy reaction to bad code or bad ideas. Short jab — one line. Optional technique overlay must be valid for the current mood.',
  {
    target: z.string().describe('The thing to heckle'),
    technique: z
      .enum(COMIC_TECHNIQUES)
      .optional()
      .describe(
        'Optional comedy-technique overlay (rule-of-three, misdirection, escalation, callback, understatement, auto). Invalid mood×technique combos are refused.',
      ),
  },
  async ({ target, technique }) => {
    try {
      const result = await heckle(target, technique ?? 'auto');
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- catchphrase_generate ---
server.tool(
  'catchphrase_generate',
  'Generate a short, reusable catchphrase or recurring bit for this session. Stored for callbacks.',
  {
    context: z.string().optional().describe('Optional context to inspire the catchphrase'),
  },
  async ({ context }) => {
    try {
      const result = await catchphraseGenerate(context);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- catchphrase_callback ---
server.tool(
  'catchphrase_callback',
  'Recall the most-used catchphrase from this session. Returns null if no catchphrases exist yet.',
  {},
  async () => {
    try {
      const result = catchphraseCallback();
      if (result === null) {
        return {
          content: [{ type: 'text', text: 'null' }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- running_gag ---
// The explicit gag-planting affordance the callback mechanic was missing (callback-revival C1).
// Plants { setup, tag } into the session so comic_timing can later replay it as a callback once
// the distance gate opens and until the retirement cap closes it. Grounded in explicit-affordance
// memory research (Xiong et al. 2025; Memory Sandbox 2023; Buçinca et al. 2021) — a chosen tool
// call, never a silent auto-write.
server.tool(
  'running_gag',
  'Plant a running gag for later callbacks. Provide a setup (the bit) and a short tag (the trigger word comic_timing watches for). Stored for the session; comic_timing can call it back once a couple of turns have passed, and it retires after a few fires so it never gets stale. A gag whose setup or tag trips the safety filter or is not English (non-Latin script) is refused, not stored.',
  {
    setup: z.string().describe('The gag itself — the recurring bit to reference later (e.g. "the deadbeef pointer that keeps haunting this build")'),
    tag: z.string().describe('A short trigger word/phrase comic_timing watches for to fire the callback (e.g. "deadbeef")'),
  },
  async ({ setup, tag }) => {
    try {
      const result = runningGag(setup, tag);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- debug_status ---
server.tool(
  'debug_status',
  'Dump current session state, mood config, and voice backend. Useful for debugging without env vars.',
  {},
  async () => {
    try {
      const session = getSession();
      // Best-effort live probe so the operator gets a one-call answer to "is the backend healthy
      // and correctly configured?" — bounded timeout, never throws.
      const probe = await probeOllama(2000);
      // Prompt fingerprint (B5 / v1.2 F4): a short stable hash binding the ACTIVE prompt text
      // (base + the resolved mood prompt) + model + temperature, so two runs' outputs can be
      // attributed to a prompt-vs-model change deterministically. active_prompt_key surfaces the
      // REAL version in effect (exposes a silent v2->v1 downgrade that prompt_version hides).
      const activePromptKey = getActivePromptKey(session.mood);
      const activePromptText = `${baseSystemPrefix()}\n${getMoodSystemPrompt(session.mood)}\n${getMoodVoiceNotes(session.mood)}`;
      const promptFingerprint = createHash('sha256')
        .update(`${activePromptKey}|${getModel()}|${getTemperature()}|${activePromptText}`)
        .digest('hex')
        .slice(0, 12);
      const status = {
        mood: session.mood,
        mood_description: MOOD_DESCRIPTIONS[session.mood],
        allowed_techniques: allowedTechniquesForMood(session.mood),
        voice_notes: getMoodVoiceNotes(session.mood),
        turn_counter: session.turn_counter,
        recent_bits_count: session.recent_bits.length,
        running_gags_count: session.running_gags.length,
        // Surface gag CONTENTS (setup/tag/used/last_turn), not just the count — the count alone
        // can't tell the operator WHICH gags are live or being called back. Capped to the most
        // recent few so a long session's full list never bloats this output.
        running_gags: session.recentGags(),
        catchphrase_count: session.catchphrases.size,
        buffer_stats: session.bufferStats(),
        catchphrases: Object.fromEntries(session.catchphrases),
        voice_backend: process.env.VOICE_SOUNDBOARD_ENGINE || 'default (kokoro)',
        model: getModel(),
        ollama_host: getOllamaHost(),
        ollama_api_key_set: hasApiKey(),
        timeout_ms: getTimeoutMs(),
        temperature: getTemperature(),
        max_retries: getMaxRetries(),
        persist: persistEnabled(),
        session_path: sessionFilePath(),
        gag_min_distance: getGagMinDistance(),
        gag_max_fires: getGagMaxFires(),
        full_trace: fullTraceEnabled(),
        prompt_version: getPromptVersion(),
        active_prompt_key: activePromptKey,
        prompt_fingerprint: promptFingerprint,
        ollama_reachable: probe.reachable,
        // When unreachable, surface the already-classified cause so the operator gets a one-call
        // answer (connection vs auth vs timeout) without re-running under SENSOR_HUMOR_DEBUG. (B6)
        ...(probe.reachable ? {} : { unreachable_reason: probe.reason }),
        model_available: probe.model_available,
        generation: getOllamaStats(),
        debug: isDebug(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- debug_chain ---
// Forensic observability (ROADMAP v2.0 "Chain Trace Tool"): return the last N per-call traces so a
// dev can reconstruct the generation pipeline for a recent comedy output in ONE tool call instead
// of grepping logs. Each comedy tool records a trace via session.recordTrace; getTraces returns
// them newest-first, bounded to the ring depth. SENSOR_HUMOR_FULL_TRACE=true adds prompt/raw/parsed
// to each entry (default off, to bound size).
server.tool(
  'debug_chain',
  'Dump the forensic trace ring: the last N comedy-tool calls with turn, tool, mood, input, prompt fingerprint, retries, validators triggered, degraded reason, and latency. Use to debug "why did this roast land weird?" in one call. Set SENSOR_HUMOR_FULL_TRACE=true to also capture full prompt text + raw model output + parsed output per entry.',
  {
    limit: z
      .number()
      .int()
      .positive()
      .max(10)
      .optional()
      .describe('How many recent traces to return, newest first (1-10). Defaults to 10 (the full ring).'),
  },
  async ({ limit }) => {
    try {
      const session = getSession();
      // getTraces clamps internally too; the schema already bounds 1-10 for a well-formed caller.
      const traces = session.getTraces(limit ?? 10);
      return {
        content: [{ type: 'text', text: JSON.stringify(traces, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- session_reset ---
server.tool(
  'session_reset',
  'Reset all session state: mood returns to dry, gags/bits/catchphrases cleared, turn counter reset. Use when starting a new topic or comedy session.',
  {},
  async () => {
    try {
      const session = resetSession();
      return {
        content: [{ type: 'text', text: JSON.stringify({ reset: true, mood: session.mood, turn_counter: session.turn_counter }, null, 2) }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// --- Ollama health check (non-blocking) ---
async function checkOllamaHealth(): Promise<void> {
  const probe = await probeOllama();
  if (!probe.reachable) {
    // Distinguish the AUTH case: an unreachable-due-to-auth backend is a wrong/missing key, not a
    // down daemon — the fix is OLLAMA_API_KEY, not "start ollama". Naming it here saves the operator
    // a wrong debugging path. Mirrors ERROR_HINTS.auth.
    if (probe.reason === 'auth') {
      console.error(
        `[sensor-humor] WARNING: Ollama rejected the request at ${getOllamaHost()} (auth). ` +
          `Set OLLAMA_API_KEY for this remote/cloud host. Tools will use fallbacks until it's fixed.`,
      );
      return;
    }
    console.error(
      `[sensor-humor] WARNING: Ollama not reachable at ${getOllamaHost()}. Tools will use fallbacks until available.`,
    );
    return;
  }
  if (!probe.model_available) {
    // The #1 fresh-install failure: daemon up, model not pulled. Name the exact fix.
    console.error(
      `[sensor-humor] WARNING: model "${probe.model}" is not pulled. Tools will use fallbacks. Run: ollama pull ${probe.model}`,
    );
    return;
  }
  console.error('[sensor-humor] Ollama connection verified');
}

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sensor-humor] MCP server v1.3.1 running on stdio');

  // Fire-and-forget health check
  checkOllamaHealth();

  // Graceful shutdown — close the transport (flushing buffered stdout) before exit,
  // guarded against a double signal, with a hard-exit safety net. (BK-06)
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('[sensor-humor] Shutting down...');
    const hardExit = setTimeout(() => process.exit(0), 2000);
    hardExit.unref?.();
    try {
      await server.close();
    } catch {
      // Already closing / not connected — we're exiting regardless.
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[sensor-humor] Fatal error:', err);
  process.exit(1);
});
