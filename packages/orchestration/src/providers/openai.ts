/**
 * OpenAI provider — routed through OpenRouter.
 *
 * Uses model: openai/gpt-5.4 by default.
 * Override with OPENROUTER_OPENAI_MODEL or OPENROUTER_DEFAULT_MODEL.
 * OPENROUTER_SECONDARY_MODEL provides a lighter OpenAI route for
 * compare/rerun or default-provider use when desired.
 *
 * Azure is a provider choice on OpenRouter, not part of the model slug.
 * Use standard model IDs such as openai/gpt-5.4 and control provider
 * routing with OPENROUTER_IGNORE_PROVIDERS or request-level provider rules.
 *
 * Model page: https://openrouter.ai/openai/gpt-5.4
 */

import type {
  GenerateTextInput,
  GenerateTextOutput,
  ModelProvider,
} from "../types/providers";
import { openRouterGenerate } from "./openrouter";

export function getDefaultOpenAIModel(): string {
  return (
    process.env.OPENROUTER_OPENAI_MODEL ??
    process.env.OPENROUTER_DEFAULT_MODEL ??
    "openai/gpt-5.4"
  );
}

export function getSecondaryOpenAIModel(): string {
  return process.env.OPENROUTER_SECONDARY_MODEL ?? "openai/gpt-5.4-mini";
}

function getIgnoredProviders(): string[] {
  const raw = process.env.OPENROUTER_IGNORE_PROVIDERS ?? "none";
  return raw.toLowerCase() === "none"
    ? []
    : raw
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean);
}

export class OpenAIProvider implements ModelProvider {
  name = "openai";
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? getDefaultOpenAIModel();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return openRouterGenerate(
      input.model ?? this.model,
      input,
      this.name,
      getIgnoredProviders()
    );
  }
}

export class OpenAISecondaryProvider implements ModelProvider {
  name = "openai-secondary";
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? getSecondaryOpenAIModel();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return openRouterGenerate(
      input.model ?? this.model,
      input,
      this.name,
      getIgnoredProviders()
    );
  }
}
