import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPTURE_SCHEMA,
  buildCaptureRow,
  captureEnabled,
  captureRow,
  captureTarget,
  type CaptureRow,
} from '../src/capture.js';
import { getSession, resetSession } from '../src/session.js';
import type { TraceEntry } from '../src/types.js';

const CAPTURE_ENV = 'SENSOR_HUMOR_CAPTURE';

/** A representative light trace entry (what the comedy tools hand recordTrace). */
function makeEntry(over: Partial<TraceEntry> = {}): TraceEntry {
  return {
    turn: 3,
    tool: 'roast',
    mood: 'roast',
    input: '3000-line file, zero comments',
    output: 'Verdict: monolithic state blob syndrome.',
    prompt_fingerprint: 'abc123def456',
    retries: 1,
    validators_triggered: [],
    latency_ms: 1200,
    ...over,
  };
}

describe('capture — target resolution (SENSOR_HUMOR_CAPTURE)', () => {
  afterEach(() => {
    delete process.env[CAPTURE_ENV];
  });

  it('is disabled when the env var is unset (opt-in, off by default)', () => {
    delete process.env[CAPTURE_ENV];
    expect(captureTarget()).toBeNull();
    expect(captureEnabled()).toBe(false);
  });

  it('is disabled for an empty / whitespace-only value', () => {
    process.env[CAPTURE_ENV] = '   ';
    expect(captureTarget()).toBeNull();
    expect(captureEnabled()).toBe(false);
  });

  it('resolves and trims a real path', () => {
    process.env[CAPTURE_ENV] = '  /data/comedic-moods.jsonl  ';
    expect(captureTarget()).toBe('/data/comedic-moods.jsonl');
    expect(captureEnabled()).toBe(true);
  });
});

describe('capture — buildCaptureRow (provenance stamping)', () => {
  it('stamps schema, timestamp, and full generation provenance', () => {
    const row = buildCaptureRow(makeEntry(), 1_700_000_000_000);
    expect(row.schema).toBe(CAPTURE_SCHEMA);
    expect(row.ts).toBe(1_700_000_000_000);
    expect(row.tool).toBe('roast');
    expect(row.mood).toBe('roast');
    expect(row.input).toBe('3000-line file, zero comments');
    expect(row.output).toBe('Verdict: monolithic state blob syndrome.');
    // Provenance the entry doesn't carry — stamped from the live getters (env defaults here).
    expect(row.prompt_version).toBe('roast.v1'); // getActivePromptKey default
    expect(row.model).toBe('qwen2.5:7b'); // getModel default
    expect(row.inference.temperature).toBe(0.55); // getInferenceSettings default
    expect(row.inference.mirostat).toBe(2);
    expect(row.prompt_fingerprint).toBe('abc123def456');
    expect(row.retries).toBe(1);
    expect(row.latency_ms).toBe(1200);
  });

  it('marks a clean model generation valid and omits degraded_reason', () => {
    const row = buildCaptureRow(makeEntry(), 0);
    expect(row.valid).toBe(true);
    expect(row.degraded_reason).toBeUndefined();
  });

  it('marks a degraded / safety-substituted line invalid and records the reason + gates', () => {
    const row = buildCaptureRow(
      makeEntry({ degraded_reason: 'safety-filter', validators_triggered: ['terminal-gate'] }),
      0,
    );
    expect(row.valid).toBe(false);
    expect(row.degraded_reason).toBe('safety-filter');
    expect(row.validators_triggered).toEqual(['terminal-gate']);
  });

  it('defaults a missing output line to empty string (guarded separately in captureRow)', () => {
    const row = buildCaptureRow(makeEntry({ output: undefined }), 0);
    expect(row.output).toBe('');
  });
});

describe('capture — captureRow file sink', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sensor-humor-capture-'));
    file = join(dir, 'nested', 'comedic-moods.jsonl'); // nested path exercises the mkdir
  });

  afterEach(() => {
    delete process.env[CAPTURE_ENV];
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one JSONL row per call when enabled, creating parent dirs', () => {
    process.env[CAPTURE_ENV] = file;
    captureRow(makeEntry({ output: 'first' }));
    captureRow(makeEntry({ output: 'second' }));

    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]) as CaptureRow;
    expect(first.schema).toBe(CAPTURE_SCHEMA);
    expect(first.output).toBe('first');
    expect((JSON.parse(lines[1]) as CaptureRow).output).toBe('second');
  });

  it('is a no-op when disabled — no file written', () => {
    delete process.env[CAPTURE_ENV];
    captureRow(makeEntry());
    expect(existsSync(file)).toBe(false);
  });

  it('skips an entry with no output line — no blank rows', () => {
    process.env[CAPTURE_ENV] = file;
    captureRow(makeEntry({ output: '' }));
    captureRow(makeEntry({ output: undefined }));
    expect(existsSync(file)).toBe(false);
  });

  it('is best-effort: an I/O error never throws into the caller', () => {
    // Point capture at a path that is itself a directory → appendFileSync throws EISDIR, which
    // captureRow must swallow. A comedy tool call must never crash because capture failed.
    const asDir = join(dir, 'is-a-dir');
    mkdirSync(asDir, { recursive: true });
    process.env[CAPTURE_ENV] = asDir;
    expect(() => captureRow(makeEntry())).not.toThrow();
  });
});

describe('capture — recordTrace integration (end-to-end wiring)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    resetSession();
    dir = mkdtempSync(join(tmpdir(), 'sensor-humor-capture-e2e-'));
    file = join(dir, 'comedic-moods.jsonl');
  });

  afterEach(() => {
    delete process.env[CAPTURE_ENV];
    rmSync(dir, { recursive: true, force: true });
  });

  it('session.recordTrace writes a capture row at the single choke point', () => {
    process.env[CAPTURE_ENV] = file;
    const s = getSession();
    s.recordTrace(makeEntry({ tool: 'heckle', mood: 'zoomer', output: 'skill issue detected' }));

    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]) as CaptureRow;
    expect(row.tool).toBe('heckle');
    expect(row.mood).toBe('zoomer');
    expect(row.output).toBe('skill issue detected');
    expect(row.prompt_version).toBe('zoomer.v1');
    // Trace ring still works — capture is additive, not a replacement.
    expect(s.getTraces()).toHaveLength(1);
  });

  it('recordTrace does not write when capture is disabled', () => {
    delete process.env[CAPTURE_ENV];
    const s = getSession();
    s.recordTrace(makeEntry());
    expect(existsSync(file)).toBe(false);
  });
});
