import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import type { InquirySession, SessionTurnRecord } from "../../../packages/orchestration/src/types/session";
import { FileWitnessConsentStore } from "../../../packages/orchestration/src/witness/fileConsentStore";
import { FileWitnessTestimonyStore } from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import {
  getWitnessConsentGate,
  persistWitnessTurnArtifacts,
} from "./witnessRuntime";

function buildSession(overrides: Partial<InquirySession> = {}): InquirySession {
  return {
    id: "session-1",
    createdAt: "2026-04-17T18:00:00.000Z",
    updatedAt: "2026-04-17T18:01:00.000Z",
    summary: null,
    turns: [],
    ...overrides,
  };
}

function buildTurn(overrides: Partial<SessionTurnRecord> = {}): SessionTurnRecord {
  return {
    id: "turn-1",
    createdAt: "2026-04-17T18:01:00.000Z",
    mode: "dialogic",
    userMessage: "I want to describe what changed.",
    assistantMessage: "What feels most important to begin with?",
    memoryDecision: {
      shouldStore: false,
      reason: "No durable memory candidate.",
      candidates: [],
      skippedCandidates: [],
      storedItems: [],
    },
    ...overrides,
  };
}

test("getWitnessConsentGate reports missing conversational and retention consent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-gate-"));

  try {
    const store = new FileWitnessConsentStore(root);

    const blocked = await getWitnessConsentGate(store, "wit-1");
    assert.equal(blocked.allowed, false);
    assert.deepEqual(blocked.missingScopes, ["conversational", "retention"]);

    await store.appendDecision({
      witnessId: "wit-1",
      actor: "witness",
      scope: "conversational",
      status: "granted",
      decidedAt: "2026-04-17T18:00:00.000Z",
    });
    const missingRetention = await getWitnessConsentGate(store, "wit-1");
    assert.equal(missingRetention.allowed, false);
    assert.deepEqual(missingRetention.missingScopes, ["retention"]);

    await store.appendDecision({
      witnessId: "wit-1",
      actor: "witness",
      scope: "retention",
      status: "granted",
      decidedAt: "2026-04-17T18:01:00.000Z",
    });
    const allowed = await getWitnessConsentGate(store, "wit-1");
    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.missingScopes, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persistWitnessTurnArtifacts stamps witness metadata onto the session and appends testimony", async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-session-"));
  const testimonyRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-testimony-runtime-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(testimonyRoot);
    const session = buildSession({
      turns: [buildTurn()],
    });

    const persisted = await persistWitnessTurnArtifacts({
      sessionRoot,
      testimonyStore,
      witnessId: "wit-1",
      session,
      persistedTurn: session.turns[0],
    });

    assert.equal(persisted.session.witnessId, "wit-1");
    assert.equal(persisted.session.productId, "witness");

    const testimony = await testimonyStore.list();
    assert.equal(testimony.length, 1);
    assert.equal(testimony[0].sessionId, session.id);
    assert.equal(testimony[0].witnessId, "wit-1");
    assert.equal(testimony[0].segments.length, 2);
    assert.equal(testimony[0].segments[0].role, "witness");
    assert.equal(testimony[0].segments[1].role, "inquisitor");
  } finally {
    await rm(sessionRoot, { recursive: true, force: true });
    await rm(testimonyRoot, { recursive: true, force: true });
  }
});
