/**
 * CLI: validate a comedic-moods BWS anchor JSONL file against the judgment-record contract.
 * Exit 0 when every judgment is valid, 1 on any invalid judgment, 2 on usage/IO error.
 *
 * Usage:  npx tsx scripts/validate-bws-anchor.ts <anchor.jsonl>
 */
import { readFileSync } from 'node:fs';
import { validateBwsJudgmentsJsonl } from '../src/dataset/label/validate.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/validate-bws-anchor.ts <anchor.jsonl>');
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(file, 'utf-8');
} catch (e) {
  console.error(`cannot read ${file}: ${(e as Error).message}`);
  process.exit(2);
}

const r = validateBwsJudgmentsJsonl(text);
console.error(`bws-anchor validate: ${r.valid}/${r.total} judgments valid (${r.invalid} invalid)`);
for (const e of r.errors.slice(0, 25)) {
  console.error(`  line ${e.line}: ${e.issues.join('; ')}`);
}
if (r.errors.length > 25) console.error(`  … and ${r.errors.length - 25} more`);
process.exit(r.invalid === 0 ? 0 : 1);
