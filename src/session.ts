/**
 * Session state manager for sensor-humor.
 * In-memory only — session dies when server stops.
 */

import {
  DEFAULT_MOOD,
  type MoodStyle,
  type RecentBit,
  type RunningGag,
  type SensorHumorSession,
} from './types.js';
import { sanitizeForPrompt } from './validators.js';

const MAX_RECENT_BITS = 20;

export class Session implements SensorHumorSession {
  mood: MoodStyle;
  running_gags: RunningGag[];
  recent_bits: RecentBit[];
  catchphrases: Map<string, number>;
  turn_counter: number;

  constructor() {
    this.mood = DEFAULT_MOOD;
    this.running_gags = [];
    this.recent_bits = [];
    this.catchphrases = new Map();
    this.turn_counter = 0;
  }

  /** Advance turn counter. Call once per tool invocation. */
  tick(): number {
    return ++this.turn_counter;
  }

  /** Set the active mood. */
  setMood(style: MoodStyle): void {
    this.mood = style;
  }

  /** Push a bit to the ring buffer (max 20). Oldest evicted first. */
  pushBit(text: string, technique: string): void {
    const bit: RecentBit = {
      text,
      turn: this.turn_counter,
      technique,
    };
    this.recent_bits.push(bit);
    if (this.recent_bits.length > MAX_RECENT_BITS) {
      this.recent_bits.shift();
    }
  }

  /** Add or update a running gag. */
  addGag(setup: string, tag: string): void {
    const existing = this.running_gags.find((g) => g.tag === tag);
    if (existing) {
      existing.used++;
      existing.last_turn = this.turn_counter;
    } else {
      this.running_gags.push({
        setup,
        tag,
        used: 1,
        last_turn: this.turn_counter,
      });
    }
  }

  /** Record a catchphrase use. Returns the new use count. */
  useCatchphrase(phrase: string): number {
    const count = (this.catchphrases.get(phrase) ?? 0) + 1;
    this.catchphrases.set(phrase, count);
    return count;
  }

  /**
   * Find gags whose tags appear in the given text.
   * Used by comic_timing to decide if a callback is available.
   */
  findCallbackCandidates(text: string): RunningGag[] {
    const lower = text.toLowerCase();
    return this.running_gags.filter((g) => lower.includes(g.tag.toLowerCase()));
  }

  /** Compact summary of recent bits for prompt injection. */
  recentBitsSummary(): string {
    if (this.recent_bits.length === 0) return 'No bits yet this session.';
    const lines = this.recent_bits.slice(-5).map(
      (b, i) => `${i + 1}. [turn ${b.turn}, ${b.technique}] ${sanitizeForPrompt(b.text)}`
    );
    return `Recent bits:\n${lines.join('\n')}`;
  }

  /** Compact summary of running gags for prompt injection. */
  gagsSummary(): string {
    if (this.running_gags.length === 0) return 'No running gags yet.';
    const lines = this.running_gags.map(
      (g) => `- "${sanitizeForPrompt(g.setup)}" (tag: ${g.tag}, used ${g.used}x, last turn ${g.last_turn})`
    );
    return `Running gags:\n${lines.join('\n')}`;
  }

  /** Compact summary of catchphrases for prompt injection. */
  catchphrasesSummary(): string {
    if (this.catchphrases.size === 0) return 'No catchphrases yet.';
    const lines = Array.from(this.catchphrases.entries()).map(
      ([phrase, count]) => `- "${sanitizeForPrompt(phrase)}" (used ${count}x)`
    );
    return `Catchphrases:\n${lines.join('\n')}`;
  }

  /** Full state summary for prompt context injection. */
  stateSummary(): string {
    return [
      `Turn: ${this.turn_counter}`,
      `Mood: ${this.mood}`,
      this.recentBitsSummary(),
      this.gagsSummary(),
      this.catchphrasesSummary(),
    ].join('\n\n');
  }
}

/** Singleton session for the current server process. */
let _session: Session | null = null;

export function getSession(): Session {
  if (!_session) {
    _session = new Session();
  }
  return _session;
}

export function resetSession(): Session {
  _session = new Session();
  return _session;
}
