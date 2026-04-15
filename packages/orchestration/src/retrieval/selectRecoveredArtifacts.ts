import type { LoadedRecoveredArtifact } from "../types/canon";
import type { Mode } from "../types/modes";
import {
  hasSearchPhrase,
  uniqueSearchTokens,
} from "../utils/text";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "about",
  "there",
  "their",
  "project",
  "document",
]);

const EXPLICIT_ARTIFACT_TAGS = new Set([
  "emergence",
  "founding",
  "genesis",
  "first-person",
  "voice-benchmark",
  "catalytic-event",
]);

function scoreArtifact(
  artifact: LoadedRecoveredArtifact,
  query: string,
  mode: Mode
): number {
  const queryTokens = new Set(uniqueSearchTokens(query));
  let score = 0;

  const exactIdentifiers = [
    artifact.title,
    artifact.slug,
    artifact.class,
    "recovered artifact",
    "founding artifact",
  ];

  for (const phrase of exactIdentifiers) {
    if (hasSearchPhrase(query, phrase)) {
      score += 25;
    }
  }

  for (const phrase of artifact.retrievalConditions) {
    if (hasSearchPhrase(query, phrase)) {
      score += 20;
    }
  }

  for (const tag of artifact.retrievalTags) {
    if (EXPLICIT_ARTIFACT_TAGS.has(tag) && hasSearchPhrase(query, tag)) {
      score += 15;
    }
  }

  const metadataTokens = new Set(
    uniqueSearchTokens(
      [
        artifact.title,
        artifact.slug,
        artifact.class,
        artifact.retrievalTags.join(" "),
        artifact.retrievalConditions.join(" "),
      ].join(" ")
    )
  );

  for (const token of metadataTokens) {
    if (
      token.length >= 4 &&
      !STOPWORDS.has(token) &&
      queryTokens.has(token)
    ) {
      score += 5;
    }
  }

  if (mode === "archive" && score > 0) {
    score += 5;
  }

  return score;
}

export function selectRecoveredArtifacts(
  artifacts: LoadedRecoveredArtifact[],
  query: string,
  mode: Mode
): LoadedRecoveredArtifact[] {
  return artifacts
    .filter(
      (artifact) =>
        artifact.status !== "archived" &&
        artifact.recoveryStatus !== "placeholder"
    )
    .map((artifact) => ({
      artifact,
      score: scoreArtifact(artifact, query, mode),
    }))
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((item) => item.artifact);
}
