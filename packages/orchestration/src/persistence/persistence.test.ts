import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FileMemoryStore } from "../memory/fileMemoryStore";
import { MockProvider } from "../providers/mock";
import { runSessionTurn } from "../sessions/runSessionTurn";
import { FileSessionStore } from "../sessions/fileSessionStore";
import {
  defaultContextSnapshotRoot,
  FileContextSnapshotStore,
} from "./fileContextSnapshotStore";
import {
  migrateMemoryItem,
  migrateSession,
} from "./migrations";
import { checkReplayCompatibility, replayTurn } from "./replay";
import {
  exportSessionBundle,
  importSessionBundle,
  SessionArchiveSchema,
} from "./archive";
import { SCHEMA_VERSIONS, SchemaMigrationError } from "./schemaVersions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const canonRoot = path.join(repoRoot, "packages", "canon");

async function createRoots() {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-persistence-"));
  return {
    sessionsRoot: path.join(root, "sessions"),
    memoryRoot: path.join(root, "memory-items"),
    exportPath: path.join(root, "export", "bundle.json"),
    importedRoot: path.join(root, "imported-sessions"),
  };
}

test("new sessions are persisted with schemaVersion and context snapshots as first-class objects", async () => {
  const { sessionsRoot, memoryRoot } = await createRoots();
  const provider = new MockProvider();

  const result = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    memoryRoot,
    mode: "dialogic",
    userMessage: "I prefer concise replies.",
  });

  const raw = await readFile(
    path.join(sessionsRoot, `${result.session.id}.json`),
    "utf8"
  );
  const parsed = JSON.parse(raw);
  assert.equal(parsed.schemaVersion, SCHEMA_VERSIONS.session);

  const turn = parsed.turns[0];
  assert.ok(turn.contextSnapshotId, "turn should reference a context snapshot");
  assert.ok(turn.runMetadata, "turn should carry runMetadata");
  assert.equal(turn.runMetadata.provider, provider.name);
  assert.ok(turn.runMetadata.canonVersion);
  assert.ok(turn.runMetadata.promptRevision);
  assert.ok(turn.runMetadata.pipelineRevision);
  assert.ok(turn.trace, "turn should carry a trace");

  const snapshotStore = new FileContextSnapshotStore(
    defaultContextSnapshotRoot(sessionsRoot)
  );
  const snapshot = await snapshotStore.load(turn.contextSnapshotId);
  assert.ok(snapshot, "snapshot file should be loadable");
  assert.equal(snapshot?.schemaVersion, SCHEMA_VERSIONS.contextSnapshot);
  assert.equal(snapshot?.userMessage, "I prefer concise replies.");
});

test("migrateSession upgrades v1 unversioned sessions and rejects newer versions", async () => {
  const { sessionsRoot } = await createRoots();
  await mkdir(sessionsRoot, { recursive: true });

  const legacy = {
    id: "legacy-session",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    summary: null,
    turns: [],
  };
  const legacyPath = path.join(sessionsRoot, `${legacy.id}.json`);
  await writeFile(legacyPath, JSON.stringify(legacy, null, 2), "utf8");

  const store = new FileSessionStore(sessionsRoot);
  const loaded = await store.load(legacy.id);
  assert.ok(loaded);
  assert.equal(loaded?.schemaVersion, SCHEMA_VERSIONS.session);

  // rejection for future versions
  assert.throws(
    () =>
      migrateSession({
        schemaVersion: SCHEMA_VERSIONS.session + 99,
        id: "future",
        createdAt: "now",
        updatedAt: "now",
        summary: null,
        turns: [],
      }),
    SchemaMigrationError
  );

  // rejection for garbage
  assert.throws(() => migrateSession("not-an-object"), SchemaMigrationError);
});

test("migrateSession preserves witness product metadata", () => {
  const migrated = migrateSession({
    schemaVersion: SCHEMA_VERSIONS.session,
    id: "witness-session",
    productId: "witness",
    witnessId: "wit-123",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    summary: null,
    turns: [],
  });

  assert.equal(migrated.productId, "witness");
  assert.equal(migrated.witnessId, "wit-123");
});

