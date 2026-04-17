import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  FileWitnessConsentStore,
  listConsentForWitness,
} from "./fileConsentStore";
import {
  FileWitnessTestimonyStore,
  appendTurnToTestimony,
} from "./fileTestimonyStore";

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
