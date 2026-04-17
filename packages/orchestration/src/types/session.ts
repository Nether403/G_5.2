import type { PersistedSessionSummary } from "../persistence/sessionSchema";
import type { RunMetadata } from "../persistence/runMetadata";
import type { Mode } from "./modes";
import type { TurnArtifacts } from "./pipeline";

export interface SessionContextSnapshot {
  selectedDocuments: Array<{ slug: string; title: string }>;
  selectedFacts: Array<{ id: string; statement: string }>;
  selectedGlossaryTerms: Array<{ term: string; definition: string }>;
  selectedRecoveredArtifacts: Array<{ slug: string; title: string }>;
  selectedMemoryItems: Array<{
    id: string;
    type: import("./memory").MemoryType;
    scope: import("./memory").MemoryScope;
    statement: string;
    sessionId?: string;
  }>;
  consideredButSkippedDocuments?: Array<{
    slug: string;
    title: string;
    reason: string;
  }>;
  hadSessionSummary: boolean;
  recentMessageCount: number;
}

export interface SessionTurnTrace {
  schemaVersion?: number;
  draft: string;
  critique: string;
  revision: string;
  final: string;
}

export interface SessionTurnProvider {
  name: string;
  model: string;
}

export interface SessionTurnRerun {
  id: string;
  createdAt: string;
  mode: Mode;
  assistantMessage: string;
  provider: SessionTurnProvider;
  trace?: SessionTurnTrace;
  contextSnapshot?: SessionContextSnapshot;
  memoryDecision: TurnArtifacts["memoryDecision"];
}

export interface SessionTurnRecord {
  schemaVersion?: number;
  id: string;
  createdAt: string;
  mode: Mode;
  userMessage: string;
  assistantMessage: string;
  memoryDecision: TurnArtifacts["memoryDecision"];
  contextSnapshot?: SessionContextSnapshot;
  contextSnapshotId?: string;
  runMetadata?: RunMetadata;
  trace?: SessionTurnTrace;
  provider?: SessionTurnProvider;
  reruns?: SessionTurnRerun[];
  error?: {
    message: string;
    failedAt: string;
  };
}

export interface InquirySession {
  schemaVersion?: number;
  id: string;
  productId?: "pes" | "witness";
  witnessId?: string;
  createdAt: string;
  updatedAt: string;
  summary: PersistedSessionSummary | null;
  turns: SessionTurnRecord[];
  tags?: string[];
  archived?: boolean;
  title?: string;
}

export interface SessionStore {
  load(sessionId: string): Promise<InquirySession | null>;
  save(session: InquirySession): Promise<void>;
}

export interface RunSessionTurnInput {
  canonRoot: string;
  mode: Mode;
  userMessage: string;
  sessionId?: string;
  sessionsRoot: string;
  memoryRoot?: string;
  recentTurnLimit?: number;
}

export interface SessionTurnArtifacts extends TurnArtifacts {
  session: InquirySession;
  persistedTurn: SessionTurnRecord;
}
