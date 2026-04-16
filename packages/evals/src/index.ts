/**
 * packages/evals/src/index.ts
 *
 * Package entry point: runs the full eval suite against the env provider.
 * Used by `pnpm --filter @g52/evals dev [filter...]`
 *
 * Optional filter args narrow which cases run:
 *   pnpm --filter @g52/evals dev -- canon
 *   pnpm --filter @g52/evals dev -- canon-precedence-001 voice
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCases } from "./fixtures/loadCases";
import { runSuite } from "./runners/runSuite";
import { buildEvalProvider } from "./runners/providerFactory";
import {
  printSummary,
  printCategoryBreakdown,
  printSubsystemScorecards,
} from "./reporters/consoleReporter";
import { writeJsonReport } from "./reporters/jsonReporter";
import { buildReportMetadata } from "./reporters/reportMetadata";
import { buildScoreReport } from "./assertions/scoreReport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const packageRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(packageRoot, "../..");
  const canonRoot = path.join(repoRoot, "packages", "canon");
  const casesDir = path.join(packageRoot, "src", "fixtures", "cases");
  const canonFixturesRoot = path.join(packageRoot, "src", "fixtures", "canon");
  const memoryFixturesRoot = path.join(
    packageRoot,
    "src",
    "fixtures",
    "memory"
  );
  const reportsDir = path.join(packageRoot, "reports");

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
    entrypoint: "packages/evals/src/index.ts",
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
