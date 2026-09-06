#!/usr/bin/env node
/**
 * v1.2 Prompt Stability Lock — the LIVE regression scorecard (manual / nightly).
 *
 * This is the statistical drift gate. It exercises each mood against the real Ollama backend,
 * scores every output for FORM + SAFETY conformance (NOT funniness — see src/scorecard/rules.ts),
 * and renders a three-valued PASS / FAIL / INCONCLUSIVE verdict per mood using a Wilson interval
 * with SPRT early-stopping (see src/scorecard/stats.ts for the grounding).
 *
 *   PASS         — Wilson lower bound > threshold: the mood still conforms.
 *   FAIL         — Wilson upper bound < threshold, SPRT ACCEPT_DRIFTED, OR total==0 after a
 *                  reachable backend (an empty sample is a confirmed outage, not INCONCLUSIVE).
 *   INCONCLUSIVE — not enough evidence on a non-empty sample; never blocks (raise SCORECARD_N).
 *   SKIP         — Ollama unreachable / model missing; exit 75 (distinct from PASS/FAIL).
 *
 * The per-PR gate is the DETERMINISTIC half — the golden-set + stats tests under `npm test` —
 * which needs no backend. This live run is the nightly/manual complement; run it with:
 *
 *   npm run scorecard                 # ~recommended N per mood, SPRT early-stop
 *   SCORECARD_N=40 npm run scorecard  # quick pass
 *
 * Per the studio's GitHub Actions rules, org repos do not run scheduled workflows — this stays a
 * manual `npm run scorecard` (or a workflow_dispatch), never an unattended cron.
 */

import { writeFileSync } from 'node:fs';
import { MOOD_STYLES, type MoodStyle } from '../src/types.js';
import { resetSession } from '../src/session.js';
import { moodSet } from '../src/tools/mood.js';
import { comicTiming } from '../src/tools/comic_timing.js';
import { scoreOutput } from '../src/scorecard/rules.js';
import {
  wilsonInterval,
  threeValuedVerdict,
  sprt,
  recommendedSampleSize,
  type Verdict,
  type SprtDecision,
} from '../src/scorecard/stats.js';
import { probeOllama, getModel } from '../src/ollama.js';

const THRESHOLD = 0.65; // conformance floor; FAIL only when the Wilson UPPER bound is below this
const SPRT = { p0: 0.72, p1: 0.62, alpha: 0.05, beta: 0.05 }; // healthy vs drifted, 5%/5% errors
const MIN_N = 30; // never decide on fewer than this many non-degraded samples
const MAX_N = (() => {
  const env = Number.parseInt(process.env.SCORECARD_N ?? '', 10);
  if (Number.isFinite(env) && env > 0) return env;
  return recommendedSampleSize(0.7, 0.06); // ~224 — the study-swarm's sound-N family
})();

// b-sc-002: machine-readable output for the roadmap's nightly drift job (archive + diff). When a
// path is provided — via SENSOR_HUMOR_SCORECARD_JSON=<path> OR `--json <path>` — the full per-mood
// reports are written there as JSON. Human rows stay on stderr (stdout is free), so this is purely
// additive to the existing CLI behavior. No path -> unchanged (JSON write is skipped).
function resolveJsonPath(argv: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  const flagIdx = argv.indexOf('--json');
  if (flagIdx !== -1) {
    const next = argv[flagIdx + 1];
    // `--json <path>`; a bare trailing `--json` (no path, or followed by another flag) is ignored.
    if (next && !next.startsWith('--')) return next;
  }
  const envPath = env.SENSOR_HUMOR_SCORECARD_JSON?.trim();
  return envPath ? envPath : undefined;
}

/**
 * Pure shape of the JSON artifact — separated from the write so it stays deterministic and easy to
 * reason about. `generatedAt` is passed in (the caller supplies `new Date().toISOString()` at
 * runtime; the stats/rules modules forbid a clock, but this is a top-level SCRIPT, so a wall-clock
 * timestamp here is fine and is exactly what a nightly archive/diff wants).
 */
