export type ArchiveCandidateStatus =
  | "draft"
  | "archive_review_approved"
  | "archive_review_rejected"
  | "publication_ready"
  | "publication_rejected"
  | "superseded";

export interface ArchiveCandidateRecord {
  id: string;
  witnessId: string;
  testimonyId: string;
  testimonyUpdatedAt: string;
  approvedSynthesisId: string;
  approvedAnnotationId: string;
  createdAt: string;
  updatedAt: string;
  status: ArchiveCandidateStatus;
  reviewNote?: string;
  publicationNote?: string;
}

export interface ArchiveCandidateStore {
  load(candidateId: string): Promise<ArchiveCandidateRecord | null>;
  list(): Promise<ArchiveCandidateRecord[]>;
  save(record: ArchiveCandidateRecord): Promise<ArchiveCandidateRecord>;
  delete(candidateId: string): Promise<boolean>;
}
