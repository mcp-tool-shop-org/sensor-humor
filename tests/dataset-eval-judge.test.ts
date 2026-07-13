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
import {
  evaluate,
  shuffledMood,
  interPoolAgreement,
  majorityBool,
  majorityMood,
  type EvalRow,
  type DegradedLine,
} from '../src/dataset/eval/controls.js';
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

describe('majority aggregation', () => {
  it('majorityBool: strict majority, tie/empty -> null', () => {
    expect(majorityBool([true, true, false])).toBe(true);
    expect(majorityBool([false, false, true])).toBe(false);
    expect(majorityBool([true, false])).toBeNull(); // even split
    expect(majorityBool([null, null])).toBeNull(); // nothing decided
    expect(majorityBool([true, null, true])).toBe(true); // nulls ignored
  });

  it('majorityMood: plurality winner, tie -> null', () => {
    expect(majorityMood(['dry', 'dry', 'roast'])).toBe('dry');
    expect(majorityMood(['dry', 'roast'])).toBeNull(); // tie
    expect(majorityMood([null, 'cynic', null])).toBe('cynic');
    expect(majorityMood([])).toBeNull();
  });
});

describe('evaluate — cross-family panel + the three controls falsify', () => {
  it('a single valid judge (panel of 1) passes every gate', async () => {
    const res = await evaluate([oracleJudge()], corpus(), degradedCorpus());
    expect(res.pass).toBe(true);
    expect(res.panel.n_pools).toBe(1);
    expect(res.panel.real_conformance).toBe(1);
  });

  it('a valid discriminating PANEL passes; panel numbers are clean', async () => {
    const res = await evaluate([oracleJudge('a'), oracleJudge('b'), oracleJudge('c')], corpus(), degradedCorpus());
    expect(res.pass).toBe(true);
    expect(res.panel.real_conformance).toBe(1);
    expect(res.panel.blind_accuracy).toBe(1);
    expect(res.panel.shuffled_conformance).toBe(0);
    expect(res.panel.degraded_conformance).toBe(0);
  });

  it('an all-rubber-stamp panel FAILS mood-blind, mood-shuffled, and degraded-line', async () => {
    const res = await evaluate(
      [rubberStampJudge('a'), rubberStampJudge('b'), rubberStampJudge('c')],
      corpus(),
      degradedCorpus(),
    );
    expect(res.pass).toBe(false);
    expect(res.panelGates.blind.pass).toBe(false); // ~chance after counterbalancing
    expect(res.panelGates.shuffled.pass).toBe(false); // real == shuffled → no gap
    expect(res.panelGates.degraded.pass).toBe(false); // canned lines all "conform"
    expect(res.panelGates.conformanceFloor.pass).toBe(true); // it does say yes to real lines
  });

  it('the panel OUTVOTES a single rogue judge (Verga PoLL robustness), and the diagnostic still flags it', async () => {
    const res = await evaluate(
      [oracleJudge('a'), oracleJudge('b'), rubberStampJudge('c')],
      corpus(),
      degradedCorpus(),
    );
    expect(res.pass).toBe(true); // two oracles outvote the one rubber-stamp per line
    const rogue = res.gates.find((g) => g.judge === 'c');
    expect(rogue?.pass).toBe(false); // the rogue pool still fails its OWN diagnostic gate
  });

  it('reports inter-pool agreement (oracles agree fully)', async () => {
    const res = await evaluate([oracleJudge('a'), oracleJudge('b'), oracleJudge('c')], corpus(), degradedCorpus());
    expect(res.agreement).toBe(1);
    expect(interPoolAgreement(res.pools)).toBe(1);
  });
});
