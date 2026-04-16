import type { BuiltContext, TurnArtifacts } from "../types/pipeline";
import type { ModelProvider } from "../types/providers";
import type { SessionTurnRecord } from "../types/session";
import { runTurn } from "../pipeline/runTurn";
import { loadCanon } from "../canon/loadCanon";
import { PIPELINE_REVISION, PROMPT_REVISION } from "../pipeline/revision";
import { FileSessionStore } from "../sessions/fileSessionStore";
import {
  defaultContextSnapshotRoot,
  FileContextSnapshotStore,
} from "./fileContextSnapshotStore";
import { getGitCommit } from "./gitContext";
import type { PersistedContextSnapshot } from "./contextSnapshotSchema";

export interface ReplayTurnInput {
  sessionsRoot: string;
  snapshotsRoot?: string;
  sessionId: string;
  turnId: string;
  /**
   * "replay"  → deterministic: reconstruct the turn artifacts directly
   *             from the persisted trace and snapshot without any
   *             provider calls. Output matches the original run
   *             bit-for-bit regardless of provider determinism.
   * "rerun"   → re-invoke the full pipeline (buildContext + retrieval
   *             + draft/critique/revision) against the current canon
   *             using the given provider. Requires canonRoot.
   */
  mode?: "replay" | "rerun";
  canonRoot?: string;
  /**
   * When true, mismatches between the persisted turn's runMetadata
   * (canon version, prompt/pipeline revision, commit SHA) and the
   * current environment are returned instead of thrown. Only meaningful
   * in "rerun" mode.
   */
  allowMismatch?: boolean;
}

export interface ReplayCompatibilityMismatch {
  field: "canonVersion" | "promptRevision" | "pipelineRevision" | "commitSha";
  persisted: string | null;
  current: string | null;
}

export interface ReplayResult {
  snapshot: PersistedContextSnapshot;
  turn: TurnArtifacts;
  mode: "replay" | "rerun";
  mismatches: ReplayCompatibilityMismatch[];
}

/**
 * Replay a persisted turn.
 *
 * Default mode is deterministic replay: the persisted systemPrompt and
 * userPrompt are fed directly into the draft/critique/revision
 * primitives, and the provider output for a given deterministic
 * provider will match bit-for-bit. Canon is not consulted; retrieval
 * is not re-run.
 *
 * Rerun mode re-executes buildContext against the current canon (useful
 * for A/B comparing canon changes) and by default hard-fails when the
 * environment does not match the persisted runMetadata.
 */
export async function replayTurn(
  provider: ModelProvider | null,
  input: ReplayTurnInput
): Promise<ReplayResult> {
  const mode = input.mode ?? "replay";
  const sessionStore = new FileSessionStore(input.sessionsRoot);
  const session = await sessionStore.load(input.sessionId);
  if (!session) {
    throw new Error(
      `replayTurn: session not found (id=${input.sessionId})`
    );
  }

  const turnRecord = session.turns.find((t) => t.id === input.turnId);
  if (!turnRecord) {
    throw new Error(
      `replayTurn: turn not found (sessionId=${input.sessionId}, turnId=${input.turnId})`
    );
  }

  if (!turnRecord.contextSnapshotId) {
    throw new Error(
      `replayTurn: turn has no contextSnapshotId (turnId=${input.turnId}). ` +
        `Replay requires a turn recorded with persistence schema v2 or later.`
    );
  }

  const snapshotStore = new FileContextSnapshotStore(
    input.snapshotsRoot ?? defaultContextSnapshotRoot(input.sessionsRoot)
  );
  const snapshot = await snapshotStore.load(turnRecord.contextSnapshotId);
  if (!snapshot) {
    throw new Error(
      `replayTurn: context snapshot not found (id=${turnRecord.contextSnapshotId})`
    );
  }

  if (mode === "replay") {
    const turn = reconstructTurnFromPersisted(snapshot, turnRecord);
    return { snapshot, turn, mode, mismatches: [] };
  }

  // Rerun against current canon.
  if (!input.canonRoot) {
    throw new Error(
      `replayTurn: canonRoot is required in rerun mode.`
    );
  }
  if (!provider) {
    throw new Error(
      `replayTurn: a model provider is required in rerun mode.`
    );
  }
  const mismatches = await checkReplayCompatibility({
    turn: turnRecord,
    canonRoot: input.canonRoot,
  });
  if (mismatches.length > 0 && !input.allowMismatch) {
    const summary = mismatches
      .map(
        (m) =>
          `${m.field}: persisted=${m.persisted ?? "null"} current=${m.current ?? "null"}`
      )
      .join("; ");
    throw new Error(
      `replayTurn: environment mismatch in rerun mode (${summary}). ` +
        `Pass allowMismatch: true to proceed anyway.`
    );
  }

  const turn = await runTurn(provider, {
    canonRoot: input.canonRoot,
    mode: snapshot.mode,
    userMessage: snapshot.userMessage,
    recentMessages: snapshot.recentMessages,
    sessionSummary: snapshot.sessionSummary ?? undefined,
    sessionId: input.sessionId,
    memoryItems: snapshot.memoryItems,
  });

  return { snapshot, turn, mode, mismatches };
}

