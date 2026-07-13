import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBwsJudgmentsJsonl } from '../src/dataset/label/validate.js';
import { bestWorstInTuple } from '../src/dataset/label/schema.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const script = join(repoRoot, 'scripts', 'label-comedic-moods.ts');
// Run the CLI through tsx's cli.mjs directly (node-runnable on every Node the CI matrix uses, unlike the
// `--import tsx` flag which needs Node ≥18.19).
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runLabel(args: string[], stdin: string): void {
  execFileSync(process.execPath, [tsxCli, script, ...args], {
    input: stdin,
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function corpus(): string {
  const outs = ['dry one', 'dry two', 'dry three', 'dry four', 'dry five'];
  return outs.map((o) => JSON.stringify({ mood: 'dry', output: o, valid: true })).join('\n') + '\n';
}

describe('label-comedic-moods CLI (smoke, piped stdin)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sensor-humor-label-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('collects judgments from piped BEST/WORST picks and writes a valid, resumable anchor', () => {
    const corpusFile = join(dir, 'corpus.jsonl');
    const anchorFile = join(dir, 'out.anchor.jsonl');
    writeFileSync(corpusFile, corpus(), 'utf-8');

    // Two judgments: BEST=line 1, WORST=line 2 each; then quit.
    runLabel(
      [corpusFile, '--anchor', anchorFile, '--mood', 'dry', '--k', '4', '--target', '2', '--rater', 'smoke'],
      '1\n2\n1\n2\nq\n',
    );

    expect(existsSync(anchorFile)).toBe(true);
    const res = validateBwsJudgmentsJsonl(readFileSync(anchorFile, 'utf-8'));
    expect(res.invalid).toBe(0);
    expect(res.valid).toBe(2);
    for (const rec of res.records) {
      expect(rec.mood).toBe('dry');
      expect(rec.line_ids).toHaveLength(4);
      expect(rec.rater).toBe('smoke');
      expect(bestWorstInTuple(rec)).toBe(true); // best/worst are real members, distinct
    }

    // Resume: a second run with the target already met must add nothing (append-only, no re-judging).
    runLabel([corpusFile, '--anchor', anchorFile, '--mood', 'dry', '--k', '4', '--target', '2'], '');
    const res2 = validateBwsJudgmentsJsonl(readFileSync(anchorFile, 'utf-8'));
    expect(res2.valid).toBe(2);
  }, 30_000);
});
