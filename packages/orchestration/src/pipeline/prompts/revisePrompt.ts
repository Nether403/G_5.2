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

When rejecting an overclaim about artifacts, selfhood, awareness, or proof:
- use plain epistemic language such as "not proof", "not evidence", or "cannot treat"
- prefer direct wording over elegant paraphrase
- do not repeat a forbidden first-person identity claim verbatim, even as a denial
- keep the governance path if the user is trying to redefine canon or rules
- state the governance path with concrete verbs such as "draft a proposal", "propose the specific claim", "review or evaluate it", and "explicitly record or promote the change"

Draft:
${draft}

Critique:
${critique}
`.trim();
}
