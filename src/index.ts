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
import { catchphraseGenerate, catchphraseCallback } from './tools/catchphrase.js';
import { getSession, resetSession } from './session.js';
import { MOOD_DESCRIPTIONS } from './types.js';
import { getMoodVoiceNotes, getPromptVersion } from './prompts/loader.js';
import { getModel, getOllamaHost, getTimeoutMs, getOllamaStats, isDebug, probeOllama, hasApiKey } from './ollama.js';

const server = new McpServer({
  name: 'sensor-humor',
  version: '1.1.1',
});

/** Hints keyed by error code, so a tool error tells the caller how to fix it. */
const ERROR_HINTS: Record<string, string> = {
  validation: 'Check the tool arguments against the documented schema (e.g. a valid mood).',
  connection: 'Ensure Ollama is running and OLLAMA_HOST is reachable.',
  'model-not-found': 'The configured model is not pulled. Run: ollama pull <SENSOR_HUMOR_MODEL> (default qwen2.5:7b).',
  timeout: 'The model took too long — raise SENSOR_HUMOR_TIMEOUT_MS or use a smaller model.',
  auth: 'Ollama rejected the request (auth). Check credentials for a remote/cloud OLLAMA_HOST.',
  'rate-limit': 'Rate limited by the Ollama host. Retry after a short delay.',
  unknown: 'Set SENSOR_HUMOR_DEBUG=true and check stderr for detail.',
};

function classifyToolError(e: Error): string {
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
    const result = moodGet();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
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
  'Deliver an affectionate burn on code, errors, ideas, or situations. Returns a severity rating 1-5. Uses verdict/diagnosis label pattern.',
  {
    target: z.string().describe('The code, error, idea, or situation to roast'),
    context: z
      .enum(ROAST_CONTEXTS)
      .optional()
      .describe('What kind of thing is being roasted: code, error, idea, or situation'),
  },
  async ({ target, context }) => {
    try {
      const result = await roast(target, context ?? 'code');
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
  'Quick, punchy reaction to bad code or bad ideas. Short jab — one line, no config needed.',
  {
    target: z.string().describe('The thing to heckle'),
  },
  async ({ target }) => {
    try {
      const result = await heckle(target);
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
    const result = catchphraseCallback();
    if (result === null) {
      return {
        content: [{ type: 'text', text: 'null' }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

// --- debug_status ---
server.tool(
  'debug_status',
  'Dump current session state, mood config, and voice backend. Useful for debugging without env vars.',
  {},
  async () => {
    const session = getSession();
    // Best-effort live probe so the operator gets a one-call answer to "is the backend healthy
    // and correctly configured?" — bounded timeout, never throws.
    const probe = await probeOllama(2000);
    const status = {
      mood: session.mood,
      mood_description: MOOD_DESCRIPTIONS[session.mood],
      voice_notes: getMoodVoiceNotes(session.mood),
      turn_counter: session.turn_counter,
      recent_bits_count: session.recent_bits.length,
      running_gags_count: session.running_gags.length,
      catchphrase_count: session.catchphrases.size,
      buffer_stats: session.bufferStats(),
      catchphrases: Object.fromEntries(session.catchphrases),
      voice_backend: process.env.VOICE_SOUNDBOARD_ENGINE || 'default (kokoro)',
      model: getModel(),
      ollama_host: getOllamaHost(),
      ollama_api_key_set: hasApiKey(),
      timeout_ms: getTimeoutMs(),
      prompt_version: getPromptVersion(),
      ollama_reachable: probe.reachable,
      model_available: probe.model_available,
      generation: getOllamaStats(),
      debug: isDebug(),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  },
);

// --- session_reset ---
server.tool(
  'session_reset',
  'Reset all session state: mood returns to dry, gags/bits/catchphrases cleared, turn counter reset. Use when starting a new topic or comedy session.',
  {},
  async () => {
    const session = resetSession();
    return {
      content: [{ type: 'text', text: JSON.stringify({ reset: true, mood: session.mood, turn_counter: session.turn_counter }, null, 2) }],
    };
  },
);

// --- Ollama health check (non-blocking) ---
async function checkOllamaHealth(): Promise<void> {
  const probe = await probeOllama();
  if (!probe.reachable) {
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
  console.error('[sensor-humor] MCP server v1.1.1 running on stdio');

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
