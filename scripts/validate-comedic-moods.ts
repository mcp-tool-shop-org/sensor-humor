/**
 * CLI: validate a comedic-moods capture JSONL file against the row contract.
 * Exit 0 when every row is valid, 1 on any invalid row, 2 on usage/IO error.
 *
 * Usage:  npx tsx scripts/validate-comedic-moods.ts <capture.jsonl>
 */
import { readFileSync } from 'node:fs';
import { validateCaptureJsonl } from '../src/dataset/validate.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/validate-comedic-moods.ts <capture.jsonl>');
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(file, 'utf-8');
} catch (e) {
  console.error(`cannot read ${file}: ${(e as Error).message}`);
  process.exit(2);
}

const r = validateCaptureJsonl(text);
console.error(`comedic-moods validate: ${r.valid}/${r.total} rows valid (${r.invalid} invalid)`);
for (const e of r.errors.slice(0, 25)) {
  console.error(`  line ${e.line}: ${e.issues.join('; ')}`);
}
if (r.errors.length > 25) console.error(`  … and ${r.errors.length - 25} more`);
process.exit(r.invalid === 0 ? 0 : 1);
