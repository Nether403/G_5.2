import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { writeJsonReport } from "./jsonReporter";

test("writeJsonReport persists structured metadata", async () => {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "g52-report-"));
  const reportPath = await writeJsonReport(
    reportsDir,
    "anthropic",
    "anthropic/claude-sonnet-4.6",
    {
      gitCommit: "abcdef1234567890",
      canonVersion: "0.1.1",
      canonLastUpdated: "2026-04-15",
      promptRevision: "baseline-hardening-v1",
      filter: ["canon"],
      captureTrace: true,
      git: {
        commit: "abcdef1234567890",
        shortCommit: "abcdef1",
        dirty: false,
      },
      canon: {
        version: "0.1.1",
        lastUpdated: "2026-04-15",
      },
      revisions: {
        pipeline: "baseline-hardening-v1",
        prompt: "baseline-hardening-v1",
      },
      runContext: {
        entrypoint: "scripts/run-evals.ts",
        captureTrace: true,
        filter: ["canon"],
        caseCount: 1,
        nodeVersion: "v25.0.0",
        evalProviderPreference: "anthropic",
      },
    },
    {
      total: 1,
      passed: 1,
      failed: 0,
      passRate: 1,
      failedIds: [],
    },
    []
  );

  const raw = await readFile(reportPath, "utf8");
  const parsed = JSON.parse(raw);

  assert.equal(parsed.metadata.canon.version, "0.1.1");
  assert.equal(parsed.metadata.git.shortCommit, "abcdef1");
  assert.equal(parsed.metadata.gitCommit, "abcdef1234567890");
  assert.equal(parsed.metadata.canonVersion, "0.1.1");
  assert.equal(parsed.metadata.promptRevision, "baseline-hardening-v1");
  assert.equal(parsed.metadata.runContext.captureTrace, true);
});
