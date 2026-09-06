/**
 * CLI: enrich a comedic-moods capture JSONL into an enriched JSONL (rows + provenance/verdict block),
 * and print the distribution-verdict summary.
 *
 * Exit 0 when every row enriched cleanly, 1 on any invalid row (a build/publish gate — a malformed
 * capture must not silently pass through enrichment), 2 on usage/IO error.
 *
 * Usage:
 *   npx tsx scripts/enrich-comedic-moods.ts <capture.jsonl> [--out <enriched.jsonl>]
 *                                           [--source synthetic|user_input] [--consent n/a|opted_in|unknown|withdrawn] [--scrub]
 *
 * Defaults: no `--source` override (each row's capture-time stamp is used; unstamped rows are
 * `user_input`, fail-closed). `--scrub` runs the regex-floor PII scrub on user_input rows; synthetic
 * rows are always floor-scrubbed so a public_candidate cannot issue without a scrub result. Without
 * `--scrub`, an opted-in user_input row stays `internal` ("not yet PII-scrubbed") — the correct
 * fail-safe verdict.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { enrichCaptureJsonl, type EnrichOptions } from '../src/dataset/enrich.js';
import type { SourceType, ConsentStatus } from '../src/dataset/provenance.js';

const SOURCES: readonly SourceType[] = ['synthetic', 'user_input'];
const CONSENTS: readonly ConsentStatus[] = ['n/a', 'opted_in', 'unknown', 'withdrawn'];

function usage(msg: string): never {
  console.error(msg);
  console.error(
    'usage: tsx scripts/enrich-comedic-moods.ts <capture.jsonl> [--out <file>] [--source synthetic|user_input] [--consent n/a|opted_in|unknown|withdrawn] [--scrub]',
  );
  process.exit(2);
}

// --- parse argv ------------------------------------------------------------
const args = process.argv.slice(2);
let input: string | undefined;
let out: string | undefined;
let source: SourceType | undefined;
let consent: ConsentStatus | undefined;
let scrub = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') out = args[++i];
  else if (a === '--scrub') scrub = true;
  else if (a === '--source') {
    const v = args[++i];
    if (!SOURCES.includes(v as SourceType)) usage(`invalid --source '${v}' (expected: ${SOURCES.join(' | ')})`);
    source = v as SourceType;
  } else if (a === '--consent') {
    const v = args[++i];
    if (!CONSENTS.includes(v as ConsentStatus)) usage(`invalid --consent '${v}' (expected: ${CONSENTS.join(' | ')})`);
    consent = v as ConsentStatus;
  } else if (a.startsWith('--')) usage(`unknown flag '${a}'`);
  else if (input === undefined) input = a;
  else usage(`unexpected extra argument '${a}'`);
}

if (input === undefined) usage('missing <capture.jsonl>');
// Default output: alongside the input, `<base>.enriched.jsonl` (strip one trailing .jsonl if present).
const outFile = out ?? `${input.replace(/\.jsonl$/i, '')}.enriched.jsonl`;

// --- read ------------------------------------------------------------------
let text: string;
try {
  text = readFileSync(input, 'utf-8');
} catch (e) {
  usage(`cannot read ${input}: ${(e as Error).message}`);
}

// --- enrich ----------------------------------------------------------------
const opts: EnrichOptions = { scrub, ...(source ? { source_type: source } : {}), ...(consent ? { consent_status: consent } : {}) };
const { records, summary } = enrichCaptureJsonl(text, opts);

// --- write -----------------------------------------------------------------
try {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''), 'utf-8');
} catch (e) {
  usage(`cannot write ${outFile}: ${(e as Error).message}`);
}

// --- report ----------------------------------------------------------------
const v = summary.by_verdict;
console.error(
  `comedic-moods enrich: ${summary.enriched}/${summary.total} rows enriched → ${outFile} (${summary.invalid} invalid)`,
);
console.error(
  `  verdicts: public_candidate ${v.public_candidate} · internal ${v.internal} · excluded ${v.excluded} · public ${v.public} (never auto-assigned)`,
);
for (const e of summary.errors.slice(0, 25)) console.error(`  line ${e.line}: ${e.issues.join('; ')}`);
if (summary.errors.length > 25) console.error(`  … and ${summary.errors.length - 25} more`);

process.exit(summary.invalid === 0 ? 0 : 1);
