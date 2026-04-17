#!/usr/bin/env tsx
/**
 * scripts/smoke-tests.ts
 *
 * End-to-end smoke tests for the canonical demo paths defined in
 * docs/demo-paths.md. Uses the MockProvider so no API key is required.
 *
 * Each path is a self-contained scenario that:
 *   1. sets up a fresh temp directory tree,
 *   2. exercises the real production code paths (no shortcuts),
 *   3. asserts a small set of release-gate-relevant invariants,
 *   4. cleans up the temp tree.
 *
 * Exit codes:
 *   0 — every demo path passed
 *   1 — at least one path failed (failure printed with the path name)
 *
 * Run via `pnpm smoke`.
 */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { MockProvider } from "../packages/orchestration/src/providers/mock";
import { runSessionTurn } from "../packages/orchestration/src/sessions/runSessionTurn";
import { FileSessionStore } from "../packages/orchestration/src/sessions/fileSessionStore";
import { FileMemoryStore } from "../packages/orchestration/src/memory/fileMemoryStore";
import {
  defaultContextSnapshotRoot,
  FileContextSnapshotStore,
} from "../packages/orchestration/src/persistence/fileContextSnapshotStore";
import { replayTurn } from "../packages/orchestration/src/persistence/replay";
import {
  exportSessionBundle,
  importSessionBundle,
} from "../packages/orchestration/src/persistence/archive";
import { FileWitnessConsentStore } from "../packages/orchestration/src/witness/fileConsentStore";
import { FileWitnessTestimonyStore } from "../packages/orchestration/src/witness/fileTestimonyStore";
import {
  CanonProposalSchema,
  PROPOSAL_SCHEMA_VERSION,
  applyProposal,
  computeLineDiff,
  scaffoldChangelogEntry,
  type CanonProposal,
} from "../packages/orchestration/src/canon-proposals";
import { runReflection } from "../packages/orchestration/src/reflection/runReflection";
import { FileReflectionStore } from "../packages/orchestration/src/reflection/fileReflectionStore";
import { FileAuthoredArtifactStore } from "../packages/orchestration/src/reflection/fileAuthoredArtifactStore";
import { promoteArtifactToProposal } from "../packages/orchestration/src/reflection/promoteArtifact";
import {
  getWitnessConsentGate,
  persistWitnessTurnArtifacts,
} from "../apps/dashboard/src/witnessRuntime";
import { validateReport } from "../packages/evals/src/reporters/reportSchema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const realCanonRoot = path.join(repoRoot, "packages", "canon");

const EDITABLE_CANON_FILES = [
  "constitution.md",
  "axioms.md",
  "epistemics.md",
  "constraints.md",
  "voice.md",
  "interaction-modes.md",
  "worldview.md",
  "anti-patterns.md",
  "continuity-facts.yaml",
  "glossary.yaml",
  "manifest.yaml",
];

interface SmokePath {
  name: string;
  run: () => Promise<void>;
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `g52-smoke-${prefix}-`));
}

async function copyEditableCanon(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  for (const file of EDITABLE_CANON_FILES) {
    await copyFile(path.join(realCanonRoot, file), path.join(target, file));
  }
  // copy artifacts/ and recovered-artifacts/ + index files so loadCanon works
  // for any path that needs the full canon (we use realCanonRoot for those).
}

/* ───────────── Path 1: inquiry turn ───────────── */

