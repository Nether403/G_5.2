import type { EvalResult } from "../types";

export interface ScoreReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  failedIds: string[];
}

/**
 * Generates a summary score from a set of eval results.
 * Does not print — callers decide what to do with the report.
 */
export function buildScoreReport(results: EvalResult[]): ScoreReport {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const failedIds = results.filter((r) => !r.passed).map((r) => r.id);

  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    failedIds,
  };
}
