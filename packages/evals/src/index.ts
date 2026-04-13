/**
 * packages/evals/src/index.ts
 *
 * Package entry point: runs the full eval suite against the env provider.
 * Identical in behaviour to scripts/run-evals.ts but executes from
 * within the package context (used by `pnpm --filter @g52/evals dev`).
 */

import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { EvalCase } from "./types";
import { runSuite } from "./runners/runSuite";
import { buildEvalProvider } from "./runners/providerFactory";
import { printSummary } from "./reporters/consoleReporter";
import { writeJsonReport } from "./reporters/jsonReporter";
import { buildScoreReport } from "./assertions/scoreReport";

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
  const packageRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(packageRoot, "../..");
  const canonRoot = path.join(repoRoot, "packages", "canon");
  const casesDir = path.join(packageRoot, "src", "fixtures", "cases");
  const reportsDir = path.join(packageRoot, "reports");

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
