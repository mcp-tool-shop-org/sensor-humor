/**
 * comedic-moods-v0 — dataset enrichment (Slice 2.1).
 *
 * Reads a JSON-Lines capture file, validates every row against the row contract (`CaptureRowSchema`),
 * assigns the provenance / distribution verdict (`assignVerdict`), and re-validates the enriched row
 * against the enriched contract (`EnrichedRecordSchema`) before accepting it. Pure (text in, result
 * out — no I/O, no clock, no model) so it is trivially testable; the CLI wrapper
 * (`scripts/enrich-comedic-moods.ts`) handles file I/O + exit codes.
 *
 * A row that fails to parse, fails the row contract, or (defensively) fails the enriched contract is
 * NOT enriched — it is collected as an error with its 1-based line number, mirroring the validator's
 * fail-loudly discipline. The `by_verdict` tally is the summary the enrich step reports so a human can
 * see the internal / public_candidate / excluded split before any distribution step.
 */
import { CaptureRowSchema } from './schema.js';
import { EnrichedRecordSchema } from './provenance-schema.js';
import { assignVerdict, type EnrichedRecord, type RecordVerdict, type VerdictContext } from './provenance.js';
import type { RowError } from './validate.js';

/** Zero-initialised verdict tally — every RecordVerdict is a key so the summary shape is stable. */
function emptyVerdictTally(): Record<RecordVerdict, number> {
  return { public: 0, public_candidate: 0, internal: 0, excluded: 0 };
}

export interface EnrichSummary {
  /** Non-blank lines considered (blank lines, incl. a trailing newline, are skipped). */
  total: number;
  /** Rows that parsed, satisfied the row contract, and produced a valid enriched record. */
  enriched: number;
  /** Rows rejected (JSON-parse, row-contract, or enriched-contract failure). */
  invalid: number;
  /** Count of accepted rows per distribution verdict. `public` is never assigned by the engine. */
  by_verdict: Record<RecordVerdict, number>;
  /** Per-line errors for rejected rows, first failure per line, 1-based line numbers. */
  errors: RowError[];
}

export interface EnrichResult {
  records: EnrichedRecord[];
  summary: EnrichSummary;
}

/**
 * Enrich JSONL capture text into records + a verdict summary. `ctx` is applied to every row (the
 * internal-seed sweep is uniformly synthetic; a live-capture wrapper passes user_input + consent).
 * PII scrubbing is not performed here — pass a `pii_scrub` result in `ctx` once a scrub has run
 * (Slice 2.2); absent it, an opted-in user_input row correctly stays `internal` ("not yet scrubbed").
 */
export function enrichCaptureJsonl(text: string, ctx: VerdictContext = {}): EnrichResult {
  const lines = text.split(/\r?\n/);
  const records: EnrichedRecord[] = [];
  const errors: RowError[] = [];
  const by_verdict = emptyVerdictTally();
  let considered = 0;

  lines.forEach((raw, i) => {
    if (raw.trim().length === 0) return; // skip blank lines (incl. trailing newline)
    considered++;
    const line = i + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ line, issues: [`invalid JSON: ${(e as Error).message}`] });
      return;
    }

    const res = CaptureRowSchema.safeParse(parsed);
    if (!res.success) {
      errors.push({ line, issues: res.error.issues.map((iss) => `${iss.path.join('.') || '(root)'}: ${iss.message}`) });
      return;
    }

    const enriched = assignVerdict(res.data, ctx);

    // Defensive boundary: assignVerdict is typed to return an EnrichedRecord, but re-checking the
    // actual object against the enriched contract means the writer can never emit a record that would
    // fail the publish-gate validator — a contract violation is caught here, not in a shipped snapshot.
    const check = EnrichedRecordSchema.safeParse(enriched);
    if (!check.success) {
      errors.push({ line, issues: check.error.issues.map((iss) => `enriched.${iss.path.join('.') || '(root)'}: ${iss.message}`) });
      return;
    }

    records.push(enriched);
    by_verdict[enriched.provenance.record_verdict]++;
  });

  return {
    records,
    summary: { total: considered, enriched: records.length, invalid: considered - records.length, by_verdict, errors },
  };
}