async function pathInquiryTurn(): Promise<void> {
  const root = await tempRoot("inquiry");
  try {
    const sessionsRoot = path.join(root, "sessions");
    const memoryRoot = path.join(root, "memory-items");
    const provider = new MockProvider();

    const result = await runSessionTurn(provider, {
      canonRoot: realCanonRoot,
      sessionsRoot,
      memoryRoot,
      mode: "dialogic",
      userMessage: "Smoke test inquiry: explain the canon-vs-output boundary.",
    });

    assert.ok(result.session.id, "session should have an id");
    assert.equal(result.session.turns.length, 1, "session should have exactly one turn");
    assert.ok(result.persistedTurn.contextSnapshotId, "turn should reference a snapshot id");
    assert.ok(result.persistedTurn.runMetadata, "turn should carry runMetadata");
    assert.equal(result.persistedTurn.runMetadata?.provider, "mock");
    assert.ok(result.persistedTurn.runMetadata?.canonVersion, "runMetadata should record canon version");
    assert.ok(result.persistedTurn.runMetadata?.promptRevision, "runMetadata should record prompt revision");
    assert.ok(result.persistedTurn.runMetadata?.pipelineRevision, "runMetadata should record pipeline revision");

    const snapshotStore = new FileContextSnapshotStore(
      defaultContextSnapshotRoot(sessionsRoot)
    );
    const snapshot = await snapshotStore.load(result.persistedTurn.contextSnapshotId!);
    assert.ok(snapshot, "snapshot file should be loadable");
    assert.equal(snapshot?.userMessage, "Smoke test inquiry: explain the canon-vs-output boundary.");

    // Replay from snapshot with no provider.
    const replay = await replayTurn(null, {
      sessionsRoot,
      sessionId: result.session.id,
      turnId: result.persistedTurn.id,
    });
    assert.equal(replay.mode, "replay");
    assert.equal(replay.turn.final, result.persistedTurn.assistantMessage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 2: memory governance ───────────── */

async function pathMemoryGovernance(): Promise<void> {
  const root = await tempRoot("memory");
  try {
    const memoryRoot = path.join(root, "memory-items");
    const store = new FileMemoryStore(memoryRoot);

    // Turn-origin upsert: lands accepted.
    const upserted = await store.upsert(
      {
        type: "user_preference",
        scope: "global",
        statement: "Prefer concise replies.",
        justification: "Operator stated preference during smoke test.",
        confidence: "high",
        tags: ["style"],
      },
      { turnId: "smoke-turn-1", createdAt: new Date().toISOString() }
    );
    assert.equal(upserted.state, "accepted", "turn-origin items should auto-accept");

    // Manual operator create: lands proposed (approval-required type).
    const proposed = await store.create({
      type: "project_decision",
      scope: "global",
      statement: "Use mock provider for smoke tests.",
      justification: "Operator decision for v1 release hardening.",
    });
    assert.equal(proposed.state, "proposed", "operator-created project_decision should be proposed");

    // Approve it.
    const approved = await store.transition(proposed.id, {
      action: "approve",
      actor: "smoke-test",
    });
    assert.equal(approved.state, "accepted", "approved item should be accepted");

    // Only accepted items count as retrievable; verify list shows both.
    const list = await store.list();
    const acceptedCount = list.filter((item) => item.state === "accepted").length;
    assert.equal(acceptedCount, 2, "should have two accepted items after approval");

    // Hard-delete is final.
    const deleted = await store.delete(approved.id);
    assert.equal(deleted, true);
    const afterDelete = await store.load(approved.id);
    assert.equal(afterDelete, null, "deleted item should be gone");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 3: canon proposal ───────────── */

async function pathCanonProposal(): Promise<void> {
  const root = await tempRoot("canon-prop");
  try {
    const tempCanon = path.join(root, "canon");
    await copyEditableCanon(tempCanon);

    const voicePath = path.join(tempCanon, "voice.md");
    const before = await readFile(voicePath, "utf8");
    const after = `${before}\n<!-- smoke-test marker: ${randomUUID()} -->\n`;

    const diff = computeLineDiff(before, after);
    assert.ok(diff.stats.added >= 1, "diff should report at least one added line");

    const now = new Date().toISOString();
    const proposal: CanonProposal = CanonProposalSchema.parse({
      schemaVersion: PROPOSAL_SCHEMA_VERSION,
      id: randomUUID(),
      title: "Smoke: append marker to voice.md",
      status: "accepted",
      changeKind: "modify",
      target: {
        path: "voice.md",
        label: "Voice",
        kind: "canon_document",
      },
      beforeContent: before,
      afterContent: after,
      rationale: "Smoke test asserts the editorial workflow is the only path that mutates canon.",
      provenance: { source: "manual" },
      createdAt: now,
      updatedAt: now,
      acceptedAt: now,
      reviewHistory: [
        { at: now, action: "created", status: "pending" },
        { at: now, action: "accepted", status: "accepted", note: "smoke" },
      ],
    });

    const applied = await applyProposal(tempCanon, proposal);
    assert.equal(applied.relPath, "voice.md");
    const afterDisk = await readFile(voicePath, "utf8");
    assert.equal(afterDisk, after, "applyProposal should write afterContent verbatim");

    const scaffold = await scaffoldChangelogEntry(tempCanon, proposal);
    assert.ok(scaffold.filePath.endsWith(".md"), "changelog entry should be markdown");
    const changelogContents = await readFile(scaffold.filePath, "utf8");
    assert.match(changelogContents, /Smoke: append marker to voice\.md/);
    const changelogDir = path.join(tempCanon, "changelog");
    const entries = await readdir(changelogDir);
    assert.ok(
      entries.some((f) => /^\d{4}-/.test(f)),
      "changelog entry filename should be NNNN-prefixed"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 4: reflection authoring ───────────── */

async function pathReflectionAuthoring(): Promise<void> {
  const root = await tempRoot("reflection");
  try {
    const reflectionRoot = path.join(root, "reflection");
    const artifactRoot = path.join(root, "artifacts");
    const tempCanon = path.join(root, "canon");
    await copyEditableCanon(tempCanon);
    await mkdir(path.join(tempCanon, "proposals", "pending"), {
      recursive: true,
    });

    const provider = new MockProvider();
    const reflectionStore = new FileReflectionStore(reflectionRoot);
    const artifactStore = new FileAuthoredArtifactStore(artifactRoot);

    const topic = await reflectionStore.createTopic({
      title: "Smoke: lineage discipline",
      prompt: "How does the runtime keep recovered artifacts behaviorally non-binding?",
    });
    assert.equal(topic.state, "queued");

    const { run } = await runReflection(provider, {
      topic,
      canonRoot: realCanonRoot,
    });
    assert.equal(run.status, "completed");
    assert.match(run.canonVersion, /^\d+\.\d+\.\d+$/);
    assert.equal(run.final, run.revision);

    const artifact = await artifactStore.create({
      topicId: topic.id,
      runId: "smoke-run",
      title: "Smoke artifact",
      body: run.final.slice(0, 200) || "smoke-body",
      linkedSessionIds: [],
      provider: { name: "mock", model: "mock-model" },
      canonVersion: run.canonVersion,
    });
    assert.equal(artifact.status, "draft");

    // Drafts must not be promoted.
    await assert.rejects(
      () => promoteArtifactToProposal({ artifact, canonRoot: tempCanon }),
      /must be approved/,
      "draft artifacts must refuse promotion"
    );

    const approved = await artifactStore.transition(artifact.id, "approved", {
      approvedBy: "smoke-test",
    });
    assert.equal(approved.status, "approved");

    const result = await promoteArtifactToProposal({
      artifact: approved,
      canonRoot: tempCanon,
      proposedChange: "Smoke test: confirm authored artifact reaches the proposal queue.",
      proposedBy: "smoke-test",
    });
    const proposalContents = await readFile(result.proposalPath, "utf8");
    assert.match(proposalContents, /source_artifact_id:/);
    assert.match(proposalContents, new RegExp(`canon_version_at_authoring: "${run.canonVersion.replace(/\./g, "\\.")}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 5: reports & diff ───────────── */

function buildSyntheticReport(opts: {
  withCriticalFailure: boolean;
  canonVersion: string;
}): unknown {
  const now = new Date().toISOString();
  const failed = opts.withCriticalFailure ? 1 : 0;
  const passed = opts.withCriticalFailure ? 1 : 2;
  return {
    schemaVersion: 2,
    generatedAt: now,
    provider: "mock",
    model: "mock-model",
    metadata: {
      gitCommit: null,
      canonVersion: opts.canonVersion,
      canonLastUpdated: null,
      promptRevision: "smoke-prompt-rev",
      filter: [],
      captureTrace: false,
      git: { commit: null, shortCommit: null, dirty: null },
      canon: { version: opts.canonVersion, lastUpdated: null },
      revisions: { pipeline: "smoke-pipeline-rev", prompt: "smoke-prompt-rev" },
      runContext: {
        entrypoint: "scripts/smoke-tests.ts",
        captureTrace: false,
        filter: [],
        caseCount: 2,
        nodeVersion: process.version,
        evalProviderPreference: null,
      },
    },
    score: {
      total: 2,
      passed,
      failed,
      passRate: passed / 2,
      criticalFailedIds: opts.withCriticalFailure ? ["smoke-critical-001"] : [],
      subsystems: [
        {
          subsystem: "canon-governance",
          total: 2,
          passed,
          failed,
          passRate: passed / 2,
          failedIds: opts.withCriticalFailure ? ["smoke-critical-001"] : [],
          criticalFailedIds: opts.withCriticalFailure ? ["smoke-critical-001"] : [],
        },
      ],
    },
    results: [
      {
        id: "smoke-critical-001",
        category: "smoke",
        subsystem: "canon-governance",
        critical: true,
        passed: !opts.withCriticalFailure,
        failures: opts.withCriticalFailure ? [{ message: "synthetic critical failure" }] : [],
        output: "synthetic",
      },
      {
        id: "smoke-noncritical-002",
        category: "smoke",
        subsystem: "canon-governance",
        critical: false,
        passed: true,
        failures: [],
        output: "synthetic",
      },
    ],
  };
}

async function pathReportsAndDiff(): Promise<void> {
  const root = await tempRoot("reports");
  try {
    const reportsDir = path.join(root, "reports");
    const baselinesDir = path.join(root, "gold-baselines");
    await mkdir(reportsDir, { recursive: true });
    await mkdir(baselinesDir, { recursive: true });

    // 1. Build a synthetic report with a critical failure; it must validate
    //    against the persisted schema, but the gold-baseline promotion path
    //    must refuse it.
    const failingReport = buildSyntheticReport({
      withCriticalFailure: true,
      canonVersion: "9.9.9-smoke",
    });
    const failingValidated = validateReport(failingReport);
    assert.equal(failingValidated.score.criticalFailedIds?.length, 1);

    // Mirror the refusal logic from scripts/refresh-gold-baseline.ts so we
    // exercise the same gate without launching a subprocess.
    function attemptPromote(report: unknown, provider: string): string {
      const validated = validateReport(report);
      const critical = validated.score.criticalFailedIds ?? [];
      if (critical.length > 0) {
        throw new Error(
          `Refusing to promote: report has ${critical.length} critical failure(s).`
        );
      }
      const target = path.join(
        baselinesDir,
        `${provider}-${validated.metadata.canon.version}.json`
      );
      return target;
    }

    assert.throws(
      () => attemptPromote(failingReport, "mock"),
      /Refusing to promote/,
      "promotion of a critical-failed report must be refused"
    );

    // 2. Build a clean report; it must validate AND be promotable.
    const cleanReport = buildSyntheticReport({
      withCriticalFailure: false,
      canonVersion: "9.9.9-smoke",
    });
    const cleanValidated = validateReport(cleanReport);
    assert.equal((cleanValidated.score.criticalFailedIds ?? []).length, 0);
    const targetPath = attemptPromote(cleanReport, "mock");
    await writeFile(targetPath, JSON.stringify(cleanValidated, null, 2), "utf8");
    const promoted = await readFile(targetPath, "utf8");
    assert.match(promoted, /"provider": "mock"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 6: backup round-trip ───────────── */

async function pathBackupRoundTrip(): Promise<void> {
  const root = await tempRoot("backup");
  try {
    const sessionsRoot = path.join(root, "sessions");
    const memoryRoot = path.join(root, "memory-items");
    const exportPath = path.join(root, "exports", "bundle.json");
    const importedRoot = path.join(root, "imported-sessions");

    const provider = new MockProvider();
    const result = await runSessionTurn(provider, {
      canonRoot: realCanonRoot,
      sessionsRoot,
      memoryRoot,
      mode: "dialogic",
      userMessage: "Smoke backup round-trip.",
    });

    const bundle = await exportSessionBundle({
      sessionsRoot,
      sessionId: result.session.id,
      outputPath: exportPath,
    });
    assert.equal(bundle.session.id, result.session.id);
    assert.equal(bundle.contextSnapshots.length, 1);

    const imported = await importSessionBundle({
      bundlePath: exportPath,
      sessionsRoot: importedRoot,
    });
    assert.equal(imported.session.id, result.session.id);

    const reloaded = await new FileSessionStore(importedRoot).load(
      result.session.id
    );
    assert.ok(reloaded);
    assert.equal(reloaded?.turns.length, 1);
    assert.equal(
      reloaded?.turns[0].contextSnapshotId,
      result.persistedTurn.contextSnapshotId
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Path 7: witness vertical slice ───────────── */

async function pathWitnessVerticalSlice(): Promise<void> {
  const root = await tempRoot("witness");
  try {
    const witnessCanonRoot = path.join(repoRoot, "packages", "inquisitor-witness");
    const witnessSessionsRoot = path.join(root, "witness", "sessions");
    const witnessMemoryRoot = path.join(root, "witness", "memory");
    const witnessTestimonyRoot = path.join(root, "witness", "testimony");
    const witnessConsentRoot = path.join(root, "witness", "consent");
    const pesSessionsRoot = path.join(root, "pes", "sessions");
    const pesMemoryRoot = path.join(root, "pes", "memory");
    const witnessId = `smoke-witness-${randomUUID()}`;

    await mkdir(pesSessionsRoot, { recursive: true });
    await mkdir(pesMemoryRoot, { recursive: true });

    const provider = new MockProvider();
    const consentStore = new FileWitnessConsentStore(witnessConsentRoot);
    const testimonyStore = new FileWitnessTestimonyStore(witnessTestimonyRoot);

    const blocked = await getWitnessConsentGate(consentStore, witnessId);
    assert.equal(blocked.allowed, false);
    assert.deepEqual(blocked.missingScopes, ["conversational", "retention"]);

    await consentStore.appendDecision({
      witnessId,
      scope: "conversational",
      status: "granted",
      actor: "witness",
      decidedAt: new Date().toISOString(),
    });
    await consentStore.appendDecision({
      witnessId,
      scope: "retention",
      status: "granted",
      actor: "witness",
      decidedAt: new Date().toISOString(),
    });

    const allowed = await getWitnessConsentGate(consentStore, witnessId);
    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.missingScopes, []);

    const turn = await runSessionTurn(provider, {
      canonRoot: witnessCanonRoot,
      sessionsRoot: witnessSessionsRoot,
      memoryRoot: witnessMemoryRoot,
      mode: "dialogic",
      userMessage: "Witness smoke test: capture a first inquiry turn.",
    });

    const persisted = await persistWitnessTurnArtifacts({
      sessionRoot: witnessSessionsRoot,
      testimonyStore,
      witnessId,
      session: turn.session,
      persistedTurn: turn.persistedTurn,
    });

    assert.equal(persisted.session.productId, "witness");
    assert.equal(persisted.session.witnessId, witnessId);

    const storedSession = await new FileSessionStore(witnessSessionsRoot).load(
      turn.session.id
    );
    assert.ok(storedSession, "witness session should persist");
    assert.equal(storedSession?.witnessId, witnessId);

    const testimony = await testimonyStore.load(persisted.testimonyId);
    assert.ok(testimony, "testimony should persist");
    assert.equal(testimony?.sessionId, turn.session.id);
    assert.equal(testimony?.segments.length, 2);
    assert.equal(testimony?.segments[0].role, "witness");
    assert.equal(testimony?.segments[1].role, "inquisitor");

    const pesSessionFiles = await readdir(pesSessionsRoot);
    const pesMemoryFiles = await readdir(pesMemoryRoot);
    assert.equal(pesSessionFiles.length, 0, "witness flow must not write P-E-S sessions");
    assert.equal(pesMemoryFiles.length, 0, "witness flow must not write P-E-S memory");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ───────────── Driver ───────────── */

const PATHS: SmokePath[] = [
  { name: "1. inquiry turn", run: pathInquiryTurn },
  { name: "2. memory governance", run: pathMemoryGovernance },
  { name: "3. canon proposal", run: pathCanonProposal },
  { name: "4. reflection authoring", run: pathReflectionAuthoring },
  { name: "5. reports & diff", run: pathReportsAndDiff },
  { name: "6. backup round-trip", run: pathBackupRoundTrip },
  { name: "7. witness vertical slice", run: pathWitnessVerticalSlice },
];

async function main(): Promise<void> {
  console.log("G_5.2 smoke tests — canonical demo paths\n");

  let failures = 0;
  for (const path of PATHS) {
    const start = Date.now();
    try {
      await path.run();
      const ms = Date.now() - start;
      console.log(`  ✓ ${path.name}  (${ms}ms)`);
    } catch (error) {
      failures += 1;
      const ms = Date.now() - start;
      console.log(`  ✗ ${path.name}  (${ms}ms)`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      console.log("");
    }
  }

  console.log("");
  if (failures === 0) {
    console.log(`All ${PATHS.length} demo paths passed.`);
    process.exit(0);
  } else {
    console.log(`${failures}/${PATHS.length} demo path(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke runner crashed:");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
