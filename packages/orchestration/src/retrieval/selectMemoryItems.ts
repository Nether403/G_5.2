import type { MemoryItem } from "../types/memory";

const MAX_MEMORY_ITEMS = 5;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
  "you",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function scoreMemoryItem(item: MemoryItem, query: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const haystack = `${item.statement} ${item.tags.join(" ")}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  if (query.toLowerCase().includes(item.statement.toLowerCase())) {
    score += 3;
  }

  return score;
}

export function selectMemoryItems(
  memoryItems: MemoryItem[],
  query: string,
  sessionId?: string
): MemoryItem[] {
  // Only accepted items are retrievable. Proposed / rejected / superseded /
  // resolved / archived items are inspectable in the operator surface but
  // excluded from turn context to preserve memory discipline.
  const retrievable = memoryItems.filter((item) => item.state === "accepted");

  const sessionThreads = retrievable
    .filter(
      (item) =>
        item.type === "open_thread" &&
        item.scope === "session" &&
        item.sessionId === sessionId
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const rank = (type: "project_decision" | "user_preference") =>
    retrievable
      .filter((item) => item.type === type && item.scope === "global")
      .map((item) => ({
        item,
        score: scoreMemoryItem(item, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt)
      )
      .map((entry) => entry.item);

  return [...sessionThreads, ...rank("project_decision"), ...rank("user_preference")].slice(
    0,
    MAX_MEMORY_ITEMS
  );
}
