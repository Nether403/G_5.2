import type {
  GenerateTextInput,
  GenerateTextOutput,
  ModelProvider,
} from "../types/providers";

/**
 * Anthropic via OpenRouter provider stub.
 *
 * To implement:
 * 1. Set OPENROUTER_API_KEY and OPENROUTER_DEFAULT_MODEL in your .env file
 *    (see .env.example).
 * 2. OpenRouter accepts standard OpenAI-compatible chat completions format.
 * 3. Implement generateText() below using fetch or the openai SDK pointed
 *    at the OpenRouter base URL.
 *
 * Endpoint shape:
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Header: Authorization: Bearer {OPENROUTER_API_KEY}
 *   Body:   { model: "anthropic/claude-3-5-sonnet", messages: [...] }
 */
export class AnthropicProvider implements ModelProvider {
  name = "anthropic";

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    throw new Error(
      "AnthropicProvider not implemented yet. See src/providers/anthropic.ts for wiring instructions."
    );
  }
}
