import type { CanonDocument, LoadedCanon } from "../types/canon";
import type { Mode } from "../types/modes";
import { normalizeForSearch, tokenizeSearchText } from "../utils/text";

export function selectCanonDocuments(
  canon: LoadedCanon,
  query: string,
  mode: Mode
): CanonDocument[] {
  const terms = tokenizeSearchText(query);

  const scored = canon.documents
    .filter((doc) => doc.status === "active")
    .map((doc) => {
      const haystack = normalizeForSearch(
        `${doc.slug} ${doc.title} ${doc.retrievalTags.join(" ")} ${doc.content}`
      );

      let score = doc.priority;

      for (const term of terms) {
        if (haystack.includes(term)) score += 10;
      }

      if (doc.slug === "constraints") score += 25;
      if (doc.slug === "epistemics") score += 20;
      if (doc.slug === "constitution") score += 15;
      if (doc.slug === "axioms") score += 10;
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
