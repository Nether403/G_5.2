import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";

import { MockProvider } from "../providers/mock";
import { FileWitnessConsentStore } from "./fileConsentStore";
import { FileWitnessTestimonyStore } from "./fileTestimonyStore";
import {
  FileWitnessAnnotationStore,
  FileWitnessSynthesisStore,
} from "./fileDraftStores";
import {
  approveWitnessAnnotation,
  approveWitnessSynthesis,
  createWitnessAnnotationDraft,
  createWitnessSynthesisDraft,
  getWitnessConsentGate,
} from "./runtime";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const witnessPolicyRoot = path.join(repoRoot, "packages", "inquisitor-witness");

test("getWitnessConsentGate prefers testimony-scoped decisions over witness-wide fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-runtime-gate-"));

  try {
    const consentStore = new FileWitnessConsentStore(path.join(root, "consent"));
    const witnessId = "wit-gate";
    const testimonyId = "testimony-gate";

    await consentStore.appendDecision({
      witnessId,
      scope: "retention",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T10:00:00.000Z",
    });
    await consentStore.appendDecision({
      witnessId,
      scope: "synthesis",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T10:01:00.000Z",
    });

    const witnessWide = await getWitnessConsentGate(consentStore, witnessId, {
      testimonyId,
      requiredScopes: ["retention", "synthesis"],
    });
    assert.equal(witnessWide.allowed, true);

    await consentStore.appendDecision({
      witnessId,
      testimonyId,
      scope: "synthesis",
      status: "denied",
      actor: "witness",
      decidedAt: "2026-04-18T10:02:00.000Z",
    });

    const testimonyScoped = await getWitnessConsentGate(consentStore, witnessId, {
      testimonyId,
      requiredScopes: ["retention", "synthesis"],
    });
    assert.equal(testimonyScoped.allowed, false);
    assert.deepEqual(testimonyScoped.missingScopes, ["synthesis"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approving a new synthesis supersedes the prior approved synthesis and marks testimony synthesized", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-runtime-synth-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(path.join(root, "testimony"));
    const synthesisStore = new FileWitnessSynthesisStore(path.join(root, "synthesis"));
    const consentStore = new FileWitnessConsentStore(path.join(root, "consent"));
    const provider = new MockProvider();
    const witnessId = "wit-synthesis";
    const createdAt = "2026-04-18T11:00:00.000Z";

    const testimony = await testimonyStore.create({
      witnessId,
      sessionId: "session-synthesis",
      capturedAt: createdAt,
      title: "Witness synthesis test",
    });
    await testimonyStore.save({
      ...testimony,
      segments: [
        {
          id: "segment-1",
          role: "witness",
          text: "First I hesitated, then I described the event.",
          createdAt,
        },
      ],
    });

    await consentStore.appendDecision({
      witnessId,
      testimonyId: testimony.id,
      scope: "retention",
      status: "granted",
      actor: "witness",
      decidedAt: createdAt,
    });
    await consentStore.appendDecision({
      witnessId,
      testimonyId: testimony.id,
      scope: "synthesis",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T11:01:00.000Z",
    });

    const firstDraft = await createWitnessSynthesisDraft(provider, {
      policyRoot: witnessPolicyRoot,
      testimonyId: testimony.id,
      testimonyStore,
      synthesisStore,
      consentStore,
    });
    const secondDraft = await createWitnessSynthesisDraft(provider, {
      policyRoot: witnessPolicyRoot,
      testimonyId: testimony.id,
      testimonyStore,
      synthesisStore,
      consentStore,
    });

    const firstApproved = await approveWitnessSynthesis({
      synthesisStore,
      testimonyStore,
      synthesisId: firstDraft.id,
      reviewNote: "approve first",
    });
    assert.equal(firstApproved.status, "approved");
    assert.equal(firstApproved.source, "model");

    const secondApproved = await approveWitnessSynthesis({
      synthesisStore,
      testimonyStore,
      synthesisId: secondDraft.id,
      reviewNote: "approve second",
    });
    assert.equal(secondApproved.status, "approved");

    const all = await synthesisStore.list();
    const superseded = all.find((record) => record.id === firstDraft.id);
    assert.equal(superseded?.status, "superseded");

    const updatedTestimony = await testimonyStore.load(testimony.id);
    assert.equal(updatedTestimony?.state, "synthesized");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("annotation drafts reject inquisitor segments and mismatched spans without persisting records", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-runtime-annot-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(path.join(root, "testimony"));
    const annotationStore = new FileWitnessAnnotationStore(path.join(root, "annotations"));
    const consentStore = new FileWitnessConsentStore(path.join(root, "consent"));
    const provider = new MockProvider();
    const witnessId = "wit-annotation";
    const createdAt = "2026-04-18T12:00:00.000Z";

    const testimony = await testimonyStore.save({
      id: "testimony-annotation",
      witnessId,
      sessionId: "session-annotation",
      state: "retained",
      createdAt,
      updatedAt: createdAt,
      title: "Witness annotation test",
      segments: [
        {
          id: "segment-witness",
          role: "witness",
          text: "I am not sure what happened before I arrived.",
          createdAt,
        },
        {
          id: "segment-inquisitor",
          role: "inquisitor",
          text: "What happened next?",
          createdAt,
        },
      ],
    });

    await consentStore.appendDecision({
      witnessId,
      testimonyId: testimony.id,
      scope: "retention",
      status: "granted",
      actor: "witness",
      decidedAt: createdAt,
    });
    await consentStore.appendDecision({
      witnessId,
      testimonyId: testimony.id,
      scope: "annotation",
      status: "granted",
      actor: "witness",
      decidedAt: "2026-04-18T12:01:00.000Z",
    });

    await assert.rejects(
      () =>
        createWitnessAnnotationDraft(provider, {
          policyRoot: witnessPolicyRoot,
          testimonyId: testimony.id,
          testimonyStore,
          annotationStore,
          consentStore,
          segmentIds: ["segment-inquisitor"],
        }),
      /witness segments/i
    );

    assert.equal((await annotationStore.list()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
