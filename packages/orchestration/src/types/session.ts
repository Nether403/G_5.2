import type { Mode } from "./modes";
import type { TurnArtifacts } from "./pipeline";

export interface SessionTurnRecord {
  id: string;
  createdAt: string;
  mode: Mode;
  userMessage: string;
  assistantMessage: string;
  memoryDecision: TurnArtifacts["memoryDecision"];
}

export interface InquirySession {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  turns: SessionTurnRecord[];
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
  recentTurnLimit?: number;
}

export interface SessionTurnArtifacts extends TurnArtifacts {
  session: InquirySession;
  persistedTurn: SessionTurnRecord;
}
