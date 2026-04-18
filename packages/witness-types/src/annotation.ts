export type AnnotationStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "superseded";

export type WitnessRecordSource = "model" | "operator";

export interface AnnotationEntry {
  id: string;
  labelId: string;
  labelName: string;
  segmentId: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  rationale?: string;
}

export interface AnnotationRecord {
  id: string;
  witnessId: string;
  testimonyId: string;
  createdAt: string;
  updatedAt: string;
  status: AnnotationStatus;
  source: WitnessRecordSource;
  reviewNote?: string;
  entries: AnnotationEntry[];
}

export interface AnnotationStore {
  load(annotationId: string): Promise<AnnotationRecord | null>;
  list(): Promise<AnnotationRecord[]>;
  save(record: AnnotationRecord): Promise<AnnotationRecord>;
  delete(annotationId: string): Promise<boolean>;
}
