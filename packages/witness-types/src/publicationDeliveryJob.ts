import type { PublicationDeliveryBackend } from "./publicationDelivery";

export type PublicationDeliveryJobStatus =
  | "queued"
  | "in_progress"
  | "succeeded"
  | "failed";

export interface PublicationDeliveryJobRecord {
  id: string;
  packageId: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  backend: PublicationDeliveryBackend;
  status: PublicationDeliveryJobStatus;
  createdAt: string;
  updatedAt: string;
  lastAttemptId?: string;
  error?: string;
  recoveredFromRestartAt?: string;
}

export interface PublicationDeliveryJobStore {
  load(jobId: string): Promise<PublicationDeliveryJobRecord | null>;
  list(filters?: {
    packageId?: string;
    bundleId?: string;
    witnessId?: string;
    testimonyId?: string;
    status?: PublicationDeliveryJobStatus;
  }): Promise<PublicationDeliveryJobRecord[]>;
  save(
    record: PublicationDeliveryJobRecord
  ): Promise<PublicationDeliveryJobRecord>;
  delete(jobId: string): Promise<boolean>;
}
