/**
 * comedic-moods — the Character Voice Model contract (v0.5).
 *
 * A descriptive, tunable model of a comedic character's voice, organized into five INDEPENDENT layers
 * (Psyche · Theme · Rhetoric · Delivery · Stance). The independence is the point: "who the character is"
 * must be tunable separately from "how the text is built," "how it's performed," and "who it's for" —
 * grounded across four disciplines (Halliday's field/tenor/mode; Biber 1988 orthogonal factors; Goffman
 * 1959 front/back-stage; Booth 1961 / Chatman 1978 persona-vs-narrator; Stanislavski/Chekhov inner-vs-outer).
 *
 * This file is the single source of truth for a persisted character profile — the runtime zod contract
 * (`CharacterVoiceProfileSchema`) plus the inferred TS type. Profiles are data (`profiles/*.json`); each
 * mood/character is one profile CONFIGURED against this schema. The model is deliberately EXTENSIBLE: a
 * layer is an open map of named dimensions, and any dimension can `refines` into finer sub-dimensions
 * (the fractal "gradation" mechanism) — new dimensions and characters never break the schema.
 *
 * Design is study-swarm-grounded + family-different-verifier-checked (see docs/character-voice-model.md's
 * "Research grounding"). Positions are a value in [0,1] on a NAMED continuum (0 = low pole, 1 = high pole)
 * — a tunable knob, not a stat; the poles + prose `note` carry the accurate description.
 */
import { z } from 'zod';

/** The model version stamped on every profile — bump on a breaking profile-shape change. */
export const VOICE_MODEL_SCHEMA = 'comedic-moods-voice/v0.5';

/**
 * A position on a named continuum. `position` ∈ [0,1] locates this character between the two poles;
 * `refines` is the fractal gradation — any dimension can resolve into finer sub-dimensions (e.g. the
 * Psyche `filter` resolves into capacity-to-aim × disposition-to-check × suppression-threshold). Typed
 * recursively via a hand-written interface so `refines` can nest to any depth.
 */
export interface Dimension {
  low: string;
  high: string;
  position: number;
  note?: string;
  refines?: Record<string, Dimension>;
}

export const DimensionSchema: z.ZodType<Dimension> = z.lazy(() =>
  z
    .object({
      low: z.string().min(1),
      high: z.string().min(1),
      position: z.number().min(0).max(1),
      note: z.string().min(1).optional(),
      refines: z.record(DimensionSchema).optional(),
    })
    .strict(),
);

/** An open map of named dimensions — a layer. Extensible: profiles add dimensions without a schema change. */
export const DimensionLayerSchema = z.record(DimensionSchema);

/** A signature device (a recurring rhetorical move): present with an emphasis `weight` ∈ [0,1]. */
export const DeviceSchema = z
  .object({
    name: z.string().min(1),
    weight: z.number().min(0).max(1),
    note: z.string().min(1).optional(),
  })
  .strict();

/**
 * The Theme layer — what the comedy is ABOUT, as a tunable intensity slider rather than a fixed tag.
 * `intensity` ∈ [0,1] runs from the veneer over innocence (0, Wodehouse) → over a brutal machine (1,
 * Blackadder/Yes Minister); `expose_vs_anaesthetise` ∈ [0,1] is Jonathan Coe's caveat (0 = the joke
 * anaesthetises us to the machine, 1 = it exposes it).
 */
export const ThemeLayerSchema = z
  .object({
    intensity: z.number().min(0).max(1),
    conceals: z.string().min(1),
    targets: z.array(z.string().min(1)).min(1),
    expose_vs_anaesthetise: z.number().min(0).max(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

/** The Rhetoric layer — the dimensions of construction plus the signature devices. */
export const RhetoricLayerSchema = z
  .object({
    dimensions: DimensionLayerSchema,
    devices: z.array(DeviceSchema),
  })
  .strict();

/**
 * The Stance layer — who the wit is aimed at and the relationship. `direction` is a distribution over
 * up / inward / down (the Self-awareness axis correlates: the knowing punch up/inward, the deluded down);
 * it is NOT constrained to sum to 1 — these are independent leanings, tunable per character.
 */
export const StanceLayerSchema = z
  .object({
    dimensions: DimensionLayerSchema.optional(),
    subject: z.array(z.string().min(1)).min(1),
    direction: z
      .object({
        up: z.number().min(0).max(1),
        inward: z.number().min(0).max(1),
        down: z.number().min(0).max(1),
      })
      .strict(),
    relationship: z.string().min(1),
  })
  .strict();

/** A recognisable variant of the voice, anchored to a sourced exemplar (see the canon doc's grounding). */
export const VariantSchema = z
  .object({
    name: z.string().min(1),
    exemplar: z.string().min(1),
    register: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

/**
 * A full character voice profile — one comedic mood/character configured against the model. `.strict()`
 * throughout: a stray key is a contract violation, so a hand-edited profile can't smuggle an un-modelled
 * field past validation. `neighbours` names adjacent character families reachable by moving a dial (e.g.
 * dry → cringe by lowering Self-awareness) — the boundaries the model spans but must not conflate.
 */
export const CharacterVoiceProfileSchema = z
  .object({
    schema: z.literal(VOICE_MODEL_SCHEMA),
    id: z.string().min(1),
    label: z.string().min(1),
    core_attitude: z.string().min(1),
    layers: z
      .object({
        psyche: DimensionLayerSchema,
        theme: ThemeLayerSchema,
        rhetoric: RhetoricLayerSchema,
        delivery: DimensionLayerSchema,
        stance: StanceLayerSchema,
      })
      .strict(),
    variants: z.array(VariantSchema).optional(),
    neighbours: z
      .array(
        z
          .object({ family: z.string().min(1), reached_by: z.string().min(1), exemplar: z.string().min(1).optional() })
          .strict(),
      )
      .optional(),
    provenance: z
      .object({
        grounded_by: z.string().min(1),
        verified_by: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

/** The profile type — inferred from the schema so it cannot drift from what the validator enforces. */
export type CharacterVoiceProfile = z.infer<typeof CharacterVoiceProfileSchema>;

export interface ProfileValidation {
  ok: boolean;
  profile?: CharacterVoiceProfile;
  issues?: string[];
}

/** Validate an unknown value as a character voice profile, returning the parsed profile or field-level
 *  issues (mirrors the dataset validators' fail-loud discipline). */
export function validateProfile(value: unknown): ProfileValidation {
  const res = CharacterVoiceProfileSchema.safeParse(value);
  if (res.success) return { ok: true, profile: res.data };
  return { ok: false, issues: res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
