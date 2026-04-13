import type { ContinuityFact } from "../types/canon";
import type { Mode } from "../types/modes";

export function selectContinuityFacts(
  facts: ContinuityFact[],
  query: string,
  mode: Mode
): ContinuityFact[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);

  const scored = facts.map((fact) => {
    const haystack =
      `${fact.id} ${fact.statement} ${fact.category} ${fact.tags.join(" ")}`.toLowerCase();

    let score = 0;

    for (const term of terms) {
      if (haystack.includes(term)) score += 10;
    }

    if (mode === "archive" && fact.category === "project-history") score += 10;
    if (mode === "editorial" && fact.category.includes("governance")) score += 10;

    return { fact, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.fact);
}
