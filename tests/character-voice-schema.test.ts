import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProfile } from '../src/character/voice-schema.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const dryBritish = JSON.parse(
  readFileSync(join(repoRoot, 'src/character/profiles/dry-british.json'), 'utf-8'),
);

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
