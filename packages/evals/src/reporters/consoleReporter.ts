import type { EvalResult } from "../types";
import type { ScoreReport } from "../assertions/scoreReport";

/**
 * Prints eval results to stdout in the standard format:
 *
 *   PASS canon-precedence-001
 *   FAIL speculation-labeling-001
 *     - Missing speculative language
 *     - Contained forbidden phrase: "this will become"
 */
export function printResult(result: EvalResult): void {
  if (result.passed) {
    console.log(`PASS ${result.id}`);
    return;
  }

  console.log(`FAIL ${result.id}`);
  for (const failure of result.failures) {
    console.log(`  - ${failure.message}`);
  }
}

export function printSummary(report: ScoreReport): void {
  console.log("");
  console.log(
    `Summary: ${report.passed}/${report.total} passed` +
      (report.failed > 0 ? ` — ${report.failed} failed` : " ✓")
  );
}
