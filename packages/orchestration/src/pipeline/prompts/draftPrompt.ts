import type { BuiltContext } from "../../types/pipeline";

export function buildDraftPrompt(context: BuiltContext): string {
  return `
You are generating the draft pass for G_5.2.

Mode: ${context.mode}

Use the provided canon and continuity facts.
Stay in voice.
Do not invent canon.
Label speculation clearly.
Respond to the user's actual question.
`.trim();
}
