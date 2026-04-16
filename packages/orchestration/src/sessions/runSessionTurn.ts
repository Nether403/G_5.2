import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadCanon } from "../canon/loadCanon";
import type { Message } from "../types/messages";
import type { MemoryDecision, MemoryStoredItemSnapshot } from "../types/memory";
import type { ModelProvider } from "../types/providers";
import type {
  InquirySession,
  RunSessionTurnInput,
  SessionContextSnapshot,
  SessionTurnArtifacts,
  SessionTurnRecord,
} from "../types/session";
import { FileMemoryStore } from "../memory/fileMemoryStore";
import { runTurn } from "../pipeline/runTurn";
import { PIPELINE_REVISION, PROMPT_REVISION } from "../pipeline/revision";
import { truncateToTokens } from "../utils/budget";
import {
  defaultContextSnapshotRoot,
  FileContextSnapshotStore,
} from "../persistence/fileContextSnapshotStore";
import type { PersistedContextSnapshot } from "../persistence/contextSnapshotSchema";
import type { RunMetadata } from "../persistence/runMetadata";
import { SCHEMA_VERSIONS } from "../persistence/schemaVersions";
import type { PersistedSessionSummary } from "../persistence/sessionSchema";
import { getGitCommit } from "../persistence/gitContext";
import { FileSessionStore } from "./fileSessionStore";

const DEFAULT_RECENT_TURN_LIMIT = 4;
const MAX_SUMMARY_ENTRIES = 6;
const MAX_SUMMARY_TOKENS = 500;

function createEmptySession(sessionId?: string): InquirySession {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSIONS.session,
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

function summarizeTurns(
  turns: SessionTurnRecord[],
  generatedAt: string
): PersistedSessionSummary | null {
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

  return {
    schemaVersion: SCHEMA_VERSIONS.sessionSummary,
    text: truncateToTokens(summary, MAX_SUMMARY_TOKENS),
    generatedAt,
  };
}

export function buildContextSnapshot(
  turn: SessionTurnArtifacts["context"]
): SessionContextSnapshot {
  return {
    selectedDocuments: turn.selectedDocuments.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
    })),
    selectedFacts: turn.selectedFacts.map((fact) => ({
      id: fact.id,
      statement: fact.statement,
    })),
    selectedGlossaryTerms: turn.selectedGlossaryTerms.map((term) => ({
      term: term.term,
      definition: term.definition,
    })),
    selectedRecoveredArtifacts: turn.selectedRecoveredArtifacts.map(
      (artifact) => ({
        slug: artifact.slug,
        title: artifact.title,
      })
    ),
    selectedMemoryItems: turn.selectedMemoryItems.map((item) => ({
      id: item.id,
      type: item.type,
      scope: item.scope,
      statement: item.statement,
      ...(item.sessionId ? { sessionId: item.sessionId } : {}),
    })),
    consideredButSkippedDocuments: (
      turn.consideredButSkippedDocuments ?? []
    ).map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      reason: doc.reason,
    })),
    hadSessionSummary: Boolean(turn.sessionSummary),
    recentMessageCount: turn.recentMessages.length,
  };
}

function defaultMemoryRoot(sessionsRoot: string): string {
  return path.join(path.dirname(sessionsRoot), "memory-items");
}

function finalizeMemoryDecision(
  decision: MemoryDecision,
  storedItems: MemoryStoredItemSnapshot[]
): MemoryDecision {
  const skippedCandidates = decision.candidates
    .filter((candidate) => candidate.confidence !== "high")
    .map((candidate) => ({
      ...candidate,
      rejectionReason:
        candidate.rejectionReason ??
        "Only high-confidence candidates are stored in V1.",
    }));

  if (storedItems.length > 0) {
    return {
      ...decision,
      shouldStore: true,
      reason: `Stored or confirmed ${storedItems.length} durable memory item${storedItems.length === 1 ? "" : "s"}.`,
      skippedCandidates,
      storedItems,
    };
  }

  if (decision.candidates.length > 0 && skippedCandidates.length > 0) {
    return {
      ...decision,
      shouldStore: false,
      reason: "Memory candidates were proposed but none met the V1 storage threshold.",
      skippedCandidates,
      storedItems: [],
    };
  }

  return {
    ...decision,
    shouldStore: false,
    skippedCandidates,
    storedItems: [],
  };
}