function reconstructTurnFromPersisted(
  snapshot: PersistedContextSnapshot,
  turnRecord: SessionTurnRecord
): TurnArtifacts {
  // Pure reconstruction from persisted data. No provider calls. The
  // draft / critique / revision strings come from the persisted trace;
  // the context is rehydrated from the context snapshot. For older
  // turn records that predate the trace field, we fall back to the
  // final assistantMessage so replay still produces a coherent artifact
  // even if intermediate passes were not captured.
  if (!turnRecord.trace) {
    throw new Error(
      `replayTurn: turn ${turnRecord.id} has no persisted trace. ` +
        `Deterministic replay requires a trace captured at write time. ` +
        `Use mode: "rerun" to re-invoke the pipeline instead.`
    );
  }

  const context: BuiltContext = {
    mode: snapshot.mode,
    selectedDocuments: [],
    selectedFacts: [],
    selectedGlossaryTerms: [],
    selectedRecoveredArtifacts: [],
    consideredButSkippedDocuments: [],
    selectedMemoryItems: snapshot.memoryItems,
    systemPrompt: snapshot.systemPrompt,
    userPrompt: snapshot.userPrompt,
    recentMessages: snapshot.recentMessages,
    sessionSummary: snapshot.sessionSummary ?? undefined,
  };

  return {
    context,
    draft: turnRecord.trace.draft,
    critique: turnRecord.trace.critique,
    revision: turnRecord.trace.revision,
    final: turnRecord.trace.final,
    memoryDecision: turnRecord.memoryDecision,
  };
}

export interface CheckReplayCompatibilityInput {
  turn: SessionTurnRecord;
  canonRoot: string;
  commitCwd?: string;
}

/**
 * Compare a persisted turn's runMetadata against the current
 * environment. Returns an empty array when everything matches; entries
 * otherwise describe each field that has drifted.
 */
export async function checkReplayCompatibility(
  input: CheckReplayCompatibilityInput
): Promise<ReplayCompatibilityMismatch[]> {
  const persisted = input.turn.runMetadata;
  if (!persisted) {
    return [];
  }
  const mismatches: ReplayCompatibilityMismatch[] = [];

  const canon = await loadCanon(input.canonRoot);
  const currentCanonVersion = String(canon.manifest.version);
  if (currentCanonVersion !== persisted.canonVersion) {
    mismatches.push({
      field: "canonVersion",
      persisted: persisted.canonVersion,
      current: currentCanonVersion,
    });
  }

  if (PROMPT_REVISION !== persisted.promptRevision) {
    mismatches.push({
      field: "promptRevision",
      persisted: persisted.promptRevision,
      current: PROMPT_REVISION,
    });
  }

  if (PIPELINE_REVISION !== persisted.pipelineRevision) {
    mismatches.push({
      field: "pipelineRevision",
      persisted: persisted.pipelineRevision,
      current: PIPELINE_REVISION,
    });
  }

  const currentCommit = await getGitCommit(input.commitCwd ?? process.cwd());
  const persistedCommit = persisted.commitSha ?? null;
  if (
    persistedCommit !== null &&
    currentCommit !== null &&
    persistedCommit !== currentCommit
  ) {
    mismatches.push({
      field: "commitSha",
      persisted: persistedCommit,
      current: currentCommit,
    });
  }

  return mismatches;
}
