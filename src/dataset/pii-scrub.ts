/**
 * comedic-moods-v0 — PII scrub floor (Slice 2.2).
 *
 * A deterministic, dependency-free regex FLOOR that detects common PII/secret classes in a row's text
 * and produces a per-entity `PiiScrubResult` for the verdict engine. Two design commitments from the
 * study-swarm License/provenance lock:
 *
 *  1. PER-ENTITY pass/fail, never one blended score — a single "looks scrubbed" number hides categories
 *     (SantaCoder: PII detection F1 ranges 61–98% BY entity). `per_entity` records each class so a
 *     failing class is visible, and `clean` is the AND over all classes.
 *  2. Fail-SAFE by detection, not by redaction — a regex floor is NOT a defensible clearance (Hong et
 *     al.: one scrub pass is insufficient for public release). So a DETECTED entity fails the row
 *     (→ excluded), rather than being quietly redacted-and-cleared. Redaction IS produced (for a future
 *     keep-and-redact path once a real scrubber + human review exist) but does not itself clear a row.
 *
 * v0 is a FLOOR. The upgrade is Microsoft Presidio (NER + context + checksum validators); this module's
 * `tool`/`version` stamp makes a re-scrub with a better tool distinguishable at read time. user_input
 * rows are scrubbed when enrich `--scrub` is on; synthetic rows are always floor-scrubbed so a
 * public_candidate cannot issue without a scrub result.
 *
 * All patterns are linear (bounded quantifiers, no nested/overlapping repetition) — a deliberate guard
 * against the ReDoS class the repo has fixed before; detection uses String.match / String.replace, not
 * a reused global-regex `.test()` (whose persisted lastIndex would flake across calls).
 */
import type { PiiScrubResult } from './provenance.js';

export const PII_SCRUB_TOOL = 'regex-floor';
export const PII_SCRUB_VERSION = '0.2.0';

/** The entity classes the floor detects. Distinct classes so a failure names WHICH category fired. */
export const PII_ENTITY_CLASSES = ['email', 'phone', 'ssn', 'ip', 'credit_card', 'key'] as const;
export type PiiEntityClass = (typeof PII_ENTITY_CLASSES)[number];

/**
 * Per-class detectors. Each is a linear, globally-flagged pattern. Over-detection is acceptable and
 * intentional (a version string matching the IPv4 shape, a long number matching card/phone): the floor
 * fails safe toward exclusion, so a false positive costs one excluded row, never a leak.
 */
const DETECTORS: Record<PiiEntityClass, RegExp[]> = {
  email: [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  // 3-3-4 with optional country code / parens / separators (covers "1234567890" and "(555) 123-4567").
  phone: [/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g],
  ssn: [/\b\d{3}-\d{2}-\d{4}\b/g],
  ip: [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IPv4
    // IPv6 — linear, bounded quantifiers only (no nested/overlapping repetition).
    /\b(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}\b/g, // full 8 hextets
    /::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4}\b/g, // leading :: (incl. ::1)
    /\b(?:[0-9A-Fa-f]{1,4}:){1,7}:/g, // trailing / mid compression (hextets then ::)
  ],
  // 13–16 digits with optional single space/dash between them (a card-shaped run).
  credit_card: [/\b(?:\d[ -]?){13,16}\b/g],
  key: [
    /\bsk-[A-Za-z0-9]{16,}\b/g, // classic openai/stripe hyphen secret
    /\bsk-(?:proj|svcacct|ant)-[A-Za-z0-9_-]{16,}/g, // openai project/svcacct, anthropic
    /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g, // stripe live/test (underscore, not hyphen)
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
    /\bghp_[A-Za-z0-9]{36}\b/g, // github classic PAT
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g, // github fine-grained PAT
    /\bgho_[A-Za-z0-9]{20,}/g, // github oauth token
    /\bghu_[A-Za-z0-9]{20,}/g, // github user-to-server token
    /\bghs_[A-Za-z0-9]{20,}/g, // github server-to-server token
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // slack token
    /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, // JWT (three base64url segments)
    /\b[0-9a-f]{32,}\b/gi, // generic long hex (md5/sha/hex secret)
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/g, // PEM private key (generic or RSA)
  ],
};

/** Placeholder a detected entity is redacted to (e.g. `credit_card` → `[CREDIT_CARD]`). */
function placeholder(cls: PiiEntityClass): string {
  return `[${cls.toUpperCase()}]`;
}

export interface ScrubOutput {
  /** The per-entity verdict + `clean` flag consumed by the enrichment verdict engine. */
  result: PiiScrubResult;
  /** The input with every detected entity replaced by its `[CLASS]` placeholder (for a future
   *  keep-and-redact path; v0 excludes rather than keeps, so this is informational). */
  redacted: string;
}

/**
 * Run the regex floor over `text`. `per_entity[class]` is 'fail' when that class matched at least once,
 * 'pass' otherwise; `clean` is true only when EVERY class passed (no PII of any class detected).
 * Deterministic and pure — same text always yields the same result.
 */
export function scrubPii(text: string): ScrubOutput {
  const per_entity: Record<string, 'pass' | 'fail'> = {};
  let redacted = text;

  for (const cls of PII_ENTITY_CLASSES) {
    let found = false;
    for (const re of DETECTORS[cls]) {
      // Detect against the ORIGINAL text so per-entity results are order-independent; String.match
      // (unlike a reused global `.test()`) does not carry lastIndex between calls.
      if (text.match(re) !== null) found = true;
      // Redaction accumulates on `redacted`; a placeholder can't re-trigger another class's detector.
      redacted = redacted.replace(re, placeholder(cls));
    }
    per_entity[cls] = found ? 'fail' : 'pass';
  }

  const clean = PII_ENTITY_CLASSES.every((c) => per_entity[c] === 'pass');
  return { result: { tool: PII_SCRUB_TOOL, version: PII_SCRUB_VERSION, per_entity, clean }, redacted };
}

/**
 * AND two (or more) per-entity scrub results — a class fails if it failed in ANY part.
 * Used when input and output are scrubbed separately so each field can be redacted on exclude.
 */
export function combineScrubResults(parts: readonly PiiScrubResult[]): PiiScrubResult {
  const first = parts[0];
  const per_entity: Record<string, 'pass' | 'fail'> = {};
  for (const cls of PII_ENTITY_CLASSES) {
    per_entity[cls] = parts.some((p) => p.per_entity[cls] === 'fail') ? 'fail' : 'pass';
  }
  return {
    tool: first?.tool ?? PII_SCRUB_TOOL,
    version: first?.version ?? PII_SCRUB_VERSION,
    per_entity,
    clean: PII_ENTITY_CLASSES.every((c) => per_entity[c] === 'pass'),
  };
}
