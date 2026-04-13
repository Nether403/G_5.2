import type {
  GenerateTextInput,
  GenerateTextOutput,
  ModelProvider,
} from "../types/providers";

/**
 * Azure OpenAI provider stub.
 *
 * To implement:
 * 1. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME
 *    in your .env file (see .env.example).
 * 2. Install the Azure OpenAI SDK or use native fetch against the REST API.
 * 3. Implement generateText() below.
 *
 * Endpoint shape:
 *   POST {AZURE_OPENAI_ENDPOINT}/openai/deployments/{deployment}/chat/completions?api-version={version}
 *   Header: api-key: {AZURE_OPENAI_API_KEY}
 */
export class OpenAIProvider implements ModelProvider {
  name = "openai";

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    throw new Error(
      "OpenAIProvider not implemented yet. See src/providers/openai.ts for wiring instructions."
    );
  }
}
