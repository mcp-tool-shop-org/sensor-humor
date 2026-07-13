/**
 * CLI (HUMAN-OPERATED): collect the comedic-moods BWS human anchor (Slice 4, decision B.2).
 *
 * Reads a capture/enriched JSONL, groups the valid lines by mood, and — per mood — actively selects the
 * next Best-Worst-Scaling tuple to show you (least-sampled + closest-strength frontier, Mikhailiuk 2020),
 * presents its k lines, and reads your BEST / WORST pick from stdin. Each judgment is appended to the
 * anchor JSONL immediately. The anchor is the small human set that TRAINS + VALIDATES the bulk
 * embodiment scorer (decision A) — it is not the bulk label.
 *
 * SAFE BY CONSTRUCTION: the anchor is written APPEND-ONLY — a judgment is flushed the instant you make
 * it and existing lines are never rewritten, so a crash/quit can only ever lose the tuple in flight, not
 * prior work. RESUMABLE: on start it reads the existing anchor and skips every tuple already judged, so
 * you build toward the ~100–200 comparisons/mood target across many short sessions. There is no
 * irreversible/external action here (no network, no publish); the only side effect is the local
 * append-only file — undo = delete or truncate the anchor.
 *
 * Grounding: BWS > rating scales at lower cost (Kiritchenko & Mohammad 2017, arXiv:1712.01765); active
 * sampling ~3× fewer comparisons (Mikhailiuk et al. 2020, arXiv:2004.05691); Bradley-Terry over the
 * implied pairs handles intransitivity (Xu et al. 2025, arXiv:2502.14074).
 *
 * Usage:
 *   npx tsx scripts/label-comedic-moods.ts <capture-or-enriched.jsonl>
 *        [--anchor <anchor.jsonl>]   output (default: <input-base>.anchor.jsonl), append-only + resumable
 *        [--mood <mood>]             label ONLY this mood (default: all six, in canonical order)
 *        [--k <n>]                   tuple size shown per judgment (default 4)
 *        [--target <n>]              stop a mood at n TOTAL judgments incl. resumed (default 24/mood)
 *        [--rater <id>]              stamp each judgment with this rater id
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { MOOD_STYLES, MOOD_DESCRIPTIONS, type MoodStyle } from '../src/types.js';
import {
  BWS_JUDGMENT_SCHEMA,
  lineId,
  judgmentRecordToBws,
  type BwsJudgmentRecord,
} from '../src/dataset/label/schema.js';
import { validateBwsJudgmentsJsonl } from '../src/dataset/label/validate.js';
import { selectNextTuple } from '../src/dataset/label/bws-active.js';
import {
  bwsCountScores,
  fitBradleyTerry,
  findIntransitiveTriples,
  judgmentsToPairs,
  tupleKey,
  type BwsJudgment,
} from '../src/dataset/label/bws.js';

function usage(msg: string): never {
  console.error(msg);
  console.error(
    'usage: tsx scripts/label-comedic-moods.ts <capture-or-enriched.jsonl> [--anchor <file>] [--mood <mood>] [--k <n>] [--target <n>] [--rater <id>]',
  );
  process.exit(2);
}

// --- argv ------------------------------------------------------------------
const args = process.argv.slice(2);
let input: string | undefined;
let anchor: string | undefined;
let onlyMood: MoodStyle | undefined;
let k = 4;
let target = 24;
let rater: string | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--anchor') anchor = args[++i];
  else if (a === '--rater') rater = args[++i];
  else if (a === '--mood') {
    const v = args[++i];
    if (!(MOOD_STYLES as readonly string[]).includes(v)) usage(`invalid --mood '${v}' (expected: ${MOOD_STYLES.join(' | ')})`);
    onlyMood = v as MoodStyle;
  } else if (a === '--k') {
    k = parseInt(args[++i], 10);
    if (!Number.isInteger(k) || k < 2) usage('--k must be an integer >= 2');
  } else if (a === '--target') {
    target = parseInt(args[++i], 10);
    if (!Number.isInteger(target) || target < 1) usage('--target must be a positive integer');
  } else if (a.startsWith('--')) usage(`unknown flag '${a}'`);
  else if (input === undefined) input = a;
  else usage(`unexpected extra argument '${a}'`);
}
if (input === undefined) usage('missing <capture-or-enriched.jsonl>');
const anchorFile = anchor ?? `${input.replace(/\.jsonl$/i, '')}.anchor.jsonl`;
const moods: MoodStyle[] = onlyMood ? [onlyMood] : [...MOOD_STYLES];

// --- read corpus (lenient, like the eval CLI: any valid row with a known mood + output) ------------
let corpusText: string;
try {
  corpusText = readFileSync(input, 'utf-8');
} catch (e) {
  usage(`cannot read ${input}: ${(e as Error).message}`);
}
const MOODS = new Set<string>(MOOD_STYLES);
const idText = new Map<string, string>(); // stable lineId → the line's output text (for display)
const idMood = new Map<string, MoodStyle>();
for (const raw of corpusText.split(/\r?\n/)) {
  if (!raw.trim()) continue;
  let r: { mood?: string; output?: string; valid?: boolean };
  try {
    r = JSON.parse(raw);
  } catch {
    continue; // a malformed corpus line is validate-comedic-moods' concern, not the labeler's
  }
  if (r.valid === true && typeof r.output === 'string' && r.output && r.mood && MOODS.has(r.mood)) {
    const mood = r.mood as MoodStyle;
    const id = lineId(mood, r.output);
    if (!idText.has(id)) {
      idText.set(id, r.output);
      idMood.set(id, mood);
    }
  }
}
const byMood = new Map<MoodStyle, string[]>();
for (const [id, mood] of idMood) byMood.set(mood, [...(byMood.get(mood) ?? []), id]);
for (const [mood, ids] of byMood) byMood.set(mood, [...ids].sort());
if (idText.size === 0) usage('no valid rows to label (need valid:true rows with a known mood + non-empty output)');

// --- resume: load existing anchor → per-mood judgments + already-judged tuple keys ------------------
const judgmentsByMood = new Map<MoodStyle, BwsJudgment[]>();
const seenByMood = new Map<MoodStyle, Set<string>>();
for (const mood of MOOD_STYLES) {
  judgmentsByMood.set(mood, []);
  seenByMood.set(mood, new Set<string>());
}
if (existsSync(anchorFile)) {
  const prev = validateBwsJudgmentsJsonl(readFileSync(anchorFile, 'utf-8'));
  if (prev.invalid > 0)
    console.error(`  warning: ${prev.invalid} existing anchor line(s) failed the contract and were ignored (run validate-bws-anchor.ts for detail)`);
  for (const rec of prev.records) {
    judgmentsByMood.get(rec.mood)!.push(judgmentRecordToBws(rec));
    seenByMood.get(rec.mood)!.add(tupleKey(rec.line_ids));
  }
}

// --- helpers ---------------------------------------------------------------
const preview = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 68);

function appendRecord(rec: BwsJudgmentRecord): void {
  mkdirSync(dirname(anchorFile), { recursive: true });
  appendFileSync(anchorFile, JSON.stringify(rec) + '\n', 'utf-8'); // append-only: prior judgments are never at risk
}

/**
 * A prompt reader over readline that is correct for BOTH interactive and piped stdin. We deliberately do
 * NOT use `rl.question`: with fast piped input, readline emits `'line'` events for every buffered line
 * up front, and any line that arrives while no question is pending is dropped — so a scripted stdin loses
 * all but the first answer. Instead we buffer every `'line'` and hand them out one per `ask`, resolving
 * null on EOF/close so a finished/piped stdin ends the loop cleanly instead of hanging.
 */
