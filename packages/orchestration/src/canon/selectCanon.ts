import type { CanonDocument, LoadedCanon } from "../types/canon";
import type { Mode } from "../types/modes";

export function selectCanonDocuments(
  canon: LoadedCanon,
  query: string,
  mode: Mode
): CanonDocument[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);

  const scored = canon.documents.map((doc) => {
    const haystack =
      `${doc.slug} ${doc.title} ${doc.retrievalTags.join(" ")} ${doc.content}`.toLowerCase();

    let score = doc.priority;

    for (const term of terms) {
      if (haystack.includes(term)) score += 10;
    }

    if (mode === "editorial" && doc.slug === "constraints") score += 15;
    if (mode === "reflective" && doc.slug === "voice") score += 10;
    if (mode === "meta" && doc.slug === "interaction-modes") score += 10;

    return { doc, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.doc);
}
