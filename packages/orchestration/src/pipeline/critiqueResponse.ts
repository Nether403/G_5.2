import type { ModelProvider } from "../types/providers";
import { buildCritiquePrompt } from "./prompts/critiquePrompt";

export async function critiqueResponse(
  provider: ModelProvider,
  draft: string
): Promise<string> {
  const result = await provider.generateText({
    system: "You are the critique pass for G_5.2.",
    user: buildCritiquePrompt(draft),
  });

  return result.text;
}
