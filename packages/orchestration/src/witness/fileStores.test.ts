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
