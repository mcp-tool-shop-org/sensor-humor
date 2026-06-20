/**
 * Session state manager for sensor-humor.
 * In-memory only — session dies when server stops.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_MOOD,
  MOOD_STYLES,
  type MoodStyle,
  type RecentBit,
  type RunningGag,
  type SensorHumorSession,
} from './types.js';
import { sanitizeForPrompt } from './validators.js';

const MAX_RECENT_BITS = 20;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // stale gags aren't funny

function persistEnabled(): boolean {
  return process.env.SENSOR_HUMOR_PERSIST === 'true';
}

/** Session file path, resolved lazily so SENSOR_HUMOR_SESSION_DIR can override it. */
function sessionFilePath(): string {
  const dir = process.env.SENSOR_HUMOR_SESSION_DIR ?? join(homedir(), '.sensor-humor');
  return join(dir, 'session.json');
}

/** JSON-safe snapshot of session state (the catchphrase Map is serialized as entries). */
export interface SessionSnapshot {
  version: 1;
  saved_at: number;
  mood: MoodStyle;
  running_gags: RunningGag[];
  recent_bits: RecentBit[];
  catchphrases: [string, number][];
  turn_counter: number;
}

/** A snapshot is usable only if well-formed and within the 24h expiry window. */
export function snapshotIsFresh(snapshot: SessionSnapshot | null | undefined, now: number): boolean {
  return (
    !!snapshot &&
    typeof snapshot.saved_at === 'number' &&
    now - snapshot.saved_at >= 0 &&
    now - snapshot.saved_at <= SESSION_MAX_AGE_MS
  );
}

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
    this.save();
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
      const evicted = this.recent_bits.shift();
      if (process.env.SENSOR_HUMOR_DEBUG === 'true' && evicted) {
        console.error(`[sensor-humor] Evicted bit from turn ${evicted.turn} (buffer full at ${MAX_RECENT_BITS})`);
      }
    }
    this.save();
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
    this.save();
  }

  /** Record a catchphrase use. Returns the new use count. */
  useCatchphrase(phrase: string): number {
    const count = (this.catchphrases.get(phrase) ?? 0) + 1;
    this.catchphrases.set(phrase, count);
    this.save();
    return count;
  }

  /**
   * Find gags whose tags appear in the given text.
   * Used by comic_timing to decide if a callback is available.
   */
  findCallbackCandidates(text: string): RunningGag[] {
    const lower = text.toLowerCase();
    return this.running_gags.filter((g) => {
      const tag = g.tag.toLowerCase();
      if (tag.length < 3) return lower.includes(tag); // short tags: keep substring match
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`).test(lower);
    });
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

  /** Buffer occupancy stats for debug_status. */
  bufferStats(): { recent_bits: number; max: number; running_gags: number; catchphrases: number } {
    return {
      recent_bits: this.recent_bits.length,
      max: MAX_RECENT_BITS,
      running_gags: this.running_gags.length,
      catchphrases: this.catchphrases.size,
    };
  }

  /** Full state summary for prompt context. */
  stateSummary(): string {
    return [
      `Turn: ${this.turn_counter}`,
      `Mood: ${this.mood}`,
      this.recentBitsSummary(),
      this.gagsSummary(),
      this.catchphrasesSummary(),
    ].join('\n\n');
  }

  /** Snapshot session state as a JSON-safe object (Map serialized as entries). */
  serialize(): SessionSnapshot {
    return {
      version: 1,
      saved_at: Date.now(),
      mood: this.mood,
      running_gags: this.running_gags,
      recent_bits: this.recent_bits,
      catchphrases: Array.from(this.catchphrases.entries()),
      turn_counter: this.turn_counter,
    };
  }

  /** Rebuild a Session from a snapshot, defensively (the file may be corrupt or tampered). */
  static fromSnapshot(s: SessionSnapshot): Session {
    const sess = new Session();
    sess.mood = (MOOD_STYLES as readonly string[]).includes(s.mood) ? s.mood : DEFAULT_MOOD;
    sess.running_gags = Array.isArray(s.running_gags) ? s.running_gags : [];
    sess.recent_bits = Array.isArray(s.recent_bits) ? s.recent_bits.slice(-MAX_RECENT_BITS) : [];
    sess.catchphrases = new Map(Array.isArray(s.catchphrases) ? s.catchphrases : []);
    sess.turn_counter = typeof s.turn_counter === 'number' && s.turn_counter >= 0 ? s.turn_counter : 0;
    return sess;
  }

  /**
   * Persist to disk when SENSOR_HUMOR_PERSIST=true. Best-effort: an I/O failure is logged in
   * debug mode but never thrown into a tool call (degrade to in-memory, don't crash).
   */
  save(): void {
    if (!persistEnabled()) return;
    try {
      const file = sessionFilePath();
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, JSON.stringify(this.serialize()), 'utf-8');
    } catch (err) {
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Failed to persist session:', (err as Error).message);
      }
    }
  }
}

/** Load a persisted session if enabled, present, and fresh (<24h); otherwise null. */
function loadPersisted(): Session | null {
  if (!persistEnabled()) return null;
  try {
    const file = sessionFilePath();
    if (!existsSync(file)) return null;
    const snapshot = JSON.parse(readFileSync(file, 'utf-8')) as SessionSnapshot;
    if (!snapshotIsFresh(snapshot, Date.now())) {
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] Persisted session missing/stale (>24h); starting fresh');
      }
      return null;
    }
    return Session.fromSnapshot(snapshot);
  } catch (err) {
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error('[sensor-humor] Failed to load persisted session:', (err as Error).message);
    }
    return null;
  }
}

/** Singleton session for the current server process. */
let _session: Session | null = null;

export function getSession(): Session {
  if (!_session) {
    _session = loadPersisted() ?? new Session();
  }
  return _session;
}

export function resetSession(): Session {
  _session = new Session();
  // Overwrite any persisted file with the fresh empty state, so a restart after reset is clean.
  _session.save();
  return _session;
}
