#!/usr/bin/env node

/**
 * sensor-humor MCP server entry point.
 * Registers tools and runs via stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MOOD_STYLES, COMIC_TECHNIQUES } from './types.js';
import { moodSet, moodGet } from './tools/mood.js';
import { comicTiming } from './tools/comic_timing.js';

const server = new McpServer({
  name: 'sensor-humor',
  version: '0.1.0',
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
        content: [
          { type: 'text', text: `Error: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sensor-humor] MCP server running on stdio');
}

main().catch((err) => {
  console.error('[sensor-humor] Fatal error:', err);
  process.exit(1);
});
