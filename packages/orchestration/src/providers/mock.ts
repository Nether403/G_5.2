import type {
  GenerateTextInput,
  GenerateTextOutput,
  ModelProvider,
} from "../types/providers";

export class MockProvider implements ModelProvider {
  name = "mock";

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return {
      provider: this.name,
      model: "mock-model",
      text: `[MOCK OUTPUT]
SYSTEM:
${input.system.slice(0, 500)}

USER:
${input.user.slice(0, 500)}
`,
    };
  }
}
