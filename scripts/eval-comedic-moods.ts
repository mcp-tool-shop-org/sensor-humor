/**
 * CLI: run the comedic-moods-v0 falsifiable eval over a capture/enriched JSONL, with cross-family
 * Ollama judge pools, and print the pre-registered gate verdict.
 *
 * Exit 0 when v0 PASSES every gate on every pool, 1 when a gate FAILS (the eval is falsifiable — a
 * failing control is a real, reportable result, not an error), 2 on usage/IO error.
 *
 * Usage:
 *   npx tsx scripts/eval-comedic-moods.ts <capture-or-enriched.jsonl>
 *        [--judges mistral-small:24b,gemma4:31b,granite4.1:30b]   cross-family panel (NEVER a qwen* model)
 *        [--limit N]                                              cap real rows (quick smoke run)
 *
 * The generator is qwen2.5:7b, so judges MUST be a different family — the CLI refuses any qwen* model.
 * The primary verdict is the per-line MAJORITY across the panel (Verga PoLL); per-family numbers are
 * reported as diagnostics. Judges run sequentially on the local GPU; a full 96-row × 3-family run is
 * many 24–31B calls (minutes).
 */
import { readFileSync } from 'node:fs';
import { MOOD_STYLES, type MoodStyle } from '../src/types.js';
import { STATIC_SAFE_FALLBACK } from '../src/validators.js';
import { ollamaJudge } from '../src/dataset/eval/ollama-judge.js';
import { evaluate, type EvalRow, type DegradedLine } from '../src/dataset/eval/controls.js';

function die(msg: string, code = 2): never {
  console.error(msg);
  if (code === 2) console.error('usage: tsx scripts/eval-comedic-moods.ts <jsonl> [--judges m1,m2] [--limit N]');
  process.exit(code);
}

// --- argv ------------------------------------------------------------------
const args = process.argv.slice(2);
let input: string | undefined;
// Default: a 3-family cross-family PANEL (Verga PoLL — a decorrelated panel beats any single judge and
// halves self-preference). All non-qwen (the generator's family). ≥3 avoids majority-vote ties.
let judgeModels = ['mistral-small:24b', 'gemma4:31b', 'granite4.1:30b'];
let limit = Infinity;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--judges') judgeModels = (args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--limit') limit = Math.max(1, parseInt(args[++i], 10) || 1);
  else if (a.startsWith('--')) die(`unknown flag '${a}'`);
  else if (input === undefined) input = a;
  else die(`unexpected extra argument '${a}'`);
}
if (!input) die('missing <capture-or-enriched.jsonl>');
if (judgeModels.length === 0) die('no judge models given');
// Guard the "no model judges its own comedy" invariant: the generator is qwen2.5:7b.
const sameFamily = judgeModels.filter((m) => /qwen/i.test(m));
if (sameFamily.length) die(`judge(s) ${sameFamily.join(', ')} are the same family as the generator (qwen2.5:7b) — pick a different family`);

// --- read rows -------------------------------------------------------------
const MOODS = new Set<string>(MOOD_STYLES);
let text: string;
try {
  text = readFileSync(input, 'utf-8');
} catch (e) {
  die(`cannot read ${input}: ${(e as Error).message}`);
}

const valid: EvalRow[] = [];
for (const raw of text.split(/\r?\n/)) {
  if (!raw.trim()) continue;
  let r: { mood?: string; input?: string; output?: string; valid?: boolean };
  try {
    r = JSON.parse(raw);
  } catch {
    continue; // a malformed line is not the eval's concern — validate-comedic-moods gates that
  }
  if (r.valid === true && typeof r.output === 'string' && r.output && r.mood && MOODS.has(r.mood)) {
    valid.push({ mood: r.mood as MoodStyle, input: r.input ?? '', output: r.output });
  }
}
if (valid.length === 0) die('no valid rows to evaluate (need valid:true rows with a known mood + output)', 2);
const rows = valid.slice(0, limit);

// Degraded corpus: the canned STATIC_SAFE_FALLBACK line per mood, paired with a REAL situation drawn
// from the batch — a genuine input the generic canned line pointedly does NOT answer (the control).
const sampleInputs = rows.map((r) => r.input).filter(Boolean);
const degraded: DegradedLine[] = MOOD_STYLES.map((mood, i) => ({
  mood,
  input: sampleInputs[i % Math.max(1, sampleInputs.length)] ?? 'a 3000-line file with zero comments',
  line: STATIC_SAFE_FALLBACK[mood],
}));

// --- run -------------------------------------------------------------------
console.error(`[eval] ${rows.length} real rows · judges: ${judgeModels.join(', ')} · degraded: ${degraded.length}`);
console.error('[eval] running cross-family judges sequentially (this can take minutes on 24–31B models)…');
const judges = judgeModels.map(ollamaJudge);

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
evaluate(judges, rows, degraded)
  .then((res) => {
    const P = res.panel;
    console.log('\n=== comedic-moods-v0 eval — cross-family panel ===');
    console.log(`panel of ${P.n_pools}: ${P.judges.join(', ')}`);
    console.log(`  real mood-conformance : ${pct(P.real_conformance)}  (n=${P.n_real})`);
    console.log(`  mood-blind accuracy   : ${pct(P.blind_accuracy)}  (${P.blind_correct}/${P.blind_n}, chance 16.7%)`);
    console.log(`  mood-shuffled conform : ${pct(P.shuffled_conformance)}`);
    console.log(`  degraded-line conform : ${pct(P.degraded_conformance)}  (n=${P.degraded_n})`);

    console.log('\npanel gates (pre-registered) — the PRIMARY verdict:');
    for (const gate of [res.panelGates.conformanceFloor, res.panelGates.blind, res.panelGates.shuffled, res.panelGates.degraded]) {
      console.log(`  [${gate.pass ? 'PASS' : 'FAIL'}] ${gate.detail}`);
    }
    if (res.agreement !== null) console.log(`\ninter-pool agreement (reliability): ${pct(res.agreement)}`);

    console.log('\n--- per-family diagnostics (a rogue judge the panel absorbs shows here) ---');
    for (const p of res.pools) {
      const g = res.gates.find((x) => x.judge === p.judge);
      console.log(
        `  ${p.judge} — ${g?.pass ? 'pass' : 'FAIL'}: conform ${pct(p.real_conformance)}, blind ${pct(p.blind_accuracy)}, shuffled ${pct(p.shuffled_conformance)}, degraded ${pct(p.degraded_conformance)}`,
      );
    }
    console.log(`\n=== v0 VERDICT (panel): ${res.pass ? 'PASS' : 'FAIL'} ===`);
    process.exit(res.pass ? 0 : 1);
  })
  .catch((e) => die(`[eval] failed: ${(e as Error).message}`, 2));
