/**
 * Task 7 — the Corpus_Entry compiler (G_5.2 governed plane).
 *
 * Assembles a validated Corpus_Entry from sealed governed testimony plus the
 * TWP control-plane reference IDs, running the partition (Task 3), hashing
 * (Task 4), and eval-standard (Task 5) checks before a fail-closed final parse.
 *
 * Boundary discipline (Property 5 / R13): the entry only ever REFERENCES the
 * two planes by id; it never embeds TWP-owned bodies. {@link corpusEntryTwpProjection}
 * is the minimal, body-free view TWP persists/hosts — it excludes the testimony
 * body, reasoning/plurality bodies, provenance, the private section, and the
 * audit-only source_testimony_hash.
 */

import {
  CORPUS_ENTRY_SCHEMA_VERSION,
  parseCorpusEntry,
  type ConsentBoundary,
  type CorpusEntry,
  type CorpusEvalCase,
  type DatasheetSummary,
  type EntryKind,
  type HumanReadable,
  type Plurality,
  type PrivateSection,
  type Provenance,
  type PublicSlice,
  type ReasoningStructure,
  type References,
  type ReviewSummary,
} from "./corpusEntry";
import { assertWitnessAttributedEval } from "./evalStandard";
import {
  assertSourceHashAbsentFromPublic,
  computeRedactedPublicSliceHash,
} from "./hashing";
import { assertPublicContainment, computePublicView } from "./partition";

/** A sealed governed testimony, identified and content-hashed in G_5.2. */
export interface SealedTestimonyRef {
  testimonyId: string;
  /** Becomes meta.hashes.source_testimony_hash (audit-only). */
  contentHash: string;
}

export interface CompileCorpusEntryInput {
  entryId: string;
  entryKind: EntryKind;
  createdAt?: string;
  isSynthetic?: boolean;
  syntheticNotice?: string | null;
  framingStatement: string;
  consentVersionRef: string;
  testimony: SealedTestimonyRef;
  consentBoundary: ConsentBoundary;
  references: References;
  provenance: Provenance;
  humanReadable: HumanReadable;
  reasoningStructure: ReasoningStructure;
  plurality: Plurality;
  evalCase: CorpusEvalCase;
  publicSlice: PublicSlice;
  datasheetSummary: DatasheetSummary;
  reviewSummary?: ReviewSummary;
  privateSection?: PrivateSection;
}

/**
 * Compile and validate a Corpus_Entry. `outreach_ready` is always false at
 * compile time — only the HCC reviewer gate (Task 9) may flip it. Throws
 * (fail-closed) on any containment, eval-standard, hash, or schema violation.
 */
export function compileCorpusEntry(input: CompileCorpusEntryInput): CorpusEntry {
  const isSynthetic =
    input.isSynthetic ?? input.entryKind === "synthetic_exemplar";

  if (input.references.g52_governed.testimony_id !== input.testimony.testimonyId) {
    throw new Error(
      `compileCorpusEntry: references.g52_governed.testimony_id (${input.references.g52_governed.testimony_id}) does not match the sealed testimony (${input.testimony.testimonyId})`,
    );
  }

  const draft: CorpusEntry = {
    schema_version: CORPUS_ENTRY_SCHEMA_VERSION,
    meta: {
      entry_id: input.entryId,
      entry_kind: input.entryKind,
      created_at: input.createdAt ?? new Date().toISOString(),
      is_synthetic: isSynthetic,
      synthetic_notice:
        input.syntheticNotice ??
        (isSynthetic ? "SYNTHETIC EXEMPLAR — not real testimony." : null),
      // Compile never asserts readiness; the HCC gate is the only authority.
      outreach_ready: false,
      framing_statement: input.framingStatement,
      consent_version_ref: input.consentVersionRef,
      hashes: {
        source_testimony_hash: input.testimony.contentHash,
        redacted_public_slice_hash: null,
        publication_bundle_hash: null,
      },
    },
    consent_boundary: input.consentBoundary,
    provenance: input.provenance,
    human_readable: input.humanReadable,
    reasoning_structure: input.reasoningStructure,
    plurality: input.plurality,
    eval_case: input.evalCase,
    references: input.references,
    public_slice: input.publicSlice,
    datasheet_summary: input.datasheetSummary,
    ...(input.reviewSummary ? { review_summary: input.reviewSummary } : {}),
    ...(input.privateSection ? { private: input.privateSection } : {}),
  };

  // The public-slice hash covers exactly the public view (framing + slice +
  // datasheet), so it must be computed after the slice is in place.
  draft.meta.hashes.redacted_public_slice_hash =
    computeRedactedPublicSliceHash(draft);

  assertPublicContainment(draft);
  assertWitnessAttributedEval(draft);
  assertSourceHashAbsentFromPublic(computePublicView(draft), draft);

  // Fail-closed final validation.
  return parseCorpusEntry(draft);
}

/**
 * The minimal, body-free projection TWP persists/hosts. Excludes the testimony
 * body, reasoning/plurality bodies, provenance, the private section, and the
 * audit-only source_testimony_hash (Property 5 / R13).
 */
export interface CorpusEntryTwpProjection {
  entry_id: string;
  entry_kind: EntryKind;
  outreach_ready: boolean;
  redacted_public_slice_hash: string | null;
  publication_bundle_hash: string | null;
  framing_statement: string;
  public_slice: PublicSlice;
  datasheet_summary: DatasheetSummary;
  twp_control_plane: References["twp_control_plane"];
  disclosure_manifest_hash: string | null;
}

export function corpusEntryTwpProjection(
  entry: CorpusEntry,
): CorpusEntryTwpProjection {
  return {
    entry_id: entry.meta.entry_id,
    entry_kind: entry.meta.entry_kind,
    outreach_ready: entry.meta.outreach_ready,
    // Only the public hashes cross — never source_testimony_hash.
    redacted_public_slice_hash: entry.meta.hashes.redacted_public_slice_hash,
    publication_bundle_hash: entry.meta.hashes.publication_bundle_hash,
    framing_statement: entry.meta.framing_statement,
    public_slice: entry.public_slice,
    datasheet_summary: entry.datasheet_summary,
    twp_control_plane: entry.references.twp_control_plane,
    disclosure_manifest_hash: entry.references.g52_governed.disclosure_manifest_hash,
  };
}
