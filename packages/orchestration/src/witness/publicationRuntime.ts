import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AnnotationRecord } from "../../../witness-types/src/annotation";
import type { ArchiveCandidateRecord } from "../../../witness-types/src/archiveCandidate";
import type { PublicationBundleManifest } from "../../../witness-types/src/publicationArtifact";
import type { SynthesisRecord } from "../../../witness-types/src/synthesis";
import type { TestimonyRecord } from "../../../witness-types/src/testimony";
import type { FileWitnessAnnotationStore, FileWitnessArchiveCandidateStore, FileWitnessPublicationBundleStore, FileWitnessSynthesisStore } from "./fileDraftStores";
import type { FileWitnessTestimonyStore } from "./fileTestimonyStore";

export interface CreateWitnessPublicationBundleInput {
  publicationBundleRoot: string;
  archiveCandidateId: string;
  testimonyStore: FileWitnessTestimonyStore;
  synthesisStore: FileWitnessSynthesisStore;
  annotationStore: FileWitnessAnnotationStore;
  archiveCandidateStore: FileWitnessArchiveCandidateStore;
  publicationBundleStore: FileWitnessPublicationBundleStore;
}

interface WitnessPublicationBundlePayload {
  schemaVersion: "0.2.0";
  witnessId: string;
  testimony: {
    id: string;
    sessionId: string;
    title?: string;
    state: TestimonyRecord["state"];
    createdAt: string;
    updatedAt: string;
    segments: Array<{
      id: string;
      role: TestimonyRecord["segments"][number]["role"];
      text: string;
      createdAt: string;
    }>;
  };
  synthesis: {
    id: string;
    createdAt: string;
    updatedAt: string;
    text: string;
  };
  annotations: {
    id: string;
    createdAt: string;
    updatedAt: string;
    entries: Array<{
      id: string;
      labelId: string;
      labelName: string;
      segmentId: string;
      startOffset: number;
      endOffset: number;
      quote: string;
      rationale?: string;
    }>;
  };
  archiveCandidate: {
    id: string;
    testimonyId: string;
    testimonyUpdatedAt: string;
    status: ArchiveCandidateRecord["status"];
    reviewNote?: string;
    publicationNote?: string;
    approvedSynthesisId: string;
    approvedAnnotationId: string;
    createdAt: string;
    updatedAt: string;
  };
}

async function loadArchiveCandidateOrThrow(
  archiveCandidateStore: FileWitnessArchiveCandidateStore,
  archiveCandidateId: string
) {
  const archiveCandidate = await archiveCandidateStore.load(archiveCandidateId);
  if (!archiveCandidate) {
    throw new Error(`Unknown archive candidate: ${archiveCandidateId}`);
  }
  if (archiveCandidate.status !== "publication_ready") {
    throw new Error(
      "Witness publication bundle creation requires a publication_ready archive candidate."
    );
  }
  return archiveCandidate;
}

