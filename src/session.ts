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
  type TraceEntry,
} from './types.js';
import { sanitizeForPrompt, hasHarshLeak, hasSimileLeak } from './validators.js';
import { captureRow } from './capture.js';

const MAX_RECENT_BITS = 20;
/**
 * Forensic trace ring depth (ROADMAP v2.0 "Chain Trace Tool"). Kept small and bounded like
 * recent_bits — a debug_chain call only ever needs the LAST handful of calls to reconstruct a
 * recent pipeline, and heavy full-trace entries (prompt/raw/parsed) must not accumulate unbounded.
 */
const MAX_TRACES = 10;
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

/** True for a real finite number (rejects NaN/Infinity and non-numbers). Snapshot fields use this. */
function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function persistEnabled(): boolean {
  return process.env.SENSOR_HUMOR_PERSIST === 'true';
}

/**
 * Full-trace capture flag (ROADMAP v2.0 "Chain Trace Tool"). When true, each trace entry
 * additionally carries the heavy fields (full prompt text + raw model output + parsed output).
 * Default OFF so the trace ring stays small — mirrors the SENSOR_HUMOR_PERSIST boolean knob.
 */
export function fullTraceEnabled(): boolean {
  return process.env.SENSOR_HUMOR_FULL_TRACE === 'true';
}

// ── Callback mechanic knobs (the running-gag/callback feature) ──────────────────────────────────
// Two tuning constants govern when a planted gag is an eligible callback candidate. Both are
// env-overridable, mirroring getTimeoutMs/getTemperature in ollama.ts (parse, clamp sane,
// invalid/absent -> default with a debug-gated log).

/** Default turns a gag must age past its setup before it can fire (see Ma et al. 2026 below). */
const DEFAULT_GAG_MIN_DISTANCE = 2;
/** Default number of fires after which a gag retires (see Pistole & Shor / Schmidt & Eisend). */
const DEFAULT_GAG_MAX_FIRES = 3;

/**
 * Minimum temporal distance (in turns) between a gag's setup and its first eligible callback.
 * Grounding: Ma et al. 2026 (arXiv:2605.00143) — for callbacks, temporal distance / built-up
 * anticipation outweighs the content of the tag itself; firing a callback immediately after its
 * setup reads as repetition, not payoff. So a freshly-planted gag is withheld until it has aged
 * at least this many turns. Env: SENSOR_HUMOR_GAG_MIN_DISTANCE, clamped 0..20 (0 = fire
 * immediately, disabling the gate; 20 caps how long a gag can be starved). Invalid/absent ->
 * default, matching the getTimeoutMs env-knob pattern.
 */
export function getGagMinDistance(): number {
  const env = process.env.SENSOR_HUMOR_GAG_MIN_DISTANCE;
  if (env === undefined) return DEFAULT_GAG_MIN_DISTANCE;
  const n = Number.parseInt(env, 10);
  if (!Number.isFinite(n) || n < 0 || n > 20) {
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error(
        `[sensor-humor] Invalid SENSOR_HUMOR_GAG_MIN_DISTANCE="${env}" (want 0..20); falling back to ${DEFAULT_GAG_MIN_DISTANCE}`,
      );
    }
    return DEFAULT_GAG_MIN_DISTANCE;
  }
  return n;
}

/**
 * Maximum times a gag may fire before it retires (stops being an eligible callback candidate).
 * Grounding: Pistole & Shor 1979 (DOI:10.1080/00221309.1979.9710524) and Schmidt & Eisend 2015
 * (DOI:10.1080/00913367.2015.1018460) — humor repetition follows an inverted-U: funniness rises
 * to a low peak around 3–4 exposures, then decays into tedium. Retiring a gag at this cap stops
 * it before the down-slope. A gag's `used` count is its fire count (comic_timing bumps it on an
 * honored callback). Env: SENSOR_HUMOR_GAG_MAX_FIRES, clamped 1..10 (must allow at least one
 * fire). Invalid/absent -> default, matching the getTimeoutMs env-knob pattern.
 */
