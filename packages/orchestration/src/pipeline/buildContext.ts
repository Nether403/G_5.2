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

  let userPrompt = input.userMessage;

  if (input.recentMessages && input.recentMessages.length > 0) {
    const transcript = input.recentMessages
      .map(
        (msg) =>
          `${msg.role === "user" ? "User" : "System"}:\n${msg.content}`
      )
      .join("\n\n---\n\n");

    userPrompt = `Recent context:\n\n${transcript}\n\n---\n\nUser:\n${input.userMessage}`;
  }

  return {
    mode: input.mode,
    selectedDocuments: retrieval.documents,
    selectedFacts: retrieval.facts,
    systemPrompt,
    recentMessages: input.recentMessages,
    userPrompt,
  };
}
