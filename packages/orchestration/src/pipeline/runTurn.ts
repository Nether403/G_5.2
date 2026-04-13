import type { BuildContextInput, TurnArtifacts } from "../types/pipeline";
import type { ModelProvider } from "../types/providers";
import { buildContext } from "./buildContext";
import { draftResponse } from "./draftResponse";
import { critiqueResponse } from "./critiqueResponse";
import { reviseResponse } from "./reviseResponse";
import { decideMemory } from "./decideMemory";

export async function runTurn(
  provider: ModelProvider,
  input: BuildContextInput
): Promise<TurnArtifacts> {
  const context = await buildContext(input);
  const draft = await draftResponse(provider, context);
  const critique = await critiqueResponse(provider, draft);
  const revision = await reviseResponse(
    provider,
    context.systemPrompt,
    draft,
    critique
  );

  return {
    context,
    draft,
    critique,
    revision,
    final: revision,
    memoryDecision: decideMemory(revision),
  };
}
