/**
 * Task 5 — the public-eval / private-holdout split and the Witness-Attributed
 * Eval Standard (R6, R9).
 *
 * The schema already guarantees exactly one `eval_case` that is `is_public: true`
 * with no `holdout` field, and that holdout benchmark cases live only under
 * `private.holdout_eval_cases`. This module adds the semantic checks the schema
 * cannot express: the eval's ideal behavior must be attributed to the witness's
 * reasoning and must NOT be phrased as a universal moral verdict (R9.2, R9.3).
 */

import type { CorpusEntry } from "./corpusEntry";

/** Phrasings that signal a universal moral verdict rather than witness attribution. */
export const UNIVERSAL_VERDICT_PATTERNS: RegExp[] = [
  /\bthe correct (moral )?answer\b/i,
  /\bthe right answer\b/i,
  /\bthe morally correct\b/i,
  /\bthe objectively (correct|right)\b/i,
  /\buniversally (correct|true|right)\b/i,
  /\bthe only ethical (choice|answer)\b/i,
];

export interface EvalStandardViolation {
  field: string;
  reason: string;
}

export interface EvalStandardResult {
  ok: boolean;
  violations: EvalStandardViolation[];
}

/**
 * Validate that the mandatory eval is public, witness-attributed, and not a
 * universal verdict, and that any holdout cases sit only in the private section.
 */
export function validateWitnessAttributedEval(
  entry: CorpusEntry,
): EvalStandardResult {
  const violations: EvalStandardViolation[] = [];
  const evalCase = entry.eval_case;

  if (evalCase.is_public !== true) {
    violations.push({
      field: "eval_case.is_public",
      reason: "the mandatory entry eval must be public",
    });
  }

  if (evalCase.attribution_basis.trim().length === 0) {
    violations.push({
      field: "eval_case.attribution_basis",
      reason: "ideal behavior must be attributed to the witness's reasoning",
    });
  }

  for (const pattern of UNIVERSAL_VERDICT_PATTERNS) {
    if (pattern.test(evalCase.witness_attributed_ideal_behavior)) {
      violations.push({
        field: "eval_case.witness_attributed_ideal_behavior",
        reason: `ideal behavior reads as a universal verdict (matched ${pattern}); it must preserve the tension THIS witness articulated`,
      });
      break;
    }
  }

  // Defense in depth: a stray `holdout` key must never ride on the public eval.
  if (Object.prototype.hasOwnProperty.call(evalCase, "holdout")) {
    violations.push({
      field: "eval_case.holdout",
      reason:
        "the public eval must not carry a holdout flag; holdout cases live in private.holdout_eval_cases",
    });
  }

  return { ok: violations.length === 0, violations };
}

/** Throw if the witness-attributed eval standard is violated. */
export function assertWitnessAttributedEval(entry: CorpusEntry): void {
  const result = validateWitnessAttributedEval(entry);
  if (!result.ok) {
    const detail = result.violations
      .map((v) => `${v.field}: ${v.reason}`)
      .join("; ");
    throw new Error(`Witness-attributed eval standard violated: ${detail}`);
  }
}
