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
import {
  assignVerdict,
  type EnrichedRecord,
  type RecordVerdict,
  type VerdictContext,
  type SourceType,
  type ConsentStatus,
} from './provenance.js';
import { scrubPii, combineScrubResults } from './pii-scrub.js';
import type { RowError } from './validate.js';

/** Options for a batch enrichment. Applied uniformly to every row in the file unless a row already
 *  carries a capture-time `source_type` stamp and the caller did not pass an explicit override. */
export interface EnrichOptions {
  /** Where every row's input came from. When omitted, each row's stamp is used, else 'user_input'. */
  source_type?: SourceType;
  /** Consent for user_input rows. Ignored for synthetic rows. */
  consent_status?: ConsentStatus;
  /**
   * Run the regex-floor PII scrub on each user_input row (over its input + generated line) and feed the
   * per-entity result into the verdict. Synthetic rows are always floor-scrubbed (public_candidate
   * requires a scrub result). Off by default for user_input — without it, an opted-in user_input row
   * correctly stays `internal` ("not yet PII-scrubbed").
   */
  scrub?: boolean;
}

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
 * Resolve a row's source: explicit enrich option (CLI `--source`) wins, else the capture-time stamp,
 * else fail-closed `user_input` — never silently treat an unstamped live file as synthetic.
 */
function resolveSourceType(row: { source_type?: SourceType }, options: EnrichOptions): SourceType {
  if (options.source_type !== undefined) return options.source_type;
  if (row.source_type !== undefined) return row.source_type;
  return 'user_input';
}

/**
 * Enrich JSONL capture text into records + a verdict summary. `options.source_type` overrides a row
 * stamp when provided; otherwise the capture-time stamp is used, else `user_input` (fail-closed).
 * The regex-floor scrub runs for user_input when `scrub: true`, and always for synthetic rows (so a
 * public_candidate can never issue without a scrub result). A failing entity excludes the row and
 * the snapshot persists redacted input/output rather than plaintext PII.
 */
export function enrichCaptureJsonl(text: string, options: EnrichOptions = {}): EnrichResult {
  const { consent_status, scrub = false } = options;
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

    const source_type = resolveSourceType(res.data, options);
    // Build this row's verdict context. Synthetic rows are always floor-scrubbed so public_candidate
    // cannot issue without a scrub result; a user_input row is scrubbed when `scrub` is on.
    const rowCtx: VerdictContext = { source_type, ...(consent_status ? { consent_status } : {}) };
    const shouldScrub = scrub || source_type === 'synthetic';
    let redactedInput: string | undefined;
    let redactedOutput: string | undefined;
    if (shouldScrub) {
      const inScrub = scrubPii(res.data.input);
      const outScrub = scrubPii(res.data.output);
      rowCtx.pii_scrub = combineScrubResults([inScrub.result, outScrub.result]);
      redactedInput = inScrub.redacted;
      redactedOutput = outScrub.redacted;
    }
    let enriched = assignVerdict(res.data, rowCtx);

    // Excluded rows must not persist plaintext PII in the enriched snapshot — keep the redacted
    // fields (schema requires input/output; a fully-redacted empty output becomes a placeholder).
    if (enriched.provenance.record_verdict === 'excluded' && redactedInput !== undefined && redactedOutput !== undefined) {
      const out = redactedOutput.length > 0 ? redactedOutput : '[REDACTED]';
      enriched = { ...enriched, input: redactedInput, output: out };
    }

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
