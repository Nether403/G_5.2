#!/usr/bin/env tsx
/**
 * scripts/run-evals.ts
 *
 * Root-level eval runner. Resolves paths from repo root.
 * Use this for CI or cross-package runs.
 *
 * Usage:
 *   pnpm evals                        # run all cases
 *   pnpm evals -- canon               # filter by id/filename fragment
 *   pnpm evals -- canon voice-001     # multiple filters (OR)
 *   pnpm evals -- --trace             # capture full pipeline snapshots
 *   EVAL_PROVIDER=openai pnpm evals   # switch provider
 *
 * Exit 0 — all matched cases passed
 * Exit 1 — one or more failures
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCases } from "../packages/evals/src/fixtures/loadCases";
import { runSuite } from "../packages/evals/src/runners/runSuite";
import { buildEvalProvider } from "../packages/evals/src/runners/providerFactory";
import {
  printSummary,
  printCategoryBreakdown,
  printSubsystemScorecards,
} from "../packages/evals/src/reporters/consoleReporter";
import { writeJsonReport } from "../packages/evals/src/reporters/jsonReporter";
import { buildReportMetadata } from "../packages/evals/src/reporters/reportMetadata";
import { buildScoreReport } from "../packages/evals/src/assertions/scoreReport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const canonRoot = path.join(repoRoot, "packages", "canon");
  const casesDir = path.join(
    repoRoot,
    "packages",
    "evals",
    "src",
    "fixtures",
    "cases"
  );
  const canonFixturesRoot = path.join(
    repoRoot,
    "packages",
    "evals",
    "src",
    "fixtures",
    "canon"
  );
  const memoryFixturesRoot = path.join(
    repoRoot,
    "packages",
    "evals",
    "src",
    "fixtures",
    "memory"
  );
  const reportsDir = path.join(repoRoot, "packages", "evals", "reports");

  // Parse CLI args: positional terms are filters, --trace enables snapshots
  const args = process.argv.slice(2);
  const captureTrace = args.includes("--trace");
  const filter = args.filter((a) => !a.startsWith("--"));

  const provider = buildEvalProvider();
  const cases = await loadCases({ casesDir, filter });

  if (cases.length === 0) {
    const hint =
      filter.length > 0 ? ` matching filter: ${filter.join(", ")}` : "";
    throw new Error(`No eval cases found${hint}`);
  }

  const filterMsg = filter.length > 0 ? ` [filter: ${filter.join(", ")}]` : "";
  const traceMsg = captureTrace ? " [trace: on]" : "";
  console.log(`Running ${cases.length} eval case(s)${filterMsg}${traceMsg}\n`);

  const { results, providerName, modelName } = await runSuite({
    cases,
    provider,
    defaultCanonRoot: canonRoot,
    canonFixturesRoot,
    memoryFixturesRoot,
    captureTrace,
  });

  const score = buildScoreReport(results);
  printSummary(score);
  printSubsystemScorecards(score);
  printCategoryBreakdown(results);
  const metadata = await buildReportMetadata({
    canonRoot,
    entrypoint: "scripts/run-evals.ts",
    captureTrace,
    filter,
    caseCount: cases.length,
  });

  const reportPath = await writeJsonReport(
    reportsDir,
    providerName,
    modelName,
    metadata,
    score,
    results
  );

  console.log(`Report: ${reportPath}`);

  if (score.criticalFailedIds.length > 0) {
    process.exit(2);
  }
  if (score.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Eval run failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
