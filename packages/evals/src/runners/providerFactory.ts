/**
 * providerFactory.ts — eval-layer provider construction.
 *
 * Wraps providerFromEnv() from orchestration with eval-specific
 * logging (which provider is active, why).
 *
 * Selection order:
 *   1. EVAL_PROVIDER=openai  → OpenAIProvider
 *   2. EVAL_PROVIDER=anthropic → AnthropicProvider
 *   3. EVAL_PROVIDER=gemini (or unset) → GeminiProvider
 *   4. No OPENROUTER_API_KEY → MockProvider (warns loudly)
 */

import { providerFromEnv } from "../../../orchestration/src/providers/fromEnv";
import type { ModelProvider } from "../../../orchestration/src/types/providers";

export function buildEvalProvider(): ModelProvider {
  const provider = providerFromEnv();

  if (provider.name === "mock") {
    console.warn(
      "[evals] WARNING: No OPENROUTER_API_KEY set — using MockProvider.\n" +
        "         Results will not be meaningful. Set the key to run real evals.\n"
    );
  } else {
    const model = (provider as { model?: string }).model ?? "unknown";
    console.log(`[evals] Provider: ${provider.name} (${model})\n`);
  }

  return provider;
}
