/**
 * comedic-moods-v0 — crowd-labeler serve/ingest CORE (Slice 4, decision B.2 — the public flavor).
 *
 * Pure decision logic behind the two browser seams the web labeler exposes (`loadNextTuple` /
 * `submitJudgment`):
 *   - buildLinePool    : corpus JSONL → per-mood pool of {id,text} (stable content-derived ids)
 *   - nextRound        : active-select the next BWS tuple to SERVE a rater (wraps `selectNextTuple`)
 *   - validateJudgment : contract-check an INCOMING judgment against `BwsJudgmentRecordSchema`
 *   - isHoneypotBest   : QC signal — a rater who crowns a canned/degraded line as BEST is suspect
 *
 * No I/O, no clock, no http — a total function of its inputs, so the seam is unit-testable; the thin
 * `scripts/serve-labeler.ts` adds the node:http transport, the append-only files, and the in-memory
 * state. This mirrors the CLI split (pure `bws.ts`/`bws-active.ts` + thin `label-comedic-moods.ts`).
 *
 * Selection uses the AGGREGATE judgments for a mood (all raters) to drive the active fit — more crowd
 * data ⇒ better tuples (Mikhailiuk 2020) — while the per-rater `exclude` (already-seen tuple keys) lets
 * DIFFERENT raters overlap on the same tuple. Overlap is deliberate: inter-rater agreement / split-half
 * reliability (the crowd-quality signal) is measured exactly on the tuples multiple raters both judge.
 */
import { MOOD_STYLES, MOOD_DESCRIPTIONS, type MoodStyle } from '../../types.js';
import { lineId, BwsJudgmentRecordSchema, type BwsJudgmentRecord } from './schema.js';
import { tupleKey, type BwsJudgment } from './bws.js';
import { selectNextTuple } from './bws-active.js';

/** One line as sent to the browser: the stable id + its text. The client never computes the id. */
export interface RoundLine {
  id: string;
  text: string;
}

/** A round to present: one mood (as a character) + the k lines of that mood to rank. */
export interface Round {
  mood: MoodStyle;
  moodLabel: string;
  moodVoice: string;
  lines: RoundLine[];
}

/** Per-mood pool of the corpus's valid lines, keyed by mood. */
export type LinePool = Map<MoodStyle, RoundLine[]>;

const MOODS = new Set<string>(MOOD_STYLES);
const label = (m: MoodStyle): string => m.charAt(0).toUpperCase() + m.slice(1);

/**
 * Build the per-mood line pool from a capture/enriched JSONL (lenient read, like the eval + labeling
 * CLIs: any valid row with a known mood + non-empty output). Lines are keyed by the SAME stable
 * content-derived id the anchor uses (`lineId`), deduped globally, and sorted by id for a stable pool.
 */
export function buildLinePool(corpusText: string): LinePool {
  const pool: LinePool = new Map();
  const seen = new Set<string>();
  for (const raw of corpusText.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let r: { mood?: string; output?: string; valid?: boolean };
    try {
      r = JSON.parse(raw);
    } catch {
      continue;
    }
    if (r.valid === true && typeof r.output === 'string' && r.output && r.mood && MOODS.has(r.mood)) {
      const mood = r.mood as MoodStyle;
      const id = lineId(mood, r.output);
      if (seen.has(id)) continue;
      seen.add(id);
      pool.set(mood, [...(pool.get(mood) ?? []), { id, text: r.output }]);
    }
  }
  for (const [m, arr] of pool) pool.set(m, [...arr].sort((a, b) => a.id.localeCompare(b.id)));
  return pool;
}

export interface NextRoundOptions {
  /** Tuple size to present (default 4). */
  k?: number;
  /** Force a specific mood; otherwise the least-labeled eligible mood is chosen (coverage balance). */
  mood?: MoodStyle;
  /** Tuple keys this rater has already judged — so they are not shown the same tuple twice. */
  exclude?: Iterable<string>;
}

/**
 * Choose the next round to serve. Among moods with ≥k lines, prefers the one with the FEWEST aggregate
 * judgments (spreads crowd effort across moods), then active-selects that mood's most informative
 * unseen-by-this-rater tuple. Returns null when no mood is eligible, or when every eligible mood's
 * frontier is exhausted for this rater (the caller can then show a "you're all caught up" state).
 */
export function nextRound(
  pool: LinePool,
  judgmentsByMood: Map<MoodStyle, BwsJudgment[]>,
  opts: NextRoundOptions = {},
): Round | null {
  const { k = 4, mood, exclude } = opts;
  const excludeSet = new Set(exclude ?? []);
  const eligible = (mood ? [mood] : [...MOOD_STYLES]).filter((m) => (pool.get(m)?.length ?? 0) >= k);
  const ordered = eligible.sort(
    (a, b) =>
      (judgmentsByMood.get(a)?.length ?? 0) - (judgmentsByMood.get(b)?.length ?? 0) ||
      MOOD_STYLES.indexOf(a) - MOOD_STYLES.indexOf(b),
  );
  for (const m of ordered) {
    const lines = pool.get(m)!;
    const ids = lines.map((l) => l.id);
    const tuple = selectNextTuple(ids, judgmentsByMood.get(m) ?? [], k, { exclude: excludeSet });
    if (excludeSet.has(tupleKey(tuple.items))) continue; // frontier exhausted for this rater → try next mood
    const byId = new Map(lines.map((l) => [l.id, l.text]));
    return {
      mood: m,
      moodLabel: label(m),
      moodVoice: MOOD_DESCRIPTIONS[m],
      lines: tuple.items.map((id) => ({ id, text: byId.get(id) ?? id })),
    };
  }
  return null;
}

export interface IngestResult {
  ok: boolean;
  /** The parsed, contract-valid record (present iff ok). */
  record?: BwsJudgmentRecord;
  /** Human-readable contract issues (present iff !ok). */
  issues?: string[];
}

/**
 * Validate an incoming submit payload `{ judgment, meta? }`: the `judgment` must satisfy the strict
 * anchor contract (`BwsJudgmentRecordSchema`); `meta` is an opaque research sidecar the caller persists
 * separately (never smuggled into the strict record). Returns the parsed record or the field-level
 * issues — the server rejects with the issues rather than appending a malformed judgment.
 */
export function validateJudgment(payload: unknown): IngestResult {
  if (typeof payload !== 'object' || payload === null || !('judgment' in payload))
    return { ok: false, issues: ['payload must be an object with a `judgment` field'] };
  const res = BwsJudgmentRecordSchema.safeParse((payload as { judgment: unknown }).judgment);
  if (!res.success)
    return { ok: false, issues: res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  return { ok: true, record: res.data };
}

/**
 * QC honeypot signal: true if the rater crowned a known canned/degraded line as BEST. Seed the pool with
 * the eval's degraded-line controls (a generic line that answers nothing) as honeypots — a genuine rater
 * ranks them WORST, so a BEST here flags low-effort/adversarial input for downstream agreement filtering.
 */
export function isHoneypotBest(record: BwsJudgmentRecord, honeypotIds: ReadonlySet<string>): boolean {
  return honeypotIds.has(record.best);
}
