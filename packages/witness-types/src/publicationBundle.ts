export type PublicationBundleStatus = "created";

export interface PublicationBundleRecord {
  id: string;
  witnessId: string;
  testimonyId: string;
  archiveCandidateId: string;
  sourceTestimonyUpdatedAt: string;
  sourceSynthesisId: string;
  sourceAnnotationId: string;
  createdAt: string;
  updatedAt: string;
  status: PublicationBundleStatus;
  bundleJsonPath: string;
  bundleMarkdownPath?: string;
}

export interface PublicationBundleStore {
  load(bundleId: string): Promise<PublicationBundleRecord | null>;
  list(): Promise<PublicationBundleRecord[]>;
  save(record: PublicationBundleRecord): Promise<PublicationBundleRecord>;
  delete(bundleId: string): Promise<boolean>;
}