export async function runSessionTurn(
  provider: ModelProvider,
  input: RunSessionTurnInput
): Promise<SessionTurnArtifacts> {
  const recentTurnLimit = input.recentTurnLimit ?? DEFAULT_RECENT_TURN_LIMIT;
  const store = new FileSessionStore(input.sessionsRoot);
  const memoryRoot = input.memoryRoot ?? defaultMemoryRoot(input.sessionsRoot);
  const memoryStore = new FileMemoryStore(memoryRoot);
  const snapshotStore = new FileContextSnapshotStore(
    defaultContextSnapshotRoot(input.sessionsRoot)
  );
  const existing =
    (input.sessionId ? await store.load(input.sessionId) : null) ??
    createEmptySession(input.sessionId);

  const recentTurns = existing.turns.slice(-recentTurnLimit);
  const turn = await runTurn(provider, {
    canonRoot: input.canonRoot,
    mode: input.mode,
    userMessage: input.userMessage,
    recentMessages: toRecentMessages(recentTurns),
    sessionSummary: existing.summary?.text ?? undefined,
    sessionId: existing.id,
    memoryRoot,
  });

  const turnId = randomUUID();
  const createdAt = new Date().toISOString();
  const memorySource = {
    sessionId: existing.id,
    turnId,
    createdAt,
  };
  const storedItems: MemoryStoredItemSnapshot[] = [];

  for (const candidate of turn.memoryDecision.candidates) {
    if (candidate.confidence !== "high") {
      continue;
    }

    storedItems.push(await memoryStore.upsert(candidate, memorySource));
  }

  const providerLabel = {
    name: provider.name,
    model: (provider as { model?: string }).model ?? "unknown",
  };

  const memoryDecision = finalizeMemoryDecision(turn.memoryDecision, storedItems);
  const inlineSnapshot = buildContextSnapshot(turn.context);

  // Persist the full replay-ready snapshot as a first-class object.
  const canon = await loadCanon(input.canonRoot);
  const snapshotId = randomUUID();
  const persistedSnapshot: PersistedContextSnapshot = {
    schemaVersion: SCHEMA_VERSIONS.contextSnapshot,
    id: snapshotId,
    createdAt,
    mode: input.mode,
    canonVersion: String(canon.manifest.version),
    userMessage: input.userMessage,
    recentMessages: turn.context.recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.passType ? { passType: m.passType } : {}),
      ...(m.createdAt ? { createdAt: m.createdAt } : {}),
    })),
    sessionSummary: turn.context.sessionSummary ?? null,
    memoryItems: turn.context.selectedMemoryItems,
    selectedDocuments: inlineSnapshot.selectedDocuments,
    selectedFacts: inlineSnapshot.selectedFacts,
    selectedGlossaryTerms: inlineSnapshot.selectedGlossaryTerms,
    selectedRecoveredArtifacts: inlineSnapshot.selectedRecoveredArtifacts,
    selectedMemoryItems: inlineSnapshot.selectedMemoryItems,
    hadSessionSummary: inlineSnapshot.hadSessionSummary,
    recentMessageCount: inlineSnapshot.recentMessageCount,
    systemPrompt: turn.context.systemPrompt,
    userPrompt: turn.context.userPrompt,
  };
  await snapshotStore.save(persistedSnapshot);

  const runMetadata: RunMetadata = {
    provider: provider.name,
    model: (provider as { model?: string }).model ?? "unknown",
    canonVersion: String(canon.manifest.version),
    canonLastUpdated: canon.manifest.last_updated ?? null,
    promptRevision: PROMPT_REVISION,
    pipelineRevision: PIPELINE_REVISION,
    commitSha: await getGitCommit(process.cwd()),
    capturedAt: createdAt,
  };

  const persistedTurn: SessionTurnRecord = {
    schemaVersion: SCHEMA_VERSIONS.sessionTurn,
    id: turnId,
    createdAt,
    mode: input.mode,
    userMessage: input.userMessage,
    assistantMessage: turn.final,
    memoryDecision,
    contextSnapshot: inlineSnapshot,
    contextSnapshotId: snapshotId,
    runMetadata,
    trace: {
      schemaVersion: SCHEMA_VERSIONS.turnTrace,
      draft: turn.draft,
      critique: turn.critique,
      revision: turn.revision,
      final: turn.final,
    },
    provider: providerLabel,
  };

  const turns = [...existing.turns, persistedTurn];
  const rolledIntoSummary = turns.slice(
    0,
    Math.max(0, turns.length - recentTurnLimit)
  );
  const session: InquirySession = {
    ...existing,
    schemaVersion: SCHEMA_VERSIONS.session,
    updatedAt: persistedTurn.createdAt,
    summary: summarizeTurns(rolledIntoSummary, persistedTurn.createdAt),
    turns,
  };

  await store.save(session);

  return {
    ...turn,
    memoryDecision,
    session,
    persistedTurn,
  };
}
