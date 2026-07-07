/**
 * running_gag — plant a running gag for later callbacks (callback-revival C1).
 *
 * This is the EXPLICIT gag-planting affordance the callback mechanic was missing. Before it,
 * running_gags was never seeded at runtime — addGag's only caller (comic_timing) merely BUMPS a
 * pre-existing gag on an honored callback, so with an empty store no callback could ever fire. This
 * tool is the door: the caller plants { setup, tag }; comic_timing later replays it as a callback
 * once the distance gate opens and until the retirement cap closes it.
 *
 * Design grounding (a study-swarm ran):
 *   - Explicit-creation, NOT silent auto-promotion. Xiong et al. 2025 (arXiv:2505.16067) show an
 *     unfiltered auto-write path degrades a memory store and propagates errors downstream; Memory
 *     Sandbox (Huang/Gajos/Glassman 2023, arXiv:2308.01542) shows explicit affordances restore user
 *     control over what an agent remembers; Buçinca et al. 2021 show a deliberate action reduces
 *     over-reliance. So planting a gag is a chosen tool call, never an inferred side effect.
 *   - Store-time safety gate. A gag is STORED and later REPLAYED verbatim to the user on callback,
 *     so a dirty gag must never be plantable in the first place. The terminal safety gate
 *     (hasHarshLeak/hasSimileLeak, McGraw & Warren 2010 benign-violation floor) runs on
 *     setup+tag here and REFUSES a dirty gag — closing the store-time hole rather than relying only
 *     on the output gates downstream (defense-in-depth, mirroring how fromSnapshot drops dirty
 *     persisted gags on load).
 */

import { getSession } from '../session.js';
import type { RunningGagResult } from '../types.js';
import { sanitizeForPrompt, hasHarshLeak, hasSimileLeak } from '../validators.js';

/**
 * A dirty gag is UNPLANTABLE. We refuse (throw) rather than substitute a safe line the way the
 * output tools do: a gag is durable state that gets replayed, so the right failure is "don't store
 * it and tell the caller why," not "store a canned stand-in." The thrown Error's message flows
 * through index.ts's toolError() into the studio Structured Error Shape ({ code, message, hint,
 * retryable }); classifyToolError maps a "validation"-style message to code 'validation'.
 */
export class DirtyGagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirtyGagError';
  }
}

/**
 * Plant a running gag. Sanitizes both fields, runs the terminal safety gate on the combined
 * setup+tag, and refuses to store a gag that leaks a slur or simile. On success the gag is added to
 * the session (session.addGag stamps its created_turn for the distance gate) and a receipt is
 * returned.
 */
export function runningGag(setup: string, tag: string): RunningGagResult {
  const session = getSession();
  session.tick();

  // Sanitize first (strip newlines/control/zero-width/confusables, cap length) so a planted gag
  // can never carry a prompt-injection payload or obfuscated token into later prompts on replay.
  const cleanSetup = sanitizeForPrompt(setup);
  const cleanTag = sanitizeForPrompt(tag);

  if (cleanSetup.length === 0 || cleanTag.length === 0) {
    // First-person + actionable, matching the codebase's user-facing string voice.
    throw new DirtyGagError(
      "I need both a non-empty setup and tag to plant a gag — after sanitizing, one of them was empty.",
    );
  }

  // Terminal safety gate: a gag is stored and later REPLAYED verbatim on callback, so a dirty gag
  // must never be plantable. Check setup and tag together and REFUSE if either leaks (C1 / C5).
  if (
    hasHarshLeak(cleanSetup) ||
    hasHarshLeak(cleanTag) ||
    hasSimileLeak(cleanSetup) ||
    hasSimileLeak(cleanTag)
  ) {
    throw new DirtyGagError(
      "I won't plant that gag — its setup or tag trips the safety filter (a slur or a simile). Rephrase it clean and I'll store it for callbacks.",
    );
  }

  session.addGag(cleanSetup, cleanTag);
  // created_turn was just stamped by addGag on the fresh gag (or, on a tag collision, the existing
  // gag's original plant turn is preserved — either way this is the gag's setup turn).
  const gag = session.running_gags.find((g) => g.tag === cleanTag);
  const createdTurn = gag?.created_turn ?? session.turn_counter;

  return {
    tag: cleanTag,
    setup: cleanSetup,
    gag_count: session.running_gags.length,
    created_turn: createdTurn,
  };
}
