import type { ModelProvider } from "../types/providers";
import type { BuiltContext } from "../types/pipeline";
import { buildDraftPrompt } from "./prompts/draftPrompt";

export async function draftResponse(
  provider: ModelProvider,
  context: BuiltContext
): Promise<string> {
  const result = await provider.generateText({
    system: `${context.systemPrompt}\n\n${buildDraftPrompt(context)}`,
    user: context.userPrompt,
  });

  return result.text;
}
