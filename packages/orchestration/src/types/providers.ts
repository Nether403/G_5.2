export interface GenerateTextInput {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
}

export interface GenerateTextOutput {
  text: string;
  provider: string;
  model: string;
}

export interface ModelProvider {
  name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}
