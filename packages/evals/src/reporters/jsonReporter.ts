import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalResult } from "../types";
import type { ScoreReport } from "../assertions/scoreReport";

export interface JsonReport {
  generatedAt: string;
  provider: string;
  model: string;
  score: ScoreReport;
  results: EvalResult[];
}

/**
 * Writes a JSON eval report to `reportsDir/eval-report-<timestamp>.json`.
 * Creates the directory if it does not exist.
 * Returns the path written.
 */
export async function writeJsonReport(
  reportsDir: string,
  providerName: string,
  modelName: string,
  score: ScoreReport,
  results: EvalResult[]
): Promise<string> {
  await mkdir(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    reportsDir,
    `eval-report-${timestamp}.json`
  );

  const report: JsonReport = {
    generatedAt: new Date().toISOString(),
    provider: providerName,
    model: modelName,
    score,
    results,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  return reportPath;
}
