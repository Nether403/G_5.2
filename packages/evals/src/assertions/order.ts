import { includesNormalized } from "./matchesAny";

/**
 * Checks that `before` appears earlier in the output than `after`.
 * Returns null if the check passes, or an error string if it fails.
 *
 * Intended for future ordering assertions (e.g., "constraints cited
 * before any mention of artifacts").
 */
export function checkOrder(
  output: string,
  before: string,
  after: string
): string | null {
  const lower = output.toLowerCase();
  const beforeIdx = lower.indexOf(before.toLowerCase());
  const afterIdx = lower.indexOf(after.toLowerCase());

  if (beforeIdx === -1) {
    return `Expected "${before}" to appear in output (for ordering check)`;
  }
  if (afterIdx === -1) {
    return `Expected "${after}" to appear in output (for ordering check)`;
  }
  if (beforeIdx > afterIdx) {
    return `Expected "${before}" to appear before "${after}" in output`;
  }

  return null;
}

/** Convenience: returns true if the phrase exists anywhere in the output. */
export function phraseExists(output: string, phrase: string): boolean {
  return includesNormalized(output, phrase);
}
