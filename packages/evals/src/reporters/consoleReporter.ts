import type { EvalCategory, EvalResult } from "../types";
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

  if (report.criticalFailedIds.length > 0) {
    console.log("");
    console.log(
      `MERGE-BLOCKING: ${report.criticalFailedIds.length} critical case(s) failed:`
    );
    for (const id of report.criticalFailedIds) {
      console.log(`  - ${id}`);
    }
    console.log(
      "See docs/eval-discipline.md for the merge-blocking regression policy."
    );
  }
}

/**
 * Prints a subsystem-level scorecard:
 *
 *   Subsystems:
 *     canon-governance   3/3 ✓
 *     editorial-workflow 1/2 — 1 failed (1 critical): editorial-proposal-handling-001
 *     memory-discipline  4/5 — 1 failed: memory-pollution-001
 */
export function printSubsystemScorecards(report: ScoreReport): void {
  if (report.subsystems.length === 0) return;

  const longest = Math.max(
    ...report.subsystems.map((s) => s.subsystem.length)
  );
  console.log("\nSubsystems:");
  for (const card of report.subsystems) {
    const padded = card.subsystem.padEnd(longest);
    if (card.failed === 0) {
      console.log(`  ${padded}  ${card.passed}/${card.total} ✓`);
    } else {
      const criticalSuffix =
        card.criticalFailedIds.length > 0
          ? ` (${card.criticalFailedIds.length} critical)`
          : "";
      console.log(
        `  ${padded}  ${card.passed}/${card.total} — ${card.failed} failed${criticalSuffix}: ${card.failedIds.join(", ")}`
      );
    }
  }
}

/**
 * Prints a category-grouped breakdown of results:
 *
 *   governance  3/3 ✓
 *   epistemics  4/5 — 1 failed: retrieval-precedence-001
 *   style       2/2 ✓
 */
export function printCategoryBreakdown(results: EvalResult[]): void {
  const categories = new Map<
    EvalCategory,
    { passed: number; total: number; failedIds: string[] }
  >();

  for (const r of results) {
    const cat = r.category;
    if (!categories.has(cat)) {
      categories.set(cat, { passed: 0, total: 0, failedIds: [] });
    }
    const entry = categories.get(cat)!;
    entry.total++;
    if (r.passed) {
      entry.passed++;
    } else {
      entry.failedIds.push(r.id);
    }
  }

  console.log("\nCategory breakdown:");
  for (const [cat, entry] of [...categories.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const padded = cat.padEnd(12);
    if (entry.failedIds.length === 0) {
      console.log(`  ${padded} ${entry.passed}/${entry.total} ✓`);
    } else {
      console.log(
        `  ${padded} ${entry.passed}/${entry.total} — ${entry.failedIds.length} failed: ${entry.failedIds.join(", ")}`
      );
    }
  }
}
