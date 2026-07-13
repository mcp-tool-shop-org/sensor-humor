import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tupleKey, type BwsJudgment } from '../src/dataset/label/bws.js';
import type { MoodStyle } from '../src/types.js';
import { lineId, type BwsJudgmentRecord } from '../src/dataset/label/schema.js';
import { validateBwsJudgmentsJsonl } from '../src/dataset/label/validate.js';
import { buildLinePool, nextRound, validateJudgment, isHoneypotBest } from '../src/dataset/label/serve-core.js';

const corpus = (rows: { mood: string; output: string; valid?: boolean }[]): string =>
  rows.map((r) => JSON.stringify({ mood: r.mood, output: r.output, valid: r.valid ?? true })).join('\n') + '\n';

const nLines = (mood: string, n: number): { mood: string; output: string }[] =>
  Array.from({ length: n }, (_, i) => ({ mood, output: `${mood} line ${i} about failure ${i}` }));

describe('buildLinePool', () => {
  it('groups valid rows by mood with stable content ids, deduped', () => {
    const pool = buildLinePool(corpus([...nLines('dry', 3), ...nLines('roast', 2), { mood: 'dry', output: 'dry line 0 about failure 0' }]));
    expect(pool.get('dry')!).toHaveLength(3); // the duplicate collapses to one id
    expect(pool.get('roast')!).toHaveLength(2);
    expect(pool.get('dry')![0].id).toBe(lineId('dry', pool.get('dry')![0].text));
  });

  it('ignores invalid rows and unknown moods', () => {
    const pool = buildLinePool(corpus([{ mood: 'dry', output: 'ok', valid: true }, { mood: 'dry', output: 'bad', valid: false }, { mood: 'giddy', output: 'x' }]));
    expect(pool.get('dry')!).toHaveLength(1);
    expect(pool.has('giddy' as MoodStyle)).toBe(false);
  });
});

describe('nextRound', () => {
  const pool = buildLinePool(corpus([...nLines('dry', 5), ...nLines('roast', 5)]));
  const empty = (): Map<MoodStyle, BwsJudgment[]> => new Map();

  it('returns a k-line round of a single mood with real text', () => {
    const round = nextRound(pool, empty(), { k: 4 })!;
    expect(round).not.toBeNull();
    expect(round.lines).toHaveLength(4);
    expect(round.lines.every((l) => typeof l.text === 'string' && l.text.length > 0)).toBe(true);
    expect(round.moodLabel).toBe('Dry'); // least-judged, canonical order → dry
  });

  it('balances toward the least-judged mood', () => {
    const jm: Map<MoodStyle, BwsJudgment[]> = new Map([
      ['dry', [{ items: ['x', 'y', 'z', 'w'], best: 'x', worst: 'w' }, { items: ['x', 'y', 'z', 'w'], best: 'y', worst: 'z' }]],
    ]);
    expect(nextRound(pool, jm, { k: 4 })!.mood).toBe('roast'); // roast has 0 judgments, dry has 2
  });

  it('respects a forced mood', () => {
    expect(nextRound(pool, empty(), { k: 4, mood: 'roast' })!.mood).toBe('roast');
  });

  it('does not re-serve a tuple this rater already judged', () => {
    const first = nextRound(pool, empty(), { k: 4, mood: 'dry' })!;
    const second = nextRound(pool, empty(), { k: 4, mood: 'dry', exclude: [tupleKey(first.lines.map((l) => l.id))] })!;
    expect(tupleKey(second.lines.map((l) => l.id))).not.toBe(tupleKey(first.lines.map((l) => l.id)));
  });

  it('returns null when no mood has k lines', () => {
    const thin = buildLinePool(corpus(nLines('dry', 3)));
    expect(nextRound(thin, empty(), { k: 4 })).toBeNull();
  });
});

