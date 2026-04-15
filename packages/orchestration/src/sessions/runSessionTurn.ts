import { randomUUID } from "node:crypto";
import type { Message } from "../types/messages";
import type { ModelProvider } from "../types/providers";
import type {
  InquirySession,
  RunSessionTurnInput,
  SessionTurnArtifacts,
  SessionTurnRecord,
} from "../types/session";
import { runTurn } from "../pipeline/runTurn";
import { truncateToTokens } from "../utils/budget";
import { FileSessionStore } from "./fileSessionStore";

const DEFAULT_RECENT_TURN_LIMIT = 4;
const MAX_SUMMARY_ENTRIES = 6;
const MAX_SUMMARY_TOKENS = 500;

function createEmptySession(sessionId?: string): InquirySession {
  const now = new Date().toISOString();

  return {
    id: sessionId ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
    summary: null,
    turns: [],
  };
}

function toRecentMessages(turns: SessionTurnRecord[]): Message[] {
  return turns.flatMap((turn) => [
    {
      role: "user" as const,
      content: turn.userMessage,
      passType: "user" as const,
      createdAt: turn.createdAt,
    },
    {
      role: "assistant" as const,
      content: turn.assistantMessage,
      passType: "final" as const,
      createdAt: turn.createdAt,
    },
  ]);
}

function summarizeTurns(turns: SessionTurnRecord[]): string | null {
  if (turns.length === 0) {
    return null;
  }

  const summary = turns
    .slice(-MAX_SUMMARY_ENTRIES)
    .map((turn, index) => {
      const user = truncateToTokens(turn.userMessage, 40).replace(/\s+/g, " ");
      const assistant = truncateToTokens(turn.assistantMessage, 60).replace(
        /\s+/g,
        " "
      );

      return `${index + 1}. [${turn.mode}] User: ${user}\nAssistant: ${assistant}`;
    })
    .join("\n");

  return truncateToTokens(summary, MAX_SUMMARY_TOKENS);
}

export async function runSessionTurn(
  provider: ModelProvider,
  input: RunSessionTurnInput
): Promise<SessionTurnArtifacts> {
  const recentTurnLimit = input.recentTurnLimit ?? DEFAULT_RECENT_TURN_LIMIT;
  const store = new FileSessionStore(input.sessionsRoot);
  const existing =
    (input.sessionId ? await store.load(input.sessionId) : null) ??
    createEmptySession(input.sessionId);

  const recentTurns = existing.turns.slice(-recentTurnLimit);
  const turn = await runTurn(provider, {
    canonRoot: input.canonRoot,
    mode: input.mode,
    userMessage: input.userMessage,
    recentMessages: toRecentMessages(recentTurns),
    sessionSummary: existing.summary ?? undefined,
  });

  const persistedTurn: SessionTurnRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    mode: input.mode,
    userMessage: input.userMessage,
    assistantMessage: turn.final,
    memoryDecision: turn.memoryDecision,
  };

  const turns = [...existing.turns, persistedTurn];
  const rolledIntoSummary = turns.slice(
    0,
    Math.max(0, turns.length - recentTurnLimit)
  );
  const session: InquirySession = {
    ...existing,
    updatedAt: persistedTurn.createdAt,
    summary: summarizeTurns(rolledIntoSummary),
    turns,
  };

  await store.save(session);

  return {
    ...turn,
    session,
    persistedTurn,
  };
}
