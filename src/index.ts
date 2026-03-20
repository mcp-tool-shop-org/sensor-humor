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

const server = new McpServer({
  name: 'sensor-humor',
  version: '0.2.0',
});

// --- mood_set ---
server.tool(
  'mood_set',
  'Set the comedic mood/persona for this session. Affects the voice of all comedy tools.',
  {
    style: z.enum(MOOD_STYLES).describe(
      'The mood to set. Options: dry (deadpan), roast (affectionate burns), absurdist (surreal), wholesome (warm dad energy), sardonic (weary wit), unhinged (chaotic energy)',
    ),
  },
  async ({ style }) => {
    try {
      const result = moodSet(style);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
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
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
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
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
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
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
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
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
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

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sensor-humor] MCP server v0.2.0 running on stdio');
}

main().catch((err) => {
  console.error('[sensor-humor] Fatal error:', err);
  process.exit(1);
});
