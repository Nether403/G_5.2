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

test("computeDiff captures glossary and recovered-artifact trace deltas", () => {
  const reportA = buildReport({
    results: [
      {
        id: "case-001",
        category: "context",
        passed: true,
        failures: [],
        output: "A",
        trace: {
          selectedDocuments: [{ slug: "constitution", title: "Constitution" }],
          selectedFacts: [{ id: "CF-001", statement: "fact" }],
          selectedGlossaryTerms: [{ term: "canon", definition: "definition" }],
          selectedRecoveredArtifacts: [],
          systemPrompt: "system",
          userPrompt: "user",
          draft: "draft-a",
          critique: "critique-a",
          revision: "revision-a",
          final: "final-a",
        },
      },
    ],
  });
  const reportB = buildReport({
    results: [
      {
        id: "case-001",
        category: "context",
        passed: true,
        failures: [],
        output: "B",
        trace: {
          selectedDocuments: [{ slug: "constitution", title: "Constitution" }],
          selectedFacts: [{ id: "CF-001", statement: "fact" }],
          selectedGlossaryTerms: [{ term: "canon-creep", definition: "definition" }],
          selectedRecoveredArtifacts: [{ slug: "emergence-first-person-account", title: "Emergence" }],
          systemPrompt: "system",
          userPrompt: "user",
          draft: "draft-b",
          critique: "critique-b",
          revision: "revision-b",
          final: "final-b",
        },
      },
    ],
  });

  const diff = computeDiff(reportA, reportB);
  const traceDiff = diff.cases[0].traceDiff;

  assert.equal(traceDiff.selectedGlossaryTerms.a, "canon");
  assert.equal(traceDiff.selectedGlossaryTerms.b, "canon-creep");
  assert.equal(traceDiff.selectedRecoveredArtifacts.a, null);
  assert.equal(
    traceDiff.selectedRecoveredArtifacts.b,
    "emergence-first-person-account"
  );
});
