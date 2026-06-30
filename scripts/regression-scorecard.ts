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
 *   FAIL         — Wilson upper bound < threshold: a CONFIRMED drift; exit 1 (blocks a release).
 *   INCONCLUSIVE — not enough evidence; never blocks (raise SCORECARD_N for a tighter answer).
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

async function scoreMood(mood: MoodStyle): Promise<MoodReport> {
  resetSession();
  moodSet(mood);
  let hits = 0;
  let total = 0;
  let degraded = 0;
  let stopped = `fixed-N(${MAX_N})`;

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
        break;
      }
    }
  }

  const interval = wilsonInterval(hits, total);
  const verdict: Verdict =
    total === 0 ? 'INCONCLUSIVE' : threeValuedVerdict(hits, total, { threshold: THRESHOLD });
  return { mood, total, hits, degraded, interval, verdict, stopped };
}

async function main(): Promise<void> {
  const probe = await probeOllama(5000);
  if (!probe.reachable || !probe.model_available) {
    // This gate needs the backend. Don't fail a gate you couldn't run — skip cleanly (exit 0).
    console.error(
      `[scorecard] Ollama not ready (reachable=${probe.reachable}, model_available=${probe.model_available}, model="${getModel()}"). ` +
        `This live gate needs the backend; skipping. The deterministic per-PR gate runs in 'npm test'.`,
    );
    process.exit(0);
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

  const failed = reports.filter((r) => r.verdict === 'FAIL');
  const inconclusive = reports.filter((r) => r.verdict === 'INCONCLUSIVE');

  if (inconclusive.length) {
    console.error(
      `[scorecard] INCONCLUSIVE: ${inconclusive.map((r) => r.mood).join(', ')} — not enough evidence ` +
        `(raise SCORECARD_N). Not blocking.`,
    );
  }
  if (failed.length) {
    console.error(
      `[scorecard] FAIL: ${failed.map((r) => r.mood).join(', ')} drifted below ${THRESHOLD} ` +
        `(Wilson upper < threshold — a confirmed regression). Investigate the prompt/model before shipping.`,
    );
    process.exit(1);
  }
  console.error('[scorecard] PASS — no mood shows a confirmed conformance regression.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[scorecard] fatal:', err);
  process.exit(2);
});
