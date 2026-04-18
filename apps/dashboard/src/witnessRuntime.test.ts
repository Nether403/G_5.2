import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import type { InquirySession, SessionTurnRecord } from "../../../packages/orchestration/src/types/session";
import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import { FileWitnessConsentStore } from "../../../packages/orchestration/src/witness/fileConsentStore";
import {
  FileWitnessTestimonyStore,
  appendTurnToTestimony,
} from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import {
  getWitnessConsentGate,
  persistWitnessTurnArtifacts,
  type WitnessCompensationEvent,
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

function assertCompensationEvent(
  actual: unknown[],
  expected: Omit<WitnessCompensationEvent, "testimonyId"> & {
    testimonyId?: string | "any-string";
  }
) {
  assert.equal(actual.length, 1);
  const [event] = actual as WitnessCompensationEvent[];
  assert.equal(event.event, expected.event);
  assert.equal(event.reason, expected.reason);
  assert.equal(event.action, expected.action);
  assert.equal(event.status, expected.status);
  assert.equal(event.witnessId, expected.witnessId);
  assert.equal(event.sessionId, expected.sessionId);
  assert.equal(event.error, expected.error);
  if (expected.testimonyId === "any-string") {
    assert.equal(typeof event.testimonyId, "string");
    assert.ok(event.testimonyId);
  } else {
    assert.equal(event.testimonyId, expected.testimonyId);
  }
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

test("persistWitnessTurnArtifacts rolls back testimony when session persistence fails", async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-session-fail-"));
  const testimonyRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-testimony-fail-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(testimonyRoot);
    const events: unknown[] = [];
    const session = buildSession({
      turns: [buildTurn()],
    });

    await assert.rejects(
      () =>
        persistWitnessTurnArtifacts({
          sessionRoot,
          testimonyStore,
          witnessId: "wit-1",
          session,
          persistedTurn: session.turns[0],
          logger: async (event) => {
            events.push(event);
          },
          sessionStore: {
            save: async () => {
              throw new Error("session write failed");
            },
          },
        }),
      /session write failed/
    );

    const testimony = await testimonyStore.list();
    assert.equal(testimony.length, 0);
    assertCompensationEvent(events, {
      event: "witness_persistence_compensation",
      reason: "session_save_failed",
      action: "delete_created_testimony",
      status: "succeeded",
      witnessId: "wit-1",
      sessionId: "session-1",
      testimonyId: "any-string",
      error: "session write failed",
    });
  } finally {
    await rm(sessionRoot, { recursive: true, force: true });
    await rm(testimonyRoot, { recursive: true, force: true });
  }
});

test("persistWitnessTurnArtifacts restores an existing testimony record when session persistence fails", async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-session-restore-"));
  const testimonyRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-testimony-restore-"));

  try {
    const testimonyStore = new FileWitnessTestimonyStore(testimonyRoot);
    const existing = await testimonyStore.create({
      witnessId: "wit-1",
      sessionId: "session-1",
      capturedAt: "2026-04-17T17:59:00.000Z",
      title: "Existing Witness Session",
    });

    const original = await appendTurnToTestimony(testimonyStore, {
      testimonyId: existing.id,
      witnessText: "The first statement is already retained.",
      assistantText: "The first answer is already retained.",
      createdAt: "2026-04-17T18:00:00.000Z",
    });

    const events: unknown[] = [];
    const session = buildSession({
      turns: [buildTurn()],
    });

    await assert.rejects(
      () =>
        persistWitnessTurnArtifacts({
          sessionRoot,
          testimonyStore,
          witnessId: "wit-1",
          session,
          persistedTurn: session.turns[0],
          logger: async (event) => {
            events.push(event);
          },
          sessionStore: {
            save: async () => {
              throw new Error("session write failed");
            },
          },
        }),
      /session write failed/
    );

    const restored = await testimonyStore.load(existing.id);
    assert.deepEqual(restored, original);
    assertCompensationEvent(events, {
      event: "witness_persistence_compensation",
      reason: "session_save_failed",
      action: "restore_existing_testimony",
      status: "succeeded",
      witnessId: "wit-1",
      sessionId: "session-1",
      testimonyId: existing.id,
      error: "session write failed",
    });
  } finally {
    await rm(sessionRoot, { recursive: true, force: true });
    await rm(testimonyRoot, { recursive: true, force: true });
  }
});

test("a compensated witness persistence failure leaves session and testimony roots unchanged from the operator view", async () => {
  const sessionRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-session-acceptance-"));
  const testimonyRoot = await mkdtemp(path.join(os.tmpdir(), "g52-witness-testimony-acceptance-"));

  try {
    const sessionStore = new FileSessionStore(sessionRoot);
    const testimonyStore = new FileWitnessTestimonyStore(testimonyRoot);
    const created = await testimonyStore.create({
      witnessId: "wit-1",
      sessionId: "session-1",
      capturedAt: "2026-04-17T17:59:00.000Z",
      title: "Existing Witness Session",
    });
    await appendTurnToTestimony(testimonyStore, {
      testimonyId: created.id,
      witnessText: "The first statement is already retained.",
      assistantText: "The first answer is already retained.",
      createdAt: "2026-04-17T18:00:00.000Z",
    });

    const beforeSession = await sessionStore.load("session-1");
    const beforeTestimony = await testimonyStore.list();
    const events: unknown[] = [];
    const session = buildSession({
      turns: [buildTurn()],
    });

    await assert.rejects(
      () =>
        persistWitnessTurnArtifacts({
          sessionRoot,
          testimonyStore,
          witnessId: "wit-1",
          session,
          persistedTurn: session.turns[0],
          logger: async (event) => {
            events.push(event);
          },
          sessionStore: {
            save: async () => {
              throw new Error("session write failed");
            },
          },
        }),
      /session write failed/
    );

    const afterSession = await sessionStore.load("session-1");
    const afterTestimony = await testimonyStore.list();

    assert.deepEqual(afterSession, beforeSession);
    assert.deepEqual(afterTestimony, beforeTestimony);
    assertCompensationEvent(events, {
      event: "witness_persistence_compensation",
      reason: "session_save_failed",
      action: "restore_existing_testimony",
      status: "succeeded",
      witnessId: "wit-1",
      sessionId: "session-1",
      testimonyId: created.id,
      error: "session write failed",
    });
  } finally {
    await rm(sessionRoot, { recursive: true, force: true });
    await rm(testimonyRoot, { recursive: true, force: true });
  }
});
