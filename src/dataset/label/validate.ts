/**
 * comedic-moods-v0 — BWS anchor validator (Slice 4, decision B.2).
 *
 * Reads a JSON-Lines anchor file and validates every judgment against the record contract
 * (`BwsJudgmentRecordSchema`), collecting per-line errors. Pure (text in, result out) so it is trivially
 * testable; the CLI wrapper (`scripts/validate-bws-anchor.ts`) handles I/O + exit code. Mirrors the
 * capture-row validator (`../validate.ts`) — a published anchor with any invalid judgment fails loudly
 * rather than shipping a corrupt training/validation set.
 *
 * Unlike the row validator it also returns the successfully-parsed `records`, so the labeling CLI can
 * reuse this one parse to resume (skip already-judged tuples) instead of re-implementing the read.
 */
import type { RowError } from '../validate.js';
import { BwsJudgmentRecordSchema, type BwsJudgmentRecord } from './schema.js';

export interface BwsValidateResult {
  total: number;
  valid: number;
  invalid: number;
  errors: RowError[];
  /** The judgments that parsed AND satisfied the contract, in file order (for resume/labeling). */
  records: BwsJudgmentRecord[];
}

/**
 * Validate JSONL anchor text. Blank lines are skipped (a trailing newline is not an error). Each
 * non-blank line must be valid JSON AND satisfy the judgment contract; the first JSON-parse or schema
 * failure per line is reported with its 1-based line number.
 */
export function validateBwsJudgmentsJsonl(text: string): BwsValidateResult {
  const lines = text.split(/\r?\n/);
  const errors: RowError[] = [];
  const records: BwsJudgmentRecord[] = [];
  let considered = 0;

  lines.forEach((raw, i) => {
    if (raw.trim().length === 0) return; // skip blank lines (incl. trailing newline)
    considered++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ line: i + 1, issues: [`invalid JSON: ${(e as Error).message}`] });
      return;
    }
    const res = BwsJudgmentRecordSchema.safeParse(parsed);
    if (res.success) {
      records.push(res.data);
    } else {
      errors.push({
        line: i + 1,
        issues: res.error.issues.map((iss) => `${iss.path.join('.') || '(root)'}: ${iss.message}`),
      });
    }
  });

  return { total: considered, valid: records.length, invalid: considered - records.length, errors, records };
}
