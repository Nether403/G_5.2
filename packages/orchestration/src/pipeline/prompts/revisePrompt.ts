export function buildRevisePrompt(draft: string, critique: string): string {
  return `
Revise the draft using the critique.

Preserve:
- strongest grounded insights
- voice consistency
- clarity

Remove:
- overclaiming
- drift
- fog
- unnecessary theatrics

Draft:
${draft}

Critique:
${critique}
`.trim();
}
