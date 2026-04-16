import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { writeJsonReport } from "./jsonReporter";
import {
  CURRENT_REPORT_SCHEMA_VERSION,
  validateReport,
} from "./reportSchema";

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
      criticalFailedIds: [],
      subsystems: [],
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
  assert.equal(parsed.schemaVersion, CURRENT_REPORT_SCHEMA_VERSION);

  const validated = validateReport(parsed);
  assert.equal(validated.schemaVersion, CURRENT_REPORT_SCHEMA_VERSION);
});

test("validateReport accepts legacy reports that lack schemaVersion", () => {
  const legacy = {
    generatedAt: "2026-01-01T00:00:00.000Z",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4.6",
    metadata: {
      gitCommit: null,
      canonVersion: "0.1.0",
      promptRevision: "baseline-hardening-v1",
      filter: [],
      captureTrace: false,
      git: { commit: null, shortCommit: null, dirty: null },
      canon: { version: "0.1.0" },
      revisions: {
        pipeline: "baseline-hardening-v1",
        prompt: "baseline-hardening-v1",
      },
      runContext: {
        entrypoint: "packages/evals/src/index.ts",
        captureTrace: false,
        filter: [],
        caseCount: 0,
        nodeVersion: "v20.0.0",
        evalProviderPreference: null,
      },
    },
    score: {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      failedIds: [],
    },
    results: [],
  };

  const validated = validateReport(legacy);
  assert.equal(validated.provider, "anthropic");
  assert.equal(validated.schemaVersion, CURRENT_REPORT_SCHEMA_VERSION);
});

test("exportReportBundle + importReportBundle round-trip a report", async () => {
  const { exportReportBundle, importReportBundle } = await import(
    "./reportArchive"
  );
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "g52-report-src-"));
  const importDir = await mkdtemp(path.join(os.tmpdir(), "g52-report-dst-"));
  const bundlePath = path.join(
    await mkdtemp(path.join(os.tmpdir(), "g52-report-bundle-")),
    "bundle.json"
  );

  const originalPath = await writeJsonReport(
    reportsDir,
    "anthropic",
    "anthropic/claude-sonnet-4.6",
    {
      gitCommit: "deadbeef",
      canonVersion: "0.1.1",
      canonLastUpdated: null,
      promptRevision: "baseline-hardening-v1",
      filter: [],
      captureTrace: false,
      git: { commit: "deadbeef", shortCommit: "deadbee", dirty: false },
      canon: { version: "0.1.1", lastUpdated: null },
      revisions: {
        pipeline: "baseline-hardening-v1",
        prompt: "baseline-hardening-v1",
      },
      runContext: {
        entrypoint: "packages/evals/src/index.ts",
        captureTrace: false,
        filter: [],
        caseCount: 0,
        nodeVersion: "v20.0.0",
        evalProviderPreference: null,
      },
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      failedIds: [],
      criticalFailedIds: [],
      subsystems: [],
    },
    []
  );

  const reportFileName = path.basename(originalPath);
  const bundle = await exportReportBundle({
    reportsDir,
    reportFileName,
    outputPath: bundlePath,
  });
  assert.equal(bundle.kind, "report");
  assert.equal(bundle.reportFileName, reportFileName);

  const imported = await importReportBundle({
    bundlePath,
    reportsDir: importDir,
  });
  const importedRaw = JSON.parse(await readFile(imported.reportPath, "utf8"));
  assert.equal(importedRaw.provider, "anthropic");
  assert.equal(importedRaw.schemaVersion, CURRENT_REPORT_SCHEMA_VERSION);
  assert.equal(
    path.basename(imported.reportPath),
    reportFileName
  );

  await assert.rejects(
    () => importReportBundle({ bundlePath, reportsDir: importDir }),
    /already exists/
  );
});
