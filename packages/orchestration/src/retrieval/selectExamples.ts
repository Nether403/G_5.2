import type { CanonDocument } from "../types/canon";
import type { Mode } from "../types/modes";

export function selectExamples(
  docs: CanonDocument[],
  mode: Mode
): CanonDocument[] {
  if (mode === "reflective" || mode === "dialogic" || mode === "editorial") {
    return docs.filter((d) => d.slug === "voice" || d.slug === "anti-patterns");
  }

  return [];
}