export function getGagMaxFires(): number {
  const env = process.env.SENSOR_HUMOR_GAG_MAX_FIRES;
  if (env === undefined) return DEFAULT_GAG_MAX_FIRES;
  const n = Number.parseInt(env, 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) {
    if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
      console.error(
        `[sensor-humor] Invalid SENSOR_HUMOR_GAG_MAX_FIRES="${env}" (want 1..10); falling back to ${DEFAULT_GAG_MAX_FIRES}`,
      );
    }
    return DEFAULT_GAG_MAX_FIRES;
  }
  return n;
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
  /** Lifetime count of gags evicted by the LRU cap. Invisible outside SENSOR_HUMOR_DEBUG before —
   *  surfaced in bufferStats/debug_status so churn (a session hammering distinct gags) is legible. */
  gags_evicted: number;
  /** Lifetime count of catchphrases evicted by the LRU cap (same rationale as gags_evicted). */
  catchphrases_evicted: number;
  /**
   * Forensic trace ring (ROADMAP v2.0 "Chain Trace Tool"): the last MAX_TRACES comedy-tool calls,
   * oldest-first internally. debug_chain reads it newest-first via getTraces(). In-memory only and
   * NOT persisted — traces are a live-debugging aid (they can carry full prompt/raw text under
   * SENSOR_HUMOR_FULL_TRACE, which must never land in the session.json file) and reset with the
   * session by virtue of a fresh Session() starting empty.
   */
  traces: TraceEntry[];

  constructor() {
    this.mood = DEFAULT_MOOD;
    this.running_gags = [];
    this.recent_bits = [];
    this.catchphrases = new Map();
    this.turn_counter = 0;
    this.gags_evicted = 0;
    this.catchphrases_evicted = 0;
    this.traces = [];
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
        // Stamp the plant turn so the callback distance gate can measure age since setup
        // independently of last reference (callback-revival C2; Ma et al. 2026).
        created_turn: this.turn_counter,
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
        this.gags_evicted++;
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
        this.catchphrases_evicted++;
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
   * Record one comedy-tool call into the forensic trace ring (ROADMAP v2.0 "Chain Trace Tool").
   * Bounded exactly like pushBit: append, then evict the oldest when over MAX_TRACES, so the ring
   * always holds the most-recent MAX_TRACES calls. Traces are in-memory only and NOT persisted, so
   * this deliberately does NOT call save() (unlike the other mutators) — the heavy full-trace
   * fields must never be written to disk, and a trace is a live-session debugging aid.
   */
  recordTrace(entry: TraceEntry): void {
    this.traces.push(entry);
    if (this.traces.length > MAX_TRACES) {
      const evicted = this.traces.shift();
      if (process.env.SENSOR_HUMOR_DEBUG === 'true' && evicted) {
        console.error(`[sensor-humor] Evicted trace from turn ${evicted.turn} (ring full at ${MAX_TRACES})`);
      }
    }
    // Opt-in dataset capture (SENSOR_HUMOR_CAPTURE): append this generation to the comedic-moods
    // JSONL dataset. No-op when the flag is unset; best-effort so it can never break a tool call.
    // Kept OUT of the in-memory trace ring above — capture is a separate, durable dataset sink that
    // (unlike the trace) IS persisted, so it deliberately does not touch save() or the ring's fields.
    captureRow(entry);
  }

  /**
   * The most recent trace entries, NEWEST first, capped to `limit` (default MAX_TRACES). Backing
   * accessor for the debug_chain tool. Returns a shallow copy so a caller can't mutate the ring;
   * `limit` is clamped to [0, MAX_TRACES] so an over-large or negative request stays bounded.
   */
  getTraces(limit = MAX_TRACES): TraceEntry[] {
    const clamped = Math.max(0, Math.min(MAX_TRACES, Math.floor(limit)));
    // Copy, reverse to newest-first, then slice to the clamped limit.
    return [...this.traces].reverse().slice(0, clamped);
  }

  /**
   * Whether a gag is currently eligible to fire as a callback — the inverted-U + distance gates
   * that revive the callback mechanic (callback-revival C2 + C3). A gag is eligible only if it has
   * BOTH:
   *   - aged at least SENSOR_HUMOR_GAG_MIN_DISTANCE turns since its setup (Ma et al. 2026,
   *     arXiv:2605.00143 — temporal distance / anticipation is what makes a callback land, so a gag
   *     is withheld until it is old enough), AND
   *   - not yet retired: fired fewer than SENSOR_HUMOR_GAG_MAX_FIRES times (Pistole & Shor 1979
   *     DOI:10.1080/00221309.1979.9710524 + Schmidt & Eisend 2015 DOI:10.1080/00913367.2015.1018460
   *     — humor repetition is an inverted-U peaking low ~3–4 exposures, then tedium; retire before
   *     the down-slope).
   * `used` is the fire count (comic_timing bumps it on an honored callback). created_turn falls
   * back to last_turn for legacy gags that predate the field.
   */
  isEligibleCallback(gag: RunningGag): boolean {
    const plantedTurn = gag.created_turn ?? gag.last_turn;
    const age = this.turn_counter - plantedTurn;
    if (age < getGagMinDistance()) return false; // too soon after setup — no anticipation yet
    if (gag.used >= getGagMaxFires()) return false; // retired: past the inverted-U peak
    return true;
  }

  /**
   * Find gags whose tags appear in the given text AND that are currently eligible callbacks.
   * Used by comic_timing to decide if a callback is available. Eligibility (isEligibleCallback)
   * enforces the distance gate and the retirement cap, so a gag planted this turn, or one that has
   * already fired its cap, is correctly excluded — the fix that makes the revived mechanic behave.
   */
  findCallbackCandidates(text: string): RunningGag[] {
    const lower = text.toLowerCase();
    return this.running_gags.filter((g) => {
      if (!this.isEligibleCallback(g)) return false;
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
    gags_evicted: number;
    catchphrases_evicted: number;
  } {
    return {
      recent_bits: this.recent_bits.length,
      max: MAX_RECENT_BITS,
      running_gags: this.running_gags.length,
      max_running_gags: MAX_RUNNING_GAGS,
      catchphrases: this.catchphrases.size,
      max_catchphrases: MAX_CATCHPHRASES,
      // Eviction counters: non-zero means the caps are actively churning entries out — a
      // legibility signal that was previously only a debug-only stderr line.
      gags_evicted: this.gags_evicted,
      catchphrases_evicted: this.catchphrases_evicted,
    };
  }

  /**
   * The most-recently-referenced running gags, newest first, capped to `limit`. Accessor for
   * debug_status so it can surface gag CONTENTS (setup/tag/used/last_turn) — bounded so a long
   * session's full gag list never bloats the tool output. Ordering mirrors gagsSummary's
   * highest-last_turn selection.
   */
  recentGags(limit = SUMMARY_INJECT_LIMIT): RunningGag[] {
    return [...this.running_gags]
      .sort((a, b) => b.last_turn - a.last_turn)
      .slice(0, Math.max(0, limit));
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
    try {
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
        ? s.running_gags
            .filter((g): g is RunningGag => {
              if (g === null || typeof g !== 'object') return false;
              const gag = g as RunningGag;
              return (
                typeof gag.setup === 'string' &&
                typeof gag.tag === 'string' &&
                isFiniteNumber(gag.used) &&
                isFiniteNumber(gag.last_turn) &&
                !isDirty(gag.setup) &&
                !isDirty(gag.tag)
              );
            })
            .map((g) => ({
              setup: g.setup,
              tag: g.tag,
              used: g.used,
              last_turn: g.last_turn,
              created_turn: isFiniteNumber(g.created_turn) ? g.created_turn : g.last_turn,
            }))
            .slice(-MAX_RUNNING_GAGS)
        : [];
      sess.recent_bits = Array.isArray(s.recent_bits)
        ? s.recent_bits
            .filter((b): b is RecentBit => {
              if (b === null || typeof b !== 'object') return false;
              const bit = b as RecentBit;
              return (
                typeof bit.text === 'string' &&
                typeof bit.technique === 'string' &&
                isFiniteNumber(bit.turn) &&
                !isDirty(bit.text)
              );
            })
            .map((b) => ({ text: b.text, turn: b.turn, technique: b.technique }))
            .slice(-MAX_RECENT_BITS)
        : [];
      sess.catchphrases = new Map(
        (Array.isArray(s.catchphrases) ? s.catchphrases : [])
          .filter(
            (e): e is [string, number] =>
              Array.isArray(e) && typeof e[0] === 'string' && isFiniteNumber(e[1]) && !isDirty(e[0]),
          )
          .slice(-MAX_CATCHPHRASES),
      );
      sess.turn_counter = isFiniteNumber(s.turn_counter) && s.turn_counter >= 0 ? s.turn_counter : 0;
      return sess;
    } catch (err) {
      if (process.env.SENSOR_HUMOR_DEBUG === 'true') {
        console.error('[sensor-humor] fromSnapshot threw; starting fresh:', (err as Error).message);
      }
      return new Session();
    }
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