async function loadTestimonyOrThrow(
  testimonyStore: FileWitnessTestimonyStore,
  testimonyId: string
) {
  const testimony = await testimonyStore.load(testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${testimonyId}`);
  }
  if (testimony.state !== "sealed") {
    throw new Error(
      "Witness publication bundle creation requires a sealed testimony."
    );
  }
  return testimony;
}

async function loadSynthesisOrThrow(
  synthesisStore: FileWitnessSynthesisStore,
  synthesisId: string
) {
  const synthesis = await synthesisStore.load(synthesisId);
  if (!synthesis) {
    throw new Error(`Unknown synthesis record: ${synthesisId}`);
  }
  if (synthesis.status !== "approved") {
    throw new Error(
      "Witness publication bundle creation requires an approved synthesis."
    );
  }
  return synthesis;
}

async function loadAnnotationOrThrow(
  annotationStore: FileWitnessAnnotationStore,
  annotationId: string
) {
  const annotation = await annotationStore.load(annotationId);
  if (!annotation) {
    throw new Error(`Unknown annotation record: ${annotationId}`);
  }
  if (annotation.status !== "approved") {
    throw new Error(
      "Witness publication bundle creation requires an approved annotation."
    );
  }
  return annotation;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildPublicationBundlePayload(
  testimony: TestimonyRecord,
  synthesis: SynthesisRecord,
  annotation: AnnotationRecord,
  archiveCandidate: ArchiveCandidateRecord
): WitnessPublicationBundlePayload {
  return {
    schemaVersion: "0.2.0",
    witnessId: testimony.witnessId,
    testimony: {
      id: testimony.id,
      sessionId: testimony.sessionId,
      ...(testimony.title ? { title: testimony.title } : {}),
      state: testimony.state,
      createdAt: testimony.createdAt,
      updatedAt: testimony.updatedAt,
      segments: testimony.segments.map((segment) => ({
        id: segment.id,
        role: segment.role,
        text: segment.text,
        createdAt: segment.createdAt,
      })),
    },
    synthesis: {
      id: synthesis.id,
      createdAt: synthesis.createdAt,
      updatedAt: synthesis.updatedAt,
      text: synthesis.text,
    },
    annotations: {
      id: annotation.id,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
      entries: annotation.entries.map((entry) => ({
        id: entry.id,
        labelId: entry.labelId,
        labelName: entry.labelName,
        segmentId: entry.segmentId,
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
        quote: entry.quote,
        ...(entry.rationale ? { rationale: entry.rationale } : {}),
      })),
    },
    archiveCandidate: {
      id: archiveCandidate.id,
      testimonyId: archiveCandidate.testimonyId,
      testimonyUpdatedAt: archiveCandidate.testimonyUpdatedAt,
      status: archiveCandidate.status,
      approvedSynthesisId: archiveCandidate.approvedSynthesisId,
      approvedAnnotationId: archiveCandidate.approvedAnnotationId,
      createdAt: archiveCandidate.createdAt,
      updatedAt: archiveCandidate.updatedAt,
      ...(archiveCandidate.reviewNote
        ? { reviewNote: archiveCandidate.reviewNote }
        : {}),
      ...(archiveCandidate.publicationNote
        ? { publicationNote: archiveCandidate.publicationNote }
        : {}),
    },
  };
}

function assertSourceRecordConsistency(
  archiveCandidate: ArchiveCandidateRecord,
  testimony: TestimonyRecord,
  synthesis: SynthesisRecord,
  annotation: AnnotationRecord
) {
  if (testimony.updatedAt !== archiveCandidate.testimonyUpdatedAt) {
    throw new Error(
      "Witness publication bundle testimony updatedAt must match the archive candidate."
    );
  }
  if (testimony.witnessId !== archiveCandidate.witnessId) {
    throw new Error(
      "Witness publication bundle testimony witness id must match the archive candidate."
    );
  }
  if (synthesis.testimonyId !== archiveCandidate.testimonyId) {
    throw new Error(
      "Witness publication bundle synthesis testimony id must match the archive candidate."
    );
  }
  if (synthesis.witnessId !== archiveCandidate.witnessId) {
    throw new Error(
      "Witness publication bundle synthesis witness id must match the archive candidate."
    );
  }
  if (annotation.testimonyId !== archiveCandidate.testimonyId) {
    throw new Error(
      "Witness publication bundle annotation testimony id must match the archive candidate."
    );
  }
  if (annotation.witnessId !== archiveCandidate.witnessId) {
    throw new Error(
      "Witness publication bundle annotation witness id must match the archive candidate."
    );
  }
}

function buildPublicationBundleMarkdown(
  payload: WitnessPublicationBundlePayload
): string {
  return [
    "# Publication Bundle",
    "",
    `- Witness ID: ${payload.witnessId}`,
    `- Testimony ID: ${payload.testimony.id}`,
    `- Archive Candidate ID: ${payload.archiveCandidate.id}`,
    `- Source Testimony Updated At: ${payload.archiveCandidate.testimonyUpdatedAt}`,
    `- Synthesis ID: ${payload.synthesis.id}`,
    `- Annotation ID: ${payload.archiveCandidate.approvedAnnotationId}`,
    "",
    "## Synthesis",
    "",
    payload.synthesis.text,
    "",
    `## Annotation Entries (${payload.annotations.entries.length})`,
  ].join("\n");
}

