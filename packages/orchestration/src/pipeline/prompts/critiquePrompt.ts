export function buildCritiquePrompt(draft: string): string {
  return `
Critique this draft for:
- canon drift
- unsupported claims
- tone drift
- mystification
- unlabeled speculation
- unnecessary inflation

Return a concise critique.
Draft:
${draft}
`.trim();
}