function buildScorecardJson(args: {
  model: string;
  threshold: number;
  maxN: number;
  generatedAt: string;
  reports: readonly MoodReport[];
}): {
  model: string;
  threshold: number;
  maxN: number;
  generatedAt: string;
  moods: readonly MoodReport[];
} {
  return {
    model: args.model,
    threshold: args.threshold,
    maxN: args.maxN,
    generatedAt: args.generatedAt,
    moods: args.reports,
  };
}

// Fixed dev-humor inputs, cycled across samples. Stable so the run measures the prompt/model, not
// input variety.
const INPUTS: readonly string[] = [
  'the build passed on the third attempt',
  'a six-hundred-line function named helper',
  'someone committed the entire node_modules directory',
  'the tests pass locally but not in CI',
  'a variable named data2_final_v3',
  'the hotfix needed a hotfix',
  'forty browser tabs and zero of them are the docs',
  'the migration ran twice',
  'a TODO comment dated four years ago',
  'the staging environment is the production environment',
];

interface MoodReport {
  mood: MoodStyle;
  total: number; // non-degraded samples scored
  hits: number;
  degraded: number;
  interval: { lower: number; upper: number };
  verdict: Verdict;
  stopped: string;
}

/** Distinct skip exit when the live gate could not run (backend down). Not 0 (PASS) and not 1 (FAIL). */
const SKIP_EXIT = 75;

/**
 * Authoritative verdict layer for the exit code (sc-005).
 *
 * SPRT and the Wilson three-valued verdict answer DIFFERENT questions on the SAME sample, and on a
 * truncated (early-stopped) sample they can disagree: SPRT can reach ACCEPT_DRIFTED (a confirmed
 * drift by its own error-controlled boundary) while the Wilson interval on the truncated N is still
 * wide enough to straddle the threshold and report INCONCLUSIVE. If we reported the Wilson verdict
 * alone, that confirmed drift would be downgraded to a non-blocking INCONCLUSIVE and slip past the
 * exit-1 gate.
 *
 * Resolution — SPRT is AUTHORITATIVE for the exit code whenever it stopped:
 *   - SPRT ACCEPT_DRIFTED  -> FAIL         (a confirmed regression; blocks the release)
 *   - SPRT ACCEPT_HEALTHY  -> PASS         (a confirmed healthy stream)
 *   - SPRT CONTINUE / never fired (fixed-N exhaustion) -> fall back to the Wilson three-valued
 *     verdict on the full realized sample (the andon-correct decision at fixed N).
 *   - total==0 after a reachable backend -> FAIL (empty sample is a confirmed outage, not
 *     INCONCLUSIVE). Unreachable Ollama is SKIP (exit 75), never PASS.
 *
 * The Wilson interval is still computed and reported for the human-readable row; only the
 * exit-code verdict is reconciled here.
 */
function reconcileVerdict(sprtDecision: SprtDecision | null, hits: number, total: number): Verdict {
  if (sprtDecision === 'ACCEPT_DRIFTED') return 'FAIL';
  if (sprtDecision === 'ACCEPT_HEALTHY') return 'PASS';
  // A reachable backend that produced zero scorable samples is a confirmed outage, not "not enough
  // evidence" — INCONCLUSIVE never blocks, and printing PASS on an empty sample hid a total failure.
  if (total === 0) return 'FAIL';
  return threeValuedVerdict(hits, total, { threshold: THRESHOLD });
}

async function scoreMood(mood: MoodStyle): Promise<MoodReport> {
  resetSession();
  moodSet(mood);
  let hits = 0;
  let total = 0;
  let degraded = 0;
  let stopped = `fixed-N(${MAX_N})`;
  let sprtDecision: SprtDecision | null = null;

  for (let i = 0; i < MAX_N; i++) {
    const result = await comicTiming(INPUTS[i % INPUTS.length]);
    // A degraded output measures backend health, not prompt conformance — exclude it from the
    // hit-rate and track it separately so a backend wobble doesn't masquerade as prompt drift.
    if (result.degraded) {
      degraded++;
      continue;
    }
    total++;
    if (scoreOutput(mood, result.rewrite).hit) hits++;

    // SPRT early-stop once we have a real sample: accept a clearly healthy/drifted stream early.
    if (total >= MIN_N) {
      const decision = sprt({ successes: hits, n: total, ...SPRT });
      if (decision !== 'CONTINUE') {
        stopped = decision;
        sprtDecision = decision;
        break;
      }
    }
  }

  const interval = wilsonInterval(hits, total);
  // sc-005: SPRT is authoritative for the exit-code verdict when it stopped the run; otherwise the
  // Wilson three-valued verdict on the full sample decides. This prevents an early ACCEPT_DRIFTED
  // from being reported as a non-blocking INCONCLUSIVE on the truncated sample.
  const verdict: Verdict = reconcileVerdict(sprtDecision, hits, total);
  return { mood, total, hits, degraded, interval, verdict, stopped };
}

