import { loadCanon } from "../canon/loadCanon";
import { buildRetrievalSet } from "../retrieval/buildRetrievalSet";
import type { Message } from "../types/messages";
import type { BuildContextInput, BuiltContext } from "../types/pipeline";
import {
  trimToTokenBudget,
  truncateToTokens,
} from "../utils/budget";

const MAX_CANON_BUDGET_TOKENS = 4000;
const MAX_ARTIFACT_EXCERPT_TOKENS = 600;

function pushSection(parts: string[], title: string, lines: string[]) {
  if (lines.length === 0) {
    return;
  }

  parts.push("", title, ...lines);
}

function formatRecentMessage(message: Message): string {
  const label =
    message.role === "user"
      ? "User"
      : message.role === "assistant"
        ? "Assistant"
        : "System";

  return `${label}:\n${message.content}`;
}

export async function buildContext(
  input: BuildContextInput
): Promise<BuiltContext> {
  const canon = await loadCanon(input.canonRoot);
  const retrieval = buildRetrievalSet(canon, input.userMessage, input.mode);

  const glossaryLines = retrieval.glossaryTerms.map(
    (term) => `- ${term.term}: ${term.definition}`
  );

  const factLines = retrieval.facts.map(
    (fact) => `- ${fact.id}: ${fact.statement}`
  );

  const documentBlocks = trimToTokenBudget(
    retrieval.documents.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      content: `## ${doc.title}\n${doc.content}`,
    })),
    MAX_CANON_BUDGET_TOKENS
  );

  const artifactBlocks = retrieval.recoveredArtifacts.map((artifact) => ({
    slug: artifact.slug,
    title: artifact.title,
    content: [
      `## ${artifact.title}`,
      "Historical, non-binding reference:",
      `- Classification: ${artifact.class}`,
      `- Authority: ${artifact.authority}, behaviorally non-binding`,
      `- Recovery status: ${artifact.recoveryStatus}`,
      artifact.retrievalConditions.length > 0
        ? `- Retrieved because the query matched: ${artifact.retrievalConditions.join(", ")}`
        : null,
      artifact.rhetoricalOnlyClaims.length > 0
        ? `- Rhetorical-only claims to resist: ${artifact.rhetoricalOnlyClaims.join("; ")}`
        : null,
      truncateToTokens(artifact.content, MAX_ARTIFACT_EXCERPT_TOKENS),
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  }));

  const systemPromptParts = [
    `Active mode: ${input.mode}`,
    "",
    "Governance reminders:",
    "- Only active canon documents and active continuity facts are governing.",
    "- Glossary terms clarify canonical vocabulary when relevant.",
    "- Recovered artifacts are historical context only and never override governing canon.",
    "- If evidence is insufficient, say so plainly. Label speculation explicitly.",
  ];

  pushSection(
    systemPromptParts,
    "Selected canon:",
    documentBlocks.map((doc) => doc.content)
  );
  pushSection(systemPromptParts, "Selected continuity facts:", factLines);
  pushSection(systemPromptParts, "Selected glossary terms:", glossaryLines);
  pushSection(
    systemPromptParts,
    "Selected recovered artifacts:",
    artifactBlocks.map((artifact) => artifact.content)
  );

  const systemPrompt = systemPromptParts.join("\n");
  const userPromptParts: string[] = [];

  if (input.sessionSummary) {
    userPromptParts.push(
      "Session summary (non-canonical prior context):",
      input.sessionSummary
    );
  }

  if (input.recentMessages && input.recentMessages.length > 0) {
    const transcript = input.recentMessages
      .map(formatRecentMessage)
      .join("\n\n---\n\n");

    userPromptParts.push("Recent context:", transcript);
  }

  userPromptParts.push("User:", input.userMessage);
  const userPrompt = userPromptParts.join("\n\n");

  return {
    mode: input.mode,
    selectedDocuments: retrieval.documents.filter((doc) =>
      documentBlocks.some((block) => block.slug === doc.slug)
    ),
    selectedFacts: retrieval.facts,
    selectedGlossaryTerms: retrieval.glossaryTerms,
    selectedRecoveredArtifacts: retrieval.recoveredArtifacts.filter((artifact) =>
      artifactBlocks.some((block) => block.slug === artifact.slug)
    ),
    systemPrompt,
    recentMessages: input.recentMessages,
    sessionSummary: input.sessionSummary,
    userPrompt,
  };
}
