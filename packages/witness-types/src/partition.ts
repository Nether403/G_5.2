/**
 * Task 3 — public/private partition for a Corpus_Entry.
 *
 * The consent boundary classifies content segments by RFC-6901 JSON Pointer.
 * Partition is DEFAULT-DENY: a segment is exposable only if it is explicitly
 * classified `public`. This module both validates an authored entry against the
 * containment invariant (Property 1 / R12) and computes the safe public view
 * that the compiler + exporter (Tasks 7/8) project for outreach.
 *
 * Invariants enforced:
 *   - A segment whose pointer targets a public region (/public_slice or
 *     /datasheet_summary) MUST be classified `public`.
 *   - A segment whose pointer targets the /private subtree MUST NOT be `public`.
 *   - Every segment pointer MUST resolve to an existing node (no dangling refs).
 * The computed public view NEVER contains the /private subtree, so
 * compiler_artifacts and holdout_eval_cases are excluded by construction.
 */

import type {
  Classification,
  CorpusEntry,
  DatasheetSummary,
  PublicSlice,
} from "./corpusEntry";

const PUBLIC_REGIONS = ["/public_slice", "/datasheet_summary"] as const;
const PRIVATE_REGION = "/private";

function unescapeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Resolve an RFC-6901 JSON Pointer against a root value. */
export function resolveJsonPointer(
  root: unknown,
  pointer: string,
): { found: boolean; value?: unknown } {
  if (pointer === "") return { found: true, value: root };
  if (!pointer.startsWith("/")) return { found: false };

  const tokens = pointer.split("/").slice(1).map(unescapeToken);
  let current: unknown = root;

  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false };
      }
      current = current[index];
    } else if (current !== null && typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, token)) {
        return { found: false };
      }
      current = record[token];
    } else {
      return { found: false };
    }
  }

  return { found: true, value: current };
}

function inRegion(pointer: string, region: string): boolean {
  return pointer === region || pointer.startsWith(`${region}/`);
}

export interface PartitionViolation {
  segment_id: string;
  json_pointer: string;
  classification: Classification;
  reason: string;
}

export interface PartitionResult {
  ok: boolean;
  violations: PartitionViolation[];
}

/**
 * Validate the containment invariant for an authored entry.
 * Returns every violation rather than throwing, so a reviewer surface can list
 * them; use {@link assertPublicContainment} when a hard failure is wanted.
 */
export function validatePublicContainment(entry: CorpusEntry): PartitionResult {
  const violations: PartitionViolation[] = [];

  for (const segment of entry.consent_boundary.segments) {
    const resolved = resolveJsonPointer(entry, segment.json_pointer);
    if (!resolved.found) {
      violations.push({
        segment_id: segment.segment_id,
        json_pointer: segment.json_pointer,
        classification: segment.classification,
        reason: "json_pointer does not resolve to an existing node",
      });
      continue;
    }

    const isPublic = segment.classification === "public";

    if (PUBLIC_REGIONS.some((region) => inRegion(segment.json_pointer, region)) && !isPublic) {
      violations.push({
        segment_id: segment.segment_id,
        json_pointer: segment.json_pointer,
        classification: segment.classification,
        reason:
          "non-public classification targets a public region (public_slice/datasheet_summary)",
      });
    }

    if (inRegion(segment.json_pointer, PRIVATE_REGION) && isPublic) {
      violations.push({
        segment_id: segment.segment_id,
        json_pointer: segment.json_pointer,
        classification: segment.classification,
        reason: "public classification targets the private subtree",
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Throw if the containment invariant is violated. */
export function assertPublicContainment(entry: CorpusEntry): void {
  const result = validatePublicContainment(entry);
  if (!result.ok) {
    const detail = result.violations
      .map((v) => `${v.segment_id} (${v.json_pointer}): ${v.reason}`)
      .join("; ");
    throw new Error(`Public containment violated: ${detail}`);
  }
}

export interface PublicView {
  framing_statement: string;
  public_slice: PublicSlice;
  datasheet_summary: DatasheetSummary;
}

/**
 * Project the safe-to-expose view of an entry. By construction this contains
 * only the public slice, datasheet summary, and framing statement — never the
 * /private subtree (compiler_artifacts, holdout_eval_cases, held_back_notes).
 */
export function computePublicView(entry: CorpusEntry): PublicView {
  return {
    framing_statement: entry.meta.framing_statement,
    public_slice: entry.public_slice,
    datasheet_summary: entry.datasheet_summary,
  };
}

/** Resolve the effective classification of a pointer (default-deny). */
export function classificationForPointer(
  entry: CorpusEntry,
  pointer: string,
): Classification {
  const explicit = entry.consent_boundary.segments.find(
    (segment) => segment.json_pointer === pointer,
  );
  return explicit?.classification ?? entry.consent_boundary.default_classification;
}