async function main(): Promise<void> {
  const probe = await probeOllama(5000);
  if (!probe.reachable || !probe.model_available) {
    // This gate needs the backend. Don't fail a gate you couldn't run — and don't print PASS.
    // Distinct skip exit (75 / EX_TEMPFAIL), not 0, so CI can tell skip from a green PASS.
    console.error(
      `[scorecard] SKIP — Ollama not ready (reachable=${probe.reachable}, model_available=${probe.model_available}, model="${getModel()}"). ` +
        `This live gate needs the backend; not a PASS. The deterministic per-PR gate runs in 'npm test'.`,
    );
    process.exit(SKIP_EXIT);
  }

  console.error(
    `[scorecard] model="${getModel()}" threshold=${THRESHOLD} maxN=${MAX_N} — FORM + SAFETY conformance, NOT funniness.`,
  );
  console.error('[scorecard] mood     verdict      hits/total (rate)  wilson[lo, hi]   degraded  stop');

  const reports: MoodReport[] = [];
  for (const mood of MOOD_STYLES) {
    const r = await scoreMood(mood);
    reports.push(r);
    const pct = r.total ? `${((r.hits / r.total) * 100).toFixed(0)}%` : 'n/a';
    console.error(
      `  ${r.mood.padEnd(8)} ${r.verdict.padEnd(12)} ${`${r.hits}/${r.total}`.padEnd(8)} (${pct.padEnd(4)})  ` +
        `[${r.interval.lower.toFixed(2)}, ${r.interval.upper.toFixed(2)}]   ${String(r.degraded).padEnd(8)}  ${r.stopped}`,
    );
  }

  // b-sc-002: write the machine-readable artifact BEFORE the exit-code branch so a FAIL run (exit 1)
  // still archives its results for the nightly diff. Human rows already went to stderr above.
  const jsonPath = resolveJsonPath(process.argv.slice(2), process.env);
  if (jsonPath) {
    const payload = buildScorecardJson({
      model: getModel(),
      threshold: THRESHOLD,
      maxN: MAX_N,
      generatedAt: new Date().toISOString(),
      reports,
    });
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    console.error(`[scorecard] wrote JSON report to ${jsonPath}`);
  }

  const failed = reports.filter((r) => r.verdict === 'FAIL');
  const inconclusive = reports.filter((r) => r.verdict === 'INCONCLUSIVE');

  if (inconclusive.length) {
    console.error(
      `[scorecard] INCONCLUSIVE: ${inconclusive.map((r) => r.mood).join(', ')} — not enough evidence ` +
        `(raise SCORECARD_N). Not blocking.`,
    );
  }
  if (failed.length) {
    const empty = failed.filter((r) => r.total === 0);
    const drifted = failed.filter((r) => r.total > 0);
    if (empty.length) {
      console.error(
        `[scorecard] FAIL: ${empty.map((r) => r.mood).join(', ')} produced 0 scorable samples ` +
          `(backend reachable but every comicTiming sample was degraded — an empty sample is not PASS).`,
      );
    }
    if (drifted.length) {
      console.error(
        `[scorecard] FAIL: ${drifted.map((r) => r.mood).join(', ')} drifted below ${THRESHOLD} ` +
          `(SPRT ACCEPT_DRIFTED or Wilson upper < threshold — a confirmed regression). ` +
          `Investigate the prompt/model before shipping.`,
      );
    }
    process.exit(1);
  }
  console.error('[scorecard] PASS — no mood shows a confirmed conformance regression.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[scorecard] fatal:', err);
  process.exit(2);
});