describe('validateJudgment', () => {
  const ids = [lineId('dry', 'a'), lineId('dry', 'b'), lineId('dry', 'c'), lineId('dry', 'd')];
  const rec = { schema: 'comedic-moods-bws/v0', ts: 1, mood: 'dry', line_ids: ids, best: ids[0], worst: ids[3] };

  it('accepts a valid { judgment } payload and returns the parsed record', () => {
    const r = validateJudgment({ judgment: rec, meta: { condition: 'text' } });
    expect(r.ok).toBe(true);
    expect(r.record!.best).toBe(ids[0]);
  });

  it('rejects a payload with no judgment field', () => {
    expect(validateJudgment({ meta: {} }).ok).toBe(false);
    expect(validateJudgment(null).ok).toBe(false);
  });

  it('rejects an off-contract judgment with field-level issues', () => {
    const r = validateJudgment({ judgment: { ...rec, best: 'not-a-member' } });
    expect(r.ok).toBe(false);
    expect(r.issues!.some((i) => i.includes('best'))).toBe(true);
  });
});

describe('isHoneypotBest', () => {
  it('flags a judgment whose BEST is a known honeypot line', () => {
    const rec = { schema: 'comedic-moods-bws/v0', ts: 1, mood: 'dry', line_ids: ['a', 'b', 'c', 'd'], best: 'a', worst: 'd' } as BwsJudgmentRecord;
    expect(isHoneypotBest(rec, new Set(['a']))).toBe(true);
    expect(isHoneypotBest(rec, new Set(['z']))).toBe(false);
  });
});

// --- server smoke (spawn → fetch → ingest) ---------------------------------
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverScript = join(repoRoot, 'scripts', 'serve-labeler.ts');

function startServer(args: string[]): Promise<{ proc: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [tsxCli, serverScript, ...args], { cwd: repoRoot });
    let out = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`server did not start in time; output:\n${out}`));
    }, 20_000);
    proc.stdout.on('data', (d) => {
      out += String(d);
      const m = out.match(/listening on http:\/\/[^:]+:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ proc, port: Number(m[1]) });
      }
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

describe('serve-labeler (server smoke)', () => {
  let dir: string;
  let proc: ChildProcess | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sensor-humor-serve-'));
  });
  afterEach(() => {
    proc?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves a round, ingests a valid judgment append-only, and does not re-serve it', async () => {
    const corpusFile = join(dir, 'corpus.jsonl');
    const anchorFile = join(dir, 'a.crowd-anchor.jsonl');
    writeFileSync(corpusFile, corpus(nLines('dry', 6)), 'utf-8');

    const started = await startServer([corpusFile, '--anchor', anchorFile, '--port', '0', '--k', '4']);
    proc = started.proc;
    const base = `http://localhost:${started.port}`;

    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.ok).toBe(true);

    const round = await (await fetch(`${base}/api/next?rater=t1`)).json();
    expect(round.mood).toBe('dry');
    expect(round.lines).toHaveLength(4);

    const rec = {
      schema: 'comedic-moods-bws/v0',
      ts: 1,
      mood: round.mood,
      line_ids: round.lines.map((l: { id: string }) => l.id),
      best: round.lines[0].id,
      worst: round.lines[1].id,
      rater: 't1',
    };
    const post = await (await fetch(`${base}/api/judgment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judgment: rec, meta: { condition: 'text' } }),
    })).json();
    expect(post.ok).toBe(true);

    const round2 = await (await fetch(`${base}/api/next?rater=t1`)).json();
    const k1 = tupleKey(round.lines.map((l: { id: string }) => l.id));
    const k2 = tupleKey(round2.lines.map((l: { id: string }) => l.id));
    expect(k2).not.toBe(k1); // the judged tuple is not re-served to the same rater

    const res = validateBwsJudgmentsJsonl(readFileSync(anchorFile, 'utf-8'));
    expect(res.valid).toBe(1);
    expect(res.invalid).toBe(0);

    const bad = await fetch(`${base}/api/judgment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judgment: { ...rec, best: 'not-a-member' } }),
    });
    expect(bad.status).toBe(400);
  }, 30_000);
});
