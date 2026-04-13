import type { ModelProvider } from "../types/providers";
import { buildRevisePrompt } from "./prompts/revisePrompt";

export async function reviseResponse(
  provider: ModelProvider,
  systemPrompt: string,
  draft: string,
  critique: string
): Promise<string> {
  const result = await provider.generateText({
    system: systemPrompt,
    user: buildRevisePrompt(draft, critique),
  });

  return result.text;
}
