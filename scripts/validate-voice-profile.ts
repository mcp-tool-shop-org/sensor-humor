/**
 * CLI: validate a character voice profile JSON against the Character Voice Model schema (v0.5).
 * Exit 0 when the profile conforms, 1 when it doesn't, 2 on usage/IO error.
 *
 * Usage:  npx tsx scripts/validate-voice-profile.ts <profile.json>
 *   e.g.  npx tsx scripts/validate-voice-profile.ts src/character/profiles/dry-british.json
 */
import { readFileSync } from 'node:fs';
import { validateProfile, VOICE_MODEL_SCHEMA } from '../src/character/voice-schema.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/validate-voice-profile.ts <profile.json>');
  process.exit(2);
}

let value: unknown;
try {
  value = JSON.parse(readFileSync(file, 'utf-8'));
} catch (e) {
  console.error(`cannot read/parse ${file}: ${(e as Error).message}`);
  process.exit(2);
}

const r = validateProfile(value);
if (r.ok) {
  console.error(`voice-profile validate: OK — '${r.profile!.id}' (${r.profile!.label}) conforms to ${VOICE_MODEL_SCHEMA}`);
  process.exit(0);
}
console.error(`voice-profile validate: INVALID (${r.issues!.length} issue(s))`);
for (const i of r.issues!.slice(0, 30)) console.error(`  ${i}`);
process.exit(1);
