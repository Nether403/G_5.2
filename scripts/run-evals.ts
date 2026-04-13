#!/usr/bin/env tsx
/**
 * scripts/run-evals.ts
 *
 * Root-level eval runner. Resolves paths from repo root.
 * Use this for CI or cross-package runs.
 *
 * Usage:
 *   pnpm evals
 *   EVAL_PROVIDER=openai pnpm evals
 *
 * Exit 0 — all cases passed
 * Exit 1 — one or more failures (with details printed)
 */

import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { EvalCase } from "../packages/evals/src/types";
import { runSuite } from "../packages/evals/src/runners/runSuite";
import { buildEvalProvider } from "../packages/evals/src/runners/providerFactory";
import { printSummary } from "../packages/evals/src/reporters/consoleReporter";
import { writeJsonReport } from "../packages/evals/src/reporters/jsonReporter";
import { buildScoreReport } from "../packages/evals/src/assertions/scoreReport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEvalCases(casesDir: string): Promise<EvalCase[]> {
  const entries = await readdir(casesDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();

  const cases: EvalCase[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(casesDir, file), "utf8");
    cases.push(JSON.parse(raw) as EvalCase);
  }
  return cases;
}

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
  const reportsDir = path.join(repoRoot, "packages", "evals", "reports");

  const provider = buildEvalProvider();
  const cases = await loadEvalCases(casesDir);

  if (cases.length === 0) {
    throw new Error(`No eval cases found in ${casesDir}`);
  }

  console.log(`Running ${cases.length} eval case(s)\n`);

  const { results, providerName, modelName } = await runSuite({
    cases,
    provider,
    canonRoot,
  });

  const score = buildScoreReport(results);
  printSummary(score);

  const reportPath = await writeJsonReport(
    reportsDir,
    providerName,
    modelName,
    score,
    results
  );

  console.log(`Report: ${reportPath}`);

  if (score.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Eval run failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
