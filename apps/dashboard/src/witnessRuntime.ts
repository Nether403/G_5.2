import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import type {
  InquirySession,
  SessionTurnRecord,
} from "../../../packages/orchestration/src/types/session";
import { FileWitnessTestimonyStore, appendTurnToTestimony } from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import { FileWitnessConsentStore, listConsentForWitness } from "../../../packages/orchestration/src/witness/fileConsentStore";
import { hasGrantedConsent } from "../../../packages/witness-types/src/consent";

export interface WitnessConsentGate {
  allowed: boolean;
  missingScopes: Array<"conversational" | "retention">;
}

export async function getWitnessConsentGate(
  consentStore: FileWitnessConsentStore,
  witnessId: string,
  testimonyId?: string
): Promise<WitnessConsentGate> {
  const records = await listConsentForWitness(consentStore, witnessId);
  const missingScopes: WitnessConsentGate["missingScopes"] = [];

  if (!hasGrantedConsent(records, "conversational", testimonyId)) {
    missingScopes.push("conversational");
  }

  if (!hasGrantedConsent(records, "retention", testimonyId)) {
    missingScopes.push("retention");
  }

  return {
    allowed: missingScopes.length === 0,
    missingScopes,
  };
}

export interface PersistWitnessTurnArtifactsInput {
  sessionRoot: string;
  testimonyStore: FileWitnessTestimonyStore;
  witnessId: string;
  session: InquirySession;
  persistedTurn: SessionTurnRecord;
  sessionStore?: Pick<FileSessionStore, "save">;
  logger?: WitnessCompensationLogger;
}

export interface PersistWitnessTurnArtifactsResult {
  session: InquirySession;
  testimonyId: string;
}

export interface WitnessCompensationEvent {
  event: "witness_persistence_compensation";
  reason: "testimony_append_failed" | "session_save_failed";
  action: "delete_created_testimony" | "restore_existing_testimony";
  status: "succeeded" | "failed";
  witnessId: string;
  sessionId: string;
  testimonyId?: string;
  error: string;
  compensationError?: string;
}

export type WitnessCompensationLogger = (
  event: WitnessCompensationEvent
) => void | Promise<void>;

async function emitWitnessCompensationEvent(
  logger: WitnessCompensationLogger,
  event: WitnessCompensationEvent
) {
  try {
    await logger(event);
  } catch {
    // Logging must not interfere with persistence compensation.
  }
}

function defaultWitnessCompensationLogger(event: WitnessCompensationEvent) {
  console.warn(JSON.stringify(event));
}

export async function persistWitnessTurnArtifacts(
  input: PersistWitnessTurnArtifactsInput
): Promise<PersistWitnessTurnArtifactsResult> {
  const sessionStore =
    input.sessionStore ?? new FileSessionStore(input.sessionRoot);
  const logger = input.logger ?? defaultWitnessCompensationLogger;
  const stampedSession: InquirySession = {
    ...input.session,
    productId: "witness",
    witnessId: input.witnessId,
  };

  const existing = (await input.testimonyStore.list()).find(
    (record) =>
      record.sessionId === stampedSession.id &&
      record.witnessId === input.witnessId
  );

  const rollbackTestimony = async (
    reason: WitnessCompensationEvent["reason"],
    createdTestimonyId: string | null,
    previousRecord: typeof existing,
    error: unknown
  ) => {
    const action = previousRecord
      ? "restore_existing_testimony"
      : createdTestimonyId
        ? "delete_created_testimony"
        : null;

    if (!action) {
      return;
    }

    const testimonyId = previousRecord?.id ?? createdTestimonyId ?? undefined;

    if (previousRecord) {
      try {
        await input.testimonyStore.save(previousRecord);
        await emitWitnessCompensationEvent(logger, {
          event: "witness_persistence_compensation",
          reason,
          action,
          status: "succeeded",
          witnessId: input.witnessId,
          sessionId: stampedSession.id,
          testimonyId,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      } catch (compensationError) {
        await emitWitnessCompensationEvent(logger, {
          event: "witness_persistence_compensation",
          reason,
          action,
          status: "failed",
          witnessId: input.witnessId,
          sessionId: stampedSession.id,
          testimonyId,
          error: error instanceof Error ? error.message : String(error),
          compensationError:
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError),
        });
        throw compensationError;
      }
    }

    if (!createdTestimonyId) {
      return;
    }

    try {
      await input.testimonyStore.delete(createdTestimonyId);
      await emitWitnessCompensationEvent(logger, {
        event: "witness_persistence_compensation",
        reason,
        action,
        status: "succeeded",
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        testimonyId,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (compensationError) {
      await emitWitnessCompensationEvent(logger, {
        event: "witness_persistence_compensation",
        reason,
        action,
        status: "failed",
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        testimonyId,
        error: error instanceof Error ? error.message : String(error),
        compensationError:
          compensationError instanceof Error
            ? compensationError.message
            : String(compensationError),
      });
      throw compensationError;
    }
  };

  let createdTestimonyId: string | null = null;
  let updated;

  try {
    const testimony =
      existing ??
      (await input.testimonyStore.create({
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        capturedAt: input.persistedTurn.createdAt,
        title: stampedSession.title ?? "Witness Session",
      }));

    createdTestimonyId = existing ? null : testimony.id;

    updated = await appendTurnToTestimony(input.testimonyStore, {
      testimonyId: testimony.id,
      witnessText: input.persistedTurn.userMessage,
      assistantText: input.persistedTurn.assistantMessage,
      createdAt: input.persistedTurn.createdAt,
    });
  } catch (error) {
    await rollbackTestimony(
      "testimony_append_failed",
      createdTestimonyId,
      existing,
      error
    );
    throw error;
  }

  try {
    await sessionStore.save(stampedSession);
  } catch (error) {
    await rollbackTestimony(
      "session_save_failed",
      createdTestimonyId,
      existing,
      error
    );
    throw error;
  }

  return {
    session: stampedSession,
    testimonyId: updated.id,
  };
}
