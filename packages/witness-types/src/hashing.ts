/**
 * Task 4 — the three layer-specific hashes and the public-exposure rule.
 *
 *   source_testimony_hash      — AUDIT-ONLY; equals testimony_records.content_hash.
 *   redacted_public_slice_hash — covers exactly the public view; safe to publish.
 *   publication_bundle_hash    — covers the emitted bundle; safe to publish.
 *
 * Each layer is verifiable independently (Property 2). The source testimony hash
 * must never appear in a public bundle (public-exposure rule, R8).
 */

import { createHash } from "node:crypto";

import type { CorpusEntry } from "./corpusEntry";
import { computePublicView, type PublicView } from "./partition";

export const HASH_PREFIX = "sha256:";

/** Stable, key-sorted JSON so hashing is order-independent. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** sha256 of a string (as-is) or any value (canonicalized), prefixed `sha256:`. */
export function sha256(value: unknown): string {
  const input = typeof value === "string" ? value : canonicalize(value);
  return HASH_PREFIX + createHash("sha256").update(input).digest("hex");
}

/** Hash exactly the public view (public slice + datasheet + framing). */
export function computeRedactedPublicSliceHash(entry: CorpusEntry): string {
  return sha256(computePublicView(entry));
}

/** Hash an emitted publication bundle artifact. */
export function computePublicationBundleHash(bundle: unknown): string {
  return sha256(bundle);
}

/**
 * Property 2: the entry's recorded source_testimony_hash must equal the source
 * testimony record's content_hash. Throws on mismatch.
 */
export function assertSourceTestimonyHashMatches(
  entry: CorpusEntry,
  testimonyContentHash: string,
): void {
  const recorded = entry.meta.hashes.source_testimony_hash;
  if (recorded !== testimonyContentHash) {
    throw new Error(
      `source_testimony_hash mismatch: entry has "${recorded}", testimony record has "${testimonyContentHash}"`,
    );
  }
}

/**
 * Public-exposure rule: the source_testimony_hash must never appear anywhere in
 * a public artifact. Throws if the serialized public view/bundle contains it.
 */
export function assertSourceHashAbsentFromPublic(
  publicArtifact: PublicView | unknown,
  entry: CorpusEntry,
): void {
  const sourceHash = entry.meta.hashes.source_testimony_hash;
  if (canonicalize(publicArtifact).includes(sourceHash)) {
    throw new Error(
      "source_testimony_hash is present in a public artifact; it is audit-only and must never be exposed",
    );
  }
}
