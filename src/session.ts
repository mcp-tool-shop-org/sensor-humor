/**
 * Session state manager for sensor-humor.
 * In-memory only — session dies when server stops.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
import { sanitizeForPrompt, hasHarshLeak, hasSimileLeak } from './validators.js';

const MAX_RECENT_BITS = 20;
// Unbounded collections balloon the system prompt in a long persisted session; cap them like
// recent_bits and evict the stalest entry (lowest last_turn / use count) when over the cap.
const MAX_RUNNING_GAGS = 30;
const MAX_CATCHPHRASES = 30;
// How many entries each summary injects into the prompt — bounded so the prompt stays small even
// before eviction kicks in (recentBitsSummary already slices to the last 5; mirror that here).
const SUMMARY_INJECT_LIMIT = 5;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // stale gags aren't funny

// Snapshot schema versions this build can load. Adding a future version is a one-line change here
// (plus whatever migration fromSnapshot needs). An unknown version is discarded, not force-fit.
const SUPPORTED_SNAPSHOT_VERSIONS = new Set<number>([1]);

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
      if (this.running_gags.length > MAX_RUNNING_GAGS) {
        // Evict the stalest gag: lowest last_turn (oldest reference), then lowest use count.
        let stalest = 0;
        for (let i = 1; i < this.running_gags.length; i++) {
          const a = this.running_gags[i];
          const b = this.running_gags[stalest];
          if (a.last_turn < b.last_turn || (a.last_turn === b.last_turn && a.used < b.used)) {
            stalest = i;
          }
        }
        const [evicted] = this.running_gags.splice(stalest, 1);
        if (process.env.SENSOR_HUMOR_DEBUG === 'true' && evicted) {
          console.error(
            `[sensor-humor] Evicted gag "${evicted.tag}" (last turn ${evicted.last_turn}, used ${evicted.used}x; cap ${MAX_RUNNING_GAGS})`
          );
        }
      }
    }
    this.save();
  }

  /** Record a catchphrase use. Returns the new use count. */
  useCatchphrase(phrase: string): number {
    const count = (this.catchphrases.get(phrase) ?? 0) + 1;
    // Re-insert (delete + set) so a reused phrase moves to the end of the Map's insertion order —
    // it becomes "most recently used" and is last to be evicted on a tie.
    this.catchphrases.delete(phrase);
    this.catchphrases.set(phrase, count);
    if (this.catchphrases.size > MAX_CATCHPHRASES) {
      // Evict the least-used / stalest: lowest use count, ties broken by oldest insertion order.
      let stalestKey: string | undefined;
      let stalestCount = Infinity;
      for (const [k, c] of this.catchphrases) {
        if (c < stalestCount) {
          stalestCount = c;
          stalestKey = k;
        }
      }
      if (stalestKey !== undefined) {
        this.catchphrases.delete(stalestKey);
        if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
          console.error(
            `[sensor-humor] Evicted catchphrase "${stalestKey}" (used ${stalestCount}x; cap ${MAX_CATCHPHRASES})`
          );
        }
      }
    }
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
      const tag = String(g.tag).toLowerCase();
      if (tag.length < 3) return lower.includes(tag); // short tags: keep substring match
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`).test(lower);
    });
  }

  /** Compact summary of recent bits for prompt injection. */
  recentBitsSummary(): string {
    if (this.recent_bits.length === 0) return 'No bits yet this session.';
    const lines = this.recent_bits.slice(-5).map(
      (b, i) => `${i + 1}. [turn ${b.turn}, ${sanitizeForPrompt(b.technique)}] ${sanitizeForPrompt(b.text)}`
    );
    return `Recent bits:\n${lines.join('\n')}`;
  }

  /** Compact summary of running gags for prompt injection (most recent few, to keep the prompt bounded). */
  gagsSummary(): string {
    if (this.running_gags.length === 0) return 'No running gags yet.';
    // Inject only the most-recently-referenced gags (highest last_turn); same discipline as
    // recentBitsSummary's last-5 slice, so the prompt stays small even before eviction.
    const recent = [...this.running_gags]
      .sort((a, b) => a.last_turn - b.last_turn)
      .slice(-SUMMARY_INJECT_LIMIT);
    const lines = recent.map(
      (g) => `- "${sanitizeForPrompt(g.setup)}" (tag: ${sanitizeForPrompt(g.tag)}, used ${g.used}x, last turn ${g.last_turn})`
    );
    return `Running gags:\n${lines.join('\n')}`;
  }

  /** Compact summary of catchphrases for prompt injection (most recent few, to keep the prompt bounded). */
  catchphrasesSummary(): string {
    if (this.catchphrases.size === 0) return 'No catchphrases yet.';
    // The Map's insertion order is recency-ordered (useCatchphrase re-inserts on use); take the
    // most recent few so the prompt stays bounded, mirroring recentBitsSummary's last-5 slice.
    const lines = Array.from(this.catchphrases.entries())
      .slice(-SUMMARY_INJECT_LIMIT)
      .map(([phrase, count]) => `- "${sanitizeForPrompt(phrase)}" (used ${count}x)`);
    return `Catchphrases:\n${lines.join('\n')}`;
  }

  /** Buffer occupancy stats for debug_status. */
  bufferStats(): {
    recent_bits: number;
    max: number;
    running_gags: number;
    max_running_gags: number;
    catchphrases: number;
    max_catchphrases: number;
  } {
    return {
      recent_bits: this.recent_bits.length,
      max: MAX_RECENT_BITS,
      running_gags: this.running_gags.length,
      max_running_gags: MAX_RUNNING_GAGS,
      catchphrases: this.catchphrases.size,
      max_catchphrases: MAX_CATCHPHRASES,
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
    // Version guard: serialize() stamps a schema version, but older builds never read it on load —
    // an unknown-versioned (future or tampered) file would be force-fit through the v1 field logic
    // below. If the version isn't one we support, discard the snapshot and start fresh rather than
    // run unknown-shaped data through v1 parsing.
    if (!SUPPORTED_SNAPSHOT_VERSIONS.has((s as { version?: number })?.version as number)) {
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error(
          `[sensor-humor] persisted snapshot version ${(s as { version?: number })?.version} not supported, starting fresh`
        );
      }
      return sess;
    }
    // Defense-in-depth: a tampered or legacy persist file could carry a slur/simile in a stored
    // gag, bit, or catchphrase. Drop dirty content on LOAD so it never enters the live session,
    // reaches a prompt (stateSummary), or is replayed to the user (callback). This complements
    // the terminal output gates — fail-closed at the door.
    const isDirty = (t: unknown): boolean =>
      typeof t === 'string' && (hasHarshLeak(t) || hasSimileLeak(t));
    sess.mood = (MOOD_STYLES as readonly string[]).includes(s.mood) ? s.mood : DEFAULT_MOOD;
    sess.running_gags = Array.isArray(s.running_gags)
      ? s.running_gags.filter(
          (g): g is RunningGag =>
            !!g &&
            typeof (g as RunningGag).setup === 'string' &&
            typeof (g as RunningGag).tag === 'string' &&
            !isDirty((g as RunningGag).setup) &&
            !isDirty((g as RunningGag).tag)
        )
      : [];
    sess.recent_bits = Array.isArray(s.recent_bits)
      ? s.recent_bits.slice(-MAX_RECENT_BITS).filter((b) => !isDirty((b as RecentBit)?.text))
      : [];
    sess.catchphrases = new Map(
      (Array.isArray(s.catchphrases) ? s.catchphrases : []).filter(
        (e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && !isDirty(e[0])
      )
    );
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
      // Atomic write: write to a temp file then rename into place, so an interrupted
      // write cannot clobber a good prior session.json.
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.serialize()), 'utf-8');
      renameSync(tmp, file);
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
