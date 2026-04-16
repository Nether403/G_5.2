import test from "node:test";
import assert from "node:assert/strict";
import { buildSubsystemScorecards, resolveSubsystem } from "./subsystems";
import { buildScoreReport } from "./assertions/scoreReport";
import type { EvalResult } from "./types";

function makeResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    id: "case-001",
    description: "test",
    category: "memory",
    subsystem: "memory-discipline",
    critical: false,
    passed: true,
    failures: [],
    output: "",
    provider: "test",
    model: "test",
    ...overrides,
  };
}

test("resolveSubsystem prefers explicit subsystem and falls back to category", () => {
  assert.equal(
    resolveSubsystem({ category: "memory", subsystem: "editorial-workflow" }),
    "editorial-workflow"
  );
  assert.equal(resolveSubsystem({ category: "memory" }), "memory-discipline");
  assert.equal(resolveSubsystem({ category: "governance" }), "canon-governance");
  assert.equal(resolveSubsystem({ category: "long-horizon" }), "long-horizon-coherence");
});

test("buildSubsystemScorecards groups by subsystem and tracks critical failures", () => {
  const cards = buildSubsystemScorecards([
    makeResult({ id: "a-001", subsystem: "memory-discipline", passed: true }),
    makeResult({
      id: "b-001",
      subsystem: "memory-discipline",
      passed: false,
      critical: true,
    }),
    makeResult({
      id: "c-001",
      subsystem: "editorial-workflow",
      passed: false,
    }),
  ]);

  assert.equal(cards.length, 2);
  const memory = cards.find((c) => c.subsystem === "memory-discipline")!;
  assert.equal(memory.total, 2);
  assert.equal(memory.passed, 1);
  assert.equal(memory.failed, 1);
  assert.deepEqual(memory.failedIds, ["b-001"]);
  assert.deepEqual(memory.criticalFailedIds, ["b-001"]);

  const editorial = cards.find((c) => c.subsystem === "editorial-workflow")!;
  assert.deepEqual(editorial.failedIds, ["c-001"]);
  assert.deepEqual(editorial.criticalFailedIds, []);
});

test("buildScoreReport surfaces critical failures and per-subsystem scorecards", () => {
  const score = buildScoreReport([
    makeResult({ id: "a-001", subsystem: "canon-governance", passed: true }),
    makeResult({
      id: "b-001",
      subsystem: "canon-governance",
      passed: false,
      critical: true,
    }),
    makeResult({
      id: "c-001",
      subsystem: "memory-discipline",
      passed: false,
      critical: false,
    }),
  ]);

  assert.equal(score.total, 3);
  assert.equal(score.passed, 1);
  assert.equal(score.failed, 2);
  assert.deepEqual(score.criticalFailedIds, ["b-001"]);
  assert.equal(score.subsystems.length, 2);
});
