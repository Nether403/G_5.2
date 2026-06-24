import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CorpusEntry } from "../../../witness-types/src/corpusEntry";
import type { CorpusEntryPublicationManifest } from "../../../witness-types/src/publicationArtifact";

/**
 * Task 8 — export a compiled Corpus_Entry through the existing Publication_Bundle
 * artifact contract (the bundle.json / bundle.md / manifest.json triplet under
 * `<root>/exports/`, with sha256 manifest entries and write-rollback), mirroring
 * `createWitnessPublicationBundle`. It does NOT introduce a parallel export
 * format.
 *
 * The exported bundle is the PUBLIC artifact: it carries only the public view
 * (framing + public slice + datasheet + the optional public witness label) and
 * the public hashes. It deliberately excludes the audit-only
 * source_testimony_hash, the internal `witness_profile_ref`, the governed
 * bodies, and the private section (Property 5 / R8 public-exposure rule / R12).
 *
 * Imports are type-only (erased at runtime) plus node:crypto, so this module
 * never loads the witness-types zod schema into orchestration's (zod v3) runtime.
 */

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface ExportCorpusEntryBundleInput {
  publicationBundleRoot: string;
  entry: CorpusEntry;
}

export interface ExportCorpusEntryBundleResult {
  bundleId: string;
  entryId: string;
  bundleJsonPath: string;
  bundleMarkdownPath: string;
  bundleManifestPath: string;
  /** sha256: of the emitted bundle.json body; also written back onto the entry. */
  publicationBundleHash: string;
  manifest: CorpusEntryPublicationManifest;
  /** The entry with meta.hashes.publication_bundle_hash populated. */
  entry: CorpusEntry;
}

interface PublicBundlePayload {
  schemaVersion: "0.1.0";
  kind: "corpus_entry";
  entryId: string;
  entryKind: "real" | "synthetic_exemplar";
  framingStatement: string;
  publicWitnessLabel: string | null;
  publicSlice: CorpusEntry["public_slice"];
  datasheetSummary: CorpusEntry["datasheet_summary"];
  redactedPublicSliceHash: string;
}

function buildPublicBundlePayload(entry: CorpusEntry): PublicBundlePayload {
  const redacted = entry.meta.hashes.redacted_public_slice_hash;
  if (redacted === null) {
    throw new Error(
      "exportCorpusEntryBundle requires a compiled entry with redacted_public_slice_hash set.",
    );
  }
  return {
    schemaVersion: "0.1.0",
    kind: "corpus_entry",
    entryId: entry.meta.entry_id,
    entryKind: entry.meta.entry_kind,
    framingStatement: entry.meta.framing_statement,
    // Only the public witness label may cross; witness_profile_ref is internal.
    publicWitnessLabel: entry.references.twp_control_plane.public_witness_label,
    publicSlice: entry.public_slice,
    datasheetSummary: entry.datasheet_summary,
    redactedPublicSliceHash: redacted,
  };
}

function buildMarkdown(payload: PublicBundlePayload): string {
  return [
    "# Corpus Entry Publication Bundle",
    "",
    `- Entry ID: ${payload.entryId}`,
    `- Entry Kind: ${payload.entryKind}`,
    `- Public Witness Label: ${payload.publicWitnessLabel ?? "(none)"}`,
    "",
    "## Framing",
    "",
    payload.framingStatement,
    "",
    "## Situation (public excerpt)",
    "",
    payload.publicSlice.situation_excerpt,
    "",
    `## Eval Case: ${payload.publicSlice.eval_case_public}`,
  ].join("\n");
}

/**
 * Emit the bundle triplet for a Corpus_Entry and return the populated entry.
 * `outreach_ready` is not changed here — that remains the HCC gate's authority.
 */
export async function exportCorpusEntryBundle(
  input: ExportCorpusEntryBundleInput,
): Promise<ExportCorpusEntryBundleResult> {
  const { entry } = input;
  const payload = buildPublicBundlePayload(entry);

  const bundleId = randomUUID();
  const createdAt = new Date().toISOString();
  const exportRoot = path.join(input.publicationBundleRoot, "exports");
  const bundleJsonPath = path.join(exportRoot, `${entry.meta.entry_id}-${bundleId}.json`);
  const bundleMarkdownPath = path.join(exportRoot, `${entry.meta.entry_id}-${bundleId}.md`);
  const bundleManifestPath = path.join(
    exportRoot,
    `${entry.meta.entry_id}-${bundleId}-manifest.json`,
  );

  const jsonBody = `${JSON.stringify(payload, null, 2)}\n`;
  const markdownBody = `${buildMarkdown(payload)}\n`;
  const publicationBundleHash = `sha256:${sha256Hex(jsonBody)}`;

  const manifest: CorpusEntryPublicationManifest = {
    schemaVersion: "0.1.0",
    kind: "corpus_entry",
    bundleId,
    entryId: entry.meta.entry_id,
    entryKind: entry.meta.entry_kind,
    createdAt,
    redactedPublicSliceHash: payload.redactedPublicSliceHash,
    publicationBundleHash,
    disclosureManifestHash: entry.references.g52_governed.disclosure_manifest_hash,
    exports: {
      json: {
        filename: path.basename(bundleJsonPath),
        sha256: sha256Hex(jsonBody),
        contentType: "application/json; charset=utf-8",
      },
      markdown: {
        filename: path.basename(bundleMarkdownPath),
        sha256: sha256Hex(markdownBody),
        contentType: "text/markdown; charset=utf-8",
      },
    },
  };

  await mkdir(exportRoot, { recursive: true });
  try {
    await writeFile(bundleJsonPath, jsonBody, "utf8");
    await writeFile(bundleMarkdownPath, markdownBody, "utf8");
    await writeFile(
      bundleManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    await Promise.allSettled([
      rm(bundleJsonPath, { force: true }),
      rm(bundleMarkdownPath, { force: true }),
      rm(bundleManifestPath, { force: true }),
    ]);
    throw error;
  }

  const updatedEntry: CorpusEntry = {
    ...entry,
    meta: {
      ...entry.meta,
      hashes: {
        ...entry.meta.hashes,
        publication_bundle_hash: publicationBundleHash,
      },
    },
  };

  return {
    bundleId,
    entryId: entry.meta.entry_id,
    bundleJsonPath,
    bundleMarkdownPath,
    bundleManifestPath,
    publicationBundleHash,
    manifest,
    entry: updatedEntry,
  };
}
