/**
 * runCompareTurn — run a one-off turn against the same session context
 * (recent messages, session summary, canon, memory) without persisting it
 * back to the session turn list or writing to the durable memory store.
 *
 * Used by the inquiry surface to let operators rerun an existing turn's
 * prompt against a different provider and inspect the two outputs
 * side-by-side.
 */

import { randomUUID } from "node:crypto";
import type { Mode } from "../types/modes";
import type { ModelProvider } from "../types/providers";
import type {
  InquirySession,
  SessionContextSnapshot,
  SessionTurnRerun,
  SessionTurnRecord,
} from "../types/session";
import { runTurn } from "../pipeline/runTurn";
import { FileMemoryStore } from "../memory/fileMemoryStore";
import { buildContextSnapshot } from "./runSessionTurn";
import type { Message } from "../types/messages";

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

export interface RunCompareTurnInput {
  session: InquirySession;
  turnId: string;
  canonRoot: string;
  memoryRoot: string;
  provider: ModelProvider;
  recentTurnLimit?: number;
  mode?: Mode;
  userMessageOverride?: string;
}

const DEFAULT_RECENT_TURN_LIMIT = 4;

export async function runCompareTurn(
  input: RunCompareTurnInput
): Promise<SessionTurnRerun> {
  const recentTurnLimit = input.recentTurnLimit ?? DEFAULT_RECENT_TURN_LIMIT;
  const targetIndex = input.session.turns.findIndex(
    (turn) => turn.id === input.turnId
  );
  if (targetIndex === -1) {
    throw new Error(`Turn ${input.turnId} not found in session ${input.session.id}`);
  }

  const target = input.session.turns[targetIndex];
  const priorTurns = input.session.turns.slice(0, targetIndex);
  const recentTurns = priorTurns.slice(-recentTurnLimit);

  // Recreate a session summary over the turns that would have been rolled
  // out of the recent window at the moment of the target turn. For a V1.5
  // surface this matches "what the turn saw" closely enough to make the
  // compare honest without reconstructing historical summaries exactly.
  const rolled = priorTurns.slice(
    0,
    Math.max(0, priorTurns.length - recentTurnLimit)
  );
  const sessionSummary =
    rolled.length > 0
      ? rolled
          .slice(-6)
          .map(
            (turn, index) =>
              `${index + 1}. [${turn.mode}] User: ${turn.userMessage.slice(0, 200)}`
          )
          .join("\n")
      : undefined;

  const mode = input.mode ?? target.mode;
  const userMessage = input.userMessageOverride ?? target.userMessage;

  // Load memory snapshot once; we do not write back.
  const memoryStore = new FileMemoryStore(input.memoryRoot);
  const memoryItems = await memoryStore.list();

  const turn = await runTurn(input.provider, {
    canonRoot: input.canonRoot,
    mode,
    userMessage,
    recentMessages: toRecentMessages(recentTurns),
    sessionSummary,
    sessionId: input.session.id,
    memoryItems,
  });

  const contextSnapshot: SessionContextSnapshot = buildContextSnapshot(
    turn.context
  );

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    assistantMessage: turn.final,
    provider: {
      name: input.provider.name,
      model: (input.provider as { model?: string }).model ?? "unknown",
    },
    trace: {
      draft: turn.draft,
      critique: turn.critique,
      revision: turn.revision,
      final: turn.final,
    },
    contextSnapshot,
    memoryDecision: turn.memoryDecision,
  };
}
