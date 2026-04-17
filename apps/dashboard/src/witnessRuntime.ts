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
}

export interface PersistWitnessTurnArtifactsResult {
  session: InquirySession;
  testimonyId: string;
}

export async function persistWitnessTurnArtifacts(
  input: PersistWitnessTurnArtifactsInput
): Promise<PersistWitnessTurnArtifactsResult> {
  const sessionStore = new FileSessionStore(input.sessionRoot);
  const stampedSession: InquirySession = {
    ...input.session,
    productId: "witness",
    witnessId: input.witnessId,
  };

  await sessionStore.save(stampedSession);

  const existing = (await input.testimonyStore.list()).find(
    (record) =>
      record.sessionId === stampedSession.id &&
      record.witnessId === input.witnessId
  );

  const testimony =
    existing ??
    (await input.testimonyStore.create({
      witnessId: input.witnessId,
      sessionId: stampedSession.id,
      capturedAt: input.persistedTurn.createdAt,
      title: stampedSession.title ?? "Witness Session",
    }));

  const updated = await appendTurnToTestimony(input.testimonyStore, {
    testimonyId: testimony.id,
    witnessText: input.persistedTurn.userMessage,
    assistantText: input.persistedTurn.assistantMessage,
    createdAt: input.persistedTurn.createdAt,
  });

  return {
    session: stampedSession,
    testimonyId: updated.id,
  };
}
