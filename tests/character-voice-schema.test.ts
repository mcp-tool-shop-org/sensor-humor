import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProfile } from '../src/character/voice-schema.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const profilesDir = join(repoRoot, 'src/character/profiles');
const load = (id: string) => JSON.parse(readFileSync(join(profilesDir, `${id}.json`), 'utf-8'));
const dryBritish = load('dry-british');

describe('CharacterVoiceProfileSchema', () => {
  it('validates the Dry British profile (the first filled profile)', () => {
    const r = validateProfile(dryBritish);
    if (!r.ok) console.error(r.issues);
    expect(r.ok).toBe(true);
  });

  it('exposes the five layers', () => {
    const r = validateProfile(dryBritish);
    expect(Object.keys(r.profile!.layers).sort()).toEqual(['delivery', 'psyche', 'rhetoric', 'stance', 'theme']);
  });

  it('carries the fractal gradation — the filter refines into the internal-check vector', () => {
    const r = validateProfile(dryBritish);
    const filter = r.profile!.layers.psyche.filter;
    expect(filter.refines).toBeDefined();
    expect(Object.keys(filter.refines!).sort()).toEqual(['capacity_to_aim', 'disposition_to_check', 'suppression_threshold']);
  });

  it('names the dry↔cringe neighbour boundary', () => {
    const r = validateProfile(dryBritish);
    expect(r.profile!.neighbours!.some((n) => /cringe/i.test(n.family))).toBe(true);
  });

  it('rejects a wrong schema tag', () => {
    expect(validateProfile({ ...dryBritish, schema: 'comedic-moods-voice/v0.4' }).ok).toBe(false);
  });

  it('is strict — an unknown top-level key is rejected', () => {
    expect(validateProfile({ ...dryBritish, sneaky: 1 }).ok).toBe(false);
  });

  it('rejects a position outside [0,1]', () => {
    const bad = JSON.parse(JSON.stringify(dryBritish));
    bad.layers.psyche.worldview.position = 1.5;
    expect(validateProfile(bad).ok).toBe(false);
  });

  it('rejects a dimension missing a pole', () => {
    const bad = JSON.parse(JSON.stringify(dryBritish));
    delete bad.layers.psyche.worldview.low;
    expect(validateProfile(bad).ok).toBe(false);
  });

  it('rejects a theme intensity outside [0,1]', () => {
    const bad = JSON.parse(JSON.stringify(dryBritish));
    bad.layers.theme.intensity = 2;
    expect(validateProfile(bad).ok).toBe(false);
  });
});

// Data-driven: every filled profile in the directory must conform to the schema. New moods land
// here automatically as their <mood>.json is added — no test edit needed to gain coverage.
describe('the filled mood profiles', () => {
  const profileFiles = readdirSync(profilesDir).filter((f) => f.endsWith('.json'));

  it('includes at least the dry-british profile', () => {
    expect(profileFiles).toContain('dry-british.json');
  });

  for (const file of profileFiles) {
    it(`validates ${file}`, () => {
      const r = validateProfile(JSON.parse(readFileSync(join(profilesDir, file), 'utf-8')));
      if (!r.ok) console.error(file, r.issues);
      expect(r.ok).toBe(true);
    });
  }

  it('every profile carries the mandatory five layers and provenance', () => {
    for (const file of profileFiles) {
      const r = validateProfile(JSON.parse(readFileSync(join(profilesDir, file), 'utf-8')));
      expect(r.ok).toBe(true);
      expect(Object.keys(r.profile!.layers).sort()).toEqual(['delivery', 'psyche', 'rhetoric', 'stance', 'theme']);
      expect(r.profile!.provenance.grounded_by.length).toBeGreaterThan(0);
    }
  });
});

// Per-mood characterization: each mood is a DISTINCT settlement of the same dials. These assert the
// load-bearing positions that define the character, guarding against an accidental edit flattening it.
describe('roast — affection worn as aggression', () => {
  const roast = load('roast');

  it('is warm and overt — the opposite pole from cynic', () => {
    expect(roast.layers.psyche.warmth.position).toBeGreaterThan(0.7);
  });

  it('gates cruelty at the filter: reads the room precisely, withholds the wound', () => {
    const f = roast.layers.psyche.filter.refines;
    expect(f.capacity_to_aim.position).toBeGreaterThan(0.8);
    expect(f.suppression_threshold.position).toBeGreaterThan(0.4);
  });

  it('names the flaw baldly — low understatement, unlike dry', () => {
    expect(roast.layers.rhetoric.dimensions.understatement.position).toBeLessThan(0.4);
    expect(roast.layers.rhetoric.dimensions.understatement.position).toBeLessThan(dryBritish.layers.rhetoric.dimensions.understatement.position);
  });

  it('licenses the burn through a consenting room (the complicity stance dimension)', () => {
    expect(roast.layers.stance.dimensions.complicity.position).toBeGreaterThan(0.7);
  });
});
