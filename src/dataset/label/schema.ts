/**
 * comedic-moods-v0 — the BWS judgment-record contract (Slice 4, decision B.2).
 *
 * The human anchor (decision B) is a JSON-Lines file of BWS judgments: for one mood, the human saw a
 * small tuple of lines and picked the BEST and WORST embodiment. This module is the single source of
 * truth for one persisted judgment — the runtime zod contract (`BwsJudgmentRecordSchema`) and the TS
 * type (`BwsJudgmentRecord`, inferred from it), mirroring how `../schema.ts` pins the capture row. A
 * published anchor snapshot is a build gate, so a malformed judgment must fail loudly (see `validate.ts`
 * + `scripts/validate-bws-anchor.ts`) rather than silently corrupt the set the scorer trains against.
 *
 * A judgment references lines by a STABLE, content-derived `lineId` (a short sha256 of `mood|output`),
 * NOT by row index or a volatile capture field. That is load-bearing: the corpus is regenerated /
 * reordered / re-scrubbed between labeling sessions, and a content-derived id keeps a judgment pointing
 * at the SAME line across regenerations (identical text → identical id) while a changed line is, by
 * design, a different line. Rankings are WITHIN a mood (Kiritchenko & Mohammad 2017), so every judgment
 * carries its `mood` and the anchor is grouped by it downstream.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MOOD_STYLES } from '../../types.js';
import type { BwsJudgment } from './bws.js';

/**
 * Dataset schema tag stamped on every judgment — ties on-disk anchor rows to this contract and lets a
 * future breaking judgment shape be a new tag (`/v1`). Distinct from the capture-row tag
 * (`comedic-moods/v0`): the anchor is a separate artifact with its own lifecycle.
 */
export const BWS_JUDGMENT_SCHEMA = 'comedic-moods-bws/v0';

/**
 * Stable, content-derived id for a comedic line: a short sha256 of `mood|output`. Depends ONLY on the
 * (mood, output) pair — not on ts/turn/tool or corpus order — so the SAME line regenerated later hashes
 * to the SAME id, and a judgment referencing it stays valid across corpus rebuilds. Mirrors the
 * sha256(...).slice(0,12) fingerprint idiom in `ollama.ts` (48 bits — ample separation for the
 * few-hundred lines/mood the anchor covers; line ids are hex so they never collide with the tuple-key
 * separator).
 */
export function lineId(mood: string, output: string): string {
  return createHash('sha256').update(`${mood}|${output}`).digest('hex').slice(0, 12);
}

/**
 * Structural invariants a persisted judgment must satisfy, extracted as named predicates so they are
 * TESTS (repo ethos) and can be reused by any consumer, not just prose in a refine. Typed loosely (only
 * the fields they read) so they apply to a raw parsed object and a typed record alike.
 */
export function bestWorstInTuple(r: { line_ids: string[]; best: string; worst: string }): boolean {
  return r.line_ids.includes(r.best) && r.line_ids.includes(r.worst) && r.best !== r.worst;
}
export function tupleIdsDistinct(r: { line_ids: string[] }): boolean {
  return new Set(r.line_ids).size === r.line_ids.length;
}

/**
 * The persisted BWS judgment contract. `.strict()` closes the shape — a stray top-level key (a
 * hand-edit smuggling a field the labeler never wrote) is a contract violation. `line_ids` must hold ≥2
 * distinct ids (a BWS choice needs at least a best and a worst to distinguish); `best`/`worst` must both
 * be members of `line_ids` and differ. `.superRefine` re-applies the structural invariants above with
 * targeted issues so the validator points at the exact offending field.
 */
export const BwsJudgmentRecordSchema = z
  .object({
    schema: z.literal(BWS_JUDGMENT_SCHEMA),
    ts: z.number().int().nonnegative(),
    mood: z.enum(MOOD_STYLES),
    line_ids: z.array(z.string().min(1)).min(2),
    best: z.string().min(1),
    worst: z.string().min(1),
    rater: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (!tupleIdsDistinct(r))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['line_ids'], message: 'line_ids must be distinct' });
    if (!r.line_ids.includes(r.best))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['best'], message: 'best must be one of line_ids' });
    if (!r.line_ids.includes(r.worst))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['worst'], message: 'worst must be one of line_ids' });
    if (r.best === r.worst)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['worst'], message: 'worst must differ from best' });
  });

/** The judgment type — inferred from the schema so it cannot drift from what the validator enforces. */
export type BwsJudgmentRecord = z.infer<typeof BwsJudgmentRecordSchema>;

/**
 * Project a persisted record onto the pure-math `BwsJudgment` (`bws.ts`) — drops the persistence fields
 * (schema/ts/mood/rater) the ranking math does not use. The bridge from the on-disk anchor to
 * `bwsCountScores` / `fitBradleyTerry` / `findIntransitiveTriples`.
 */
export function judgmentRecordToBws(r: BwsJudgmentRecord): BwsJudgment {
  return { items: r.line_ids, best: r.best, worst: r.worst };
}
