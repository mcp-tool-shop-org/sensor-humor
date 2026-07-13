/**
 * comedic-moods-v0 — the ENRICHED-record contract (Slice 2.1).
 *
 * `provenance.ts` defines the verdict ENGINE (assignVerdict) + its TS interfaces. This file is the
 * runtime zod contract for the ENRICHED row the enrich CLI writes: a full `CaptureRow` plus the
 * `provenance` block. It exists for the same reason `schema.ts` does for the raw row — a published
 * enriched snapshot is a build gate, so a malformed enriched row must fail loudly rather than ship.
 *
 * Built by `.extend()`ing `BaseCaptureRowSchema` (the one row definition) with the provenance block and
 * re-applying the SAME `validMatchesDegraded` invariant, so the enriched contract cannot drift from the
 * raw one. The zod schemas here and the hand-written interfaces in `provenance.ts` are held in lockstep
 * by the compile-time drift guard at the bottom of this file — if either side changes shape, tsc fails.
 */
import { z } from 'zod';
import { BaseCaptureRowSchema, validMatchesDegraded, VALID_DEGRADED_ISSUE } from './schema.js';
import type { Provenance, EnrichedRecord, PiiScrubResult } from './provenance.js';

/**
 * Result of a PII scrub pass. `per_entity` is pass/fail PER entity class (email, phone, key, …): a
 * single blended score hides categories (SantaCoder: F1 61–98% by entity), so the verdict engine
 * gates on `clean` which must reflect EVERY entity passing. A stray key would let an un-checked entity
 * class masquerade as scrubbed, so the object is `.strict()`.
 */
export const PiiScrubResultSchema = z
  .object({
    tool: z.string().min(1),
    version: z.string().min(1),
    per_entity: z.record(z.enum(['pass', 'fail'])),
    clean: z.boolean(),
  })
  .strict();

/**
 * The per-record provenance block. `.strict()` — the verdict is a distribution-gating decision, so an
 * unknown key (a hand-edit smuggling a field the engine never set) is a contract violation. `pii_scrub`
 * is nullable: `null` means "not yet scrubbed" (distinct from "scrubbed, all entities passed").
 */
export const ProvenanceSchema = z
  .object({
    source_type: z.enum(['synthetic', 'user_input']),
    consent_status: z.enum(['n/a', 'opted_in', 'unknown', 'withdrawn']),
    pii_scrub: PiiScrubResultSchema.nullable(),
    code_snippet_flag: z.boolean(),
    record_verdict: z.enum(['public', 'public_candidate', 'internal', 'excluded']),
    verdict_reason: z.string().min(1),
  })
  .strict();

/**
 * The enriched-row contract: the whole raw row plus its provenance block, still under the raw row's
 * cross-field invariant. `.extend()` builds ON `BaseCaptureRowSchema` (single source) and preserves its
 * `.strict()` policy; re-applying `validMatchesDegraded` keeps valid ⇔ !degraded_reason enforced on the
 * embedded row so an enriched snapshot can't ship an internally-inconsistent row either.
 */
export const EnrichedRecordSchema = BaseCaptureRowSchema.extend({
  provenance: ProvenanceSchema,
}).refine(validMatchesDegraded, VALID_DEGRADED_ISSUE);

/**
 * Compile-time drift guard. The zod schemas above and the hand-written interfaces in `provenance.ts`
 * describe the same shapes from two sides; this asserts they are byte-for-byte the same TYPE, so a
 * field added to one but not the other fails `tsc` instead of silently letting the writer and the
 * validator disagree. `Equals` is the standard strict type-equality (function-parameter bivariance
 * trick) — it distinguishes optional-vs-required and union membership, not just assignability.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _piiScrubMatches: Equals<z.infer<typeof PiiScrubResultSchema>, PiiScrubResult> = true;
const _provenanceMatches: Equals<z.infer<typeof ProvenanceSchema>, Provenance> = true;
const _enrichedMatches: Equals<z.infer<typeof EnrichedRecordSchema>, EnrichedRecord> = true;
void _piiScrubMatches;
void _provenanceMatches;
void _enrichedMatches;
