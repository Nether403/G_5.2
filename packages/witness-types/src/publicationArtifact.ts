export interface PublicationBundleExportEntry {
  filename: string;
  sha256: string;
  contentType:
    | "application/json; charset=utf-8"
    | "text/markdown; charset=utf-8";
}

export interface PublicationBundleManifest {
  schemaVersion: "0.1.0";
  bundleId: string;
  witnessId: string;
  archiveCandidateId: string;
  testimonyId: string;
  testimonyUpdatedAt: string;
  synthesisId: string;
  annotationId: string;
  createdAt: string;
  exports: {
    json: PublicationBundleExportEntry;
    markdown: PublicationBundleExportEntry;
  };
}

/**
 * Manifest for a Corpus_Entry publication bundle (Task 8). Mirrors the
 * PublicationBundle artifact contract but carries corpus-entry metadata:
 * public hashes only (never source_testimony_hash) plus the disclosure manifest
 * hash that ties the bundle to the TWP disclosure ledger.
 */
export interface CorpusEntryPublicationManifest {
  schemaVersion: "0.1.0";
  kind: "corpus_entry";
  bundleId: string;
  entryId: string;
  entryKind: "real" | "synthetic_exemplar";
  createdAt: string;
  redactedPublicSliceHash: string;
  publicationBundleHash: string;
  disclosureManifestHash: string | null;
  exports: {
    json: PublicationBundleExportEntry;
    markdown: PublicationBundleExportEntry;
  };
}
