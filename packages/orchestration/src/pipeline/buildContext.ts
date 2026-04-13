import path from "node:path";
import { loadCanon } from "../canon/loadCanon";
import { buildRetrievalSet } from "../retrieval/buildRetrievalSet";
import type { BuildContextInput, BuiltContext } from "../types/pipeline";

export async function buildContext(
  input: BuildContextInput
): Promise<BuiltContext> {
  const canon = await loadCanon(input.canonRoot);
  const retrieval = buildRetrievalSet(canon, input.userMessage, input.mode);

  const systemPrompt = [
    `Active mode: ${input.mode}`,
    "",
    "Selected canon:",
    ...retrieval.documents.map((doc) => `## ${doc.title}\n${doc.content}`),
    "",
    "Selected continuity facts:",
    ...retrieval.facts.map((fact) => `- ${fact.id}: ${fact.statement}`),
  ].join("\n");

  return {
    mode: input.mode,
    selectedDocuments: retrieval.documents,
    selectedFacts: retrieval.facts,
    systemPrompt,
    userPrompt: input.userMessage,
  };
}
