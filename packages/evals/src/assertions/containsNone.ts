import type { EvalFailure } from "../types";
import { includesNormalized } from "./matchesAny";

/**
 * No string in `forbidden` may appear in the output.
 */
export function assertContainsNone(
  output: string,
  forbidden: string[]
): EvalFailure[] {
  const failures: EvalFailure[] = [];

  for (const phrase of forbidden) {
    if (includesNormalized(output, phrase)) {
      failures.push({
        type: "mustNotContain",
        message: `Output contained forbidden phrase: "${phrase}"`,
      });
    }
  }

  return failures;
}