function createAsker(rl: Interface): (q: string) => Promise<string | null> {
  const buffered: string[] = [];
  const waiting: Array<(v: string | null) => void> = [];
  let closed = false;
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line.trim());
    else buffered.push(line.trim());
  });
  rl.on('close', () => {
    closed = true;
    while (waiting.length) waiting.shift()!(null);
  });
  return (q: string) =>
    new Promise<string | null>((resolve) => {
      process.stdout.write(q); // write the prompt without a newline so the answer follows it on a TTY
      if (buffered.length) return resolve(buffered.shift()!);
      if (closed) return resolve(null);
      waiting.push(resolve);
    });
}

function parseIndex(ans: string, size: number): number | null {
  const n = Number.parseInt(ans, 10);
  return Number.isInteger(n) && n >= 1 && n <= size ? n - 1 : null;
}
const isQuit = (a: string): boolean => a.toLowerCase() === 'q' || a.toLowerCase() === 'quit';
const isSkip = (a: string): boolean => a.toLowerCase() === 's' || a.toLowerCase() === 'skip';

// --- run -------------------------------------------------------------------
console.error(`[label] corpus ${input} · anchor ${anchorFile} · k=${k} · target=${target}/mood${rater ? ` · rater=${rater}` : ''}`);
for (const mood of moods) {
  const n = (byMood.get(mood) ?? []).length;
  const have = judgmentsByMood.get(mood)!.length;
  console.error(`  ${mood}: ${n} line(s), ${have}/${target} judged${n < k ? `  (fewer than k=${k} lines — will skip)` : ''}`);
}
console.error('[label] BWS anchor (Kiritchenko 2017) + active selection (Mikhailiuk 2020); study-swarm target ~100–200/mood accumulated across resumable sessions.');
console.error('[label] enter the line NUMBER for BEST then WORST; s=skip this tuple, q=quit. Progress saves after every judgment.\n');

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = createAsker(rl);
  let quit = false;

  for (const mood of moods) {
    if (quit) break;
    const items = byMood.get(mood) ?? [];
    if (items.length < k) continue; // already reported above
    const judged = judgmentsByMood.get(mood)!;
    const seen = seenByMood.get(mood)!;
    const startCount = judged.length;

    while (judged.length < target) {
      const tuple = selectNextTuple(items, judged, k, { exclude: seen });
      const key = tupleKey(tuple.items);
      if (seen.has(key)) {
        console.error(`  [${mood}] frontier exhausted (${items.length} lines, ${judged.length} judged) — moving on`);
        break;
      }

      console.log(`\n── ${mood} ── judgment ${judged.length + 1}/${target} · ${MOOD_DESCRIPTIONS[mood]}`);
      tuple.items.forEach((id, i) => console.log(`  [${i + 1}] ${preview(idText.get(id) ?? id)}`));

      const bestAns = await ask(`  BEST embodies "${mood}" (1-${k}, s=skip, q=quit): `);
      if (bestAns === null || isQuit(bestAns)) {
        quit = true;
        break;
      }
      if (isSkip(bestAns)) {
        seen.add(key); // don't show this tuple again
        continue;
      }
      const bi = parseIndex(bestAns, k);
      if (bi === null) {
        console.log(`  ? enter a number 1-${k}`);
        continue;
      }

      const worstAns = await ask(`  WORST embodies "${mood}" (1-${k}, s=skip, q=quit): `);
      if (worstAns === null || isQuit(worstAns)) {
        quit = true;
        break;
      }
      if (isSkip(worstAns)) {
        seen.add(key);
        continue;
      }
      const wi = parseIndex(worstAns, k);
      if (wi === null) {
        console.log(`  ? enter a number 1-${k}`);
        continue;
      }
      if (bi === wi) {
        console.log('  best and worst must differ — try again');
        continue;
      }

      const rec: BwsJudgmentRecord = {
        schema: BWS_JUDGMENT_SCHEMA,
        ts: Date.now(),
        mood,
        line_ids: tuple.items,
        best: tuple.items[bi],
        worst: tuple.items[wi],
        ...(rater ? { rater } : {}),
      };
      appendRecord(rec);
      judged.push(judgmentRecordToBws(rec));
      seen.add(key);
    }

    if (judged.length > startCount) console.error(`  [${mood}] +${judged.length - startCount} this session → ${judged.length} total`);
  }

  rl.close();
  printSummary();
}

