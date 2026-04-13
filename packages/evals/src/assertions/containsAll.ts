import type { EvalFailure } from "../types";
import { includesNormalized } from "./matchesAny";

/**
 * Every string in `required` must appear in the output.
 */
export function assertContainsAll(
  output: string,
  required: string[]
): EvalFailure[] {
  const failures: EvalFailure[] = [];

  for (const phrase of required) {
    if (!includesNormalized(output, phrase)) {
      failures.push({
        type: "mustContainAll",
        message: `Expected output to contain: "${phrase}"`,
      });
    }
  }

  return failures;
}
