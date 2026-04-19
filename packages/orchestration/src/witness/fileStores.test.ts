import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readdir, rm } from "node:fs/promises";

import {
  FileWitnessConsentStore,
  listConsentForWitness,
} from "./fileConsentStore";
import {
  FileWitnessTestimonyStore,
  appendTurnToTestimony,
} from "./fileTestimonyStore";
import { FileWitnessPublicationBundleStore } from "./fileDraftStores";
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import { FileWitnessPublicationDeliveryJobStore } from "./filePublicationDeliveryJobStore";
import { FileWitnessArchiveCandidateStore } from "./fileArchiveCandidateStore";

test("FileWitnessConsentStore appends decisions and filters by witness", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-consent-"));

  try {
    const store = new FileWitnessConsentStore(root);

    const conversational = await store.appendDecision({
      witnessId: "wit-1",
      actor: "witness",
      scope: "conversational",
      status: "granted",
      decidedAt: "2026-04-17T18:00:00.000Z",
    });
    const retention = await store.appendDecision({
      witnessId: "wit-1",
      actor: "witness",
      scope: "retention",
      status: "granted",
      decidedAt: "2026-04-17T18:01:00.000Z",
    });
    await store.appendDecision({
      witnessId: "wit-2",
      actor: "witness",
      scope: "conversational",
      status: "granted",
      decidedAt: "2026-04-17T18:02:00.000Z",
    });

    const witnessOne = await listConsentForWitness(store, "wit-1");
    assert.equal(witnessOne.length, 2);
    assert.equal(witnessOne[0].id, conversational.id);
    assert.equal(witnessOne[1].id, retention.id);
    assert.deepEqual(
      witnessOne.map((record) => record.decisions.at(-1)?.scope),
      ["conversational", "retention"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessTestimonyStore creates and appends a testimony record per session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-testimony-"));

  try {
    const store = new FileWitnessTestimonyStore(root);

    const created = await store.create({
      witnessId: "wit-1",
      sessionId: "sess-1",
      capturedAt: "2026-04-17T18:00:00.000Z",
      title: "Initial Witness Session",
    });

    const updated = await appendTurnToTestimony(store, {
      testimonyId: created.id,
      witnessText: "I want to describe what changed.",
      assistantText: "What feels most important to begin with?",
      createdAt: "2026-04-17T18:01:00.000Z",
    });

    assert.equal(updated.sessionId, "sess-1");
    assert.equal(updated.segments.length, 2);
    assert.equal(updated.segments[0].role, "witness");
    assert.equal(updated.segments[1].role, "inquisitor");
    assert.match(updated.segments[0].text, /what changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sealed testimony refuses further appended turns", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-sealed-testimony-"));

  try {
    const store = new FileWitnessTestimonyStore(root);

    const created = await store.create({
      witnessId: "wit-sealed",
      sessionId: "sess-sealed",
      capturedAt: "2026-04-18T20:00:00.000Z",
      title: "Sealed testimony",
    });

    await store.save({
      ...created,
      state: "sealed",
    });

    await assert.rejects(
      () =>
        appendTurnToTestimony(store, {
          testimonyId: created.id,
          witnessText: "This should not be appended.",
          assistantText: "Nor this.",
          createdAt: "2026-04-18T20:01:00.000Z",
        }),
      /sealed/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessArchiveCandidateStore round-trips current and non-current statuses", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-archive-candidate-"));

  try {
    const store = new FileWitnessArchiveCandidateStore(root);

    const created = await store.create({
      witnessId: "wit-archive",
      testimonyId: "testimony-archive",
      approvedSynthesisId: "synth-1",
      approvedAnnotationId: "annot-1",
      testimonyUpdatedAt: "2026-04-18T20:01:30.000Z",
      createdAt: "2026-04-18T20:02:00.000Z",
    });
    assert.equal(created.status, "draft");
    assert.equal(created.testimonyUpdatedAt, "2026-04-18T20:01:30.000Z");

    const updated = await store.save({
      ...created,
      status: "publication_ready",
      publicationNote: "ready",
      updatedAt: "2026-04-18T20:03:00.000Z",
    });
    assert.equal(updated.status, "publication_ready");

    const loaded = await store.load(created.id);
    assert.equal(loaded?.publicationNote, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationBundleStore round-trips bundle records", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-bundle-")
  );

  try {
    const store = new FileWitnessPublicationBundleStore(root);
    const created = await store.create({
      witnessId: "wit-pub",
      testimonyId: "testimony-pub",
      archiveCandidateId: "candidate-pub",
      sourceTestimonyUpdatedAt: "2026-04-19T09:10:00.000Z",
      sourceSynthesisId: "synth-pub",
      sourceAnnotationId: "annotation-pub",
      createdAt: "2026-04-19T09:11:00.000Z",
      bundleJsonPath: "data/witness/publication-bundles/bundle-pub.json",
      bundleMarkdownPath: "data/witness/publication-bundles/bundle-pub.md",
      bundleManifestPath:
        "data/witness/publication-bundles/bundle-pub-manifest.json",
    });
    const createdWithoutMarkdown = await store.create({
      witnessId: "wit-pub-2",
      testimonyId: "testimony-pub-2",
      archiveCandidateId: "candidate-pub-2",
      sourceTestimonyUpdatedAt: "2026-04-19T09:12:00.000Z",
      sourceSynthesisId: "synth-pub-2",
      sourceAnnotationId: "annotation-pub-2",
      createdAt: "2026-04-19T09:13:00.000Z",
      bundleJsonPath: "data/witness/publication-bundles/bundle-pub-2.json",
      bundleManifestPath:
        "data/witness/publication-bundles/bundle-pub-2-manifest.json",
    });

    assert.equal(created.status, "created");
    assert.equal(createdWithoutMarkdown.bundleMarkdownPath, undefined);
    assert.equal(
      createdWithoutMarkdown.bundleManifestPath,
      "data/witness/publication-bundles/bundle-pub-2-manifest.json"
    );

    const loaded = await store.load(created.id);
    assert.equal(loaded?.archiveCandidateId, "candidate-pub");
    assert.equal(loaded?.sourceTestimonyUpdatedAt, "2026-04-19T09:10:00.000Z");
    assert.equal(
      loaded?.bundleManifestPath,
      "data/witness/publication-bundles/bundle-pub-manifest.json"
    );

    const listed = await store.list();
    assert.equal(listed.length, 2);
    assert.equal(listed[0].id, created.id);
    assert.equal(listed[1].id, createdWithoutMarkdown.id);

    const recordFiles = await readdir(path.join(root, "records"));
    assert.equal(recordFiles.length, 2);
    assert.ok(recordFiles.every((file) => file.endsWith(".json")));

    assert.equal(await store.delete(created.id), true);
    assert.equal(await store.load(created.id), null);
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationPackageStore round-trips package records", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-")
  );

  try {
    const store = new FileWitnessPublicationPackageStore(root);
    const created = await store.create({
      bundleId: "bundle-1",
      witnessId: "wit-package",
      testimonyId: "testimony-package",
      archiveCandidateId: "candidate-package",
      createdAt: "2026-04-19T10:00:00.000Z",
      packagePath: "data/witness/publication-packages/package-1.zip",
      packageFilename: "package-1.zip",
      packageSha256:
        "1111111111111111111111111111111111111111111111111111111111111111",
      packageByteSize: 42,
      sourceBundleJsonPath: "data/witness/publication-bundles/bundle-1.json",
      sourceBundleMarkdownPath: "data/witness/publication-bundles/bundle-1.md",
      sourceBundleManifestPath:
        "data/witness/publication-bundles/bundle-1-manifest.json",
    });

    assert.equal(created.status, "created");
    assert.equal(
      (await store.load(created.id))?.packageSha256,
      created.packageSha256
    );
    assert.equal((await store.findByBundleId("bundle-1"))?.id, created.id);
    assert.deepEqual(
      (await store.list()).map((record) => record.id),
      [created.id]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationDeliveryStore round-trips delivery records and filters by package id", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-store-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryStore(root);
    const created = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      status: "succeeded",
      createdAt: "2026-04-19T22:00:00.000Z",
      remoteKey: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
      remoteUrl: "https://example.invalid/container/bundle-1.zip",
    });

    assert.equal(created.status, "succeeded");
    assert.equal((await store.load(created.id))?.packageId, "bundle-1");
    assert.equal((await store.findLatestByPackageId("bundle-1"))?.id, created.id);
    assert.deepEqual(
      (await store.list({ packageId: "bundle-1" })).map((record) => record.id),
      [created.id]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationDeliveryStore deterministically chooses the latest record when createdAt matches", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-latest-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryStore(root);
    await store.create({
      id: "delivery-a",
      packageId: "bundle-2",
      bundleId: "bundle-2",
      witnessId: "wit-2",
      testimonyId: "testimony-2",
      backend: "azure-blob",
      status: "succeeded",
      createdAt: "2026-04-19T22:05:00.000Z",
      remoteKey: "witness/wit-2/testimony/testimony-2/packages/bundle-2-a.zip",
      remoteUrl: "https://example.invalid/container/bundle-2-a.zip",
    });
    const second = await store.create({
      id: "delivery-b",
      packageId: "bundle-2",
      bundleId: "bundle-2",
      witnessId: "wit-2",
      testimonyId: "testimony-2",
      backend: "azure-blob",
      status: "failed",
      createdAt: "2026-04-19T22:05:00.000Z",
      remoteKey: "witness/wit-2/testimony/testimony-2/packages/bundle-2-b.zip",
      error: "simulated failure",
    });

    assert.deepEqual(
      (await store.list({ packageId: "bundle-2" })).map((record) => record.id),
      ["delivery-a", "delivery-b"]
    );
    assert.equal((await store.findLatestByPackageId("bundle-2"))?.id, second.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationDeliveryStore persists failed delivery records", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-failed-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryStore(root);
    const failed = await store.create({
      packageId: "bundle-3",
      bundleId: "bundle-3",
      witnessId: "wit-3",
      testimonyId: "testimony-3",
      backend: "azure-blob",
      status: "failed",
      createdAt: "2026-04-19T22:10:00.000Z",
      remoteKey: "witness/wit-3/testimony/testimony-3/packages/bundle-3.zip",
      error: "remote upload failed",
    });

    const loaded = await store.load(failed.id);
    assert.equal(loaded?.status, "failed");
    assert.equal(loaded?.error, "remote upload failed");
    assert.equal((await store.findLatestByPackageId("bundle-3"))?.id, failed.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationDeliveryJobStore round-trips queued delivery jobs and filters by package id", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-job-store-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryJobStore(root);
    const created = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      createdAt: "2026-04-20T08:00:00.000Z",
    });

    assert.equal(created.status, "queued");
    assert.equal((await store.load(created.id))?.packageId, "bundle-1");
    assert.deepEqual(
      (await store.list({ packageId: "bundle-1" })).map((record) => record.id),
      [created.id]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileWitnessPublicationDeliveryJobStore finds the oldest queued job and supports retryable failed jobs", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-job-ordering-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryJobStore(root);
    const first = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      createdAt: "2026-04-20T08:00:00.000Z",
    });
    const second = await store.create({
      packageId: "bundle-2",
      bundleId: "bundle-2",
      witnessId: "wit-2",
      testimonyId: "testimony-2",
      backend: "azure-blob",
      createdAt: "2026-04-20T08:05:00.000Z",
    });

    await store.save({
      ...second,
      status: "failed",
      updatedAt: "2026-04-20T08:06:00.000Z",
      error: "simulated failure",
    });

    assert.equal((await store.findOldestQueued())?.id, first.id);
    assert.equal((await store.list({ status: "failed" }))[0]?.id, second.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
