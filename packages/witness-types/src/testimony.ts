export type TestimonyLifecycleState =
  | "captured"
  | "retained"
  | "synthesized"
  | "withdrawn";

export type TestimonyParticipantRole = "witness" | "inquisitor";

export interface TestimonySegment {
  id: string;
  role: TestimonyParticipantRole;
  text: string;
  createdAt: string;
}

export interface TestimonyRecord {
  id: string;
  witnessId: string;
  sessionId: string;
  state: TestimonyLifecycleState;
  createdAt: string;
  updatedAt: string;
  title?: string;
  segments: TestimonySegment[];
}

export interface TestimonyStore {
  load(testimonyId: string): Promise<TestimonyRecord | null>;
  list(): Promise<TestimonyRecord[]>;
  save(record: TestimonyRecord): Promise<TestimonyRecord>;
  delete(testimonyId: string): Promise<boolean>;
}
