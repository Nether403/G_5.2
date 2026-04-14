export function buildCritiquePrompt(draft: string): string {
  return `
Critique this draft for:
- canon drift
- unsupported claims
- tone drift
- mystification
- unlabeled speculation
- unnecessary inflation
- incomplete governance response: if the draft refuses a request to alter
  canon, continuity facts, or governing rules, it must not stop at the
  refusal alone — it must also state the proper governed path: how to
  formally propose, review, and explicitly promote the change

Return a concise critique.
Draft:
${draft}
`.trim();
}
