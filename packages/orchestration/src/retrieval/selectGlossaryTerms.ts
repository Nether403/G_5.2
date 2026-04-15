import type { GlossaryTerm } from "../types/canon";
import {
  hasSearchPhrase,
  uniqueSearchTokens,
} from "../utils/text";

export function selectGlossaryTerms(
  terms: GlossaryTerm[],
  query: string
): GlossaryTerm[] {
  const queryTokens = new Set(uniqueSearchTokens(query));
  const definitionIntent =
    /\b(define|definition|meaning|mean|what is|what does)\b/i.test(query);

  const scored = terms.map((term) => {
    let score = 0;
    const termTokens = uniqueSearchTokens(term.term);
    const definitionTokens = uniqueSearchTokens(term.definition);

    if (hasSearchPhrase(query, term.term)) {
      score += 30;
    }

    if (hasSearchPhrase(query, term.definition)) {
      score += 20;
    }

    for (const token of termTokens) {
      if (token.length >= 4 && queryTokens.has(token)) {
        score += 10;
      }
    }

    for (const token of definitionTokens) {
      if (token.length >= 5 && queryTokens.has(token)) {
        score += 3;
      }
    }

    if (definitionIntent && score > 0) {
      score += 5;
    }

    return { term, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.term);
}
