/**
 * comedic-moods-v0 — provenance + verdict rule engine (Slice 2).
 *
 * Enriches a captured row with the per-record provenance / consent / PII fields and assigns a
 * distribution verdict, per the study-swarm synthesis License/provenance lock (see the
 * comedic-moods-v0 memory). Pure + deterministic — no I/O, no model calls — so verdict assignment is
 * testable and replayable. Mirrors jam-actions' tiered-verdict discipline: **`public` is NEVER
 * auto-assigned** (it requires explicit human opt-in + review); this engine assigns only
 * internal / public_candidate / excluded, fail-safe toward the most restrictive applicable verdict.
 */
import type { CaptureRow } from './schema.js';

/**
 * Where a row's INPUT came from — the copyright/PII risk axis (the OUTPUT is always synthetic,
 * model-generated). 'synthetic' = a fully synthetic row (curated internal-seed input + model output,
 * no user content); 'user_input' = the input was supplied by a user of the live tool.
 */
export type SourceType = 'synthetic' | 'user_input';

/** Consent state for a user-supplied input. 'n/a' for synthetic (internal-seed) rows. */
export type ConsentStatus = 'n/a' | 'opted_in' | 'unknown' | 'withdrawn';

/**
 * Result of a PII scrub pass. `per_entity` records pass/fail per entity class (email, phone, key, …)
 * — a single blended "looks scrubbed" score hides categories (SantaCoder: F1 61–98% by entity), so
 * the verdict engine checks `clean` which must reflect EVERY entity passing. `null` = not yet scrubbed.
 */
export interface PiiScrubResult {
  tool: string;
  version: string;
  per_entity: Record<string, 'pass' | 'fail'>;
  clean: boolean;
}

/** Distribution verdict (jam-actions enum). `public` is not assignable by this engine. */
export type RecordVerdict = 'public' | 'public_candidate' | 'internal' | 'excluded';

/** The per-record provenance block added to a captured row on enrichment. */
export interface Provenance {
  source_type: SourceType;
  consent_status: ConsentStatus;
  pii_scrub: PiiScrubResult | null;
  code_snippet_flag: boolean;
  record_verdict: RecordVerdict;
  verdict_reason: string;
}

/** A captured row enriched with its provenance/verdict block. */
export interface EnrichedRecord extends CaptureRow {
  provenance: Provenance;
}

/** Context the verdict engine needs beyond the row itself. */
export interface VerdictContext {
  /**
   * Where the input came from. Prefer the row's capture-time stamp; otherwise this context;
   * otherwise fail-closed to 'user_input' (never silently treat live capture as synthetic).
   */
  source_type?: SourceType;
  /** Consent for a user_input row. Ignored for synthetic rows. */
  consent_status?: ConsentStatus;
  /** PII scrub result, when a scrub has run over the row. */
  pii_scrub?: PiiScrubResult | null;
}

/**
 * Heuristic: does this text look like a code snippet — a license/attribution risk surface per Doe v.
 * GitHub (breach-of-open-source-license claims survived)? Counts independent code signals and fires
 * at ≥2, so prose *about* code ("a 3000-line file with zero comments") scores 0 while a real snippet
 * scores high. Used to set `code_snippet_flag`, which routes USER-supplied code to manual review
 * before any public release.
 */
export function looksLikeCode(text: string): boolean {
  const signals: RegExp[] = [
    /[{};]\s*$/m, // a line ending in a brace or semicolon
    /=>|::|->|!==|===|&&|\|\|/, // code operators
    /\b(function|const|let|var|def|class|import|export|return|public|private|async|await|null|undefined)\b/,
    /\b(catch|if|for|while|switch)\s*\(/, // control-flow keyword + paren
    /\/\/|\/\*|^\s*#/m, // comment markers (// , /* , leading #)
    /<\/?[a-z][\w-]*\s*\/?>/i, // an HTML/XML-ish tag
    /[{}()[\]][^{}()[\]]*[{}()[\]]/, // ≥2 brackets (a call / block shape)
  ];
  let hits = 0;
  for (const s of signals) if (s.test(text)) hits++;
  return hits >= 2;
}

/**
 * Assign the provenance block + distribution verdict for a captured row, per the License/provenance
 * lock. Tiered and fail-safe (defaults to the most restrictive applicable verdict); `public` is
 * never assigned here — only a human opt-in + review step promotes public_candidate → public.
 */
export function assignVerdict(row: CaptureRow, ctx: VerdictContext = {}): EnrichedRecord {
  // Fail-closed: an unstamped live-capture row is user_input, never silently synthetic.
  const source_type: SourceType = ctx.source_type ?? row.source_type ?? 'user_input';
  const code_snippet_flag = looksLikeCode(row.input);
  const pii_scrub = ctx.pii_scrub ?? null;
  const consent_status: ConsentStatus =
    source_type === 'synthetic' ? 'n/a' : ctx.consent_status ?? 'unknown';

  let record_verdict: RecordVerdict;
  let verdict_reason: string;

  if (!row.valid) {
    // A degraded / substituted line (backend fallback, safety, or language substitution) is not a
    // genuine generation — usable internally as a negative example, never a public positive.
    record_verdict = 'internal';
    verdict_reason = `degraded output (degraded_reason: ${row.degraded_reason ?? 'unknown'}) — internal-only negative`;
  } else if (pii_scrub && !pii_scrub.clean) {
    // Any per-entity PII failure blocks the row from distribution (layered scrub is the gate; one
    // failing entity is enough — Hong et al.: one pass is not defensible, so a failure is decisive).
    record_verdict = 'excluded';
    verdict_reason = 'PII scrub reported a failing entity — excluded from distribution';
  } else if (!pii_scrub) {
    // Never mint public_candidate without a scrub result — an unstamped live file used to default
    // to synthetic and skip the floor, shipping plaintext PII as a public_candidate.
    record_verdict = 'internal';
    verdict_reason =
      source_type === 'synthetic'
        ? 'synthetic row not yet PII-scrubbed — internal until a scrub result exists'
        : 'user input not yet PII-scrubbed — internal until scrubbed';
  } else if (source_type === 'synthetic') {
    // Fully synthetic (curated internal-seed input + model output, no user content): eligible for
    // public pending human review, but only AFTER a clean scrub result. code_snippet_flag on OUR
    // OWN seed inputs is informational only (it is not a third-party license risk).
    record_verdict = 'public_candidate';
    verdict_reason = 'synthetic row (internal-seed input + model output); public pending human review';
  } else if (consent_status !== 'opted_in') {
    record_verdict = 'internal';
    verdict_reason = `user input without opt-in consent (consent: ${consent_status}) — internal-only`;
  } else if (code_snippet_flag) {
    record_verdict = 'internal';
    verdict_reason =
      'user input contains code (license/attribution review required per Doe v. GitHub) — internal until reviewed';
  } else {
    record_verdict = 'public_candidate';
    verdict_reason = 'user input opted-in, PII-clean, no code — public pending human review';
  }

  return {
    ...row,
    provenance: { source_type, consent_status, pii_scrub, code_snippet_flag, record_verdict, verdict_reason },
  };
}
