import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { FileWitnessConsentStore } from "./fileConsentStore";
import { FileWitnessArchiveCandidateStore } from "./fileArchiveCandidateStore";
import {
  FileWitnessAnnotationStore,
  FileWitnessSynthesisStore,
} from "./fileDraftStores";
import { FileWitnessTestimonyStore } from "./fileTestimonyStore";
import {
  approveWitnessAnnotation,
  approveWitnessSynthesis,
  approveWitnessArchiveReview,
  createWitnessArchiveCandidate,
  markWitnessPublicationReady,
  sealWitnessTestimony,
} from "./runtime";

test("createWitnessArchiveCandidate fails until testimony is sealed and approved downstream records exist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-archive-runtime-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(path.join(root, "testimony"));
    const synthesisStore = new FileWitnessSynthesisStore(path.join(root, "synthesis"));
    const annotationStore = new FileWitnessAnnotationStore(path.join(root, "annotations"));
    const archiveCandidateStore = new FileWitnessArchiveCandidateStore(path.join(root, "archive"));
    const consentStore = new FileWitnessConsentStore(path.join(root, "consent"));

    const testimony = await testimonyStore.save({
      id: "testimony-1",
      witnessId: "wit-1",
      sessionId: "session-1",
      state: "retained",
      createdAt: "2026-04-18T20:10:00.000Z",
      updatedAt: "2026-04-18T20:10:00.000Z",
      segments: [
        {
          id: "seg-1",
          role: "witness",
          text: "I described what happened.",
          createdAt: "2026-04-18T20:10:00.000Z",
        },
      ],
    });

    await consentStore.appendDecision({
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      scope: "retention",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T20:11:00.000Z",
    });
    await consentStore.appendDecision({
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      scope: "archive_review",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T20:12:00.000Z",
    });

    await assert.rejects(
      () =>
        createWitnessArchiveCandidate({
          testimonyId: testimony.id,
          testimonyStore,
          synthesisStore,
          annotationStore,
          archiveCandidateStore,
          consentStore,
        }),
      /sealed/i
    );

    const synthesis = await synthesisStore.save({
      id: "synth-1",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:13:00.000Z",
      updatedAt: "2026-04-18T20:13:00.000Z",
      status: "approved",
      source: "model",
      text: "Approved synthesis",
    });

    const sealed = await sealWitnessTestimony({
      testimonyStore,
      testimonyId: testimony.id,
      note: "sealed for archive review",
    });

    await assert.rejects(
      () =>
        createWitnessArchiveCandidate({
          testimonyId: testimony.id,
          testimonyStore,
          synthesisStore,
          annotationStore,
          archiveCandidateStore,
          consentStore,
        }),
      /approved annotation/i
    );

    const annotation = await annotationStore.save({
      id: "annot-1",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:14:00.000Z",
      updatedAt: "2026-04-18T20:14:00.000Z",
      status: "approved",
      source: "model",
      entries: [
        {
          id: "entry-1",
          labelId: "EPI-uncertain",
          labelName: "uncertain",
          segmentId: "seg-1",
          startOffset: 2,
          endOffset: 12,
          quote: testimony.segments[0].text.slice(2, 12),
        },
      ],
    });

    const candidate = await createWitnessArchiveCandidate({
      testimonyId: testimony.id,
      testimonyStore,
      synthesisStore,
      annotationStore,
      archiveCandidateStore,
      consentStore,
    });

    assert.equal(candidate.status, "draft");
    assert.equal(candidate.approvedSynthesisId, synthesis.id);
    assert.equal(candidate.approvedAnnotationId, annotation.id);
    assert.equal(candidate.testimonyUpdatedAt, sealed.updatedAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("new archive candidates supersede prior current candidates and publication requires publication consent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-archive-current-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(path.join(root, "testimony"));
    const synthesisStore = new FileWitnessSynthesisStore(path.join(root, "synthesis"));
    const annotationStore = new FileWitnessAnnotationStore(path.join(root, "annotations"));
    const archiveCandidateStore = new FileWitnessArchiveCandidateStore(path.join(root, "archive"));
    const consentStore = new FileWitnessConsentStore(path.join(root, "consent"));

    const testimony = await testimonyStore.save({
      id: "testimony-2",
      witnessId: "wit-2",
      sessionId: "session-2",
      state: "sealed",
      createdAt: "2026-04-18T20:20:00.000Z",
      updatedAt: "2026-04-18T20:20:00.000Z",
      segments: [
        {
          id: "seg-2",
          role: "witness",
          text: "First I hesitated, then I spoke.",
          createdAt: "2026-04-18T20:20:00.000Z",
        },
      ],
    });

    for (const scope of ["retention", "archive_review"] as const) {
      await consentStore.appendDecision({
        witnessId: testimony.witnessId,
        testimonyId: testimony.id,
        scope,
        status: "granted",
        actor: "witness",
        decidedAt: "2026-04-18T20:21:00.000Z",
      });
    }

    await synthesisStore.save({
      id: "synth-2a",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:22:00.000Z",
      updatedAt: "2026-04-18T20:22:00.000Z",
      status: "approved",
      source: "model",
      text: "First approved synthesis",
    });
    await annotationStore.save({
      id: "annot-2a",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:23:00.000Z",
      updatedAt: "2026-04-18T20:23:00.000Z",
      status: "approved",
      source: "model",
      entries: [
        {
          id: "entry-2a",
          labelId: "STR-chronology",
          labelName: "chronology",
          segmentId: "seg-2",
          startOffset: 0,
          endOffset: 5,
          quote: testimony.segments[0].text.slice(0, 5),
        },
      ],
    });

    const first = await createWitnessArchiveCandidate({
      testimonyId: testimony.id,
      testimonyStore,
      synthesisStore,
      annotationStore,
      archiveCandidateStore,
      consentStore,
    });
    const archiveApproved = await approveWitnessArchiveReview({
      archiveCandidateStore,
      candidateId: first.id,
      note: "archive approved",
    });
    assert.equal(archiveApproved.status, "archive_review_approved");

    await assert.rejects(
      () =>
        markWitnessPublicationReady({
          archiveCandidateStore,
          consentStore,
          testimonyStore,
          candidateId: first.id,
          note: "publish",
        }),
      /publication/i
    );

    await consentStore.appendDecision({
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      scope: "publication",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T20:24:00.000Z",
    });

    const publicationReady = await markWitnessPublicationReady({
      archiveCandidateStore,
      consentStore,
      testimonyStore,
      candidateId: first.id,
      note: "ready",
    });
    assert.equal(publicationReady.status, "publication_ready");

    await synthesisStore.save({
      id: "synth-2b",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:25:00.000Z",
      updatedAt: "2026-04-18T20:25:00.000Z",
      status: "approved",
      source: "model",
      text: "Second approved synthesis",
    });
    await annotationStore.save({
      id: "annot-2b",
      witnessId: testimony.witnessId,
      testimonyId: testimony.id,
      createdAt: "2026-04-18T20:26:00.000Z",
      updatedAt: "2026-04-18T20:26:00.000Z",
      status: "approved",
      source: "model",
      entries: [
        {
          id: "entry-2b",
          labelId: "STR-chronology",
          labelName: "chronology",
          segmentId: "seg-2",
          startOffset: 6,
          endOffset: 15,
          quote: testimony.segments[0].text.slice(6, 15),
        },
      ],
    });

    const second = await createWitnessArchiveCandidate({
      testimonyId: testimony.id,
      testimonyStore,
      synthesisStore,
      annotationStore,
      archiveCandidateStore,
      consentStore,
    });

    const records = await archiveCandidateStore.list();
    const superseded = records.find((record) => record.id === first.id);
    assert.equal(superseded?.status, "superseded");
    assert.equal(second.status, "draft");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