test("migrateMemoryItem accepts unversioned fixtures and stamps schemaVersion on load", async () => {
  const { memoryRoot } = await createRoots();
  await mkdir(memoryRoot, { recursive: true });

  const legacyItem = {
    id: "memory-legacy",
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Legacy fixture without schemaVersion.",
    confidence: "high",
    tags: ["style"],
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    createdFrom: {
      turnId: "turn-legacy",
      createdAt: "2026-04-16T00:00:00.000Z",
    },
    lastConfirmedFrom: {
      turnId: "turn-legacy",
      createdAt: "2026-04-16T00:00:00.000Z",
    },
    confirmationCount: 1,
  };

  await writeFile(
    path.join(memoryRoot, `${legacyItem.id}.json`),
    JSON.stringify(legacyItem, null, 2),
    "utf8"
  );

  const upgraded = migrateMemoryItem(legacyItem);
  assert.equal(upgraded.schemaVersion, SCHEMA_VERSIONS.memoryItem);

  const items = await new FileMemoryStore(memoryRoot).list();
  assert.equal(items.length, 1);
  assert.equal(items[0].schemaVersion, SCHEMA_VERSIONS.memoryItem);
});

test("replayTurn reproduces the same pipeline inputs from a persisted trace", async () => {
  const { sessionsRoot, memoryRoot } = await createRoots();
  const provider = new MockProvider();

  const first = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    memoryRoot,
    mode: "dialogic",
    userMessage: "Explain how critique keeps canon intact.",
  });

  // Default "replay" mode reconstructs TurnArtifacts from the
  // persisted trace + snapshot without any provider calls. Pass
  // provider=null to make the guarantee explicit.
  const replay = await replayTurn(null, {
    sessionsRoot,
    sessionId: first.session.id,
    turnId: first.persistedTurn.id,
  });

  assert.equal(replay.mode, "replay");
  assert.equal(replay.turn.context.userPrompt, first.context.userPrompt);
  assert.equal(replay.turn.context.systemPrompt, first.context.systemPrompt);
  assert.equal(replay.turn.draft, first.persistedTurn.trace?.draft);
  assert.equal(replay.turn.critique, first.persistedTurn.trace?.critique);
  assert.equal(replay.turn.revision, first.persistedTurn.trace?.revision);
  assert.equal(replay.turn.final, first.persistedTurn.assistantMessage);
  assert.equal(replay.snapshot.mode, first.persistedTurn.mode);

  // rerun mode is available and performs the full pipeline again.
  const rerun = await replayTurn(provider, {
    sessionsRoot,
    canonRoot,
    sessionId: first.session.id,
    turnId: first.persistedTurn.id,
    mode: "rerun",
  });
  assert.equal(rerun.mode, "rerun");
  assert.equal(rerun.turn.final, first.persistedTurn.assistantMessage);

  // compatibility check reports no drift against the current env.
  const mismatches = await checkReplayCompatibility({
    turn: first.persistedTurn,
    canonRoot,
  });
  assert.deepEqual(mismatches, []);

  // canonVersion drift is detected and hard-fails rerun by default.
  const driftedTurn = {
    ...first.persistedTurn,
    runMetadata: {
      ...first.persistedTurn.runMetadata!,
      canonVersion: "not-a-real-version",
    },
  };
  const drifted = await checkReplayCompatibility({
    turn: driftedTurn,
    canonRoot,
  });
  assert.ok(drifted.some((m) => m.field === "canonVersion"));
});

test("exportSessionBundle and importSessionBundle round-trip a session with its snapshots", async () => {
  const { sessionsRoot, memoryRoot, exportPath, importedRoot } =
    await createRoots();
  const provider = new MockProvider();

  const run = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    memoryRoot,
    mode: "dialogic",
    userMessage: "I prefer concise replies.",
  });

  const bundle = await exportSessionBundle({
    sessionsRoot,
    sessionId: run.session.id,
    outputPath: exportPath,
  });

  // schema validates
  SessionArchiveSchema.parse(bundle);
  assert.equal(bundle.session.id, run.session.id);
  assert.equal(bundle.contextSnapshots.length, 1);

  const imported = await importSessionBundle({
    bundlePath: exportPath,
    sessionsRoot: importedRoot,
  });

  assert.equal(imported.session.id, run.session.id);
  assert.equal(imported.snapshotIds.length, 1);

  const reloaded = await new FileSessionStore(importedRoot).load(
    run.session.id
  );
  assert.ok(reloaded);
  assert.equal(reloaded?.turns.length, 1);
  assert.equal(
    reloaded?.turns[0].contextSnapshotId,
    run.persistedTurn.contextSnapshotId
  );

  const snapshot = await new FileContextSnapshotStore(
    defaultContextSnapshotRoot(importedRoot)
  ).load(imported.snapshotIds[0]);
  assert.ok(snapshot);
  assert.equal(snapshot?.userMessage, "I prefer concise replies.");

  // importing into the same root without overwrite refuses
  await assert.rejects(() =>
    importSessionBundle({
      bundlePath: exportPath,
      sessionsRoot: importedRoot,
    })
  );
});
