import type { InquirySession } from "../../../packages/orchestration/src/types/session";

export interface InquirySessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  preview: string;
  searchableText: string;
  tags: string[];
  archived: boolean;
  title: string | null;
  lastTurnCreatedAt: string | null;
}

export type SessionSortKey =
  | "updatedAt"
  | "createdAt"
  | "turnCount"
  | "title";

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "New session";
}

export function toSessionSummary(
  session: InquirySession
): InquirySessionSummary {
  const lastTurn = session.turns.at(-1);
  const summaryText = session.summary?.text ?? null;
  const tags = Array.isArray(session.tags) ? [...session.tags] : [];
  const searchableText = [
    session.id,
    session.title ?? "",
    summaryText,
    tags.join(" "),
    ...session.turns.flatMap((turn) => [
      turn.userMessage,
      turn.assistantMessage,
      turn.memoryDecision.reason,
      ...turn.memoryDecision.candidates.map((candidate) => candidate.statement),
      ...turn.memoryDecision.storedItems.map((item) => item.statement),
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    turnCount: session.turns.length,
    preview: firstNonEmpty(
      session.title,
      summaryText,
      lastTurn?.userMessage,
      lastTurn?.assistantMessage
    ),
    searchableText,
    tags,
    archived: Boolean(session.archived),
    title: session.title ?? null,
    lastTurnCreatedAt: lastTurn?.createdAt ?? null,
  };
}

export function sortSessionSummaries<T extends { updatedAt: string }>(
  sessions: T[]
): T[] {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function sortSessionSummariesBy(
  sessions: InquirySessionSummary[],
  key: SessionSortKey,
  direction: "asc" | "desc" = "desc"
): InquirySessionSummary[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...sessions].sort((a, b) => {
    if (key === "turnCount") {
      return (a.turnCount - b.turnCount) * dir;
    }

    if (key === "title") {
      const aTitle = (a.title ?? a.preview ?? a.id).toLowerCase();
      const bTitle = (b.title ?? b.preview ?? b.id).toLowerCase();
      return aTitle.localeCompare(bTitle) * dir;
    }

    const aVal = key === "createdAt" ? a.createdAt : a.updatedAt;
    const bVal = key === "createdAt" ? b.createdAt : b.updatedAt;
    return aVal.localeCompare(bVal) * dir;
  });
}

export function filterSessionSummaries(
  sessions: InquirySessionSummary[],
  query: string
): InquirySessionSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return sessions;
  }

  return sessions.filter((session) =>
    session.searchableText.includes(normalized)
  );
}

export function filterSessionsByTag(
  sessions: InquirySessionSummary[],
  tag: string | null
): InquirySessionSummary[] {
  if (!tag) {
    return sessions;
  }

  const normalized = tag.toLowerCase();
  return sessions.filter((session) =>
    session.tags.some((t) => t.toLowerCase() === normalized)
  );
}

export function filterSessionsByArchive(
  sessions: InquirySessionSummary[],
  mode: "active" | "archived" | "all"
): InquirySessionSummary[] {
  if (mode === "all") {
    return sessions;
  }

  if (mode === "archived") {
    return sessions.filter((session) => session.archived);
  }

  return sessions.filter((session) => !session.archived);
}

export function collectTagCounts(
  sessions: InquirySessionSummary[]
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const tag of session.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const RECENT_TURN_WINDOW_DEFAULT = 4;

export interface SessionSummaryHealth {
  hasSummary: boolean;
  summaryTokensApprox: number;
  summaryCharCount: number;
  turnsInSummary: number;
  turnsInRecentWindow: number;
  recentWindowLimit: number;
  stalenessMs: number;
  stalenessLabel: string;
}

function ageLabel(ms: number): string {
  if (ms < 60_000) {
    return "moments ago";
  }

  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (ms < 86_400_000) {
    const hours = Math.round(ms / 3_600_000);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(ms / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function computeSessionSummaryHealth(
  session: InquirySession,
  recentWindowLimit: number = RECENT_TURN_WINDOW_DEFAULT,
  now: Date = new Date()
): SessionSummaryHealth {
  const summaryText = session.summary?.text ?? "";
  const summaryCharCount = summaryText.length;
  const summaryTokensApprox = summaryText
    ? Math.max(1, Math.round(summaryText.split(/\s+/).filter(Boolean).length * 1.3))
    : 0;

  const turnsInRecentWindow = Math.min(session.turns.length, recentWindowLimit);
  const turnsInSummary = Math.max(0, session.turns.length - recentWindowLimit);
  const lastUpdate = new Date(session.updatedAt).getTime();
  const stalenessMs = Math.max(0, now.getTime() - lastUpdate);

  return {
    hasSummary: Boolean(summaryText),
    summaryTokensApprox,
    summaryCharCount,
    turnsInSummary,
    turnsInRecentWindow,
    recentWindowLimit,
    stalenessMs,
    stalenessLabel: ageLabel(stalenessMs),
  };
}
