export type SynthesisStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "superseded";

export type WitnessRecordSource = "model" | "operator";

export interface SynthesisRecord {
  id: string;
  witnessId: string;
  testimonyId: string;
  createdAt: string;
  updatedAt: string;
  status: SynthesisStatus;
  source: WitnessRecordSource;
  text: string;
  reviewNote?: string;
}

export interface SynthesisStore {
  load(synthesisId: string): Promise<SynthesisRecord | null>;
  list(): Promise<SynthesisRecord[]>;
  save(record: SynthesisRecord): Promise<SynthesisRecord>;
  delete(synthesisId: string): Promise<boolean>;
}