function buildPublicationBundleManifest(input: {
  bundleId: string;
  witnessId: string;
  archiveCandidateId: string;
  testimonyId: string;
  testimonyUpdatedAt: string;
  synthesisId: string;
  annotationId: string;
  createdAt: string;
  jsonFilename: string;
  jsonBody: string;
  markdownFilename: string;
  markdownBody: string;
}): PublicationBundleManifest {
  return {
    schemaVersion: "0.1.0",
    bundleId: input.bundleId,
    witnessId: input.witnessId,
    archiveCandidateId: input.archiveCandidateId,
    testimonyId: input.testimonyId,
    testimonyUpdatedAt: input.testimonyUpdatedAt,
    synthesisId: input.synthesisId,
    annotationId: input.annotationId,
    createdAt: input.createdAt,
    exports: {
      json: {
        filename: input.jsonFilename,
        sha256: sha256(input.jsonBody),
        contentType: "application/json",
      },
      markdown: {
        filename: input.markdownFilename,
        sha256: sha256(input.markdownBody),
        contentType: "text/markdown",
      },
    },
  };
}

export async function createWitnessPublicationBundle(
  input: CreateWitnessPublicationBundleInput
) {
  const archiveCandidate = await loadArchiveCandidateOrThrow(
    input.archiveCandidateStore,
    input.archiveCandidateId
  );
  const testimony = await loadTestimonyOrThrow(
    input.testimonyStore,
    archiveCandidate.testimonyId
  );
  const synthesis = await loadSynthesisOrThrow(
    input.synthesisStore,
    archiveCandidate.approvedSynthesisId
  );
  const annotation = await loadAnnotationOrThrow(
    input.annotationStore,
    archiveCandidate.approvedAnnotationId
  );
  assertSourceRecordConsistency(
    archiveCandidate,
    testimony,
    synthesis,
    annotation
  );

  const payload = buildPublicationBundlePayload(
    testimony,
    synthesis,
    annotation,
    archiveCandidate
  );
  const bundleId = randomUUID();
  const createdAt = new Date().toISOString();
  const exportRoot = path.join(input.publicationBundleRoot, "exports");
  const bundleJsonPath = path.join(
    exportRoot,
    `${archiveCandidate.id}-${bundleId}.json`
  );
  const bundleMarkdownPath = path.join(
    exportRoot,
    `${archiveCandidate.id}-${bundleId}.md`
  );
  const bundleManifestPath = path.join(
    exportRoot,
    `${archiveCandidate.id}-${bundleId}-manifest.json`
  );
  const jsonBody = `${JSON.stringify(payload, null, 2)}\n`;
  const markdownBody = `${buildPublicationBundleMarkdown(payload)}\n`;
  const manifest = buildPublicationBundleManifest({
    bundleId,
    witnessId: testimony.witnessId,
    archiveCandidateId: archiveCandidate.id,
    testimonyId: testimony.id,
    testimonyUpdatedAt: archiveCandidate.testimonyUpdatedAt,
    synthesisId: synthesis.id,
    annotationId: annotation.id,
    createdAt,
    jsonFilename: path.basename(bundleJsonPath),
    jsonBody,
    markdownFilename: path.basename(bundleMarkdownPath),
    markdownBody,
  });

  await mkdir(exportRoot, { recursive: true });
  try {
    await writeFile(bundleJsonPath, jsonBody, "utf8");
    await writeFile(bundleMarkdownPath, markdownBody, "utf8");
    await writeFile(
      bundleManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    return await input.publicationBundleStore.create({
      id: bundleId,
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      archiveCandidateId: archiveCandidate.id,
      sourceTestimonyUpdatedAt: archiveCandidate.testimonyUpdatedAt,
      sourceSynthesisId: synthesis.id,
      sourceAnnotationId: annotation.id,
      createdAt,
      bundleJsonPath,
      bundleMarkdownPath,
      bundleManifestPath,
    });
  } catch (error) {
    await Promise.allSettled([
      rm(bundleJsonPath, { force: true }),
      rm(bundleMarkdownPath, { force: true }),
      rm(bundleManifestPath, { force: true }),
    ]);
    throw error;
  }
}
