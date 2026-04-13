import type { EvalFailure } from "../types";

function normalize(text: string): string {
  return text.toLowerCase();
}

export function includesNormalized(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

/**
 * Each inner array is an OR-group.
 * At least one string in each group must appear in the output.
 * Returns a failure for each group that had no match.
 */
export function assertMatchesAny(
  output: string,
  groups: string[][]
): EvalFailure[] {
  const failures: EvalFailure[] = [];

  for (const group of groups) {
    const matched = group.some((candidate) =>
      includesNormalized(output, candidate)
    );

    if (!matched) {
      failures.push({
        type: "mustContainAny",
        message: `Expected at least one of: ${group.join(" | ")}`,
      });
    }
  }

  return failures;
}
