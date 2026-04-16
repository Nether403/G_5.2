import test from "node:test";
import assert from "node:assert/strict";
import { computeDiff, type JsonReport } from "./reportUtils";

function buildReport(overrides: Partial<JsonReport>): JsonReport {
  return {
    generatedAt: "2026-04-15T00:00:00.000Z",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4.6",
    metadata: {
      gitCommit: "abcdef1234567890",
      canonVersion: "0.1.1",
      canonLastUpdated: "2026-04-15",
      promptRevision: "baseline-hardening-v1",
      filter: [],
      captureTrace: true,
      git: {
        commit: "abcdef1234567890",
        shortCommit: "abcdef1",
        dirty: false,
      },
      canon: { version: "0.1.1", lastUpdated: "2026-04-15" },
      revisions: {
        pipeline: "baseline-hardening-v1",
        prompt: "baseline-hardening-v1",
      },
      runContext: {
        entrypoint: "scripts/run-evals.ts",
        captureTrace: true,
        filter: [],
        caseCount: 1,
        nodeVersion: "v25.0.0",
        evalProviderPreference: "anthropic",
      },
    },
    score: {
      total: 1,
      passed: 1,
      failed: 0,
      passRate: 1,
    },
    results: [],
    ...overrides,
  };
}

test("computeDiff produces subsystemDelta and criticalDelta", () => {
  const a = buildReport({
    score: {
      total: 2,
      passed: 2,
      failed: 0,
      passRate: 1,
      criticalFailedIds: [],
    },
    results: [
      {
        id: "memory-pollution-resists-canon-001",
        category: "memory",
        subsystem: "memory-discipline",
        critical: true,
        passed: true,
        failures: [],
        output: "ok",
      },
      {
        id: "editorial-proposal-handling-001",
        category: "editorial",
        subsystem: "editorial-workflow",
        critical: true,
        passed: true,
        failures: [],
        output: "ok",
      },
    ],
  });
  const b = buildReport({
    score: {
      total: 2,
      passed: 1,
      failed: 1,
      passRate: 0.5,
      criticalFailedIds: ["editorial-proposal-handling-001"],
    },
    results: [
      {
        id: "memory-pollution-resists-canon-001",
        category: "memory",
        subsystem: "memory-discipline",
        critical: true,
        passed: true,
        failures: [],
        output: "ok",
      },
      {
        id: "editorial-proposal-handling-001",
        category: "editorial",
        subsystem: "editorial-workflow",
        critical: true,
        passed: false,
        failures: [{ message: "missing 'proposal'" }],
        output: "i updated canon",
      },
    ],
  });

  const diff = computeDiff(a, b);
  const subEditorial = diff.subsystemDelta.find(
    (s) => s.subsystem === "editorial-workflow"
  );
  assert.ok(subEditorial);
  assert.equal(subEditorial!.delta, -1);

  assert.deepEqual(diff.criticalDelta.newlyFailingCritical, [
    "editorial-proposal-handling-001",
  ]);
  assert.deepEqual(diff.criticalDelta.newlyPassingCritical, []);
});

test("computeDiff treats missing subsystem as category-bucketed", () => {
  const a = buildReport({
    results: [
      {
        id: "legacy-case-001",
        category: "memory",
        passed: true,
        failures: [],
        output: "ok",
      },
    ],
  });
  const b = buildReport({
    results: [
      {
        id: "legacy-case-001",
        category: "memory",
        passed: false,
        failures: [{ message: "boom" }],
        output: "no",
      },
    ],
  });
  const diff = computeDiff(a, b);
  const bucket = diff.subsystemDelta.find(
    (s) => s.subsystem === "category:memory"
  );
  assert.ok(bucket);
  assert.equal(bucket!.delta, -1);
});
