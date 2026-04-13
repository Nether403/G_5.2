/**
 * fromEnv.ts — construct a ModelProvider from environment variables.
 *
 * Selection order:
 *   EVAL_PROVIDER=openai    → OpenAIProvider (openai/gpt-5.4 or OPENROUTER_OPENAI_MODEL)
 *   EVAL_PROVIDER=anthropic → AnthropicProvider (anthropic/claude-sonnet-4.6 or OPENROUTER_ANTHROPIC_MODEL)
 *   unset / default         → AnthropicProvider
 *   no OPENROUTER_API_KEY   → MockProvider
 *
 * The EVAL_PROVIDER var lets scripts and CI switch providers without
 * code changes. The provider classes themselves read their own model
 * override vars.
 */

import type { ModelProvider } from "../types/providers";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";

export function providerFromEnv(): ModelProvider {
  if (!process.env.OPENROUTER_API_KEY) {
    return new MockProvider();
  }

  const preference = (process.env.EVAL_PROVIDER ?? "anthropic").toLowerCase();

  if (preference === "openai") {
    return new OpenAIProvider();
  }

  return new AnthropicProvider();
}