function printSummary(): void {
  console.log('\n=== anchor rankings (per mood, within-mood) ===');
  for (const mood of moods) {
    const judged = judgmentsByMood.get(mood)!;
    if (judged.length === 0) {
      console.log(`\n[${mood}] no judgments yet`);
      continue;
    }
    const pairs = judgmentsToPairs(judged);
    const counts = bwsCountScores(judged);
    const bt = fitBradleyTerry(pairs);
    const cycles = findIntransitiveTriples(pairs);
    console.log(`\n[${mood}] ${judged.length} judgment(s) · ${counts.length} lines ranked · ${cycles.length} intransitive triple(s)`);
    console.log('  BWS (best−worst)/appearances — best→worst:');
    counts.slice(0, 8).forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.score.toFixed(2).padStart(5)}  ${preview(idText.get(r.item) ?? r.item)}`));
    console.log('  Bradley-Terry strength — strongest→weakest:');
    bt.slice(0, 5).forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.score.toFixed(3)}  ${preview(idText.get(r.item) ?? r.item)}`));
    if (cycles.length > 0)
      console.log(`  ⚠ ${cycles.length} intransitive triple(s) — inconsistent comparisons (Xu 2025); more judgments will stabilize the fit.`);
  }
  console.log(`\nanchor: ${anchorFile}  (validate: npx tsx scripts/validate-bws-anchor.ts ${anchorFile})`);
}

main().catch((e) => {
  console.error(`[label] failed: ${(e as Error).message}`);
  process.exit(2);
});
