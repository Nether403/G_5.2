export function includesAny(text: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 1;
  }
  return score;
}
