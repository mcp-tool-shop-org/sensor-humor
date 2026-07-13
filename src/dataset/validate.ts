/**
 * comedic-moods-v0 — dataset validator.
 *
 * Reads a JSON-Lines capture file and validates every row against the row contract
 * (`CaptureRowSchema`), collecting per-line errors. Pure (takes text, returns a result) so it is
 * trivially testable; the CLI wrapper (`scripts/validate-comedic-moods.ts`) handles I/O + exit code.
 * This is the Slice-1 "validator that enforces the row contract" — a build/publish gate: a dataset
 * snapshot with any invalid row fails loudly rather than shipping a malformed corpus.
 */
import { CaptureRowSchema } from './schema.js';

export interface RowError {
  /** 1-based line number in the JSONL file. */
  line: number;
  /** Human-readable issues for this row (`path: message`), or a JSON-parse error. */
  issues: string[];
}

export interface ValidateResult {
  total: number;
  valid: number;
  invalid: number;
  errors: RowError[];
}

/**
 * Validate JSONL capture text. Blank lines are skipped (a trailing newline is not an error). Each
 * non-blank line must be valid JSON AND satisfy the row contract; the first JSON-parse or schema
 * failure per line is reported with its 1-based line number.
 */
export function validateCaptureJsonl(text: string): ValidateResult {
  const lines = text.split(/\r?\n/);
  const errors: RowError[] = [];
  let considered = 0;
  let valid = 0;

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
    const res = CaptureRowSchema.safeParse(parsed);
    if (res.success) {
      valid++;
    } else {
      errors.push({
        line: i + 1,
        issues: res.error.issues.map((iss) => `${iss.path.join('.') || '(root)'}: ${iss.message}`),
      });
    }
  });

  return { total: considered, valid, invalid: considered - valid, errors };
}
