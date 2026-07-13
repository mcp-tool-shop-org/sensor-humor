import { describe, it, expect } from 'vitest';
import {
  buildConformancePrompt,
  buildIdentifyPrompt,
  parseYesNo,
  parseMoodChoice,
  counterbalancedOptions,
  MOODS,
  type MoodJudge,
} from '../src/dataset/eval/judge.js';
import { evaluate, shuffledMood, interPoolAgreement, type EvalRow, type DegradedLine } from '../src/dataset/eval/controls.js';
import type { MoodStyle } from '../src/types.js';

// --- pure prompt / parse / counterbalance -----------------------------------

describe('judge prompt builders + parsers', () => {
  it('conformance prompt carries only the line, situation, mood, and a YES/NO ask (no generator reasoning)', () => {
    const p = buildConformancePrompt('a flaky CI run', 'Of course: it fails again.', 'cynic', 'weary resignation');
    expect(p).toContain('a flaky CI run');
    expect(p).toContain('Of course: it fails again.');
    expect(p).toContain('"cynic"');
    expect(p).toMatch(/YES or NO/);
  });

  it('identify prompt lists the options in the given order', () => {
    const p = buildIdentifyPrompt('some line', ['dry', 'roast', 'zoomer']);
    expect(p).toMatch(/1\. dry[\s\S]*2\. roast[\s\S]*3\. zoomer/);
  });

  it('parseYesNo reads the first standalone yes/no, tolerating prose', () => {
    expect(parseYesNo('YES')).toBe(true);
    expect(parseYesNo('no.')).toBe(false);
    expect(parseYesNo('No, because it ignores the situation')).toBe(false);
    expect(parseYesNo('Not in the voice, so NO')).toBe(false); // "not"/"cannot" must not match \bno\b
    expect(parseYesNo('Yes! clearly')).toBe(true);
    expect(parseYesNo('maybe?')).toBeNull();
  });

  it('parseMoodChoice returns the earliest-mentioned option, or null', () => {
    expect(parseMoodChoice('zoomer', MOODS)).toBe('zoomer');
    expect(parseMoodChoice('this is clearly the roast voice', MOODS)).toBe('roast');
    expect(parseMoodChoice('banana', MOODS)).toBeNull();
  });
});

describe('counterbalancedOptions', () => {
  it('places the true mood at position (index mod N) and includes every mood once', () => {
    for (let i = 0; i < 12; i++) {
      const opts = counterbalancedOptions('cheeky', i);
      expect(opts[i % MOODS.length]).toBe('cheeky');
      expect(new Set(opts).size).toBe(MOODS.length);
      expect([...opts].sort()).toEqual([...MOODS].sort());
    }
  });
});

describe('shuffledMood', () => {
  it('always returns a DIFFERENT mood', () => {
    for (const m of MOODS) for (let i = 0; i < 10; i++) expect(shuffledMood(m, i)).not.toBe(m);
  });
});

// --- mock judges: prove the controls falsify --------------------------------

function tagOf(line: string): MoodStyle | null {
  const m = line.match(/^\[(\w+)\]/);
  return m ? (m[1] as MoodStyle) : null;
}

/** Oracle: reads the [mood] tag; conforms iff the asked mood matches the tag AND the line is genuine
 *  (not a CANNED fallback). Identifies the mood from the tag. Models a valid, discriminating judge. */
function oracleJudge(name = 'oracle'): MoodJudge {
  return {
    name,
    async conforms(req) {
      return tagOf(req.line) === req.mood && !req.line.includes('CANNED');
    },
    async identify(req) {
      const t = tagOf(req.line);
      return t && req.options.includes(t) ? t : null;
    },
  };
}

/** Rubber-stamp: says YES to everything and always picks the first option (pure position bias). Models
 *  the failure mode the controls exist to catch. */
function rubberStampJudge(name = 'stamp'): MoodJudge {
  return {
    name,
    async conforms() {
      return true;
    },
    async identify(req) {
      return req.options[0] ?? null;
    },
  };
}

function corpus(): EvalRow[] {
  const rows: EvalRow[] = [];
  for (let k = 0; k < 4; k++) for (const mood of MOODS) rows.push({ mood, input: `situation ${k}`, output: `[${mood}] genuine line ${k}` });
  return rows;
}
function degradedCorpus(): DegradedLine[] {
  return MOODS.map((mood) => ({ mood, input: 'a real situation', line: `[${mood}] CANNED generic fallback` }));
}

describe('evaluate — the three controls falsify correctly', () => {
  it('a valid, discriminating judge PASSES every gate', async () => {
    const res = await evaluate([oracleJudge()], corpus(), degradedCorpus());
    expect(res.pass).toBe(true);
    const p = res.pools[0];
    expect(p.real_conformance).toBe(1);
    expect(p.blind_accuracy).toBe(1);
    expect(p.shuffled_conformance).toBe(0);
    expect(p.degraded_conformance).toBe(0);
  });

  it('a rubber-stamp judge FAILS mood-blind, mood-shuffled, and degraded-line', async () => {
    const res = await evaluate([rubberStampJudge()], corpus(), degradedCorpus());
    expect(res.pass).toBe(false);
    const g = res.gates[0];
    expect(g.blind.pass).toBe(false); // ~chance after counterbalancing
    expect(g.shuffled.pass).toBe(false); // real == shuffled → no gap
    expect(g.degraded.pass).toBe(false); // canned lines all "conform"
    expect(g.conformanceFloor.pass).toBe(true); // it does say yes to real lines
  });

  it('requires ALL pools to pass — one rubber-stamp pool sinks the verdict', async () => {
    const res = await evaluate([oracleJudge('a'), rubberStampJudge('b')], corpus(), degradedCorpus());
    expect(res.pass).toBe(false);
  });

  it('reports inter-pool agreement (two oracles agree fully)', async () => {
    const res = await evaluate([oracleJudge('a'), oracleJudge('b')], corpus(), degradedCorpus());
    expect(res.agreement).toBe(1);
    expect(interPoolAgreement(res.pools)).toBe(1);
  });
});
