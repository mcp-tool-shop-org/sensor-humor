#!/usr/bin/env node
/**
 * Tarball budget (Feature Pass FP-5 / ROADMAP v1.1 leftover).
 *
 * `npm pack --dry-run --json` and fail if:
 *   - gzipped package size exceeds CAP_BYTES
 *   - a .wav leaked
 *   - scripts/ leaked
 *   - a retired mood name (absurdist/sardonic/wholesome/unhinged) is in the tarball
 *
 * Zero deps. CI and `npm run pack:check` both call this.
 */
import { execFileSync } from 'node:child_process';

/**
 * Gzipped cap — the original v1.1 ROADMAP gate. Language READMEs are force-included by npm;
 * source maps are excluded via package.json `files` so the 200 KiB line still holds (~193 KiB).
 */
const CAP_BYTES = 200 * 1024;
const RETIRED_MOODS = ['absurdist', 'sardonic', 'wholesome', 'unhinged'];

function parsePackJson(stdout) {
  const text = String(stdout).trim();
  // npm may print a JSON array or a single object; notices go to stderr.
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

// shell:true is required on Windows (Node 22 spawnSync of npm.cmd is EINVAL without it).
// Args are literals — no user input.
const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const info = parsePackJson(stdout);
const size = Number(info.size);
const files = Array.isArray(info.files) ? info.files.map((f) => String(f.path ?? f)) : [];

const failures = [];
if (!Number.isFinite(size)) {
  failures.push('npm pack --json did not report a numeric `size`');
} else if (size > CAP_BYTES) {
  failures.push(
    `tarball ${size} bytes exceeds ${CAP_BYTES} (${(size / 1024).toFixed(1)} KiB > ${CAP_BYTES / 1024} KiB)`,
  );
}
for (const p of files) {
  const lower = p.toLowerCase();
  if (lower.endsWith('.wav')) failures.push(`wav leaked: ${p}`);
  if (lower.endsWith('.map')) failures.push(`source map leaked: ${p}`);
  if (/(^|\/)scripts\//.test(lower)) failures.push(`scripts/ leaked: ${p}`);
  // src/dataset/eval/rubric.ts imports scorecard/rules, so tsc emits dist/scorecard/rules.js
  // even though tsconfig.build excludes the scorecard *roots*. That file is load-bearing, not a leak.
  for (const mood of RETIRED_MOODS) {
    if (lower.includes(mood)) failures.push(`retired mood "${mood}" in tarball: ${p}`);
  }
}

if (failures.length) {
  console.error('[pack:check] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `[pack:check] PASS — ${size} bytes (${(size / 1024).toFixed(1)} KiB) ≤ ${CAP_BYTES / 1024} KiB, ${files.length} files, no wav/scripts/retired-moods`,
);
